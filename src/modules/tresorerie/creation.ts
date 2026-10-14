import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, memberships, users } from "@/db/schema";
import type { Ecriture } from "@/lib/comptabilite/ecritures";
import { contrepasser } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";
import { enregistrerEcritureDans, type OrigineEcriture } from "@/modules/comptabilite/enregistrement";
import { employees, workers } from "@/modules/personnes/schema";
import { tiers } from "@/modules/tiers/schema";

import {
  compteTresorerieValide,
  COMPTES_RESERVES,
  ecritureArrete,
  ecritureAvance,
  ecritureBon,
  ecritureEnvoi,
  ecritureJustification,
  ecritureLigneReleve,
  ecritureReception,
  ecritureRemboursement,
  rapprocherAuto,
  refusRegularisation,
  resteAvance,
  type CompteRef,
  type LigneReleve,
  type NatureBon,
  type NatureCompte,
} from "./calcul";
import {
  arretesCaisse,
  avancesTresorerie,
  bonsCaisse,
  comptesTresorerie,
  importsReleve,
  lignesReleve,
  regularisationsAvance,
  virementsInternes,
} from "./schema";

type Executant = Transaction | typeof db;

async function journaliser(
  tx: Executant,
  organizationId: string,
  userId: string,
  action: string,
  entiteId: string,
  apres: Record<string, unknown>,
) {
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action,
    entityType: action.split(".")[0],
    entityId: entiteId,
    after: apres,
  });
}

async function numeroter(tx: Transaction, organizationId: string, cle: string, prefixe: string, date: string) {
  const annee = date.slice(0, 4);
  return prochainNumero(tx, organizationId, { cle, prefix: `${prefixe}-${annee}-`, padding: 5, periode: annee });
}

async function passer(
  tx: Transaction,
  organizationId: string,
  userId: string,
  origine: OrigineEcriture,
  pieceId: string,
  ecriture: Ecriture,
): Promise<string> {
  return enregistrerEcritureDans(tx, ecriture, {
    organizationId,
    userId,
    origine,
    pieceId,
    exercice: ecriture.date.slice(0, 4),
    dateIso: ecriture.date,
  });
}

/** Solde d'un compte SYSCOHADA : la somme de ses écritures, débit moins crédit. */
export async function soldeDuCompte(tx: Executant, organizationId: string, compte: string): Promise<number> {
  const [l] = await tx.execute<{ solde: string | null }>(sql`
    select coalesce(sum(l.debit - l.credit), 0) as solde
    from lignes_ecriture l join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId} and e.organization_id = ${organizationId} and l.compte = ${compte}
  `);
  return Number(l?.solde ?? 0);
}

/** Un compte de trésorerie, actif, de l'entreprise. Verrouillé dans la transaction. */
export async function compteDe(tx: Transaction, organizationId: string, id: string): Promise<CompteRef & { id: string; nom: string }> {
  const [c] = await tx
    .select()
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.id, id), eq(comptesTresorerie.organizationId, organizationId)))
    .for("update");
  if (!c) throw new Error("Compte de trésorerie introuvable.");
  if (!c.actif) throw new Error(`« ${c.nom} » est fermé.`);
  return { id: c.id, nom: c.nom, numero: c.compte, libelle: c.nom, nature: c.nature };
}

/**
 * Une caisse et un portefeuille mobile money ne passent pas sous zéro : on ne
 * sort pas des billets qu'on n'a pas. Une banque peut avoir un découvert
 * autorisé — la banque refusera elle-même ce qu'elle n'accorde pas.
 */
