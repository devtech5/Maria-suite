import "server-only";

import { and, asc, count, eq, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { contrepasser, type Ecriture } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { ecritures, lignesEcriture } from "@/modules/comptabilite/schema";

import { estNomComplet, MESSAGE_NOM_COMPLET } from "./beneficiaire";
import { ecritureBon } from "./calcul";
import { bonVerrouille, compteDe, exigerProvision, resoudreBeneficiaire, type NouveauBon } from "./creation";
import { bonsCaisse } from "./schema";

/**
 * Modification et suppression d'un bon de caisse.
 *
 * Tant que l'argent n'est pas sorti, le bon se corrige librement. Décaissé, il
 * a passé une écriture : on ne la réécrit pas, on la contrepasse — datée du
 * jour — et, pour une modification, on en passe une nouvelle. Le journal
 * montre ainsi l'erreur et sa correction, jamais un trou ; et la caisse
 * retrouve l'argent d'un bon supprimé.
 */

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export interface ActeurBon {
  userId: string;
  /** Détient le droit d'approuver les bons. */
  approuve: boolean;
  estProprietaire: boolean;
}

type Statut = typeof bonsCaisse.$inferSelect.statut;
type Bon = typeof bonsCaisse.$inferSelect;

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, avant: Record<string, unknown> | null, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "bon_caisse", entityId: entiteId, before: avant, after: apres });
}

/** Qui peut toucher au bon : son demandeur, ou qui approuve ; décaissé, seul qui approuve. */
function exigerDroitSur(b: Bon, acteur: ActeurBon, geste: "modifier" | "supprimer") {
  if (b.statut === "decaisse" && !acteur.approuve) {
    throw new Error(`${b.numero} est décaissé : seul qui approuve les bons peut le ${geste}.`);
  }
  if (b.demandeParUserId !== acteur.userId && !acteur.approuve) {
    throw new Error(`Seul le demandeur, ou qui approuve, peut ${geste} ce bon.`);
  }
}

/** L'écriture du décaissement, relue telle qu'elle a été passée : c'est elle qu'on retourne. */
async function ecritureDuBon(tx: Transaction, organizationId: string, b: Bon): Promise<Ecriture> {
  if (!b.ecriture) throw new Error(`${b.numero} n'a pas d'écriture.`);
  const [e] = await tx
    .select({ id: ecritures.id, journal: ecritures.journal, date: ecritures.dateEcriture, piece: ecritures.pieceNumero, libelle: ecritures.libelle })
    .from(ecritures)
    .where(and(eq(ecritures.organizationId, organizationId), eq(ecritures.numero, b.ecriture), eq(ecritures.pieceId, b.id)));
  if (!e) throw new Error(`L'écriture ${b.ecriture} du bon ${b.numero} est introuvable.`);
  const lignes = await tx
    .select({ compte: lignesEcriture.compte, libelleCompte: lignesEcriture.libelleCompte, auxiliaire: lignesEcriture.auxiliaire, debit: lignesEcriture.debit, credit: lignesEcriture.credit })
    .from(lignesEcriture)
    .where(and(eq(lignesEcriture.ecritureId, e.id), eq(lignesEcriture.organizationId, organizationId)))
    .orderBy(asc(lignesEcriture.ordre));
  return {
    journal: e.journal,
    date: String(e.date).slice(0, 10),
    piece: e.piece,
    libelle: e.libelle,
    lignes: lignes.map((l) => ({
      compte: l.compte,
      libelleCompte: l.libelleCompte,
      ...(l.auxiliaire ? { auxiliaire: l.auxiliaire } : {}),
      debit: Number(l.debit),
      credit: Number(l.credit),
    })),
  };
}

/**
 * Numéro de pièce de la prochaine écriture du bon. La première, celle du
 * décaissement, porte le numéro du bon ; les suivantes, son numéro et leur
 * rang — une pièce ne se comptabilise qu'une fois.
 */
async function pieceSuivante(tx: Transaction, organizationId: string, b: Bon): Promise<(decalage: number) => string> {
  const [r] = await tx
    .select({ n: count() })
    .from(ecritures)
    .where(and(eq(ecritures.organizationId, organizationId), eq(ecritures.origine, "bon_caisse"), eq(ecritures.pieceId, b.id)));
  const passees = Number(r?.n ?? 0);
  return (decalage) => `${b.numero}-${passees + 1 + decalage}`;
}

async function passer(tx: Transaction, organizationId: string, userId: string, bonId: string, ecriture: Ecriture): Promise<string> {
  return enregistrerEcritureDans(tx, ecriture, {
    organizationId,
    userId,
    origine: "bon_caisse",
    pieceId: bonId,
    exercice: ecriture.date.slice(0, 4),
    dateIso: ecriture.date,
  });
}

const resume = (b: Pick<Bon, "caisseId" | "nature" | "montant" | "beneficiaire" | "motif" | "statut" | "ecriture">) => ({
  caisseId: b.caisseId,
  nature: b.nature,
  montant: b.montant,
  beneficiaire: b.beneficiaire,
  motif: b.motif,
  statut: b.statut,
  ecriture: b.ecriture,
});

export interface BonModifie {
  numero: string;
  beneficiaire: string;
  montant: number;
  statutAvant: Statut;
  statut: Statut;
  /** Écriture contrepassée et nouvelle écriture, quand le bon décaissé a changé d'argent. */
  correction: { contrepassee: string; nouvelle: string } | null;
}

