import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";
import { notifier } from "@/modules/communication/notifications";
import { employees } from "@/modules/personnes/schema";

import { projets } from "./schema";
import {
  LIBELLE_STATUT_RELEVE,
  PREUVES_MAX,
  decisionPermise,
  estOrigine,
  estRole,
  lireAvancement,
  manqueAuReleve,
  projetOuvertAuTerrain,
  type MembreRole,
  type NaturePreuve,
  type OrigineMembre,
  type Position,
  type RoleEquipe,
  type StatutReleve,
} from "./terrain-regles";
import { membresProjet, preuvesReleve, relevesProjet } from "./terrain-schema";

const propre = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

// ------------------------------------------------------------------ lecture

/** Le projet et ce qu'il faut pour décider qui y a accès. */
export async function projetDuTerrain(organizationId: string, projetId: string) {
  const [p] = await db
    .select({ id: projets.id, code: projets.code, nom: projets.nom, statut: projets.statut, responsableUserId: projets.responsableUserId })
    .from(projets)
    .where(and(eq(projets.organizationId, organizationId), eq(projets.id, projetId), isNull(projets.deletedAt)));
  return p ?? null;
}

export interface MembreVue extends MembreRole {
  id: string;
  origine: OrigineMembre;
  employeeId: string | null;
  nom: string;
  telephone: string | null;
  organisme: string | null;
  /** Interne : poste de la fiche collaborateur. */
  detail: string | null;
}

/** L'équipe du projet, en poste d'abord. Le compte d'un collaborateur est celui de sa fiche. */
export async function equipeDuProjet(organizationId: string, projetId: string, inclureHorsPoste = false): Promise<MembreVue[]> {
  const conditions = [eq(membresProjet.organizationId, organizationId), eq(membresProjet.projetId, projetId), isNull(membresProjet.deletedAt)];
  if (!inclureHorsPoste) conditions.push(eq(membresProjet.actif, true));
  const lignes = await db
    .select({
      m: membresProjet,
      salarie: employees.nom,
      poste: employees.poste,
      salarieTel: employees.telephone,
      compteSalarie: employees.userId,
      compte: users.fullName,
    })
    .from(membresProjet)
    .leftJoin(employees, eq(employees.id, membresProjet.employeeId))
    .leftJoin(users, eq(users.id, membresProjet.userId))
    .where(and(...conditions))
    .orderBy(desc(membresProjet.actif), asc(membresProjet.role), asc(membresProjet.createdAt));
  return lignes.map(({ m, salarie, poste, salarieTel, compteSalarie, compte }) => ({
    id: m.id,
    role: m.role as RoleEquipe,
    origine: m.origine as OrigineMembre,
    actif: m.actif,
    employeeId: m.employeeId,
    userId: m.userId ?? compteSalarie ?? null,
    nom: salarie ?? compte ?? m.nom ?? "—",
    telephone: salarieTel ?? m.telephone,
    organisme: m.organisme,
    detail: poste ?? null,
  }));
}

export interface PersonnelChoix {
  /** `e:<collaborateur>` ou `u:<compte>`. */
  cle: string;
  nom: string;
  detail: string | null;
  /** Déjà en poste sur ce projet. */
  pris: boolean;
  /** A un compte : peut relever, et être superviseur. */
  avecCompte: boolean;
}

/** Tout le personnel : les collaborateurs en poste, et les comptes sans fiche de collaborateur. */
export async function personnelPourProjet(organizationId: string, equipe: readonly MembreVue[]): Promise<PersonnelChoix[]> {
  const [salaries, comptes] = await Promise.all([
    db
      .select({ id: employees.id, nom: employees.nom, poste: employees.poste, userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt))),
    db
      .select({ id: users.id, nom: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), eq(users.status, "actif"))),
  ]);
  const actifs = new Set(comptes.map((c) => c.id));
  const employes = new Set(equipe.map((m) => m.employeeId).filter(Boolean));
  const utilisateurs = new Set(equipe.map((m) => m.userId).filter(Boolean));
  const deSalaries = new Set(salaries.map((s) => s.userId).filter(Boolean));
  const liste: PersonnelChoix[] = [
    ...salaries.map((s) => ({
      cle: `e:${s.id}`,
      nom: s.nom,
      detail: s.poste,
      pris: employes.has(s.id) || Boolean(s.userId && utilisateurs.has(s.userId)),
      avecCompte: Boolean(s.userId && actifs.has(s.userId)),
    })),
    ...comptes
      .filter((c) => !deSalaries.has(c.id))
      .map((c) => ({ cle: `u:${c.id}`, nom: c.nom, detail: "compte sans fiche de collaborateur", pris: utilisateurs.has(c.id), avecCompte: true })),
  ];
  return liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

