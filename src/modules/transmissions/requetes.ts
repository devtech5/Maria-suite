import "server-only";

import { aliasedTable, and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { memberships, services, tiers, users } from "@/db/schema";
import { employees } from "@/modules/personnes/schema";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { moduleOuvert } from "@/lib/modules/garde";
import { prochainNumero } from "@/lib/sequences";
import { cheminDe, deposer, supprimer, urlSignee } from "@/lib/stockage";
import { notifier } from "@/modules/communication/notifications";
import { aujourdhuiPour } from "@/modules/reglement/requetes";

import {
  AVIS,
  MENTIONS,
  MOYENS,
  avisDensemble,
  formatNumero,
  normaliserPieces,
  passagePermis,
  relanceDue,
  statutInitial,
  valide,
  type Avis,
  type Piece,
  type Sens,
  type Statut,
} from "./regles";
import { transmissions, type Transmission } from "./schema";

/**
 * Transmissions, côté base. L'entreprise en premier argument, toujours ; les
 * actions vérifient les droits.
 */

export { aujourdhuiPour };

const emetteurs = aliasedTable(users, "emetteurs");
const destinataires = aliasedTable(users, "destinataires");
const responsables = aliasedTable(users, "responsables");
const servicesEmetteurs = aliasedTable(services, "services_emetteurs");
const servicesDestinataires = aliasedTable(services, "services_destinataires");

export type LigneTransmission = Transmission & {
  sens: Sens;
  statut: Statut;
  emetteurNom: string | null;
  emetteurService: string | null;
  destinataireNom: string | null;
  destinataireService: string | null;
  responsableNom: string | null;
  tiersNom: string | null;
};

function requete() {
  return db
    .select({
      t: transmissions,
      emetteurNom: emetteurs.fullName,
      emetteurService: servicesEmetteurs.libelle,
      destinataireNom: destinataires.fullName,
      destinataireService: servicesDestinataires.libelle,
      responsableNom: responsables.fullName,
      tiersNom: tiers.nom,
    })
    .from(transmissions)
    .leftJoin(emetteurs, eq(emetteurs.id, transmissions.emetteurUserId))
    .leftJoin(destinataires, eq(destinataires.id, transmissions.destinataireUserId))
    .leftJoin(responsables, eq(responsables.id, transmissions.responsableUserId))
    .leftJoin(servicesEmetteurs, eq(servicesEmetteurs.id, transmissions.emetteurServiceId))
    .leftJoin(servicesDestinataires, eq(servicesDestinataires.id, transmissions.destinataireServiceId))
    .leftJoin(tiers, eq(tiers.id, transmissions.tiersId));
}

type Brute = Awaited<ReturnType<ReturnType<typeof requete>["where"]>>[number];
const aplatir = (r: Brute): LigneTransmission => ({
  ...r.t,
  sens: r.t.sens as Sens,
  statut: r.t.statut as Statut,
  emetteurNom: r.emetteurNom,
  emetteurService: r.emetteurService,
  destinataireNom: r.destinataireNom,
  destinataireService: r.destinataireService,
  responsableNom: r.responsableNom,
  tiersNom: r.tiersNom,
});

export interface FiltreTransmissions {
  sens?: Sens;
  statuts?: Statut[];
  /** Ne garder que ce qui concerne ce compte : émis, suivi ou reçu. */
  concerne?: string;
  destinataire?: string;
  recherche?: string;
  limite?: number;
}

export async function transmissionsDe(organizationId: string, f: FiltreTransmissions = {}): Promise<LigneTransmission[]> {
  const conditions: (SQL | undefined)[] = [
    eq(transmissions.organizationId, organizationId),
    isNull(transmissions.deletedAt),
    f.sens ? eq(transmissions.sens, f.sens) : undefined,
    f.statuts?.length ? inArray(transmissions.statut, f.statuts) : undefined,
    f.destinataire ? eq(transmissions.destinataireUserId, f.destinataire) : undefined,
    f.concerne
      ? or(
          eq(transmissions.emetteurUserId, f.concerne),
          eq(transmissions.responsableUserId, f.concerne),
          eq(transmissions.destinataireUserId, f.concerne),
          eq(transmissions.creePar, f.concerne),
        )
      : undefined,
  ];
  const mots = (f.recherche ?? "").trim();
  if (mots) {
    const motif = `%${mots.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(transmissions.numero, motif), ilike(transmissions.objet, motif), ilike(transmissions.entreprise, motif), sql`${transmissions.pieces}::text ilike ${motif}`));
  }
  const lignes = await requete()
    .where(and(...conditions))
    .orderBy(desc(transmissions.createdAt))
    .limit(f.limite ?? 300);
  return lignes.map(aplatir);
}

export async function transmissionDe(organizationId: string, id: string): Promise<LigneTransmission | null> {
  const [l] = await requete().where(and(eq(transmissions.organizationId, organizationId), eq(transmissions.id, id), isNull(transmissions.deletedAt)));
  return l ? aplatir(l) : null;
}

async function verifierMembre(organizationId: string, userId: string) {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId), eq(memberships.status, "actif")));
  if (!m) throw new Error("Ce compte n'est pas un membre actif de l'entreprise.");
}

export interface NouvelleTransmission {
  sens: Sens;
  objet: string;
  mention: string;
  pieces: unknown;
  emetteurServiceId: string | null;
  destinataireUserId: string | null;
  destinataireServiceId: string | null;
  tiersId: string | null;
  entreprise: string;
  contact: string;
  responsableUserId: string | null;
  dateLimite: string;
  /** Déjà transmise (sortante) ou déjà reçue (entrante) : on enregistre le fait. */
  dejaFait: boolean;
  moyen: string;
}

/** Établit un bordereau : numéro dans la transaction, destinataire interne prévenu. */
export async function creerTransmissionPour(organizationId: string, userId: string, n: NouvelleTransmission, maintenant = new Date()): Promise<{ id: string; numero: string }> {
  const objet = n.objet.trim();
  if (objet.length < 2 || objet.length > 200) throw new Error("Indiquez l'objet de la transmission (200 caractères au plus).");
  if (!valide(MENTIONS, n.mention)) throw new Error("Choisissez la mention.");
  const pieces = normaliserPieces(n.pieces);
  if (n.dateLimite && !/^\d{4}-\d{2}-\d{2}$/.test(n.dateLimite)) throw new Error("Date limite illisible.");
  if (n.moyen && !valide(MOYENS, n.moyen)) throw new Error("Moyen de transmission inconnu.");

  if (n.sens === "interne") {
    if (!n.destinataireUserId) throw new Error("Choisissez le destinataire.");
    await verifierMembre(organizationId, n.destinataireUserId);
  } else {
    if (!n.tiersId && n.entreprise.trim().length < 2) throw new Error("Indiquez l'entreprise.");
    if (n.tiersId) {
      const [t] = await db.select({ id: tiers.id }).from(tiers).where(and(eq(tiers.organizationId, organizationId), eq(tiers.id, n.tiersId)));
      if (!t) throw new Error("Entreprise introuvable.");
    }
    if (!n.dejaFait && !n.dateLimite) throw new Error(n.sens === "entrante" ? "Indiquez la date à laquelle l'entreprise doit transmettre." : "Indiquez la date limite de transmission.");
  }
  const responsable = n.responsableUserId ?? userId;
  if (n.responsableUserId) await verifierMembre(organizationId, n.responsableUserId);

  const statut = statutInitial(n.sens, n.dejaFait);
  const id = newId();
  const numero = await db.transaction(async (tx) => {
    const num = await prochainNumero(tx, organizationId, formatNumero(maintenant.getUTCFullYear()));
    await tx.insert(transmissions).values({
      id,
      organizationId,
      numero: num,
      sens: n.sens,
      statut,
      objet,
      mention: n.mention,
      pieces,
      emetteurUserId: n.sens === "entrante" ? null : userId,
      emetteurServiceId: n.emetteurServiceId,
      destinataireUserId: n.sens === "interne" ? n.destinataireUserId : null,
      destinataireServiceId: n.sens === "interne" ? n.destinataireServiceId : null,
      tiersId: n.sens === "interne" ? null : n.tiersId,
      entreprise: n.sens === "interne" ? null : n.entreprise.trim().slice(0, 160) || null,
      contact: n.contact.trim().slice(0, 160) || null,
      responsableUserId: responsable,
      dateLimite: n.dateLimite || null,
      moyen: n.moyen || null,
      transmiseLe: statut === "transmise" ? maintenant : null,
      recueLe: statut === "recue" ? maintenant : null,
      creePar: userId,
    });
    return num;
  });
  await tracerPour(organizationId, userId, { action: `transmission.${n.sens}`, entite: "transmission", entiteId: id, apres: { numero, statut } });
  if (n.sens === "interne" && n.destinataireUserId && n.destinataireUserId !== userId) {
    await notifier(organizationId, [n.destinataireUserId], {
      categorie: "transmission",
      titre: `📎 Transmission ${numero} : ${MENTIONS[n.mention as keyof typeof MENTIONS].toLowerCase()}`,
      corps: `${objet} · ${pieces.length} pièce${pieces.length > 1 ? "s" : ""}`,
      lien: `/transmissions/${id}`,
    });
  }
  return { id, numero };
}

async function brute(organizationId: string, id: string): Promise<Transmission> {
  const [t] = await db.select().from(transmissions).where(and(eq(transmissions.organizationId, organizationId), eq(transmissions.id, id), isNull(transmissions.deletedAt)));
  if (!t) throw new Error("Transmission introuvable.");
  return t;
}

async function passer(organizationId: string, t: Transmission, vers: Statut, champs: Partial<typeof transmissions.$inferInsert>) {
  if (!passagePermis(t.sens as Sens, t.statut as Statut, vers)) throw new Error(`Ce bordereau est « ${t.statut} » : ce geste n'est plus possible.`);
  const faits = await db
    .update(transmissions)
    .set({ ...champs, statut: vers, updatedAt: new Date(), version: sql`${transmissions.version} + 1` })
    .where(and(eq(transmissions.organizationId, organizationId), eq(transmissions.id, t.id), eq(transmissions.statut, t.statut)))
    .returning({ id: transmissions.id });
  if (faits.length === 0) throw new Error("Le bordereau vient de changer : rechargez la page.");
}

/** Une obligation sortante tenue : transmise, par tel moyen. */
export async function transmettrePour(organizationId: string, userId: string, id: string, moyen: string, maintenant = new Date()): Promise<void> {
  const t = await brute(organizationId, id);
  if (moyen && !valide(MOYENS, moyen)) throw new Error("Moyen de transmission inconnu.");
  await passer(organizationId, t, "transmise", { transmiseLe: maintenant, moyen: moyen || t.moyen });
  await tracerPour(organizationId, userId, { action: "transmission.transmettre", entite: "transmission", entiteId: id });
}

/**
 * Accusé de réception : par le destinataire lui-même (interne), ou noté par
 * l'émetteur pour l'entreprise qui a signé la décharge (sortante).
 */
export async function accuserPour(organizationId: string, userId: string, id: string, signataire: string, maintenant = new Date()): Promise<void> {
  const t = await brute(organizationId, id);
  if (t.sens === "interne" && t.destinataireUserId !== userId) throw new Error("Ce bordereau ne vous est pas adressé.");
  if (t.sens === "sortante" && signataire.trim().length < 2) throw new Error("Indiquez qui a signé l'accusé de réception.");
  const [moi] = await db.select({ nom: users.fullName }).from(users).where(eq(users.id, userId));
  await passer(organizationId, t, "accusee", { accuseLe: maintenant, accusePar: t.sens === "interne" ? (moi?.nom ?? null) : signataire.trim().slice(0, 120) });
  await tracerPour(organizationId, userId, { action: "transmission.accuser", entite: "transmission", entiteId: id });
  if (t.sens === "interne" && t.emetteurUserId && t.emetteurUserId !== userId) {
    await notifier(organizationId, [t.emetteurUserId], { categorie: "transmission", titre: `✅ ${t.numero} reçu par ${moi?.nom ?? "son destinataire"}`, corps: t.objet, lien: `/transmissions/${id}` });
  }
}

/** Une obligation entrante tenue : l'entreprise a transmis. */
export async function recevoirPour(organizationId: string, userId: string, id: string, moyen: string, maintenant = new Date()): Promise<void> {
  const t = await brute(organizationId, id);
  if (moyen && !valide(MOYENS, moyen)) throw new Error("Moyen de transmission inconnu.");
  await passer(organizationId, t, "recue", { recueLe: maintenant, moyen: moyen || t.moyen });
  await tracerPour(organizationId, userId, { action: "transmission.recevoir", entite: "transmission", entiteId: id });
}

/**
 * Le retour : l'avis rendu pièce par pièce (visa, bon pour exécution…) et
 * une note. L'avis d'ensemble est le plus sévère des avis des pièces.
 */
export async function traiterPour(
  organizationId: string,
  userId: string,
  id: string,
  retour: { avis: Record<number, string>; observations: Record<number, string>; note: string },
  maintenant = new Date(),
): Promise<{ avis: Avis | null }> {
  const t = await brute(organizationId, id);
  if (t.sens === "interne" && t.destinataireUserId !== userId) throw new Error("Seul le destinataire rend le retour d'un bordereau interne.");
  const pieces: Piece[] = (t.pieces as Piece[]).map((p, i) => ({
    ...p,
    avis: valide(AVIS, retour.avis[i]) ? (retour.avis[i] as Avis) : p.avis,
    observation: (retour.observations[i] ?? p.observation ?? "").trim().slice(0, 500),
  }));
  const avis = avisDensemble(pieces);
  await passer(organizationId, t, "traitee", { pieces, avis, note: retour.note.trim().slice(0, 1000) || null, traiteeLe: maintenant });
  await tracerPour(organizationId, userId, { action: "transmission.traiter", entite: "transmission", entiteId: id, apres: { avis } });
  const prevenir = t.sens === "interne" ? t.emetteurUserId : t.responsableUserId;
  if (prevenir && prevenir !== userId) {
    await notifier(organizationId, [prevenir], {
      categorie: "transmission",
      titre: `↩️ Retour sur ${t.numero}${avis ? ` : ${AVIS[avis].toLowerCase()}` : ""}`,
      corps: t.objet,
      lien: `/transmissions/${id}`,
    });
  }
  return { avis };
}

export async function annulerPour(organizationId: string, userId: string, id: string): Promise<void> {
  const t = await brute(organizationId, id);
  await passer(organizationId, t, "annulee", {});
  await tracerPour(organizationId, userId, { action: "transmission.annuler", entite: "transmission", entiteId: id });
}

/** Joint (ou remplace) la preuve : décharge, accusé, scan reçu. */
export async function deposerPreuvePour(organizationId: string, userId: string, id: string, fichier: { contenu: ArrayBuffer; typeMime: string }): Promise<void> {
  const t = await brute(organizationId, id);
  const extension = fichier.typeMime === "application/pdf" ? "pdf" : fichier.typeMime === "image/png" ? "png" : fichier.typeMime === "image/webp" ? "webp" : "jpg";
  const chemin = cheminDe(organizationId, newId(), extension);
  const depot = await deposer({ chemin, contenu: fichier.contenu, typeMime: fichier.typeMime });
  if (!depot.ok) throw new Error(depot.raison);
  await db.update(transmissions).set({ preuve: chemin, preuveType: fichier.typeMime, updatedAt: new Date() }).where(eq(transmissions.id, id));
  if (t.preuve) await supprimer(t.preuve);
  await tracerPour(organizationId, userId, { action: "transmission.preuve", entite: "transmission", entiteId: id });
}

export async function urlPreuvePour(organizationId: string, userId: string, id: string): Promise<string | null> {
  const t = await brute(organizationId, id);
  if (!t.preuve) return null;
  await tracerPour(organizationId, userId, { action: "transmission.preuve_ouvrir", entite: "transmission", entiteId: id });
  return urlSignee(t.preuve, 120);
}

/** Relance les obligations en retard, au responsable : une fois par jour au plus. */
export async function relancerRetardsPour(organizationId: string, maintenant = new Date()): Promise<number> {
  const aujourdhui = await aujourdhuiPour(organizationId, maintenant);
  const candidats = await db
    .select()
    .from(transmissions)
    .where(
      and(
        eq(transmissions.organizationId, organizationId),
        isNull(transmissions.deletedAt),
        inArray(transmissions.statut, ["a_transmettre", "attendue"]),
        sql`${transmissions.dateLimite} < ${aujourdhui}::date`,
      ),
    )
    .limit(500);
  let n = 0;
  for (const t of candidats) {
    if (!t.responsableUserId) continue;
    if (!relanceDue({ statut: t.statut as Statut, dateLimite: t.dateLimite, derniereRelanceLe: t.derniereRelanceLe }, aujourdhui, maintenant)) continue;
    await db.update(transmissions).set({ derniereRelanceLe: maintenant }).where(eq(transmissions.id, t.id));
    const qui = t.entreprise ?? "l'entreprise";
    await notifier(organizationId, [t.responsableUserId], {
      categorie: "transmission",
      titre: t.statut === "attendue" ? `⏰ ${qui} n'a pas transmis : ${t.numero}` : `⏰ À transmettre à ${qui} : ${t.numero}`,
      corps: `${t.objet} · date limite ${(t.dateLimite as string).split("-").reverse().join("/")}`,
      lien: `/transmissions/${t.id}`,
    });
    n++;
  }
  return n;
}

const PAS_MS = 60 * 60_000;
const verifiees = new Map<string, number>();

export function relancerApresReponse(organizationId: string | null): void {
  if (!organizationId || !moduleOuvert("transmissions")) return;
  const maintenant = Date.now();
  if (maintenant - (verifiees.get(organizationId) ?? 0) < PAS_MS) return;
  verifiees.set(organizationId, maintenant);
  after(() =>
    relancerRetardsPour(organizationId).catch((erreur) => {
      console.error("Relances des transmissions", erreur);
    }),
  );
}

export interface ChoixPersonne {
  /** Le compte quand il y en a un ; sinon la fiche du salarié, jamais proposée comme destinataire. */
  id: string;
  nom: string;
  /** « Ingénieur · Chantier de Cocody » : de quoi distinguer deux homonymes. */
  detail: string | null;
  /** Salarié sans compte : il n'ouvre pas le logiciel, un bordereau ne peut pas lui être adressé. */
  sansCompte: boolean;
}

/**
 * Pour les formulaires : tout le personnel (salariés en poste, avec ou sans
 * compte) et les comptes sans fiche de salarié — l'associé, le comptable
 * externe —, les services, les entreprises du fichier tiers. Pas de saisie :
 * on choisit dans la liste.
 */
export async function choixPossibles(organizationId: string): Promise<{ personnes: ChoixPersonne[]; services: { id: string; libelle: string; code: string }[]; entreprises: { id: string; nom: string }[] }> {
  const [salaries, comptes, liste, entreprises] = await Promise.all([
    db
      .select({ id: employees.id, nom: employees.nom, poste: employees.poste, service: employees.service, userId: employees.userId })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt))),
    db
      .select({ id: users.id, nom: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), eq(users.status, "actif"))),
    db
      .select({ id: services.id, libelle: services.libelle, code: services.code })
      .from(services)
      .where(and(eq(services.organizationId, organizationId), eq(services.actif, true), isNull(services.deletedAt)))
      .orderBy(services.libelle),
    db
      .select({ id: tiers.id, nom: tiers.nom })
      .from(tiers)
      .where(and(eq(tiers.organizationId, organizationId), eq(tiers.actif, true), isNull(tiers.deletedAt)))
      .orderBy(tiers.nom)
      .limit(1000),
  ]);
  const actifs = new Set(comptes.map((c) => c.id));
  const dejaVus = new Set<string>();
  const personnes: ChoixPersonne[] = [];
  for (const s of salaries) {
    // Un compte suspendu ou retiré ne reçoit plus rien : le salarié passe « sans compte ».
    const compte = s.userId && actifs.has(s.userId) ? s.userId : null;
    if (compte) dejaVus.add(compte);
    personnes.push({ id: compte ?? s.id, nom: s.nom, detail: [s.poste, s.service].filter(Boolean).join(" · ") || null, sansCompte: compte === null });
  }
  for (const c of comptes) if (!dejaVus.has(c.id)) personnes.push({ id: c.id, nom: c.nom, detail: null, sansCompte: false });
  personnes.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
  return { personnes, services: liste, entreprises };
}