export async function exigerProvision(tx: Transaction, organizationId: string, compte: CompteRef & { nom: string }, montant: number) {
  if (compte.nature === "banque") return;
  const solde = await soldeDuCompte(tx, organizationId, compte.numero);
  if (solde < montant) {
    throw new Error(`« ${compte.nom} » ne contient que ${solde.toLocaleString("fr-FR")} F : impossible d'en sortir ${montant.toLocaleString("fr-FR")}.`);
  }
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ comptes

export interface DefinitionCompte {
  nom: string;
  nature: NatureCompte;
  compte: string;
  etablissement?: string | null;
  reference?: string | null;
  responsableUserId?: string | null;
  seuilAlerte: number;
}

export async function creerCompteDans(tx: Transaction, organizationId: string, d: DefinitionCompte, userId: string): Promise<{ id: string }> {
  if (!compteTresorerieValide(d.compte)) throw new Error("Le compte doit être un compte de trésorerie de classe 5 (52, 53, 55 ou 57).");
  const id = newId();
  await tx.insert(comptesTresorerie).values({
    id,
    organizationId,
    nom: d.nom.trim(),
    nature: d.nature,
    compte: d.compte,
    etablissement: d.etablissement?.trim() || null,
    reference: d.reference?.trim() || null,
    responsableUserId: d.responsableUserId ?? null,
    seuilAlerte: d.seuilAlerte,
  });
  await journaliser(tx, organizationId, userId, "compte_tresorerie.creer", id, { nom: d.nom, nature: d.nature, compte: d.compte });
  return { id };
}

export async function modifierCompteDans(
  tx: Transaction,
  organizationId: string,
  id: string,
  d: Omit<DefinitionCompte, "compte" | "nature"> & { actif: boolean },
  userId: string,
): Promise<void> {
  const [modifie] = await tx
    .update(comptesTresorerie)
    .set({
      nom: d.nom.trim(),
      etablissement: d.etablissement?.trim() || null,
      reference: d.reference?.trim() || null,
      responsableUserId: d.responsableUserId ?? null,
      seuilAlerte: d.seuilAlerte,
      actif: d.actif,
      updatedAt: new Date(),
      version: sql`${comptesTresorerie.version} + 1`,
    })
    .where(and(eq(comptesTresorerie.id, id), eq(comptesTresorerie.organizationId, organizationId)))
    .returning({ id: comptesTresorerie.id });
  if (!modifie) throw new Error("Compte de trésorerie introuvable.");
  await journaliser(tx, organizationId, userId, "compte_tresorerie.modifier", id, { nom: d.nom, seuilAlerte: d.seuilAlerte, actif: d.actif });
}

/**
 * Reprend les comptes de classe 5 déjà mouvementés par les autres modules —
 * la caisse du point de vente, la banque des factures, le float du guichet —
 * pour que la trésorerie montre tout l'argent dès le premier jour.
 */
export async function reprendreComptesExistants(organizationId: string, userId: string): Promise<number> {
  const utilises = await db.execute<{ compte: string; libelle: string }>(sql`
    select l.compte, min(l.libelle_compte) as libelle
    from lignes_ecriture l
    where l.organization_id = ${organizationId} and l.compte ~ '^5[2357][0-9]{0,4}$'
      and not exists (select 1 from comptes_tresorerie c where c.organization_id = ${organizationId} and c.compte = l.compte)
    group by l.compte
    order by l.compte
  `);
  if (utilises.length === 0) return 0;

  const nature = (compte: string): NatureCompte =>
    compte.startsWith("52") || compte.startsWith("53")
      ? "banque"
      : compte.startsWith("55") || COMPTES_RESERVES.includes(compte)
        ? "mobile_money"
        : "caisse";

  await db.transaction(async (tx) => {
    const noms = new Set(
      (await tx.select({ nom: comptesTresorerie.nom }).from(comptesTresorerie).where(eq(comptesTresorerie.organizationId, organizationId))).map(
        (n) => n.nom,
      ),
    );
    for (const u of utilises) {
      // Un libellé déjà pris reçoit son numéro de compte : deux « Caisse » se confondraient.
      const base = u.libelle || `Compte ${u.compte}`;
      const nom = noms.has(base) ? `${base} (${u.compte})` : base;
      noms.add(nom);
      await creerCompteDans(tx, organizationId, { nom, nature: nature(u.compte), compte: u.compte, seuilAlerte: 0 }, userId);
    }
  });
  return utilises.length;
}

// --------------------------------------------------------- virements internes

export interface NouveauVirement {
  sourceId: string;
  destinationId: string;
  montant: number;
  frais: number;
  date: string;
  reference?: string | null;
  motif?: string | null;
  /** Arrivé tout de suite : remise de main à main entre deux caisses. */
  recuImmediat: boolean;
}

export async function envoyerVirementDans(
  tx: Transaction,
  organizationId: string,
  v: NouveauVirement,
  userId: string,
): Promise<{ numero: string; ecritures: string[] }> {
  if (v.sourceId === v.destinationId) throw new Error("La source et la destination sont le même compte.");
  const source = await compteDe(tx, organizationId, v.sourceId);
  const destination = await compteDe(tx, organizationId, v.destinationId);
  await exigerProvision(tx, organizationId, source, v.montant + v.frais);

  const numero = await numeroter(tx, organizationId, "virement", "VIR", v.date);
  const id = newId();
  const envoi = await passer(
    tx,
    organizationId,
    userId,
    "virement",
    id,
    ecritureEnvoi({ numero, date: v.date, source, destination: destination.nom, montant: v.montant, frais: v.frais }),
  );
  let reception: string | null = null;
  if (v.recuImmediat) {
    reception = await passer(
      tx,
      organizationId,
      userId,
      "virement",
      id,
      ecritureReception({ numero, date: v.date, destination, source: source.nom, montant: v.montant }),
    );
  }

  await tx.insert(virementsInternes).values({
    id,
    organizationId,
    numero,
    sourceId: source.id,
    destinationId: destination.id,
    montant: v.montant,
    frais: v.frais,
    dateEnvoi: v.date,
    reference: v.reference?.trim() || null,
    motif: v.motif?.trim() || null,
    statut: v.recuImmediat ? "recu" : "en_transit",
    ecritureEnvoi: envoi,
    envoyeParUserId: userId,
    dateReception: v.recuImmediat ? v.date : null,
    ecritureReception: reception,
    recuParUserId: v.recuImmediat ? userId : null,
  });
  await journaliser(tx, organizationId, userId, "virement.envoyer", id, {
    numero,
    source: source.nom,
    destination: destination.nom,
    montant: v.montant,
    frais: v.frais,
    recu: v.recuImmediat,
  });
  return { numero, ecritures: reception ? [envoi, reception] : [envoi] };
}

async function virementVerrouille(tx: Transaction, organizationId: string, id: string) {
  const [v] = await tx
    .select()
    .from(virementsInternes)
    .where(and(eq(virementsInternes.id, id), eq(virementsInternes.organizationId, organizationId)))
    .for("update");
  if (!v) throw new Error("Virement introuvable.");
  if (v.statut !== "en_transit") throw new Error(`${v.numero} n'est plus en transit.`);
  return v;
}

/** Constate l'arrivée d'un virement : la banque a crédité, la caisse a reçu. */
export async function recevoirVirementDans(tx: Transaction, organizationId: string, id: string, date: string, userId: string): Promise<{ numero: string }> {
  const v = await virementVerrouille(tx, organizationId, id);
  if (date < v.dateEnvoi) throw new Error("L'argent ne peut pas arriver avant d'être parti.");
  const destination = await compteDe(tx, organizationId, v.destinationId);
  const [source] = await tx.select({ nom: comptesTresorerie.nom }).from(comptesTresorerie).where(eq(comptesTresorerie.id, v.sourceId));
  const ecriture = await passer(
    tx,
    organizationId,
    userId,
    "virement",
    v.id,
    ecritureReception({ numero: v.numero, date, destination, source: source?.nom ?? "—", montant: v.montant }),
  );
  await tx
    .update(virementsInternes)
    .set({ statut: "recu", dateReception: date, ecritureReception: ecriture, recuParUserId: userId, updatedAt: new Date(), version: sql`${virementsInternes.version} + 1` })
    .where(eq(virementsInternes.id, v.id));
  await journaliser(tx, organizationId, userId, "virement.recevoir", v.id, { numero: v.numero, date, ecriture });
  return { numero: v.numero };
}

/**
 * Annule un virement encore en route : l'argent revient à la source, frais
 * compris si la banque les rend — sinon on les laisse, ils ont été payés.
 * L'écriture d'envoi n'est pas effacée, elle est contrepassée.
 */
export async function annulerVirementDans(tx: Transaction, organizationId: string, id: string, motif: string, userId: string): Promise<{ numero: string }> {
  const v = await virementVerrouille(tx, organizationId, id);
  const source = await compteDe(tx, organizationId, v.sourceId);
  const [destination] = await tx.select({ nom: comptesTresorerie.nom }).from(comptesTresorerie).where(eq(comptesTresorerie.id, v.destinationId));
  // On rejoue le calcul de l'envoi pour en avoir les lignes, puis on le retourne.
  const envoi = ecritureEnvoi({ numero: v.numero, date: v.dateEnvoi, source, destination: destination?.nom ?? "—", montant: v.montant, frais: 0 });
  await passer(tx, organizationId, userId, "virement", v.id, contrepasser(envoi, `${v.numero}-A`, `Annulation ${v.numero} — ${motif}`, aujourdhui()));
  await tx
    .update(virementsInternes)
    .set({ statut: "annule", motif: `${v.motif ? `${v.motif} — ` : ""}Annulé : ${motif}`, updatedAt: new Date(), version: sql`${virementsInternes.version} + 1` })
    .where(eq(virementsInternes.id, v.id));
  await journaliser(tx, organizationId, userId, "virement.annuler", v.id, { numero: v.numero, motif });
  return { numero: v.numero };
}

// ------------------------------------------------------------ bénéficiaires

/**
 * Fiche de celui qui reçoit l'argent : un fournisseur (tiers), un salarié du
 * Personnel, un intervenant, ou un compte sans fiche au Personnel. Absente,
 * le nom saisi en tient lieu — le taxi de passage n'a pas de fiche.
 */
export type FicheBeneficiaire = { tiersId: string } | { employeId: string } | { workerId: string } | { userId: string };

interface BeneficiaireResolu {
  nom: string;
  tiersId: string | null;
  employeId: string | null;
  workerId: string | null;
  userId: string | null;
}

/**
 * Ramène le bénéficiaire choisi à son nom, recopié de la fiche : rien ne se
 * retape. Le nom saisi ne sert qu'à défaut de fiche.
 */
export async function resoudreBeneficiaire(
  tx: Executant,
  organizationId: string,
  fiche: FicheBeneficiaire | null | undefined,
  saisi: string | null | undefined,
): Promise<BeneficiaireResolu> {
  const vide = { tiersId: null, employeId: null, workerId: null, userId: null };
  if (!fiche) {
    const nom = saisi?.trim() ?? "";
    if (nom.length < 2) throw new Error("Choisissez le bénéficiaire, ou saisissez son nom.");
    return { ...vide, nom };
  }
  if ("tiersId" in fiche) {
    const [t] = await tx
      .select({ id: tiers.id, nom: tiers.nom })
      .from(tiers)
      .where(and(eq(tiers.id, fiche.tiersId), eq(tiers.organizationId, organizationId), eq(tiers.actif, true)));
    if (!t) throw new Error("Ce tiers n'existe pas, ou plus.");
    return { ...vide, nom: t.nom, tiersId: t.id };
  }
  if ("employeId" in fiche) {
    const [e] = await tx
      .select({ id: employees.id, nom: employees.nom, userId: employees.userId })
      .from(employees)
      .where(
        and(
          eq(employees.id, fiche.employeId),
          eq(employees.organizationId, organizationId),
          eq(employees.actif, true),
          isNull(employees.deletedAt),
        ),
      );
    if (!e) throw new Error("Ce salarié ne figure pas, ou plus, au Personnel.");
    return { ...vide, nom: e.nom, employeId: e.id, userId: e.userId };
  }
  if ("workerId" in fiche) {
    const [w] = await tx
      .select({ id: workers.id, nom: workers.nom })
      .from(workers)
      .where(
        and(eq(workers.id, fiche.workerId), eq(workers.organizationId, organizationId), eq(workers.actif, true), isNull(workers.deletedAt)),
      );
    if (!w) throw new Error("Cet intervenant n'existe pas, ou plus.");
    return { ...vide, nom: w.nom, workerId: w.id };
  }
  const [m] = await tx
    .select({ nom: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, fiche.userId), eq(memberships.status, "actif")));
  if (!m) throw new Error("Cette personne n'a pas d'accès actif à l'entreprise.");
  return { ...vide, nom: m.nom, userId: fiche.userId };
}

