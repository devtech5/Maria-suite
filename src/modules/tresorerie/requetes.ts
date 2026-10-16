import "server-only";

import { and, sql } from "drizzle-orm";

import { db } from "@/db";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";

import { lignesComptaLibres } from "./creation";
import { sortiesPaie } from "@/modules/paie/requetes";
import { sortiesTva } from "@/modules/fiscalite/requetes";
import { commissionsAPayer } from "@/modules/commerciaux/requetes";

import { fluxChargesRecurrentes } from "./requetes-charges";

import { planTresorerie, type Flux, type NatureBon, type NatureCompte } from "./calcul";

const enDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
const jour = (v: string | Date | null) => (v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export interface CompteVue {
  id: string;
  nom: string;
  nature: NatureCompte;
  compte: string;
  etablissement: string | null;
  reference: string | null;
  responsableUserId: string | null;
  responsable: string | null;
  seuilAlerte: number;
  actif: boolean;
  /** Somme des écritures sur le compte : débit moins crédit. */
  solde: number;
  dernierArrete: { le: string; ecart: number } | null;
  /** Lignes de relevé importées et pas encore pointées (banques seulement). */
  nonPointees: number;
}

/** Les comptes de trésorerie et leur solde, lu dans les écritures. */
export async function listerComptes(organizationId: string): Promise<CompteVue[]> {
  const lignes = await db.execute<{
    id: string;
    nom: string;
    nature: NatureCompte;
    compte: string;
    etablissement: string | null;
    reference: string | null;
    responsable_user_id: string | null;
    responsable: string | null;
    seuil_alerte: string;
    actif: boolean;
    solde: string | null;
    arrete_le: string | Date | null;
    arrete_ecart: string | null;
    non_pointees: string;
  }>(sql`
    select c.id, c.nom, c.nature, c.compte, c.etablissement, c.reference, c.responsable_user_id,
           u.full_name as responsable, c.seuil_alerte, c.actif,
           (select coalesce(sum(l.debit - l.credit), 0) from lignes_ecriture l
             where l.organization_id = c.organization_id and l.compte = c.compte) as solde,
           a.date_arrete as arrete_le, a.ecart as arrete_ecart,
           (select count(*) from lignes_releve r where r.compte_id = c.id and r.ligne_ecriture_id is null) as non_pointees
    from comptes_tresorerie c
    left join users u on u.id = c.responsable_user_id
    left join lateral (
      select date_arrete, ecart from arretes_caisse x where x.compte_id = c.id order by x.created_at desc limit 1
    ) a on true
    where c.organization_id = ${organizationId} and c.deleted_at is null
    order by c.actif desc, case c.nature when 'caisse' then 0 when 'mobile_money' then 1 else 2 end, c.nom
  `);
  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    nature: l.nature,
    compte: l.compte,
    etablissement: l.etablissement,
    reference: l.reference,
    responsableUserId: l.responsable_user_id,
    responsable: l.responsable,
    seuilAlerte: Number(l.seuil_alerte),
    actif: Boolean(l.actif),
    solde: Number(l.solde ?? 0),
    dernierArrete: l.arrete_le ? { le: jour(l.arrete_le)!, ecart: Number(l.arrete_ecart ?? 0) } : null,
    nonPointees: Number(l.non_pointees),
  }));
}

/** Argent parti d'un compte et pas encore arrivé : le solde du 585. */
export async function enTransit(organizationId: string): Promise<{ montant: number; virements: number }> {
  const [l] = await db.execute<{ montant: string; nombre: string }>(sql`
    select coalesce(sum(montant), 0) as montant, count(*) as nombre
    from virements_internes where organization_id = ${organizationId} and statut = 'en_transit'
  `);
  return { montant: Number(l?.montant ?? 0), virements: Number(l?.nombre ?? 0) };
}