export interface ProjetTerrain {
  id: string;
  code: string;
  nom: string;
  statut: string;
  role: RoleEquipe;
  chef: boolean;
  releves: number;
  aExaminer: number;
}

/** Les projets où ce compte est en poste (agent ou superviseur), ou chef de projet. */
export async function projetsDuTerrain(organizationId: string, userId: string): Promise<ProjetTerrain[]> {
  const lignes = await db.execute<{ id: string; code: string; nom: string; statut: string; role: string | null; chef: boolean; releves: string; a_examiner: string }>(sql`
    select p.id, p.code, p.nom, p.statut::text as statut,
           (select m.role from membres_projet m
             left join employees e on e.id = m.employee_id
             where m.projet_id = p.id and m.actif and m.deleted_at is null
               and coalesce(m.user_id, e.user_id) = ${userId} limit 1) as role,
           (p.responsable_user_id = ${userId}) as chef,
           (select count(*) from releves_projet r where r.projet_id = p.id and r.deleted_at is null) as releves,
           (select count(*) from releves_projet r where r.projet_id = p.id and r.deleted_at is null and r.statut = 'soumis') as a_examiner
    from projets p
    where p.organization_id = ${organizationId} and p.deleted_at is null and p.statut in ('preparation', 'en_cours', 'suspendu')
      and (p.responsable_user_id = ${userId} or exists (
        select 1 from membres_projet m left join employees e on e.id = m.employee_id
        where m.projet_id = p.id and m.actif and m.deleted_at is null and coalesce(m.user_id, e.user_id) = ${userId}))
    order by p.code desc`);
  return lignes.map((l) => ({
    id: l.id,
    code: l.code,
    nom: l.nom,
    statut: l.statut,
    role: (l.role as RoleEquipe | null) ?? "superviseur",
    chef: l.chef === true,
    releves: Number(l.releves),
    aExaminer: Number(l.a_examiner),
  }));
}

export interface PreuveVue {
  id: string;
  nature: NaturePreuve;
  nomFichier: string;
  typeMime: string;
}

export interface ReleveVue {
  id: string;
  projetId: string;
  membreId: string;
  /** Qui a exercé. */
  auteur: string;
  /** Quel compte a saisi, quand ce n'est pas l'auteur (un externe, saisi par un agent). */
  saisiPar: string | null;
  saisiParUserId: string | null;
  libelle: string;
  note: string | null;
  avancement: number | null;
  latitudeMicro: number;
  longitudeMicro: number;
  precisionM: number | null;
  priseLe: Date;
  statut: StatutReleve;
  commentaire: string | null;
  revisePar: string | null;
  reviseLe: Date | null;
  preuves: PreuveVue[];
}