// ------------------------------------------------------------ bons de caisse

export interface NouveauBon {
  caisseId: string;
  nature: NatureBon;
  montant: number;
  /** Tiers, salarié ou intervenant. Un compte seul n'est pas un bénéficiaire de bon. */
  fiche?: Exclude<FicheBeneficiaire, { userId: string }> | null;
  /** Nom saisi, quand le bénéficiaire n'a pas de fiche. */
  beneficiaire?: string | null;
  motif: string;
}

export async function demanderBonDans(
  tx: Transaction,
  organizationId: string,
  b: NouveauBon,
  userId: string,
): Promise<{ id: string; numero: string; beneficiaire: string }> {
  const caisse = await compteDe(tx, organizationId, b.caisseId);
  if (caisse.nature === "banque") throw new Error("Un bon de caisse se paie en espèces ou en mobile money, pas depuis la banque.");
  const qui = await resoudreBeneficiaire(tx, organizationId, b.fiche, b.beneficiaire);
  const numero = await numeroter(tx, organizationId, "bon_caisse", "BC", aujourdhui());
  const id = newId();
  await tx.insert(bonsCaisse).values({
    id,
    organizationId,
    numero,
    caisseId: caisse.id,
    nature: b.nature,
    montant: b.montant,
    beneficiaireTiersId: qui.tiersId,
    beneficiaireEmployeId: qui.employeId,
    beneficiaireWorkerId: qui.workerId,
    beneficiaire: qui.nom,
    motif: b.motif.trim(),
    demandeParUserId: userId,
  });
  await journaliser(tx, organizationId, userId, "bon_caisse.demander", id, {
    numero,
    montant: b.montant,
    nature: b.nature,
    caisse: caisse.nom,
    beneficiaire: qui.nom,
  });
  return { id, numero, beneficiaire: qui.nom };
}