export interface VirementVue {
  id: string;
  numero: string;
  source: string;
  destination: string;
  montant: number;
  frais: number;
  dateEnvoi: string;
  dateReception: string | null;
  statut: "en_transit" | "recu" | "annule";
  reference: string | null;
  motif: string | null;
  ecritureEnvoi: string | null;
  ecritureReception: string | null;
  envoyePar: string | null;
}

export async function listerVirements(organizationId: string, limite = 100, filtres?: FiltresListe): Promise<VirementVue[]> {
  // Filtrés en base, pas après coup : sinon la recherche ne verrait que les cent derniers.
  const recherche =
    filtres &&
    and(
      motsDans([sql`v.numero`, sql`s.nom`, sql`d.nom`, sql`v.reference`, sql`v.motif`, sql`u.full_name`], motsRecherche(filtres.q)),
      dansPeriodeSql(sql`v.date_envoi`, filtres.periode),
    );
  const lignes = await db.execute<{
    id: string;
    numero: string;
    source: string;
    destination: string;
    montant: string;
    frais: string;
    date_envoi: string | Date;
    date_reception: string | Date | null;
    statut: VirementVue["statut"];
    reference: string | null;
    motif: string | null;
    ecriture_envoi: string | null;
    ecriture_reception: string | null;
    envoye_par: string | null;
  }>(sql`
    select v.id, v.numero, s.nom as source, d.nom as destination, v.montant, v.frais, v.date_envoi, v.date_reception,
           v.statut, v.reference, v.motif, v.ecriture_envoi, v.ecriture_reception, u.full_name as envoye_par
    from virements_internes v
    join comptes_tresorerie s on s.id = v.source_id
    join comptes_tresorerie d on d.id = v.destination_id
    left join users u on u.id = v.envoye_par_user_id
    where v.organization_id = ${organizationId}${recherche ? sql` and ${recherche}` : sql``}
    order by case v.statut when 'en_transit' then 0 else 1 end, v.created_at desc
    limit ${limite}
  `);
  return lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    source: l.source,
    destination: l.destination,
    montant: Number(l.montant),
    frais: Number(l.frais),
    dateEnvoi: jour(l.date_envoi)!,
    dateReception: jour(l.date_reception),
    statut: l.statut,
    reference: l.reference,
    motif: l.motif,
    ecritureEnvoi: l.ecriture_envoi,
    ecritureReception: l.ecriture_reception,
    envoyePar: l.envoye_par,
  }));
}

export interface BonVue {
  id: string;
  numero: string;
  caisseId: string;
  caisse: string;
  nature: NatureBon;
  montant: number;
  /** Nom de la fiche quand le bénéficiaire en a une, sinon le nom saisi. */
  beneficiaire: string;
  /** Fonction du salarié, métier de l'intervenant, « Fournisseur » ; nul sans fiche. */
  beneficiaireQualite: string | null;
  motif: string;
  statut: "demande" | "approuve" | "rejete" | "decaisse" | "annule";
  demandeParUserId: string;
  demandeur: string;
  demandeLe: Date;
  approbateur: string | null;
  approuveLe: Date | null;
  motifRejet: string | null;
  decaisseLe: Date | null;
  ecriture: string | null;
  justificatifChemin: string | null;
  justificatifNom: string | null;
}

/**
 * Bons de caisse. Sans `tous`, seulement ceux que la personne a demandés.
 *
 * Sans filtre, les bons en attente et ceux des soixante derniers jours. Une
 * recherche porte sur tous les bons, en base : un bon d'il y a un an doit se
 * retrouver par son numéro.
 */