/** Les relevés d'un projet, du plus récent au plus ancien ; `deUserId` : seulement ceux saisis par ce compte. */
export async function relevesDuProjet(organizationId: string, projetId: string, filtre: { deUserId?: string; limite?: number } = {}): Promise<ReleveVue[]> {
  const conditions = [eq(relevesProjet.organizationId, organizationId), eq(relevesProjet.projetId, projetId), isNull(relevesProjet.deletedAt)];
  if (filtre.deUserId) conditions.push(eq(relevesProjet.saisiParUserId, filtre.deUserId));
  const lignes = await db
    .select({ r: relevesProjet, salarie: employees.nom, compteMembre: users.fullName, nomExterne: membresProjet.nom, userMembre: membresProjet.userId, userSalarie: employees.userId })
    .from(relevesProjet)
    .innerJoin(membresProjet, eq(membresProjet.id, relevesProjet.membreId))
    .leftJoin(employees, eq(employees.id, membresProjet.employeeId))
    .leftJoin(users, eq(users.id, membresProjet.userId))
    .where(and(...conditions))
    .orderBy(desc(relevesProjet.priseLe))
    .limit(filtre.limite ?? 200);
  if (lignes.length === 0) return [];
  const ids = lignes.map((l) => l.r.id);
  const [preuves, comptes] = await Promise.all([
    db.select().from(preuvesReleve).where(and(eq(preuvesReleve.organizationId, organizationId), inArray(preuvesReleve.releveId, ids))).orderBy(asc(preuvesReleve.createdAt)),
    db
      .select({ id: users.id, nom: users.fullName })
      .from(users)
      .where(inArray(users.id, [...new Set(lignes.flatMap((l) => [l.r.saisiParUserId, l.r.reviseParUserId]).filter((v): v is string => Boolean(v)))])),
  ]);
  const nomCompte = new Map(comptes.map((c) => [c.id, c.nom]));
  const parReleve = new Map<string, PreuveVue[]>();
  for (const p of preuves) {
    const liste = parReleve.get(p.releveId) ?? [];
    liste.push({ id: p.id, nature: p.nature as NaturePreuve, nomFichier: p.nomFichier, typeMime: p.typeMime });
    parReleve.set(p.releveId, liste);
  }
  return lignes.map(({ r, salarie, compteMembre, nomExterne, userMembre, userSalarie }) => {
    const auteur = salarie ?? compteMembre ?? nomExterne ?? "—";
    // « Saisi par » ne s'affiche que si le compte n'est pas celui de l'auteur : un nom de fiche et un nom de compte peuvent s'écrire autrement.
    const compteAuteur = userMembre ?? userSalarie ?? null;
    const saisiPar = r.saisiParUserId && r.saisiParUserId !== compteAuteur ? (nomCompte.get(r.saisiParUserId) ?? null) : null;
    return {
      id: r.id,
      projetId: r.projetId,
      membreId: r.membreId,
      auteur,
      saisiPar,
      saisiParUserId: r.saisiParUserId,
      libelle: r.libelle,
      note: r.note,
      avancement: r.avancement,
      latitudeMicro: r.latitudeMicro,
      longitudeMicro: r.longitudeMicro,
      precisionM: r.precisionM,
      priseLe: r.priseLe,
      statut: r.statut as StatutReleve,
      commentaire: r.commentaire,
      revisePar: r.reviseParUserId ? (nomCompte.get(r.reviseParUserId) ?? null) : null,
      reviseLe: r.reviseLe,
      preuves: parReleve.get(r.id) ?? [],
    };
  });
}

/** Les preuves demandées, avec le projet et le compte qui a saisi : de quoi contrôler l'accès avant de signer. */
export async function preuvesAvecContexte(organizationId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: preuvesReleve.id, chemin: preuvesReleve.chemin, projetId: relevesProjet.projetId, saisiParUserId: relevesProjet.saisiParUserId })
    .from(preuvesReleve)
    .innerJoin(relevesProjet, eq(relevesProjet.id, preuvesReleve.releveId))
    .where(and(eq(preuvesReleve.organizationId, organizationId), inArray(preuvesReleve.id, [...ids])));
}

// ---------------------------------------------------------------- écriture

export interface NouveauMembre {
  role: string;
  origine: string;
  /** Interne : `e:<collaborateur>` ou `u:<compte>`. */
  personne?: string | null;
  /** Externe : sa propre fiche. */
  nom?: string | null;
  telephone?: string | null;
  organisme?: string | null;
}

/**
 * Confie une personne au projet. Nommer un superviseur remplace l'ancien, qui
 * reste sur le projet comme agent : il a la connaissance du terrain.
 */