async function bonVerrouille(tx: Transaction, organizationId: string, id: string) {
  const [b] = await tx.select().from(bonsCaisse).where(and(eq(bonsCaisse.id, id), eq(bonsCaisse.organizationId, organizationId))).for("update");
  if (!b) throw new Error("Bon de caisse introuvable.");
  return b;
}

/**
 * Décision sur un bon. On n'approuve pas sa propre demande — sauf le
 * propriétaire, qui n'a personne au-dessus de lui.
 */
export async function deciderBonDans(
  tx: Transaction,
  organizationId: string,
  id: string,
  decision: { approuve: true } | { approuve: false; motif: string },
  acteur: { userId: string; estProprietaire: boolean },
): Promise<{ numero: string }> {
  const b = await bonVerrouille(tx, organizationId, id);
  if (b.statut !== "demande") throw new Error(`${b.numero} a déjà reçu une décision.`);
  if (b.demandeParUserId === acteur.userId && !acteur.estProprietaire) {
    throw new Error("Vous ne pouvez pas décider de votre propre demande : un autre doit l'approuver.");
  }
  await tx
    .update(bonsCaisse)
    .set({
      statut: decision.approuve ? "approuve" : "rejete",
      approuveParUserId: acteur.userId,
      approuveLe: new Date(),
      motifRejet: decision.approuve ? null : decision.motif,
      updatedAt: new Date(),
      version: sql`${bonsCaisse.version} + 1`,
    })
    .where(eq(bonsCaisse.id, b.id));
  await journaliser(tx, organizationId, acteur.userId, decision.approuve ? "bon_caisse.approuver" : "bon_caisse.rejeter", b.id, {
    numero: b.numero,
    montant: b.montant,
    ...(decision.approuve ? {} : { motif: decision.motif }),
  });
  return { numero: b.numero };
}

