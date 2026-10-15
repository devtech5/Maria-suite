import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import type { SoldeCompte } from "@/lib/comptabilite/etats";
import { ecritures, lignesEcriture } from "./schema";

/**
 * Soldes de tous les comptes mouvementés, sur un exercice.
 *
 * Une seule requête pour toute la comptabilité : le compte de résultat, la
 * position de trésorerie et la TVA due se déduisent tous des mêmes soldes. Les
 * calculer séparément ferait trois parcours de la même table, et surtout
 * ouvrirait la porte à trois vérités différentes selon l'écran consulté.
 *
 * L'écriture de clôture est laissée de côté : elle solde les classes 6 à 8
 * dans le 13, et le compte de résultat d'un exercice clos tomberait à zéro.
 *
 * `organizationId` est un paramètre obligatoire, comme partout : c'est la
 * frontière d'isolation entre clients.
 */
export async function soldesParCompte(
  organizationId: string,
  exercice?: string,
): Promise<SoldeCompte[]> {
  const lignes = await db.execute<{
    compte: string;
    libelle: string;
    debit: string;
    credit: string;
  }>(sql`
    select
      l.compte,
      min(l.libelle_compte) as libelle,
      coalesce(sum(l.debit), 0)  as debit,
      coalesce(sum(l.credit), 0) as credit
    from lignes_ecriture l
    join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId}
      and e.origine <> 'cloture'
      ${exercice ? sql`and e.exercice = ${exercice}` : sql``}
    group by l.compte
    order by l.compte
  `);

  return lignes.map((ligne) => ({
    compte: ligne.compte,
    libelle: ligne.libelle,
    // `sum` sur un bigint revient en numeric, que le pilote rend en chaîne
    // pour ne pas perdre de précision. Les montants restent des entiers de
    // francs, très en deçà de 2^53 : la conversion est sûre.
    debit: Number(ligne.debit),
    credit: Number(ligne.credit),
  }));
}

/**
 * Soldes cumulés de tous les comptes au soir d'une date : toutes les
 * écritures datées jusqu'à elle, tous exercices et toutes origines confondus,
 * clôtures comprises. C'est la matière du bilan, et des à-nouveaux : la
 * situation d'ouverture d'un exercice est celle de la veille de son premier
 * jour.
 */
export async function soldesAuJour(organizationId: string, date: string): Promise<SoldeCompte[]> {
  const lignes = await db.execute<{ compte: string; libelle: string; debit: string; credit: string }>(sql`
    select l.compte, min(l.libelle_compte) as libelle,
           coalesce(sum(l.debit), 0) as debit, coalesce(sum(l.credit), 0) as credit
    from lignes_ecriture l
    join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId} and e.date_ecriture <= ${date}
    group by l.compte
    order by l.compte
  `);
  return lignes.map((l) => ({ compte: l.compte, libelle: l.libelle, debit: Number(l.debit), credit: Number(l.credit) }));
}

/**
 * Les exercices sur lesquels l'entreprise a écrit, du plus récent au plus ancien.
 *
 * Déduits des écritures et non d'une table d'exercices : tant que la clôture
 * n'existe pas, un exercice n'est rien d'autre que l'année portée par les
 * pièces. Une liste déclarée ailleurs finirait par diverger de ce qui est
 * réellement comptabilisé.
 */
export async function exercicesEcrits(organizationId: string): Promise<string[]> {
  const lignes = await db
    .selectDistinct({ exercice: ecritures.exercice })
    .from(ecritures)
    .where(eq(ecritures.organizationId, organizationId))
    .orderBy(desc(ecritures.exercice));

  return lignes.map((ligne) => ligne.exercice);
}

export interface LigneJournal {
  compte: string;
  libelleCompte: string;
  auxiliaire: string | null;
  debit: number;
  credit: number;
  lettree: boolean;
}

export interface EcritureJournal {
  id: string;
  journal: string;
  numero: string;
  date: string;
  libelle: string;
  origine: string;
  pieceNumero: string;
  statut: string;
  lignes: LigneJournal[];
}

/**
 * Le journal : les écritures récentes, avec leurs lignes.
 *
 * Deux requêtes et non une par écriture. Une comptabilité de fin d'exercice
 * porte plusieurs milliers de pièces, et une requête par ligne affichée
 * transformerait l'ouverture du journal en attente d'une minute.
 *
 * La borne est délibérée : un journal ne se lit pas d'un bloc, il se
 * feuillette. Le filtrage par journal et par exercice précède la pagination.
 */