export async function listerBons(organizationId: string, userId: string, tous: boolean, filtres?: FiltresListe): Promise<BonVue[]> {
  const recherche =
    filtres &&
    and(
      motsDans(
        [sql`b.numero`, sql`c.nom`, sql`coalesce(bt.nom, be.nom, bw.nom, b.beneficiaire)`, sql`b.motif`, sql`d.full_name`, sql`b.ecriture`],
        motsRecherche(filtres.q),
      ),
      dansPeriodeSql(sql`b.created_at`, filtres.periode),
    );
  const lignes = await db.execute<{
    id: string;
    numero: string;
    caisse_id: string;
    caisse: string;
    nature: NatureBon;
    montant: string;
    beneficiaire: string;
    beneficiaire_qualite: string | null;
    motif: string;
    statut: BonVue["statut"];
    demande_par_user_id: string;
    demandeur: string | null;
    cree_le: string | Date;
    approbateur: string | null;
    approuve_le: string | Date | null;
    motif_rejet: string | null;
    decaisse_le: string | Date | null;
    ecriture: string | null;
    justificatif_chemin: string | null;
    justificatif_nom: string | null;
  }>(sql`
    select b.id, b.numero, b.caisse_id, c.nom as caisse, b.nature, b.montant,
           coalesce(bt.nom, be.nom, bw.nom, b.beneficiaire) as beneficiaire,
           case when bt.id is not null then 'Fournisseur' when be.id is not null then be.poste when bw.id is not null then bw.qualification end as beneficiaire_qualite,
           b.motif, b.statut,
           b.demande_par_user_id, d.full_name as demandeur, b.created_at as cree_le, a.full_name as approbateur,
           b.approuve_le, b.motif_rejet, b.decaisse_le, b.ecriture, b.justificatif_chemin, b.justificatif_nom
    from bons_caisse b
    join comptes_tresorerie c on c.id = b.caisse_id
    left join tiers bt on bt.id = b.beneficiaire_tiers_id
    left join employees be on be.id = b.beneficiaire_employe_id
    left join workers bw on bw.id = b.beneficiaire_worker_id
    left join users d on d.id = b.demande_par_user_id
    left join users a on a.id = b.approuve_par_user_id
    where b.organization_id = ${organizationId} and (${tous} or b.demande_par_user_id = ${userId})
      and ${recherche ?? sql`(b.statut in ('demande', 'approuve') or b.updated_at > now() - interval '60 days')`}
    order by case b.statut when 'demande' then 0 when 'approuve' then 1 else 2 end, b.created_at desc
    limit 300
  `);
  return lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    caisseId: l.caisse_id,
    caisse: l.caisse,
    nature: l.nature,
    montant: Number(l.montant),
    beneficiaire: l.beneficiaire,
    beneficiaireQualite: l.beneficiaire_qualite,
    motif: l.motif,
    statut: l.statut,
    demandeParUserId: l.demande_par_user_id,
    demandeur: l.demandeur ?? "Ancien membre",
    demandeLe: enDate(l.cree_le),
    approbateur: l.approbateur,
    approuveLe: l.approuve_le ? enDate(l.approuve_le) : null,
    motifRejet: l.motif_rejet,
    decaisseLe: l.decaisse_le ? enDate(l.decaisse_le) : null,
    ecriture: l.ecriture,
    justificatifChemin: l.justificatif_chemin,
    justificatifNom: l.justificatif_nom,
  }));
}

export interface AvanceVue {
  id: string;
  numero: string;
  caisse: string;
  beneficiaire: string;
  /** Fonction au Personnel, quand l'avance est remise à un salarié. */
  beneficiaireQualite: string | null;
  montant: number;
  reste: number;
  motif: string;
  echeance: string | null;
  statut: "ouverte" | "soldee";
  remiseLe: Date;
  ecriture: string;
  regularisations: { type: "justification" | "remboursement"; montant: number; nature: NatureBon | null; libelle: string | null; ecriture: string; le: Date }[];
}