export async function confierMembrePour(organizationId: string, userId: string, projetId: string, n: NouveauMembre): Promise<{ id: string }> {
  if (!estRole(n.role)) throw new Error("Choisissez le rôle : agent ou superviseur.");
  if (!estOrigine(n.origine)) throw new Error("Précisez si la personne est interne ou externe.");
  const projet = await projetDuTerrain(organizationId, projetId);
  if (!projet) throw new Error("Projet introuvable.");
  if (!projetOuvertAuTerrain(projet.statut) && projet.statut !== "suspendu") throw new Error("Ce projet est clos : on n'y confie plus de personnel.");

  let employeeId: string | null = null;
  let compte: string | null = null;
  let nom: string | null = null;
  let telephone: string | null = null;
  let organisme: string | null = null;

  if (n.origine === "externe") {
    nom = propre(n.nom, 120);
    if (!nom || nom.length < 2) throw new Error("Indiquez le nom de la personne externe.");
    telephone = propre(n.telephone, 40);
    organisme = propre(n.organisme, 120);
    if (n.role === "superviseur") throw new Error("Le superviseur a un compte pour examiner les relevés : choisissez-le dans le personnel.");
  } else {
    const cle = n.personne ?? "";
    if (cle.startsWith("e:")) {
      const [e] = await db
        .select({ id: employees.id, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.organizationId, organizationId), eq(employees.id, cle.slice(2)), eq(employees.actif, true), isNull(employees.deletedAt)));
      if (!e) throw new Error("Cette personne ne figure pas au Personnel.");
      employeeId = e.id;
      if (e.userId) {
        const [membre] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, e.userId), eq(memberships.status, "actif")));
        compte = membre ? e.userId : null;
      }
    } else if (cle.startsWith("u:")) {
      const [membre] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, cle.slice(2)), eq(memberships.status, "actif")));
      if (!membre) throw new Error("Ce compte n'appartient pas à l'entreprise.");
      compte = cle.slice(2);
    } else {
      throw new Error("Choisissez la personne dans la liste du personnel.");
    }
    if (n.role === "superviseur" && !compte) throw new Error("Le superviseur a un compte pour examiner les relevés : cette personne n'en a pas encore.");
  }

  const id = newId();
  await db.transaction(async (tx) => {
    if (n.role === "superviseur") {
      await tx
        .update(membresProjet)
        .set({ role: "agent", updatedAt: new Date(), version: sql`${membresProjet.version} + 1` })
        .where(and(eq(membresProjet.projetId, projetId), eq(membresProjet.role, "superviseur"), eq(membresProjet.actif, true), isNull(membresProjet.deletedAt)));
    }
    await tx.insert(membresProjet).values({
      id,
      organizationId,
      projetId,
      role: n.role,
      origine: n.origine,
      employeeId,
      // Le compte d'un collaborateur se lit à sa fiche : on ne le copie que pour un compte sans fiche.
      userId: employeeId ? null : compte,
      nom,
      telephone,
      organisme,
      confiePar: userId,
    });
  });
  await tracerPour(organizationId, userId, { action: "projet.equipe.confier", entite: "projet", entiteId: projetId, apres: { membre: id, role: n.role, origine: n.origine } });
  // Prévenir la personne, si elle a un compte : elle découvre ainsi son projet.
  if (compte) await notifier(organizationId, [compte], { categorie: "projet", titre: `${projet.code} · ${n.role === "superviseur" ? "Vous supervisez" : "Vous exercez"} « ${projet.nom} »`, corps: "Le chef de projet vous a confié ce projet : retrouvez-le dans « Mon terrain ».", lien: `/terrain/${projetId}` });
  return { id };
}

