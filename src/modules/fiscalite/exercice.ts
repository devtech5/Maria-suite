import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import type { CodeJournal } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans, type OrigineEcriture } from "@/modules/comptabilite/enregistrement";
import { ecritures, lignesEcriture } from "@/modules/comptabilite/schema";
import { exigerProvision } from "@/modules/tresorerie/creation";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import {
  contrepassation,
  determinerImpot,
  ecritureAffectation,
  ecritureFractionImpot,
  ecritureImpot,
  fractionsImpot,
  refusAffectation,
  refusRegleImpot,
  refusReouverture,
  regleImpotDuPays,
  type Affectation,
  type DeterminationImpot,
  type RegleImpotBenefices,
} from "./resultat";
import { affectationsResultat, exercicesClotures, fractionsImpot as tableFractions, impotsBenefices, parametresFiscaux, reouverturesExercice } from "./schema";

type Lecteur = Pick<Transaction, "execute" | "select">;

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: action.split(".")[0], entityId: entiteId, after: apres });
}

const exerciceTermine = (exercice: string, aujourdhui: string) => `${exercice}-12-31` < aujourdhui;

// ------------------------------------------------------------ pièces

/**
 * Numéro de pièce libre pour une écriture de fin d'exercice : `CLO-2026`,
 * puis `CLO-2026-2` après une réouverture, et ainsi de suite. Une pièce
 * annulée garde son numéro au journal, à côté de sa contrepassation.
 */
export async function pieceLibre(tx: Lecteur, organizationId: string, origine: OrigineEcriture, base: string): Promise<string> {
  const lignes = await tx.execute<{ piece: string }>(sql`
    select piece_numero as piece from ecritures
    where organization_id = ${organizationId} and origine = ${origine}
      and (piece_numero = ${base} or piece_numero ~ ${`^${base}-[0-9]+$`})
  `);
  if (lignes.length === 0) return base;
  const rangs = lignes.map((l) => (l.piece === base ? 1 : Number(l.piece.slice(base.length + 1))));
  return `${base}-${Math.max(...rangs) + 1}`;
}

/**
 * Contrepasse une écriture par son numéro : l'écriture inverse est passée à
 * la date donnée, sous la pièce d'origine suffixée `-ANN`.
 */
async function contrepasserDans(
  tx: Transaction,
  organizationId: string,
  numero: string,
  v: { origine: OrigineEcriture; date: string; motif: string; pieceId: string | null },
  userId: string,
): Promise<string> {
  const [e] = await tx.select().from(ecritures).where(and(eq(ecritures.organizationId, organizationId), eq(ecritures.numero, numero)));
  if (!e) throw new Error(`Écriture ${numero} introuvable.`);
  const lignes = await tx.select().from(lignesEcriture).where(eq(lignesEcriture.ecritureId, e.id)).orderBy(asc(lignesEcriture.ordre));
  const inverse = contrepassation(
    {
      journal: e.journal as CodeJournal,
      libelle: e.libelle,
      lignes: lignes.map((l) => ({ compte: l.compte, libelleCompte: l.libelleCompte, auxiliaire: l.auxiliaire ?? undefined, debit: l.debit, credit: l.credit })),
    },
    { piece: `${e.pieceNumero}-ANN`, date: v.date, motif: v.motif },
  );
  return enregistrerEcritureDans(tx, inverse, { organizationId, userId, origine: v.origine, pieceId: v.pieceId, exercice: v.date.slice(0, 4), dateIso: v.date });
}

// -------------------------------------------------------------- règle

export async function regleImpotDe(organizationId: string): Promise<{ regle: RegleImpotBenefices; verifie: boolean; verifieLe: Date | null; pays: string }> {
  const [[org], [p]] = await Promise.all([
    db.select({ pays: organizations.countryCode }).from(organizations).where(eq(organizations.id, organizationId)),
    db.select().from(parametresFiscaux).where(eq(parametresFiscaux.organizationId, organizationId)),
  ]);
  const pays = org?.pays ?? "CI";
  if (!p) return { regle: regleImpotDuPays(pays), verifie: false, verifieLe: null, pays };
  return { regle: p.regleImpot, verifie: Boolean(p.verifieLe), verifieLe: p.verifieLe, pays };
}

