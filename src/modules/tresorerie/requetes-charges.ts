import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { CATEGORIES_DEPENSE, categorieConnue } from "@/modules/projets/calcul";

import type { Flux } from "./calcul";
import {
  echeancesEnAttente,
  equivalentMensuel,
  familleDuCompte,
  libelleMois,
  prochaineEcheance,
  type Echeance,
  type FamilleCharge,
  type MouvementCharge,
  type Periodicite,
} from "./charges";
import { budgetsCharges, chargesRecurrentes } from "./schema";

const jour = (v: string | Date) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/**
 * Soldes des comptes de charge, mois par mois, de `premierMois` à `dernierMois`.
 *
 * Même périmètre que le compte de résultat (`soldesParCompte`) : toutes les
 * écritures sauf celle de clôture. Un avoir fournisseur vient en déduction,
 * d'où débit moins crédit.
 */
export async function mouvementsCharges(organizationId: string, premierMois: string, dernierMois: string): Promise<MouvementCharge[]> {
  const lignes = await db.execute<{ mois: string; compte: string; montant: string }>(sql`
    select to_char(e.date_ecriture, 'YYYY-MM') as mois, l.compte,
           coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0) as montant
    from lignes_ecriture l
    join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId}
      and l.compte like '6%'
      and e.origine <> 'cloture'
      and e.date_ecriture >= ${`${premierMois}-01`}::date
      and e.date_ecriture < (${`${dernierMois}-01`}::date + interval '1 month')
    group by 1, 2
  `);
  return lignes.map((l) => ({ mois: l.mois, compte: l.compte, montant: Number(l.montant) }));
}

export interface LigneChargeDetail {
  date: string;
  piece: string;
  libelle: string;
  compte: string;
  libelleCompte: string;
  origine: string;
  montant: number;
  famille: FamilleCharge;
}

/** Les écritures de charge d'un mois, de la plus récente à la plus ancienne. */
export async function detailCharges(organizationId: string, mois: string, famille?: FamilleCharge): Promise<LigneChargeDetail[]> {
  const lignes = await db.execute<{
    date: string | Date;
    piece: string;
    libelle: string;
    compte: string;
    libelle_compte: string;
    origine: string;
    montant: string;
  }>(sql`
    select e.date_ecriture as date, e.piece_numero as piece, e.libelle, l.compte, l.libelle_compte, e.origine,
           l.debit - l.credit as montant
    from lignes_ecriture l
    join ecritures e on e.id = l.ecriture_id
    where l.organization_id = ${organizationId}
      and l.compte like '6%'
      and e.origine <> 'cloture'
      and e.date_ecriture >= ${`${mois}-01`}::date
      and e.date_ecriture < (${`${mois}-01`}::date + interval '1 month')
    order by e.date_ecriture desc, e.numero desc, l.ordre
  `);
  return lignes
    .map((l) => ({
      date: jour(l.date),
      piece: l.piece,
      libelle: l.libelle,
      compte: l.compte,
      libelleCompte: l.libelle_compte,
      origine: l.origine,
      montant: Number(l.montant),
      famille: familleDuCompte(l.compte) ?? "autres",
    }))
    .filter((l) => !famille || l.famille === famille);
}

export interface Engagements {
  /** Dépenses approuvées, pas encore payées. */
  depensesApprouvees: number;
  /** Dépenses demandées, en attente de décision. */
  depensesDemandees: number;
  /** Bons de caisse approuvés, pas encore décaissés. */
  bonsApprouves: number;
}

/**
 * Ce qui est décidé mais pas encore en comptabilité : une dépense ne passe son
 * écriture qu'au paiement. Sans cette ligne, le gérant croirait avoir de la
 * marge sur un mois où le loyer est approuvé mais pas encore réglé.
 */
export async function engagements(organizationId: string): Promise<Engagements> {
  const [[d], [b]] = await Promise.all([
    db.execute<{ approuvees: string; demandees: string }>(sql`
      select coalesce(sum(montant) filter (where statut = 'approuvee'), 0) as approuvees,
             coalesce(sum(montant) filter (where statut = 'demandee'), 0) as demandees
      from depenses where organization_id = ${organizationId} and deleted_at is null
    `),
    db.execute<{ approuves: string }>(sql`
      select coalesce(sum(montant), 0) as approuves from bons_caisse
      where organization_id = ${organizationId} and statut = 'approuve' and deleted_at is null
    `),
  ]);
  return { depensesApprouvees: Number(d.approuvees), depensesDemandees: Number(d.demandees), bonsApprouves: Number(b.approuves) };
}

/** Enveloppes mensuelles en vigueur, par famille. */
export async function budgetsParFamille(organizationId: string): Promise<Map<string, number>> {
  const lignes = await db
    .select({ famille: budgetsCharges.famille, montant: budgetsCharges.montantMensuel })
    .from(budgetsCharges)
    .where(and(eq(budgetsCharges.organizationId, organizationId), isNull(budgetsCharges.deletedAt)));
  return new Map(lignes.map((l) => [l.famille, l.montant]));
}

