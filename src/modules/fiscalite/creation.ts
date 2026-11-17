import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { exigerProvision } from "@/modules/tresorerie/creation";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import {
  ecritureCloture,
  ecritureLiquidationTva,
  ecriturePaiementTva,
  finDeMois,
  obligationsTva,
  refusCloture,
  refusDeclarationTva,
  resultatExercice,
  type DeclarationConnue,
  type ObligationTva,
  type SoldeTva,
} from "./calcul";
import { pieceLibre } from "./exercice";
import { declarationsTva, exercicesClotures, impotsBenefices } from "./schema";

type Lecteur = Pick<Transaction, "execute" | "select">;

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: action.split(".")[0], entityId: entiteId, after: apres });
}

const jour = (v: string | Date | null) => (v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/**
 * Soldes des comptes 443 et 445, mois par mois. Les liquidations et la
 * clôture sont laissées de côté : elles soldent ces comptes, et la TVA d'un
 * mois déjà déclaré retomberait à zéro.
 */
export async function mouvementsTva(lecteur: Lecteur, organizationId: string): Promise<Map<string, SoldeTva[]>> {
  const lignes = await lecteur.execute<{ mois: string; compte: string; libelle: string; solde: string }>(sql`
    select to_char(e.date_ecriture, 'YYYY-MM') as mois, l.compte, min(l.libelle_compte) as libelle,
           coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0) as solde
    from lignes_ecriture l
    join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId}
      and (l.compte like '443%' or l.compte like '445%')
      and e.origine not in ('tva', 'cloture')
    group by 1, 2
    order by 1, 2
  `);
  const parMois = new Map<string, SoldeTva[]>();
  for (const l of lignes) {
    const liste = parMois.get(l.mois) ?? [];
    liste.push({ compte: l.compte, libelle: l.libelle, solde: Number(l.solde) });
    parMois.set(l.mois, liste);
  }
  return parMois;
}

export async function declarationsConnues(lecteur: Lecteur, organizationId: string): Promise<DeclarationConnue[]> {
  const lignes = await lecteur.select().from(declarationsTva).where(eq(declarationsTva.organizationId, organizationId));
  return lignes.map((d) => ({
    mois: d.mois,
    collectee: d.collectee,
    deductible: d.deductible,
    creditAnterieur: d.creditAnterieur,
    aPayer: d.aPayer,
    creditReporte: d.creditReporte,
    payeeLe: jour(d.payeeLe),
  }));
}

export async function calendrierTva(lecteur: Lecteur, organizationId: string, aujourdhui: string): Promise<ObligationTva[]> {
  // L'un après l'autre : dans une transaction, une seule connexion sert.
  const mouvements = await mouvementsTva(lecteur, organizationId);
  const declarations = await declarationsConnues(lecteur, organizationId);
  return obligationsTva(mouvements, declarations, aujourdhui.slice(0, 7), aujourdhui);
}

// -------------------------------------------------------------------- TVA

/**
 * Déclare la TVA d'un mois : les montants sont recalculés ici, dans la
 * transaction, depuis les écritures — jamais repris de l'écran. L'écriture de
 * liquidation solde les 443/445 du mois vers 4441 ou 4449, et la déclaration
 * déposée verrouille le mois pour toute écriture qui porte de la TVA.
 */
export async function declarerTvaDans(tx: Transaction, organizationId: string, mois: string, aujourdhui: string, userId: string): Promise<{ aPayer: number; creditReporte: number; ecriture: string | null }> {
  // Deux déclarations simultanées du même mois : la contrainte d'unicité
  // tranche, mais le verrou évite de calculer deux fois pour rien.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tva:${organizationId}`}))`);
  const calendrier = await calendrierTva(tx, organizationId, aujourdhui);
  const refus = refusDeclarationTva(mois, calendrier, aujourdhui.slice(0, 7));
  if (refus) throw new Error(refus);
  const o = calendrier.find((x) => x.mois === mois)!;

  const [clos] = await tx.select({ id: exercicesClotures.id }).from(exercicesClotures).where(and(eq(exercicesClotures.organizationId, organizationId), eq(exercicesClotures.exercice, mois.slice(0, 4))));
  if (clos) throw new Error(`L'exercice ${mois.slice(0, 4)} est clôturé : sa TVA ne peut plus être liquidée.`);

  const date = finDeMois(mois);
  const piece = ecritureLiquidationTva({ mois, date, soldes: o.soldes, liquidation: o.liquidation });
  const id = newId();
  const ecriture = piece
    ? await enregistrerEcritureDans(tx, piece, { organizationId, userId, origine: "tva", pieceId: id, exercice: date.slice(0, 4), dateIso: date })
    : null;
  const l = o.liquidation;
  await tx.insert(declarationsTva).values({
    id,
    organizationId,
    mois,
    collectee: l.collectee,
    deductible: l.deductible,
    creditAnterieur: l.creditAnterieur,
    aPayer: l.aPayer,
    creditReporte: l.creditReporte,
    ecriture,
    deposeeParUserId: userId,
  });
  await journaliser(tx, organizationId, userId, "declaration_tva.deposer", id, { mois, ...l, ecriture });
  return { aPayer: l.aPayer, creditReporte: l.creditReporte, ecriture };
}

/** Paie la TVA due d'un mois déclaré, depuis un compte de trésorerie. */
export async function payerTvaDans(tx: Transaction, organizationId: string, mois: string, v: { compteTresorerieId: string; date: string }, userId: string): Promise<{ montant: number; ecriture: string }> {
  const [d] = await tx
    .select()
    .from(declarationsTva)
    .where(and(eq(declarationsTva.organizationId, organizationId), eq(declarationsTva.mois, mois)))
    .for("update");
  if (!d) throw new Error(`La TVA de ${mois} n'est pas déclarée.`);
  if (d.payeeLe) throw new Error(`La TVA de ${mois} est déjà payée.`);
  if (d.aPayer <= 0) throw new Error(`Rien à payer sur ${mois} : la déclaration dégage un crédit.`);
  if (v.date < finDeMois(mois)) throw new Error("La date de paiement précède la fin du mois déclaré.");

  const [c] = await tx
    .select()
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.id, v.compteTresorerieId), eq(comptesTresorerie.organizationId, organizationId)))
    .for("update");
  if (!c || !c.actif) throw new Error("Compte de trésorerie introuvable ou fermé.");
  const ref = { numero: c.compte, libelle: c.nom, nature: c.nature, nom: c.nom };
  await exigerProvision(tx, organizationId, ref, d.aPayer);

  const ecriture = await enregistrerEcritureDans(
    tx,
    ecriturePaiementTva({ mois, date: v.date, montant: d.aPayer, tresorerie: { numero: c.compte, libelle: c.nom, journal: c.nature === "banque" ? "BQ" : "CA" } }),
    { organizationId, userId, origine: "tva", pieceId: d.id, exercice: v.date.slice(0, 4), dateIso: v.date },
  );
  await tx
    .update(declarationsTva)
    .set({ payeeLe: v.date, ecriturePaiement: ecriture, compteTresorerieId: c.id, updatedAt: new Date(), version: sql`${declarationsTva.version} + 1` })
    .where(eq(declarationsTva.id, d.id));
  await journaliser(tx, organizationId, userId, "declaration_tva.payer", d.id, { mois, montant: d.aPayer, ecriture, compte: c.nom });
  return { montant: d.aPayer, ecriture };
}