/** Enregistre la règle. La modifier sans l'attester efface l'attestation. */
export async function enregistrerRegleImpotDans(tx: Transaction, organizationId: string, regle: RegleImpotBenefices, atteste: boolean, userId: string): Promise<void> {
  const refus = refusRegleImpot(regle);
  if (refus) throw new Error(refus);
  const propre = { ...regle, echeances: [...regle.echeances].sort() };
  const verification = atteste ? { verifieLe: new Date(), verifieParUserId: userId } : { verifieLe: null, verifieParUserId: null };
  await tx
    .insert(parametresFiscaux)
    .values({ id: newId(), organizationId, regleImpot: propre, ...verification })
    .onConflictDoUpdate({ target: parametresFiscaux.organizationId, set: { regleImpot: propre, ...verification, updatedAt: new Date(), version: sql`${parametresFiscaux.version} + 1` } });
  await journaliser(tx, organizationId, userId, "regle_impot.modifier", organizationId, { regle: propre, atteste });
}

// -------------------------------------------------------------- impôt

/**
 * Ce que les écritures disent de l'exercice, avant impôt : le résultat des
 * classes 6 à 8 hors impôt sur le résultat (89), et le chiffre d'affaires (70).
 */
export async function elementsImpotDe(lecteur: Lecteur, organizationId: string, exercice: string): Promise<{ resultatComptable: number; chiffreAffaires: number }> {
  const [r] = await lecteur.execute<{ resultat: string; ca: string }>(sql`
    select
      coalesce(sum(case when l.compte ~ '^[678]' and l.compte !~ '^89' then l.credit - l.debit else 0 end), 0) as resultat,
      coalesce(sum(case when l.compte ~ '^70' then l.credit - l.debit else 0 end), 0) as ca
    from lignes_ecriture l
    join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId} and e.exercice = ${exercice} and e.origine <> 'cloture'
  `);
  return { resultatComptable: Number(r?.resultat ?? 0), chiffreAffaires: Number(r?.ca ?? 0) };
}

async function exerciceClos(tx: Lecteur, organizationId: string, exercice: string): Promise<boolean> {
  const [c] = await tx.select({ id: exercicesClotures.id }).from(exercicesClotures).where(and(eq(exercicesClotures.organizationId, organizationId), eq(exercicesClotures.exercice, exercice)));
  return Boolean(c);
}

export interface SaisieImpot {
  reintegrations: number;
  deductions: number;
  chiffreAffaires: number;
}

/**
 * Constate l'impôt d'un exercice terminé, avant sa clôture : la charge (891)
 * et la dette envers l'État (441) au 31 décembre, et l'échéancier des
 * fractions de l'année suivante.
 */
export async function constaterImpotDans(
  tx: Transaction,
  organizationId: string,
  exercice: string,
  saisie: SaisieImpot,
  regle: RegleImpotBenefices,
  aujourdhui: string,
  userId: string,
): Promise<DeterminationImpot & { ecriture: string | null }> {
  if (!/^\d{4}$/.test(exercice)) throw new Error("Exercice invalide.");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cloture:${organizationId}`}))`);
  if (!exerciceTermine(exercice, aujourdhui)) throw new Error(`L'exercice ${exercice} n'est pas terminé : son impôt se constate à partir du 1er janvier ${Number(exercice) + 1}.`);
  if (await exerciceClos(tx, organizationId, exercice)) throw new Error(`L'exercice ${exercice} est clôturé : rouvrez-le pour revoir son impôt.`);
  const [deja] = await tx.select({ id: impotsBenefices.id }).from(impotsBenefices).where(and(eq(impotsBenefices.organizationId, organizationId), eq(impotsBenefices.exercice, exercice)));
  if (deja) throw new Error(`L'impôt de ${exercice} est déjà constaté : annulez-le pour le refaire.`);

  const { resultatComptable } = await elementsImpotDe(tx, organizationId, exercice);
  const d = determinerImpot({ resultatComptable, ...saisie }, regle);
  const id = newId();
  const ecriture =
    d.impotDu > 0
      ? await enregistrerEcritureDans(tx, ecritureImpot({ exercice, piece: await pieceLibre(tx, organizationId, "impot", `IS-${exercice}`), impotDu: d.impotDu }), {
          organizationId,
          userId,
          origine: "impot",
          pieceId: id,
          exercice,
          dateIso: `${exercice}-12-31`,
        })
      : null;
  await tx.insert(impotsBenefices).values({ id, organizationId, exercice, ...d, regleAppliquee: regle, ecriture, constateParUserId: userId });
  const fractions = fractionsImpot(exercice, d.impotDu, regle.echeances);
  if (fractions.length) await tx.insert(tableFractions).values(fractions.map((f) => ({ id: newId(), organizationId, impotId: id, exercice, ...f })));
  await journaliser(tx, organizationId, userId, "impot_benefices.constater", id, { exercice, ...d, ecriture });
  return { ...d, ecriture };
}