export interface ChargeRecurrenteVue {
  id: string;
  libelle: string;
  categorie: string;
  libelleCategorie: string;
  montant: number;
  equivalentMensuel: number;
  periodicite: Periodicite;
  premiereEcheance: string;
  fournisseur: string | null;
  actif: boolean;
  /** Prochaine échéance à traiter, en retard comprise. */
  prochaine: Echeance | null;
  /** Dernière échéance traitée et ce qu'il en est advenu. */
  derniere: { periode: string; ignoree: boolean; depense: string | null; statut: string | null } | null;
}

async function echeancesTraitees(organizationId: string) {
  const lignes = await db.execute<{ charge_id: string; periode: string; ignoree: boolean; numero: string | null; statut: string | null }>(sql`
    select ec.charge_id, ec.periode, ec.ignoree, d.numero, d.statut
    from echeances_charge ec
    left join depenses d on d.id = ec.depense_id
    where ec.organization_id = ${organizationId} and ec.deleted_at is null
    order by ec.periode
  `);
  const parCharge = new Map<string, (typeof lignes)[number][]>();
  for (const l of lignes) {
    if (!parCharge.has(l.charge_id)) parCharge.set(l.charge_id, []);
    parCharge.get(l.charge_id)!.push(l);
  }
  return parCharge;
}

/** Les charges récurrentes, actives d'abord, avec leur prochaine échéance. */
export async function listerChargesRecurrentes(organizationId: string, aujourdhui: string): Promise<ChargeRecurrenteVue[]> {
  const [charges, traitees] = await Promise.all([
    db.execute<{
      id: string;
      libelle: string;
      categorie: string;
      montant: string;
      periodicite: Periodicite;
      premiere_echeance: string | Date;
      fournisseur: string | null;
      actif: boolean;
    }>(sql`
      select c.id, c.libelle, c.categorie, c.montant, c.periodicite, c.premiere_echeance, c.actif,
             coalesce(t.nom, c.fournisseur_libelle) as fournisseur
      from charges_recurrentes c
      left join tiers t on t.id = c.fournisseur_id
      where c.organization_id = ${organizationId} and c.deleted_at is null
      order by c.actif desc, c.libelle
    `),
    echeancesTraitees(organizationId),
  ]);

  return charges.map((c) => {
    const montant = Number(c.montant);
    const faites = traitees.get(c.id) ?? [];
    const derniere = faites[faites.length - 1];
    const definition = { premiereEcheance: jour(c.premiere_echeance), periodicite: c.periodicite };
    return {
      id: c.id,
      libelle: c.libelle,
      categorie: c.categorie,
      libelleCategorie: categorieConnue(c.categorie) ? CATEGORIES_DEPENSE[c.categorie].libelle : c.categorie,
      montant,
      equivalentMensuel: equivalentMensuel(montant, c.periodicite),
      periodicite: c.periodicite,
      premiereEcheance: definition.premiereEcheance,
      fournisseur: c.fournisseur,
      actif: c.actif,
      prochaine: c.actif ? prochaineEcheance(definition, new Set(faites.map((f) => f.periode)), aujourdhui) : null,
      derniere: derniere ? { periode: derniere.periode, ignoree: derniere.ignoree, depense: derniere.numero, statut: derniere.statut } : null,
    };
  });
}

/**
 * Échéances à venir des charges actives, pour le plan de trésorerie : celles
 * qui n'ont pas encore leur dépense. Une fois préparée, la dépense prend le
 * relais dans le plan — l'échéance n'y figure plus, rien n'est compté deux fois.
 */
export async function fluxChargesRecurrentes(organizationId: string, jusquA: string): Promise<Flux[]> {
  const [charges, traitees] = await Promise.all([
    db
      .select({
        id: chargesRecurrentes.id,
        libelle: chargesRecurrentes.libelle,
        montant: chargesRecurrentes.montant,
        periodicite: chargesRecurrentes.periodicite,
        premiereEcheance: chargesRecurrentes.premiereEcheance,
      })
      .from(chargesRecurrentes)
      .where(and(eq(chargesRecurrentes.organizationId, organizationId), eq(chargesRecurrentes.actif, true), isNull(chargesRecurrentes.deletedAt))),
    echeancesTraitees(organizationId),
  ]);

  const flux: Flux[] = [];
  for (const c of charges) {
    const faites = new Set((traitees.get(c.id) ?? []).map((f) => f.periode));
    for (const e of echeancesEnAttente({ premiereEcheance: c.premiereEcheance, periodicite: c.periodicite }, faites, jusquA)) {
      flux.push({ date: e.date, montant: -c.montant, libelle: `${c.libelle} — ${libelleMois(e.periode)}`, origine: "recurrente" });
    }
  }
  return flux;
}