// ---------------------------------------------------------------- clôture

/** Soldes des comptes de gestion (classes 6 à 8) d'un exercice, clôture exclue. */
async function soldesGestion(lecteur: Lecteur, organizationId: string, exercice: string) {
  const lignes = await lecteur.execute<{ compte: string; libelle: string; solde: string }>(sql`
    select l.compte, min(l.libelle_compte) as libelle, coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0) as solde
    from lignes_ecriture l
    join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId}
      and e.exercice = ${exercice}
      and e.origine <> 'cloture'
      and l.compte ~ '^[678]'
    group by l.compte
    order by l.compte
  `);
  return lignes.map((l) => ({ compte: l.compte, libelle: l.libelle, solde: Number(l.solde) }));
}

/**
 * Clôture un exercice : l'écriture de détermination du résultat solde la
 * gestion en 131 ou 139 au 31 décembre, puis l'exercice est fermé à toute
 * nouvelle écriture.
 */
export async function cloturerExerciceDans(tx: Transaction, organizationId: string, exercice: string, aujourdhui: string, userId: string): Promise<{ resultat: number; ecriture: string }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cloture:${organizationId}`}))`);
  const clotures = await tx.select({ exercice: exercicesClotures.exercice }).from(exercicesClotures).where(eq(exercicesClotures.organizationId, organizationId));
  const ecrits = await tx.execute<{ exercice: string }>(sql`select distinct exercice from ecritures where organization_id = ${organizationId} and exercice < ${exercice} order by exercice desc limit 1`);
  const calendrier = await calendrierTva(tx, organizationId, aujourdhui);
  const [impot] = await tx.select({ id: impotsBenefices.id }).from(impotsBenefices).where(and(eq(impotsBenefices.organizationId, organizationId), eq(impotsBenefices.exercice, exercice)));
  const clos = new Set(clotures.map((c) => c.exercice));
  const precedent = ecrits[0]?.exercice ?? null;
  const refus = refusCloture(exercice, aujourdhui, clos.has(exercice), {
    exercicePrecedentOuvert: precedent && !clos.has(precedent) ? precedent : null,
    moisTvaEnAttente: calendrier.filter((o) => !o.declaree && o.mois.startsWith(`${exercice}-`)).map((o) => o.mois),
    impotNonConstate: !impot,
  });
  if (refus) throw new Error(refus);

  const soldes = await soldesGestion(tx, organizationId, exercice);
  const id = newId();
  const piece = await pieceLibre(tx, organizationId, "cloture", `CLO-${exercice}`);
  const ecriture = await enregistrerEcritureDans(tx, ecritureCloture({ exercice, soldes, piece }), {
    organizationId,
    userId,
    origine: "cloture",
    pieceId: id,
    exercice,
    dateIso: `${exercice}-12-31`,
  });
  const resultat = resultatExercice(soldes);
  await tx.insert(exercicesClotures).values({ id, organizationId, exercice, resultat, ecriture, clotureParUserId: userId });
  await journaliser(tx, organizationId, userId, "exercice.cloturer", id, { exercice, resultat, ecriture });
  return { resultat, ecriture };
}