export async function listerAvances(organizationId: string): Promise<AvanceVue[]> {
  const lignes = await db.execute<{
    id: string;
    numero: string;
    caisse: string;
    beneficiaire: string;
    beneficiaire_qualite: string | null;
    montant: string;
    motif: string;
    echeance: string | Date | null;
    statut: AvanceVue["statut"];
    cree_le: string | Date;
    ecriture: string;
    regularisations: AvanceVue["regularisations"] | string | null;
  }>(sql`
    select a.id, a.numero, c.nom as caisse, coalesce(e.nom, a.beneficiaire) as beneficiaire, e.poste as beneficiaire_qualite, a.montant, a.motif, a.echeance, a.statut,
           a.created_at as cree_le, a.ecriture,
           (select coalesce(json_agg(json_build_object('type', r.type, 'montant', r.montant, 'nature', r.nature,
                    'libelle', r.libelle, 'ecriture', r.ecriture, 'le', r.created_at) order by r.created_at), '[]'::json)
              from regularisations_avance r where r.avance_id = a.id) as regularisations
    from avances_tresorerie a join comptes_tresorerie c on c.id = a.caisse_id
      left join employees e on e.id = a.beneficiaire_employe_id
    where a.organization_id = ${organizationId}
      and (a.statut = 'ouverte' or a.updated_at > now() - interval '60 days')
    order by case a.statut when 'ouverte' then 0 else 1 end, a.echeance nulls last, a.created_at desc
    limit 300
  `);
  return lignes.map((l) => {
    const regs = (typeof l.regularisations === "string" ? JSON.parse(l.regularisations) : (l.regularisations ?? [])) as {
      type: "justification" | "remboursement";
      montant: string | number;
      nature: NatureBon | null;
      libelle: string | null;
      ecriture: string;
      le: string;
    }[];
    const regularisations = regs.map((r) => ({ ...r, montant: Number(r.montant), le: new Date(r.le) }));
    const montant = Number(l.montant);
    return {
      id: l.id,
      numero: l.numero,
      caisse: l.caisse,
      beneficiaire: l.beneficiaire,
      beneficiaireQualite: l.beneficiaire_qualite,
      montant,
      reste: montant - regularisations.reduce((s, r) => s + r.montant, 0),
      motif: l.motif,
      echeance: jour(l.echeance),
      statut: l.statut,
      remiseLe: enDate(l.cree_le),
      ecriture: l.ecriture,
      regularisations,
    };
  });
}

export interface ArreteVue {
  id: string;
  numero: string;
  compte: string;
  date: string;
  theorique: number;
  constate: number;
  ecart: number;
  ecriture: string | null;
  observations: string | null;
  auteur: string | null;
}

export async function listerArretes(organizationId: string, limite = 30): Promise<ArreteVue[]> {
  const lignes = await db.execute<{
    id: string;
    numero: string;
    compte: string;
    date_arrete: string | Date;
    theorique: string;
    compte_constate: string;
    ecart: string;
    ecriture: string | null;
    observations: string | null;
    auteur: string | null;
  }>(sql`
    select a.id, a.numero, c.nom as compte, a.date_arrete, a.theorique, a.compte_constate, a.ecart, a.ecriture, a.observations,
           u.full_name as auteur
    from arretes_caisse a join comptes_tresorerie c on c.id = a.compte_id left join users u on u.id = a.user_id
    where a.organization_id = ${organizationId}
    order by a.created_at desc
    limit ${limite}
  `);
  return lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    compte: l.compte,
    date: jour(l.date_arrete)!,
    theorique: Number(l.theorique),
    constate: Number(l.compte_constate),
    ecart: Number(l.ecart),
    ecriture: l.ecriture,
    observations: l.observations,
    auteur: l.auteur,
  }));
}

export interface LigneReleveVue {
  id: string;
  date: string;
  libelle: string;
  montant: number;
  pointee: { numero: string; date: string; libelle: string } | null;
  ecriture: string | null;
}