export async function changerRoleMembrePour(organizationId: string, userId: string, membreId: string, role: string): Promise<void> {
  if (!estRole(role)) throw new Error("Rôle inconnu.");
  const [m] = await db
    .select({ projetId: membresProjet.projetId, actif: membresProjet.actif, origine: membresProjet.origine, employeeId: membresProjet.employeeId, userId: membresProjet.userId })
    .from(membresProjet)
    .where(and(eq(membresProjet.organizationId, organizationId), eq(membresProjet.id, membreId), isNull(membresProjet.deletedAt)));
  if (!m || !m.actif) throw new Error("Membre introuvable.");
  if (role === "superviseur") {
    const equipe = await equipeDuProjet(organizationId, m.projetId);
    const vue = equipe.find((e) => e.id === membreId);
    if (!vue?.userId) throw new Error("Le superviseur a un compte pour examiner les relevés : cette personne n'en a pas.");
  }
  await db.transaction(async (tx) => {
    if (role === "superviseur") {
      await tx
        .update(membresProjet)
        .set({ role: "agent", updatedAt: new Date(), version: sql`${membresProjet.version} + 1` })
        .where(and(eq(membresProjet.projetId, m.projetId), eq(membresProjet.role, "superviseur"), eq(membresProjet.actif, true), isNull(membresProjet.deletedAt)));
    }
    await tx.update(membresProjet).set({ role, updatedAt: new Date(), version: sql`${membresProjet.version} + 1` }).where(eq(membresProjet.id, membreId));
  });
  await tracerPour(organizationId, userId, { action: "projet.equipe.role", entite: "projet", entiteId: m.projetId, apres: { membre: membreId, role } });
}

export async function retirerMembrePour(organizationId: string, userId: string, membreId: string): Promise<void> {
  const [m] = await db
    .update(membresProjet)
    .set({ actif: false, updatedAt: new Date(), version: sql`${membresProjet.version} + 1` })
    .where(and(eq(membresProjet.organizationId, organizationId), eq(membresProjet.id, membreId), eq(membresProjet.actif, true), isNull(membresProjet.deletedAt)))
    .returning({ projetId: membresProjet.projetId });
  if (!m) throw new Error("Membre introuvable.");
  await tracerPour(organizationId, userId, { action: "projet.equipe.retirer", entite: "projet", entiteId: m.projetId, apres: { membre: membreId } });
}