export interface Justificatif {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

/**
 * Décaisse un bon approuvé : l'argent sort, l'écriture passe, le justificatif
 * s'attache. Le fichier part AVANT la transaction et se retire si elle échoue.
 */
export async function decaisserBonPour(
  organizationId: string,
  id: string,
  justificatif: Justificatif | null,
  userId: string,
): Promise<{ numero: string; ecriture: string }> {
  let chemin: string | null = null;
  if (justificatif) {
    const extension = justificatif.nom.includes(".") ? justificatif.nom.split(".").pop()! : "";
    chemin = cheminDe(organizationId, newId(), extension);
    const depot = await deposer({ chemin, contenu: justificatif.contenu, typeMime: justificatif.typeMime });
    if (!depot.ok) throw new Error(depot.raison);
  }
  try {
    return await db.transaction(async (tx) => {
      const b = await bonVerrouille(tx, organizationId, id);
      if (b.statut !== "approuve") throw new Error(`${b.numero} n'est pas approuvé : il ne se décaisse pas.`);
      const caisse = await compteDe(tx, organizationId, b.caisseId);
      await exigerProvision(tx, organizationId, caisse, b.montant);
      const ecriture = await passer(
        tx,
        organizationId,
        userId,
        "bon_caisse",
        b.id,
        ecritureBon({ numero: b.numero, date: aujourdhui(), caisse, nature: b.nature, montant: b.montant, beneficiaire: b.beneficiaire }),
      );
      await tx
        .update(bonsCaisse)
        .set({
          statut: "decaisse",
          decaisseParUserId: userId,
          decaisseLe: new Date(),
          ecriture,
          justificatifChemin: chemin,
          justificatifNom: justificatif?.nom ?? null,
          justificatifType: justificatif?.typeMime ?? null,
          updatedAt: new Date(),
          version: sql`${bonsCaisse.version} + 1`,
        })
        .where(eq(bonsCaisse.id, b.id));
      await journaliser(tx, organizationId, userId, "bon_caisse.decaisser", b.id, { numero: b.numero, montant: b.montant, ecriture, justificatif: Boolean(chemin) });
      return { numero: b.numero, ecriture };
    });
  } catch (erreur) {
    if (chemin) await supprimer(chemin);
    throw erreur;
  }
}

/** Annule un bon pas encore décaissé : par son demandeur, ou par qui approuve. */
export async function annulerBonDans(
  tx: Transaction,
  organizationId: string,
  id: string,
  acteur: { userId: string; approuve: boolean },
): Promise<{ numero: string }> {
  const b = await bonVerrouille(tx, organizationId, id);
  if (b.statut !== "demande" && b.statut !== "approuve") throw new Error(`${b.numero} ne s'annule plus.`);
  if (b.demandeParUserId !== acteur.userId && !acteur.approuve) throw new Error("Seul le demandeur, ou qui approuve, peut annuler ce bon.");
  await tx.update(bonsCaisse).set({ statut: "annule", updatedAt: new Date(), version: sql`${bonsCaisse.version} + 1` }).where(eq(bonsCaisse.id, b.id));
  await journaliser(tx, organizationId, acteur.userId, "bon_caisse.annuler", b.id, { numero: b.numero });
  return { numero: b.numero };
}

// ------------------------------------------------------------------- avances

export interface NouvelleAvance {
  caisseId: string;
  /** Salarié du Personnel, ou membre sans fiche. Absent : le nom saisi. */
  fiche?: Extract<FicheBeneficiaire, { employeId: string } | { userId: string }> | null;
  beneficiaire?: string | null;
  montant: number;
  motif: string;
  echeance?: string | null;
}

export async function remettreAvanceDans(
  tx: Transaction,
  organizationId: string,
  a: NouvelleAvance,
  userId: string,
): Promise<{ numero: string; beneficiaire: string }> {
  const qui = await resoudreBeneficiaire(tx, organizationId, a.fiche, a.beneficiaire);
  const caisse = await compteDe(tx, organizationId, a.caisseId);
  await exigerProvision(tx, organizationId, caisse, a.montant);
  const date = aujourdhui();
  const numero = await numeroter(tx, organizationId, "avance", "AV", date);
  const id = newId();
  const ecriture = await passer(tx, organizationId, userId, "avance", id, ecritureAvance({ numero, date, caisse, montant: a.montant, beneficiaire: qui.nom }));
  await tx.insert(avancesTresorerie).values({
    id,
    organizationId,
    numero,
    caisseId: caisse.id,
    beneficiaireEmployeId: qui.employeId,
    beneficiaireUserId: qui.userId,
    beneficiaire: qui.nom,
    montant: a.montant,
    motif: a.motif.trim(),
    echeance: a.echeance ?? null,
    ecriture,
    remiseParUserId: userId,
  });
  await journaliser(tx, organizationId, userId, "avance.remettre", id, { numero, beneficiaire: qui.nom, montant: a.montant });
  return { numero, beneficiaire: qui.nom };
}

export type Regularisation =
  | { type: "justification"; montant: number; nature: NatureBon; libelle?: string | null }
  | { type: "remboursement"; montant: number; caisseId: string };

/**
 * Régularise une avance. Elle se solde d'elle-même quand le reste dû tombe à
 * zéro : personne n'a à se souvenir de la fermer.
 */
export async function regulariserAvanceDans(
  tx: Transaction,
  organizationId: string,
  avanceId: string,
  r: Regularisation,
  userId: string,
): Promise<{ numero: string; reste: number }> {
  const [a] = await tx
    .select()
    .from(avancesTresorerie)
    .where(and(eq(avancesTresorerie.id, avanceId), eq(avancesTresorerie.organizationId, organizationId)))
    .for("update");
  if (!a) throw new Error("Avance introuvable.");
  if (a.statut !== "ouverte") throw new Error(`${a.numero} est déjà soldée.`);

  const passees = await tx.select({ montant: regularisationsAvance.montant }).from(regularisationsAvance).where(eq(regularisationsAvance.avanceId, a.id));
  const reste = resteAvance(a.montant, passees);
  const refus = refusRegularisation(reste, r.montant);
  if (refus) throw new Error(refus);

  const piece = `${a.numero}-${r.type === "justification" ? "J" : "R"}${passees.length + 1}`;
  const date = aujourdhui();
  let ecriture: string;
  if (r.type === "justification") {
    ecriture = await passer(tx, organizationId, userId, "avance", a.id, ecritureJustification({ piece, date, nature: r.nature, montant: r.montant, beneficiaire: a.beneficiaire }));
  } else {
    const caisse = await compteDe(tx, organizationId, r.caisseId);
    ecriture = await passer(tx, organizationId, userId, "avance", a.id, ecritureRemboursement({ piece, date, caisse, montant: r.montant, beneficiaire: a.beneficiaire }));
  }

  await tx.insert(regularisationsAvance).values({
    id: newId(),
    organizationId,
    avanceId: a.id,
    type: r.type,
    montant: r.montant,
    nature: r.type === "justification" ? r.nature : null,
    caisseId: r.type === "remboursement" ? r.caisseId : null,
    libelle: r.type === "justification" ? r.libelle?.trim() || null : null,
    ecriture,
    userId,
  });
  const nouveauReste = reste - r.montant;
  if (nouveauReste === 0) {
    await tx
      .update(avancesTresorerie)
      .set({ statut: "soldee", soldeeLe: new Date(), updatedAt: new Date(), version: sql`${avancesTresorerie.version} + 1` })
      .where(eq(avancesTresorerie.id, a.id));
  }
  await journaliser(tx, organizationId, userId, r.type === "justification" ? "avance.justifier" : "avance.rembourser", a.id, {
    numero: a.numero,
    montant: r.montant,
    reste: nouveauReste,
    ecriture,
  });
  return { numero: a.numero, reste: nouveauReste };
}

// ----------------------------------------------------------- arrêté de caisse

export async function arreterCaisseDans(
  tx: Transaction,
  organizationId: string,
  d: { compteId: string; compte: number; observations?: string | null },
  userId: string,
): Promise<{ numero: string; ecart: number; ecriture: string | null }> {
  const caisse = await compteDe(tx, organizationId, d.compteId);
  const theorique = await soldeDuCompte(tx, organizationId, caisse.numero);
  const ecart = d.compte - theorique;
  const date = aujourdhui();
  const numero = await numeroter(tx, organizationId, "arrete_caisse", "ARR", date);
  const id = newId();
  const calcul = ecritureArrete({ numero, date, caisse, ecart });
  const ecriture = calcul ? await passer(tx, organizationId, userId, "arrete_caisse", id, calcul) : null;
  await tx.insert(arretesCaisse).values({
    id,
    organizationId,
    numero,
    compteId: caisse.id,
    dateArrete: date,
    theorique,
    compte: d.compte,
    ecart,
    ecriture,
    observations: d.observations?.trim() || null,
    userId,
  });
  await journaliser(tx, organizationId, userId, "arrete_caisse.passer", id, { numero, caisse: caisse.nom, theorique, compte: d.compte, ecart, ecriture });
  return { numero, ecart, ecriture };
}

// ---------------------------------------------------------- relevé bancaire

/**
 * Importe les lignes d'un relevé. Une ligne déjà importée — même compte, même
 * date, même montant, même libellé — n'est pas reprise : réimporter le relevé
 * du mois après en avoir importé la première quinzaine ne double rien.
 */
export async function importerReleve(
  organizationId: string,
  compteId: string,
  nomFichier: string,
  lignes: readonly LigneReleve[],
  userId: string,
): Promise<{ ajoutees: number; doublons: number; pointees: number }> {
  const resultat = await db.transaction(async (tx) => {
    const compte = await compteDe(tx, organizationId, compteId);
    if (compte.nature !== "banque") throw new Error("Un relevé s'importe sur un compte bancaire.");
    const existantes = await tx
      .select({ date: lignesReleve.dateOperation, montant: lignesReleve.montant, libelle: lignesReleve.libelle })
      .from(lignesReleve)
      .where(and(eq(lignesReleve.organizationId, organizationId), eq(lignesReleve.compteId, compteId)));
    const cle = (d: string, m: number, l: string) => `${d}|${m}|${l.trim().toLowerCase()}`;
    const deja = new Set(existantes.map((e) => cle(String(e.date).slice(0, 10), e.montant, e.libelle)));
    const nouvelles = lignes.filter((l) => {
      const k = cle(l.date, l.montant, l.libelle);
      if (deja.has(k)) return false;
      deja.add(k);
      return true;
    });

    const importId = newId();
    await tx.insert(importsReleve).values({ id: importId, organizationId, compteId, nomFichier, lignes: nouvelles.length, userId });
    if (nouvelles.length) {
      await tx.insert(lignesReleve).values(
        nouvelles.map((l) => ({
          id: newId(),
          organizationId,
          importId,
          compteId,
          dateOperation: l.date,
          libelle: l.libelle.slice(0, 300),
          montant: l.montant,
        })),
      );
    }
    await journaliser(tx, organizationId, userId, "releve.importer", importId, { fichier: nomFichier, compte: compte.nom, lignes: nouvelles.length, doublons: lignes.length - nouvelles.length });
    return { ajoutees: nouvelles.length, doublons: lignes.length - nouvelles.length };
  });
  const pointees = await pointerAutomatiquement(organizationId, compteId, userId);
  return { ...resultat, pointees };
}

/** Lignes d'écriture du compte encore libres : aucune ligne de relevé ne les vise. */
export async function lignesComptaLibres(tx: Executant, organizationId: string, compte: string) {
  const lignes = await tx.execute<{ id: string; date: string | Date; montant: string; libelle: string; numero: string }>(sql`
    select l.id, e.date_ecriture as date, (l.debit - l.credit) as montant, e.libelle, e.numero
    from lignes_ecriture l join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId} and l.compte = ${compte}
      and not exists (select 1 from lignes_releve r where r.organization_id = ${organizationId} and r.ligne_ecriture_id = l.id)
    order by e.date_ecriture desc
    limit 500
  `);
  return lignes.map((l) => ({
    id: l.id,
    date: l.date instanceof Date ? l.date.toISOString().slice(0, 10) : String(l.date).slice(0, 10),
    montant: Number(l.montant),
    libelle: l.libelle,
    numero: l.numero,
  }));
}

export async function pointerAutomatiquement(organizationId: string, compteId: string, userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const compte = await compteDe(tx, organizationId, compteId);
    const releve = await tx
      .select({ id: lignesReleve.id, date: lignesReleve.dateOperation, montant: lignesReleve.montant })
      .from(lignesReleve)
      .where(and(eq(lignesReleve.organizationId, organizationId), eq(lignesReleve.compteId, compteId), isNull(lignesReleve.ligneEcritureId)));
    const libres = await lignesComptaLibres(tx, organizationId, compte.numero);
    const paires = rapprocherAuto(
      releve.map((r) => ({ id: r.id, date: String(r.date).slice(0, 10), montant: r.montant })),
      libres,
    );
    for (const p of paires) {
      await tx
        .update(lignesReleve)
        .set({ ligneEcritureId: p.ecritureId, pointeeLe: new Date(), pointeeParUserId: userId, updatedAt: new Date() })
        .where(eq(lignesReleve.id, p.releveId));
    }
    if (paires.length) await journaliser(tx, organizationId, userId, "releve.pointer", compteId, { compte: compte.nom, automatique: true, lignes: paires.length });
    return paires.length;
  });
}