export async function journalEcritures(
  organizationId: string,
  options: { exercice?: string; journal?: string; limite?: number } = {},
): Promise<EcritureJournal[]> {
  const filtres = [eq(ecritures.organizationId, organizationId)];
  if (options.exercice) filtres.push(eq(ecritures.exercice, options.exercice));
  if (options.journal) {
    filtres.push(
      eq(ecritures.journal, options.journal as (typeof ecritures.journal.enumValues)[number]),
    );
  }

  const entetes = await db
    .select({
      id: ecritures.id,
      journal: ecritures.journal,
      numero: ecritures.numero,
      date: ecritures.dateEcriture,
      libelle: ecritures.libelle,
      origine: ecritures.origine,
      pieceNumero: ecritures.pieceNumero,
      statut: ecritures.statut,
    })
    .from(ecritures)
    .where(and(...filtres))
    .orderBy(desc(ecritures.dateEcriture), desc(ecritures.createdAt))
    .limit(options.limite ?? 50);

  if (entetes.length === 0) return [];

  const lignes = await db
    .select({
      ecritureId: lignesEcriture.ecritureId,
      compte: lignesEcriture.compte,
      libelleCompte: lignesEcriture.libelleCompte,
      auxiliaire: lignesEcriture.auxiliaire,
      debit: lignesEcriture.debit,
      credit: lignesEcriture.credit,
      lettrage: lignesEcriture.lettrage,
      ordre: lignesEcriture.ordre,
    })
    .from(lignesEcriture)
    .where(inArray(lignesEcriture.ecritureId, entetes.map((e) => e.id)))
    .orderBy(asc(lignesEcriture.ordre));

  const parEcriture = new Map<string, LigneJournal[]>();

  for (const ligne of lignes) {
    const liste = parEcriture.get(ligne.ecritureId) ?? [];
    liste.push({
      compte: ligne.compte,
      libelleCompte: ligne.libelleCompte,
      auxiliaire: ligne.auxiliaire,
      debit: ligne.debit,
      credit: ligne.credit,
      lettree: ligne.lettrage !== null,
    });
    parEcriture.set(ligne.ecritureId, liste);
  }

  return entetes.map((entete) => ({
    ...entete,
    lignes: parEcriture.get(entete.id) ?? [],
  }));
}

export interface ActiviteJournal {
  journal: string;
  ecritures: number;
  debit: number;
}

/**
 * Ce que chaque journal a enregistré sur l'exercice.
 *
 * Sert à montrer d'où viennent les écritures : un exploitant dont tout part du
 * journal de caisse n'a pas la même comptabilité que celui qui facture.
 */
export async function activiteParJournal(
  organizationId: string,
  exercice?: string,
): Promise<ActiviteJournal[]> {
  const lignes = await db.execute<{
    journal: string;
    nombre: string;
    debit: string;
  }>(sql`
    select
      e.journal,
      count(distinct e.id) as nombre,
      coalesce(sum(l.debit), 0) as debit
    from ecritures e
    join lignes_ecriture l on l.ecriture_id = e.id
    where e.organization_id = ${organizationId}
      ${exercice ? sql`and e.exercice = ${exercice}` : sql``}
    group by e.journal
    order by e.journal
  `);

  return lignes.map((ligne) => ({
    journal: ligne.journal,
    ecritures: Number(ligne.nombre),
    debit: Number(ligne.debit),
  }));
}

export interface EtatLettrage {
  lettrees: number;
  nonLettrees: number;
  soldeOuvert: number;
}

/**
 * L'état du lettrage sur les comptes de tiers.
 *
 * Une ligne lettrée est rapprochée de son règlement, donc soldée. Ce qui reste
 * ouvert est ce qu'on attend encore — ou ce qu'on doit encore.
 */
export async function etatLettrage(
  organizationId: string,
  prefixeCompte = "41",
): Promise<EtatLettrage> {
  const [ligne] = await db.execute<{
    lettrees: string;
    non_lettrees: string;
    solde_ouvert: string;
  }>(sql`
    select
      count(*) filter (where lettrage is not null)  as lettrees,
      count(*) filter (where lettrage is null)      as non_lettrees,
      coalesce(sum(debit - credit) filter (where lettrage is null), 0) as solde_ouvert
    from lignes_ecriture
    where organization_id = ${organizationId}
      and compte like ${prefixeCompte + "%"}
  `);

  return {
    lettrees: Number(ligne?.lettrees ?? 0),
    nonLettrees: Number(ligne?.non_lettrees ?? 0),
    soldeOuvert: Number(ligne?.solde_ouvert ?? 0),
  };
}