/**
 * Modifie un bon. Approuvé, il garde son approbation si celui qui le modifie
 * pouvait l'approuver — la même règle que la décision ; sinon il repasse à
 * l'approbation, comme un bon refusé qu'on corrige. Décaissé, il le reste :
 * si la caisse, la nature, le montant ou le bénéficiaire changent, l'écriture
 * est contrepassée et une nouvelle passée, datées du jour.
 */
export async function modifierBonDans(tx: Transaction, organizationId: string, id: string, b: NouveauBon, acteur: ActeurBon): Promise<BonModifie> {
  const avant = await bonVerrouille(tx, organizationId, id);
  if (avant.statut === "annule") throw new Error(`${avant.numero} est annulé : il ne se modifie plus.`);
  exigerDroitSur(avant, acteur, "modifier");

  const caisse = await compteDe(tx, organizationId, b.caisseId);
  if (caisse.nature === "banque") throw new Error("Un bon de caisse se paie en espèces ou en mobile money, pas depuis la banque.");
  if (!b.fiche && !estNomComplet(b.beneficiaire)) throw new Error(MESSAGE_NOM_COMPLET);
  const qui = await resoudreBeneficiaire(tx, organizationId, b.fiche, b.beneficiaire);

  const decaisse = avant.statut === "decaisse";
  const argentChange =
    decaisse && (avant.caisseId !== caisse.id || avant.nature !== b.nature || avant.montant !== b.montant || avant.beneficiaire !== qui.nom);
  let correction: BonModifie["correction"] = null;
  if (argentChange) {
    const date = aujourdhui();
    const piece = await pieceSuivante(tx, organizationId, avant);
    const origine = await ecritureDuBon(tx, organizationId, avant);
    const contrepassee = await passer(
      tx,
      organizationId,
      acteur.userId,
      avant.id,
      contrepasser(origine, piece(0), `Bon ${avant.numero} rectifié — annulation de l'écriture ${avant.ecriture}`, date),
    );
    // L'ancien montant est revenu en caisse : le nouveau doit y être.
    await exigerProvision(tx, organizationId, caisse, b.montant);
    const refaite = ecritureBon({ numero: avant.numero, date, caisse, nature: b.nature, montant: b.montant, beneficiaire: qui.nom });
    const nouvelle = await passer(tx, organizationId, acteur.userId, avant.id, { ...refaite, piece: piece(1) });
    correction = { contrepassee, nouvelle };
  }

  const peutApprouver = acteur.approuve && (avant.demandeParUserId !== acteur.userId || acteur.estProprietaire);
  const statut: Statut = decaisse ? "decaisse" : avant.statut === "approuve" && peutApprouver ? "approuve" : "demande";
  const apres = {
    caisseId: caisse.id,
    nature: b.nature,
    montant: b.montant,
    beneficiaireTiersId: qui.tiersId,
    beneficiaireEmployeId: qui.employeId,
    beneficiaireWorkerId: qui.workerId,
    beneficiaire: qui.nom,
    motif: b.motif.trim(),
    statut,
    ecriture: correction?.nouvelle ?? avant.ecriture,
  };
  await tx
    .update(bonsCaisse)
    .set({
      ...apres,
      ...(statut === "demande" ? { approuveParUserId: null, approuveLe: null, motifRejet: null } : {}),
      updatedAt: new Date(),
      version: sql`${bonsCaisse.version} + 1`,
    })
    .where(eq(bonsCaisse.id, avant.id));
  await journaliser(tx, organizationId, acteur.userId, "bon_caisse.modifier", avant.id, { numero: avant.numero, ...resume(avant) }, {
    numero: avant.numero,
    ...resume(apres),
    ...(correction ? { contrepassee: correction.contrepassee } : {}),
  });
  return { numero: avant.numero, beneficiaire: qui.nom, montant: b.montant, statutAvant: avant.statut, statut, correction };
}

export interface BonSupprime {
  numero: string;
  montant: number;
  /** Écriture de contre-passation, quand le bon était décaissé. */
  contrepassee: string | null;
}

/**
 * Supprime un bon — logiquement : il disparaît des listes, son numéro n'est
 * pas réattribué, le journal d'audit le garde. Décaissé, son écriture est
 * contrepassée : l'argent revient en caisse.
 */
export async function supprimerBonDans(tx: Transaction, organizationId: string, id: string, acteur: ActeurBon): Promise<BonSupprime> {
  const b = await bonVerrouille(tx, organizationId, id);
  exigerDroitSur(b, acteur, "supprimer");
  let contrepassee: string | null = null;
  if (b.statut === "decaisse") {
    const piece = await pieceSuivante(tx, organizationId, b);
    const origine = await ecritureDuBon(tx, organizationId, b);
    contrepassee = await passer(
      tx,
      organizationId,
      acteur.userId,
      b.id,
      contrepasser(origine, piece(0), `Bon ${b.numero} supprimé — annulation de l'écriture ${b.ecriture}`, aujourdhui()),
    );
  }
  await tx
    .update(bonsCaisse)
    .set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${bonsCaisse.version} + 1` })
    .where(eq(bonsCaisse.id, b.id));
  await journaliser(tx, organizationId, acteur.userId, "bon_caisse.supprimer", b.id, null, { numero: b.numero, ...resume(b), contrepassee });
  return { numero: b.numero, montant: b.montant, contrepassee };
}