export interface FichierPreuve {
  nature: NaturePreuve;
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

export interface NouveauReleve {
  /** Qui a exercé ; absent : le membre en poste lié au compte qui saisit. */
  membreId?: string | null;
  libelle: string;
  note?: string | null;
  avancement?: unknown;
  position: Position | null;
  priseLe: Date;
  fichiers: FichierPreuve[];
}

/**
 * Enregistre un relevé et ses preuves. Les fichiers partent d'abord au dépôt,
 * la fiche s'écrit ensuite ; si elle échoue, les fichiers sont retirés — un
 * fichier orphelin ne se retrouve jamais. Le superviseur et le chef de projet
 * sont prévenus dans la cloche.
 */
export async function creerRelevePour(organizationId: string, userId: string, projetId: string, n: NouveauReleve, equipe: readonly MembreVue[]): Promise<{ id: string }> {
  const projet = await projetDuTerrain(organizationId, projetId);
  if (!projet) throw new Error("Projet introuvable.");
  if (!projetOuvertAuTerrain(projet.statut)) throw new Error("Ce projet n'est plus en cours : on n'y relève plus.");
  const libelle = propre(n.libelle, 200);
  if (!libelle || libelle.length < 3) throw new Error("Donnez un titre au relevé : ce que vous avez constaté ou fait.");
  const avancement = lireAvancement(n.avancement);
  if (avancement === "invalide") throw new Error("L'avancement est un pourcentage entier, de 0 à 100.");
  const manque = manqueAuReleve(n.fichiers.length, n.position !== null);
  if (manque) throw new Error(manque);
  if (n.priseLe.getTime() > Date.now() + 5 * 60_000) throw new Error("L'heure de l'appareil est dans le futur : corrigez-la avant de relever.");
  const position = n.position as Position;

  const membre = n.membreId ? equipe.find((m) => m.id === n.membreId) : equipe.find((m) => m.userId === userId);
  if (!membre) throw new Error("Cette personne n'est pas en poste sur ce projet.");

  const id = newId();
  const deposes: string[] = [];
  try {
    const preuves: { id: string; nature: NaturePreuve; chemin: string; nom: string; typeMime: string; taille: number }[] = [];
    for (const f of n.fichiers.slice(0, PREUVES_MAX)) {
      const pid = newId();
      const extension = f.nom.includes(".") ? f.nom.split(".").pop()! : "jpg";
      const chemin = cheminDe(organizationId, pid, extension);
      const depot = await deposer({ chemin, contenu: f.contenu, typeMime: f.typeMime });
      if (!depot.ok) throw new Error(depot.raison);
      deposes.push(chemin);
      preuves.push({ id: pid, nature: f.nature, chemin, nom: f.nom, typeMime: f.typeMime, taille: f.contenu.byteLength });
    }
    await db.transaction(async (tx) => {
      await tx.insert(relevesProjet).values({
        id,
        organizationId,
        projetId,
        membreId: membre.id,
        saisiParUserId: userId,
        libelle,
        note: propre(n.note, 2000),
        avancement,
        latitudeMicro: position.latitudeMicro,
        longitudeMicro: position.longitudeMicro,
        precisionM: position.precisionM,
        priseLe: n.priseLe,
      });
      await tx.insert(preuvesReleve).values(
        preuves.map((p) => ({ id: p.id, organizationId, releveId: id, nature: p.nature, chemin: p.chemin, nomFichier: p.nom, typeMime: p.typeMime, tailleOctets: p.taille })),
      );
    });
  } catch (erreur) {
    await Promise.all(deposes.map((c) => supprimer(c)));
    throw erreur;
  }
  await tracerPour(organizationId, userId, { action: "projet.releve.creer", entite: "projet", entiteId: projetId, apres: { releve: id, membre: membre.id, preuves: n.fichiers.length } });
  const superviseur = equipe.find((m) => m.role === "superviseur" && m.actif)?.userId ?? null;
  await notifier(organizationId, [superviseur, projet.responsableUserId].filter((u): u is string => Boolean(u) && u !== userId), {
    categorie: "projet",
    titre: `${projet.code} · Nouveau relevé de ${membre.nom}`,
    corps: libelle,
    lien: `/terrain/${projetId}#releve-${id}`,
  });
  return { id };
}

/** Valide un relevé, ou le renvoie avec ce qu'il faut refaire ; l'auteur est prévenu. */
export async function examinerRelevePour(organizationId: string, userId: string, releveId: string, decision: string, commentaire: string): Promise<{ projetId: string }> {
  if (decision !== "valide" && decision !== "a_refaire") throw new Error("Décision inconnue.");
  const [r] = await db
    .select({ id: relevesProjet.id, projetId: relevesProjet.projetId, statut: relevesProjet.statut, libelle: relevesProjet.libelle, saisiParUserId: relevesProjet.saisiParUserId })
    .from(relevesProjet)
    .where(and(eq(relevesProjet.organizationId, organizationId), eq(relevesProjet.id, releveId), isNull(relevesProjet.deletedAt)));
  if (!r) throw new Error("Relevé introuvable.");
  const refus = decisionPermise(r.statut as StatutReleve, decision, commentaire);
  if (refus) throw new Error(refus);
  const motif = propre(commentaire, 1000);
  await db
    .update(relevesProjet)
    .set({ statut: decision, reviseParUserId: userId, reviseLe: new Date(), commentaire: motif, updatedAt: new Date(), version: sql`${relevesProjet.version} + 1` })
    .where(eq(relevesProjet.id, releveId));
  await tracerPour(organizationId, userId, { action: "projet.releve.examiner", entite: "projet", entiteId: r.projetId, apres: { releve: releveId, decision } });
  if (r.saisiParUserId && r.saisiParUserId !== userId) {
    await notifier(organizationId, [r.saisiParUserId], {
      categorie: "projet",
      titre: `Relevé ${LIBELLE_STATUT_RELEVE[decision].toLowerCase()} : ${r.libelle}`,
      corps: motif ?? undefined,
      lien: `/terrain/${r.projetId}#releve-${releveId}`,
    });
  }
  return { projetId: r.projetId };
}