/** Relevé d'un compte bancaire : non pointé d'abord, puis le reste, du plus récent au plus ancien. */
export async function releveDuCompte(organizationId: string, compteId: string): Promise<LigneReleveVue[]> {
  const lignes = await db.execute<{
    id: string;
    date_operation: string | Date;
    libelle: string;
    montant: string;
    ecriture: string | null;
    numero: string | null;
    date_ecriture: string | Date | null;
    libelle_ecriture: string | null;
  }>(sql`
    select r.id, r.date_operation, r.libelle, r.montant, r.ecriture,
           e.numero, e.date_ecriture, e.libelle as libelle_ecriture
    from lignes_releve r
    left join lignes_ecriture l on l.id = r.ligne_ecriture_id
    left join ecritures e on e.id = l.ecriture_id
    where r.organization_id = ${organizationId} and r.compte_id = ${compteId}
    order by (r.ligne_ecriture_id is null) desc, r.date_operation desc
    limit 400
  `);
  return lignes.map((l) => ({
    id: l.id,
    date: jour(l.date_operation)!,
    libelle: l.libelle,
    montant: Number(l.montant),
    ecriture: l.ecriture,
    pointee: l.numero ? { numero: l.numero, date: jour(l.date_ecriture)!, libelle: l.libelle_ecriture ?? "" } : null,
  }));
}

/** Écritures du compte que la banque n'a pas encore passées : aucune ligne de relevé ne les vise. */
export function ecrituresNonPointees(organizationId: string, compte: string) {
  return lignesComptaLibres(db, organizationId, compte);
}

/**
 * Ce qui doit entrer et sortir, pour le plan de trésorerie.
 *
 *   + factures clients émises et pas encore soldées, à leur échéance ;
 *   − dépenses de projet approuvées et pas encore payées ;
 *   − bons de caisse approuvés et pas encore décaissés ;
 *   − ce qui reste dû aux intervenants (pointé, pas réglé) ;
 *   − les factures fournisseurs non soldées, à leur échéance ;
 *   − les échéances des charges récurrentes dont la dépense n'est pas encore préparée.
 *
 * Les montants dus sans date tombent aujourd'hui : on les doit maintenant.
 */
export async function fluxPrevus(organizationId: string, aujourdhui: string): Promise<Flux[]> {
  const horizon = new Date(Date.parse(`${aujourdhui}T00:00:00Z`) + 91 * 86_400_000).toISOString().slice(0, 10);
  const [factures, depenses, bons, intervenants, dettes, paie, tva, commissions, recurrentes] = await Promise.all([
    db.execute<{ numero: string; client: string | null; echeance: string | Date | null; reste: string }>(sql`
      select p.numero, p.client_nom as client, coalesce(p.echeance, p.date_piece) as echeance,
             p.total_ttc - coalesce((select sum(r.montant) from reglements_piece r where r.piece_id = p.id and r.deleted_at is null), 0) as reste
      from pieces_commerciales p
      where p.organization_id = ${organizationId} and p.nature = 'facture' and p.statut = 'emise'
    `),
    db.execute<{ numero: string; libelle: string; montant: string }>(sql`
      select numero, objet as libelle, montant from depenses
      where organization_id = ${organizationId} and statut = 'approuvee' and deleted_at is null
    `),
    db.execute<{ numero: string; beneficiaire: string; montant: string }>(sql`
      select b.numero, coalesce(t.nom, e.nom, w.nom, b.beneficiaire) as beneficiaire, b.montant
      from bons_caisse b
        left join tiers t on t.id = b.beneficiaire_tiers_id
        left join employees e on e.id = b.beneficiaire_employe_id
        left join workers w on w.id = b.beneficiaire_worker_id
      where b.organization_id = ${organizationId} and b.statut = 'approuve'
    `),
    db.execute<{ nom: string; du: string }>(sql`
      select w.nom,
             coalesce((select sum(p.montant) from pointages p where p.worker_id = w.id), 0)
           - coalesce((select sum(b.montant) from bons_paiement b where b.worker_id = w.id), 0) as du
      from workers w where w.organization_id = ${organizationId} and w.deleted_at is null
    `),
    db.execute<{ numero: string; fournisseur: string; echeance: string | Date; reste: string }>(sql`
      select f.numero || ' (' || f.reference_fournisseur || ')' as numero, f.fournisseur_nom as fournisseur, f.echeance,
             f.total_ttc - coalesce((select sum(r.montant) from reglements_fournisseur r where r.facture_id = f.id), 0) as reste
      from factures_fournisseur f
      where f.organization_id = ${organizationId} and f.statut = 'comptabilisee'
    `),
    sortiesPaie(organizationId, aujourdhui),
    sortiesTva(organizationId, aujourdhui),
    commissionsAPayer(organizationId),
    fluxChargesRecurrentes(organizationId, horizon),
  ]);

  const flux: Flux[] = [];
  for (const f of factures) {
    const reste = Number(f.reste);
    if (reste > 0) flux.push({ date: jour(f.echeance) ?? aujourdhui, montant: reste, libelle: `${f.numero}${f.client ? ` — ${f.client}` : ""}`, origine: "facture" });
  }
  for (const d of depenses) flux.push({ date: aujourdhui, montant: -Number(d.montant), libelle: `${d.numero} — ${d.libelle}`, origine: "depense" });
  for (const b of bons) flux.push({ date: aujourdhui, montant: -Number(b.montant), libelle: `${b.numero} — ${b.beneficiaire}`, origine: "bon" });
  for (const p of paie) flux.push({ date: p.date, montant: -p.montant, libelle: p.libelle, origine: "paie" });
  for (const t of tva) flux.push({ date: t.date, montant: -t.montant, libelle: t.libelle, origine: "tva" });
  flux.push(...recurrentes);
  for (const k of commissions) if (k.total > 0) flux.push({ date: aujourdhui, montant: -k.total, libelle: `Commission ${k.mois}`, origine: "commission" });
  for (const d of dettes) {
    const reste = Number(d.reste);
    if (reste > 0) flux.push({ date: jour(d.echeance) ?? aujourdhui, montant: -reste, libelle: `${d.numero} — ${d.fournisseur}`, origine: "fournisseur" });
  }
  for (const i of intervenants) {
    const du = Number(i.du);
    if (du > 0) flux.push({ date: aujourdhui, montant: -du, libelle: `Dû à ${i.nom}`, origine: "intervenant" });
  }
  return flux;
}