/** Annule l'impôt constaté d'un exercice ouvert, tant qu'aucune fraction n'est payée. */
export async function annulerImpotDans(tx: Transaction, organizationId: string, exercice: string, motif: string, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cloture:${organizationId}`}))`);
  if (motif.trim().length < 5) throw new Error("Dites pourquoi l'impôt est annulé.");
  if (await exerciceClos(tx, organizationId, exercice)) throw new Error(`L'exercice ${exercice} est clôturé : rouvrez-le d'abord.`);
  const [i] = await tx.select().from(impotsBenefices).where(and(eq(impotsBenefices.organizationId, organizationId), eq(impotsBenefices.exercice, exercice)));
  if (!i) throw new Error(`Aucun impôt constaté sur ${exercice}.`);
  const payees = await tx.select({ id: tableFractions.id }).from(tableFractions).where(and(eq(tableFractions.impotId, i.id), sql`${tableFractions.payeeLe} is not null`));
  if (payees.length) throw new Error("Une fraction de cet impôt est déjà payée : il ne s'annule plus.");
  const annulation = i.ecriture ? await contrepasserDans(tx, organizationId, i.ecriture, { origine: "impot", date: `${exercice}-12-31`, motif: motif.trim(), pieceId: i.id }, userId) : null;
  await tx.delete(impotsBenefices).where(eq(impotsBenefices.id, i.id));
  await journaliser(tx, organizationId, userId, "impot_benefices.annuler", i.id, { exercice, motif, ecriture: i.ecriture, annulation });
}

/** Paie une fraction de l'impôt depuis un compte de trésorerie. */
export async function payerFractionDans(tx: Transaction, organizationId: string, fractionId: string, v: { compteTresorerieId: string; date: string }, userId: string): Promise<{ montant: number; ecriture: string }> {
  const [f] = await tx
    .select()
    .from(tableFractions)
    .where(and(eq(tableFractions.id, fractionId), eq(tableFractions.organizationId, organizationId)))
    .for("update");
  if (!f) throw new Error("Fraction introuvable.");
  if (f.payeeLe) throw new Error("Cette fraction est déjà payée.");
  if (v.date <= `${f.exercice}-12-31`) throw new Error(`L'impôt de ${f.exercice} se paie après la fin de l'exercice.`);
  const [c] = await tx
    .select()
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.id, v.compteTresorerieId), eq(comptesTresorerie.organizationId, organizationId)))
    .for("update");
  if (!c || !c.actif) throw new Error("Compte de trésorerie introuvable ou fermé.");
  await exigerProvision(tx, organizationId, { numero: c.compte, libelle: c.nom, nature: c.nature, nom: c.nom }, f.montant);
  const ecriture = await enregistrerEcritureDans(
    tx,
    ecritureFractionImpot({
      exercice: f.exercice,
      rang: f.rang,
      piece: await pieceLibre(tx, organizationId, "impot", `IS-${f.exercice}-F${f.rang}`),
      date: v.date,
      montant: f.montant,
      tresorerie: { numero: c.compte, libelle: c.nom, journal: c.nature === "banque" ? "BQ" : "CA" },
    }),
    { organizationId, userId, origine: "impot", pieceId: f.id, exercice: v.date.slice(0, 4), dateIso: v.date },
  );
  await tx
    .update(tableFractions)
    .set({ payeeLe: v.date, ecriture, compteTresorerieId: c.id, updatedAt: new Date(), version: sql`${tableFractions.version} + 1` })
    .where(eq(tableFractions.id, f.id));
  await journaliser(tx, organizationId, userId, "impot_benefices.payer", f.id, { exercice: f.exercice, rang: f.rang, montant: f.montant, ecriture });
  return { montant: f.montant, ecriture };
}

// -------------------------------------------------------- affectation

/** Affecte le résultat d'un exercice clos, à la date de la décision. */
export async function affecterResultatDans(tx: Transaction, organizationId: string, exercice: string, affectation: Affectation, dateDecision: string, userId: string): Promise<{ ecriture: string }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cloture:${organizationId}`}))`);
  const [c] = await tx.select().from(exercicesClotures).where(and(eq(exercicesClotures.organizationId, organizationId), eq(exercicesClotures.exercice, exercice)));
  if (!c) throw new Error(`Clôturez d'abord l'exercice ${exercice} : son résultat n'est pas arrêté.`);
  if (dateDecision <= `${exercice}-12-31`) throw new Error("La décision d'affectation suit la fin de l'exercice.");
  const [deja] = await tx.select({ id: affectationsResultat.id }).from(affectationsResultat).where(and(eq(affectationsResultat.organizationId, organizationId), eq(affectationsResultat.exercice, exercice)));
  if (deja) throw new Error(`Le résultat de ${exercice} est déjà affecté.`);
  const refus = refusAffectation(c.resultat, affectation);
  if (refus) throw new Error(refus);
  const id = newId();
  const piece = await pieceLibre(tx, organizationId, "affectation", `AFF-${exercice}`);
  const ecriture = await enregistrerEcritureDans(tx, ecritureAffectation({ exercice, piece, date: dateDecision, resultat: c.resultat, affectation }), {
    organizationId,
    userId,
    origine: "affectation",
    pieceId: id,
    exercice: dateDecision.slice(0, 4),
    dateIso: dateDecision,
  });
  await tx.insert(affectationsResultat).values({ id, organizationId, exercice, resultat: c.resultat, ...affectation, dateDecision, ecriture, decideParUserId: userId });
  await journaliser(tx, organizationId, userId, "affectation.decider", id, { exercice, resultat: c.resultat, ...affectation, ecriture });
  return { ecriture };
}