/** Pointage à la main : le montant doit être le même, la date peut différer. */
export async function pointerDans(tx: Transaction, organizationId: string, ligneReleveId: string, ligneEcritureId: string, userId: string): Promise<void> {
  const [r] = await tx
    .select()
    .from(lignesReleve)
    .where(and(eq(lignesReleve.id, ligneReleveId), eq(lignesReleve.organizationId, organizationId)))
    .for("update");
  if (!r) throw new Error("Ligne de relevé introuvable.");
  if (r.ligneEcritureId) throw new Error("Cette ligne de relevé est déjà pointée.");
  const [compte] = await tx.select({ compte: comptesTresorerie.compte }).from(comptesTresorerie).where(eq(comptesTresorerie.id, r.compteId));
  const [l] = await tx.execute<{ montant: string; compte: string }>(sql`
    select (debit - credit) as montant, compte from lignes_ecriture where id = ${ligneEcritureId} and organization_id = ${organizationId}
  `);
  if (!l || l.compte !== compte?.compte) throw new Error("Cette écriture ne concerne pas ce compte bancaire.");
  if (Number(l.montant) !== r.montant) throw new Error("Les montants diffèrent : un pointage relie deux montants égaux.");
  await tx
    .update(lignesReleve)
    .set({ ligneEcritureId, pointeeLe: new Date(), pointeeParUserId: userId, updatedAt: new Date() })
    .where(eq(lignesReleve.id, r.id));
  await journaliser(tx, organizationId, userId, "releve.pointer", r.id, { libelle: r.libelle, montant: r.montant, automatique: false });
}