/**
 * Plan de trésorerie : le solde disponible de tous les comptes déclarés, plus
 * l'argent en route, projeté sur treize semaines avec les flux attendus.
 */
export async function planDeTresorerie(organizationId: string, aujourdhui: string) {
  const [comptes, transit, flux] = await Promise.all([listerComptes(organizationId), enTransit(organizationId), fluxPrevus(organizationId, aujourdhui)]);
  const disponible = comptes.filter((c) => c.actif).reduce((s, c) => s + c.solde, 0) + transit.montant;
  return { disponible, comptes: comptes.length, flux, ...planTresorerie(disponible, flux, aujourdhui) };
}

export interface EtatTresorerie {
  caissesSousSeuil: string[];
  bonsAApprouver: number;
  bonsADecaisser: number;
  avancesEchues: number;
  montantAvancesEchues: number;
  virementsEnTransit: number;
}

/** Ce que la trésorerie a d'urgent, pour le tableau de bord. */
export async function etatTresorerie(organizationId: string): Promise<EtatTresorerie> {
  const [comptes, [b], [a], [v]] = await Promise.all([
    listerComptes(organizationId),
    db.execute<{ a_approuver: string; a_decaisser: string }>(sql`
      select count(*) filter (where statut = 'demande') as a_approuver, count(*) filter (where statut = 'approuve') as a_decaisser
      from bons_caisse where organization_id = ${organizationId}
    `),
    db.execute<{ nombre: string; montant: string }>(sql`
      select count(*) as nombre,
             coalesce(sum(a.montant - coalesce((select sum(r.montant) from regularisations_avance r where r.avance_id = a.id), 0)), 0) as montant
      from avances_tresorerie a
      where a.organization_id = ${organizationId} and a.statut = 'ouverte'
        and coalesce(a.echeance, (a.created_at + interval '30 days')::date) < current_date
    `),
    // Trois jours en route, c'est le délai d'un versement en banque : au-delà, il faut aller voir.
    db.execute<{ nombre: string }>(sql`
      select count(*) as nombre from virements_internes
      where organization_id = ${organizationId} and statut = 'en_transit' and date_envoi < current_date - 3
    `),
  ]);
  return {
    caissesSousSeuil: comptes.filter((c) => c.actif && c.seuilAlerte > 0 && c.solde < c.seuilAlerte).map((c) => c.nom),
    bonsAApprouver: Number(b?.a_approuver ?? 0),
    bonsADecaisser: Number(b?.a_decaisser ?? 0),
    avancesEchues: Number(a?.nombre ?? 0),
    montantAvancesEchues: Number(a?.montant ?? 0),
    virementsEnTransit: Number(v?.nombre ?? 0),
  };
}