// --------------------------------------------------------- réouverture

/**
 * Rouvre un exercice clos : l'affectation de son résultat, s'il y en a une,
 * et l'écriture de clôture sont contrepassées, l'exercice accepte de nouveau
 * des écritures. Rien ne s'efface : la clôture, son annulation et le motif
 * restent au journal et dans la trace des réouvertures.
 */
export async function rouvrirExerciceDans(tx: Transaction, organizationId: string, exercice: string, motif: string, userId: string): Promise<{ ecritures: string[] }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cloture:${organizationId}`}))`);
  const clotures = await tx
    .select()
    .from(exercicesClotures)
    .where(and(eq(exercicesClotures.organizationId, organizationId), inArray(exercicesClotures.exercice, [exercice, String(Number(exercice) + 1)])));
  const c = clotures.find((x) => x.exercice === exercice);
  const refus = refusReouverture({ exercice, clos: Boolean(c), suivantClos: clotures.some((x) => x.exercice !== exercice), motif });
  if (refus || !c) throw new Error(refus ?? "Exercice introuvable.");
  const raison = motif.trim();

  const annulees: string[] = [];
  const [a] = await tx.select().from(affectationsResultat).where(and(eq(affectationsResultat.organizationId, organizationId), eq(affectationsResultat.exercice, exercice)));
  if (a) {
    annulees.push(await contrepasserDans(tx, organizationId, a.ecriture, { origine: "affectation", date: String(a.dateDecision).slice(0, 10), motif: raison, pieceId: a.id }, userId));
    await tx.delete(affectationsResultat).where(eq(affectationsResultat.id, a.id));
  }
  // L'exercice d'abord rouvert : la contrepassation de la clôture s'y date.
  await tx.delete(exercicesClotures).where(eq(exercicesClotures.id, c.id));
  annulees.push(await contrepasserDans(tx, organizationId, c.ecriture, { origine: "cloture", date: `${exercice}-12-31`, motif: raison, pieceId: c.id }, userId));

  const id = newId();
  await tx.insert(reouverturesExercice).values({ id, organizationId, exercice, motif: raison, resultatAnnule: c.resultat, ecritures: [c.ecriture, ...(a ? [a.ecriture] : []), ...annulees], rouvertParUserId: userId });
  await journaliser(tx, organizationId, userId, "exercice.rouvrir", id, { exercice, motif: raison, resultat: c.resultat, annulees });
  return { ecritures: annulees };
}

// ------------------------------------------------------------- lecture

export async function impotsConstates(organizationId: string) {
  return db.select().from(impotsBenefices).where(eq(impotsBenefices.organizationId, organizationId));
}

export async function fractionsDe(organizationId: string) {
  return db.select().from(tableFractions).where(eq(tableFractions.organizationId, organizationId)).orderBy(asc(tableFractions.echeance));
}

export async function affectationsDe(organizationId: string) {
  return db.select().from(affectationsResultat).where(eq(affectationsResultat.organizationId, organizationId));
}

export async function reouverturesDe(organizationId: string) {
  return db.select().from(reouverturesExercice).where(eq(reouverturesExercice.organizationId, organizationId)).orderBy(asc(reouverturesExercice.createdAt));
}

/** Fractions d'impôt non payées, pour le plan de trésorerie. */
export async function sortiesImpot(organizationId: string): Promise<{ date: string; montant: number; libelle: string }[]> {
  const lignes = await db
    .select()
    .from(tableFractions)
    .where(and(eq(tableFractions.organizationId, organizationId), sql`${tableFractions.payeeLe} is null`));
  return lignes.map((f) => ({ date: String(f.echeance).slice(0, 10), montant: f.montant, libelle: `Impôt sur les bénéfices ${f.exercice}, fraction ${f.rang}` }));
}