export async function depointerDans(tx: Transaction, organizationId: string, ligneReleveId: string, userId: string): Promise<void> {
  const [r] = await tx
    .update(lignesReleve)
    .set({ ligneEcritureId: null, pointeeLe: null, pointeeParUserId: null, updatedAt: new Date() })
    .where(and(eq(lignesReleve.id, ligneReleveId), eq(lignesReleve.organizationId, organizationId), isNull(lignesReleve.ecriture)))
    .returning({ libelle: lignesReleve.libelle, montant: lignesReleve.montant });
  if (!r) throw new Error("Ligne introuvable, ou comptabilisée depuis le relevé : elle ne se dépointe pas.");
  await journaliser(tx, organizationId, userId, "releve.depointer", ligneReleveId, { libelle: r.libelle, montant: r.montant });
}

/**
 * Comptabilise une ligne que la banque a passée sans que l'entreprise le sache :
 * frais de tenue de compte, agios, intérêts. L'écriture naît pointée.
 */
export async function comptabiliserLigneDans(tx: Transaction, organizationId: string, ligneReleveId: string, userId: string): Promise<{ ecriture: string }> {
  const [r] = await tx
    .select()
    .from(lignesReleve)
    .where(and(eq(lignesReleve.id, ligneReleveId), eq(lignesReleve.organizationId, organizationId)))
    .for("update");
  if (!r) throw new Error("Ligne de relevé introuvable.");
  if (r.ligneEcritureId) throw new Error("Cette ligne est déjà pointée sur une écriture.");
  const banque = await compteDe(tx, organizationId, r.compteId);
  const date = String(r.dateOperation).slice(0, 10);
  const piece = await numeroter(tx, organizationId, "releve", "RB", date);
  const ecriture = await passer(tx, organizationId, userId, "releve", r.id, ecritureLigneReleve({ piece, date, banque, montant: r.montant, libelle: r.libelle }));
  const [ligne] = await tx.execute<{ id: string }>(sql`
    select l.id from lignes_ecriture l join ecritures e on e.id = l.ecriture_id
    where e.organization_id = ${organizationId} and e.numero = ${ecriture} and l.compte = ${banque.numero}
    limit 1
  `);
  await tx
    .update(lignesReleve)
    .set({ ecriture, ligneEcritureId: ligne?.id ?? null, pointeeLe: new Date(), pointeeParUserId: userId, updatedAt: new Date() })
    .where(eq(lignesReleve.id, r.id));
  await journaliser(tx, organizationId, userId, "releve.comptabiliser", r.id, { libelle: r.libelle, montant: r.montant, ecriture });
  return { ecriture };
}

/** Pour les autres modules : le compte SYSCOHADA et le journal d'un compte de trésorerie. */
export async function compteTresorerieDe(
  tx: Executant,
  organizationId: string,
  id: string,
): Promise<{ numero: string; libelle: string; nature: NatureCompte } | null> {
  const [c] = await tx
    .select({ numero: comptesTresorerie.compte, libelle: comptesTresorerie.nom, nature: comptesTresorerie.nature, actif: comptesTresorerie.actif })
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.id, id), eq(comptesTresorerie.organizationId, organizationId)));
  return c && c.actif ? { numero: c.numero, libelle: c.libelle, nature: c.nature } : null;
}