/** Membres actifs, pour désigner un responsable ou un bénéficiaire d'avance. */
export async function membresActifs(organizationId: string): Promise<{ userId: string; nom: string }[]> {
  const lignes = await db.execute<{ user_id: string; nom: string }>(sql`
    select m.user_id, u.full_name as nom
    from memberships m join users u on u.id = m.user_id
    where m.organization_id = ${organizationId} and m.status = 'actif'
    order by u.full_name
  `);
  return lignes.map((l) => ({ userId: l.user_id, nom: l.nom }));
}

/** Une fiche proposée comme bénéficiaire : `valeur` est ce que renvoie le sélecteur. */
export interface FicheProposee {
  valeur: string;
  nom: string;
  qualite: string;
}

export interface BeneficiairesProposes {
  fournisseurs: FicheProposee[];
  personnel: FicheProposee[];
  intervenants: FicheProposee[];
  /** Membres sans fiche au Personnel : le propriétaire, un associé. */
  comptes: FicheProposee[];
}

/**
 * Ceux qui peuvent recevoir l'argent de la caisse, tirés de leurs fiches :
 * fournisseurs, Personnel avec sa fonction, intervenants avec leur métier.
 * Rien ne se retape ; le nom saisi reste pour qui n'a pas de fiche.
 */
export async function beneficiairesProposes(organizationId: string): Promise<BeneficiairesProposes> {
  const [fournisseurs, personnel, intervenants, comptes] = await Promise.all([
    db.execute<{ id: string; nom: string }>(sql`
      select id, nom from tiers
      where organization_id = ${organizationId} and est_fournisseur and actif
      order by nom
    `),
    db.execute<{ id: string; nom: string; poste: string }>(sql`
      select id, nom, poste from employees
      where organization_id = ${organizationId} and actif and deleted_at is null
      order by nom
    `),
    db.execute<{ id: string; nom: string; qualification: string }>(sql`
      select id, nom, qualification from workers
      where organization_id = ${organizationId} and actif and deleted_at is null
      order by nom
    `),
    db.execute<{ user_id: string; nom: string }>(sql`
      select m.user_id, u.full_name as nom
      from memberships m join users u on u.id = m.user_id
      where m.organization_id = ${organizationId} and m.status = 'actif'
        and not exists (
          select 1 from employees e
          where e.organization_id = m.organization_id and e.user_id = m.user_id and e.actif and e.deleted_at is null
        )
      order by u.full_name
    `),
  ]);
  return {
    fournisseurs: fournisseurs.map((t) => ({ valeur: `t:${t.id}`, nom: t.nom, qualite: "Fournisseur" })),
    personnel: personnel.map((e) => ({ valeur: `e:${e.id}`, nom: e.nom, qualite: e.poste })),
    intervenants: intervenants.map((w) => ({ valeur: `w:${w.id}`, nom: w.nom, qualite: w.qualification })),
    comptes: comptes.map((m) => ({ valeur: `u:${m.user_id}`, nom: m.nom, qualite: "Compte" })),
  };
}
