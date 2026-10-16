import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import { bilanProjet, suiviBudget, type Bilan, type SuiviBudget } from "./calcul";
import type { MoyenDepense, NaturePieceProjet, StatutDepense, StatutProjet } from "./schema";

const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

const nombreOuNul = (v: string | number | null) => (v === null ? null : Number(v));

export interface ProjetVue {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  client: string | null;
  responsableUserId: string | null;
  responsable: string | null;
  budget: number | null;
  prixVente: number | null;
  debut: string | null;
  fin: string | null;
  termineLe: string | null;
  statut: StatutProjet;
  suivi: SuiviBudget;
  /** Facturé HT, encaissé TTC, coûts HT : la matière du bilan. */
  facture: number;
  encaisse: number;
  coutEngageHt: number;
  coutPayeHt: number;
  bilan: Bilan;
  depenses: number;
  photos: number;
}

type LigneProjet = {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  client: string | null;
  responsable_user_id: string | null;
  responsable: string | null;
  budget: string | null;
  prix_vente: string | null;
  debut: string | Date | null;
  fin: string | Date | null;
  termine_le: string | Date | null;
  statut: StatutProjet;
  engage: string;
  engage_ht: string;
  paye_ht: string;
  facture: string;
  encaisse: string;
  paye: string;
  en_attente: string;
  nb_depenses: string;
  photos: string;
};

function versVue(l: LigneProjet, aujourdHui: string): ProjetVue {
  const budget = nombreOuNul(l.budget);
  const prixVente = nombreOuNul(l.prix_vente);
  // Les sommes viennent de la base ; le suivi les relit par la même règle que les tests figent.
  const suivi = suiviBudget(budget, [
    { statut: "payee", montant: Number(l.paye) },
    { statut: "approuvee", montant: Number(l.engage) - Number(l.paye) },
    { statut: "demandee", montant: Number(l.en_attente) },
  ]);
  const facture = Number(l.facture);
  const coutEngageHt = Number(l.engage_ht);
  const coutPayeHt = Number(l.paye_ht);
  return {
    id: l.id,
    code: l.code,
    nom: l.nom,
    description: l.description,
    client: l.client,
    responsableUserId: l.responsable_user_id,
    responsable: l.responsable,
    budget,
    prixVente,
    debut: iso(l.debut),
    fin: iso(l.fin),
    termineLe: iso(l.termine_le),
    statut: l.statut,
    suivi,
    facture,
    encaisse: Number(l.encaisse),
    coutEngageHt,
    coutPayeHt,
    bilan: bilanProjet(
      {
        facture,
        encaisse: Number(l.encaisse),
        coutEngage: coutEngageHt,
        coutPaye: coutPayeHt,
        prixVente,
        budget,
        engageTtc: suivi.engage,
        finPrevue: iso(l.fin),
        termineLe: iso(l.termine_le),
      },
      aujourdHui,
    ),
    depenses: Number(l.nb_depenses),
    photos: Number(l.photos),
  };
}

function requeteProjets(organizationId: string, projetId?: string) {
  return sql`
    select p.id, p.code, p.nom, p.description, t.nom as client, p.responsable_user_id,
           u.full_name as responsable, p.budget, p.prix_vente, p.debut, p.fin, p.termine_le, p.statut,
           coalesce(sum(d.montant) filter (where d.statut in ('approuvee', 'payee')), 0) as engage,
           coalesce(sum(d.montant) filter (where d.statut = 'payee'), 0) as paye,
           -- Coûts hors taxes : la TVA récupérée n'est pas une charge du projet.
           coalesce(sum(round(d.montant * 10000.0 / (10000 + d.taux_tva))) filter (where d.statut in ('approuvee', 'payee')), 0) as engage_ht,
           coalesce(sum(round(d.montant * 10000.0 / (10000 + d.taux_tva))) filter (where d.statut = 'payee'), 0) as paye_ht,
           (select coalesce(sum(f.total_ht), 0) from pieces_commerciales f
             where f.projet_id = p.id and f.nature = 'facture' and f.statut = 'emise' and f.deleted_at is null) as facture,
           (select coalesce(sum(r.montant), 0) from reglements_piece r join pieces_commerciales f on f.id = r.piece_id
             where f.projet_id = p.id and f.nature = 'facture' and f.statut = 'emise' and r.deleted_at is null) as encaisse,
           coalesce(sum(d.montant) filter (where d.statut = 'demandee'), 0) as en_attente,
           count(d.id) filter (where d.statut not in ('rejetee', 'annulee')) as nb_depenses,
           (select count(*) from pieces_projet x where x.projet_id = p.id and x.nature = 'photo') as photos
    from projets p
      left join tiers t on t.id = p.client_id
      left join users u on u.id = p.responsable_user_id
      left join depenses d on d.projet_id = p.id
    where p.organization_id = ${organizationId} and p.deleted_at is null
      ${projetId ? sql`and p.id = ${projetId}` : sql``}
    group by p.id, t.nom, u.full_name
    order by case p.statut when 'en_cours' then 0 when 'preparation' then 1 when 'suspendu' then 2 else 3 end, p.code desc
  `;
}

export async function listerProjets(organizationId: string): Promise<ProjetVue[]> {
  const lignes = await db.execute<LigneProjet>(requeteProjets(organizationId));
  const aujourdHui = new Date().toISOString().slice(0, 10);
  return lignes.map((l) => versVue(l, aujourdHui));
}

export interface DepenseVue {
  id: string;
  numero: string;
  projetId: string | null;
  projet: string | null;
  objet: string;
  categorie: string;
  fournisseur: string | null;
  montant: number;
  tauxTva: number;
  statut: StatutDepense;
  demandeeLe: Date;
  demandeur: string | null;
  demandeurId: string | null;
  approuveeLe: Date | null;
  approbateur: string | null;
  payeeLe: Date | null;
  payeur: string | null;
  moyen: MoyenDepense | null;
  referencePaiement: string | null;
  ecriture: string | null;
  motif: string | null;
  preuves: number;
}

export async function listerDepenses(organizationId: string, projetId?: string): Promise<DepenseVue[]> {
  const lignes = await db.execute<{
    id: string;
    numero: string;
    projet_id: string | null;
    projet: string | null;
    objet: string;
    categorie: string;
    fournisseur: string | null;
    montant: string;
    taux_tva: number;
    statut: StatutDepense;
    demandee_le: string | Date;
    demandeur: string | null;
    demandee_par_user_id: string | null;
    approuvee_le: string | Date | null;
    approbateur: string | null;
    payee_le: string | Date | null;
    payeur: string | null;
    moyen: MoyenDepense | null;
    reference_paiement: string | null;
    ecriture: string | null;
    motif: string | null;
    preuves: string;
  }>(sql`
    select d.id, d.numero, d.projet_id, p.code || ' · ' || p.nom as projet, d.objet, d.categorie,
           coalesce(f.nom, d.fournisseur_libelle) as fournisseur, d.montant, d.taux_tva, d.statut,
           d.demandee_le, ud.full_name as demandeur, d.demandee_par_user_id,
           d.approuvee_le, ua.full_name as approbateur, d.payee_le, up.full_name as payeur,
           d.moyen, d.reference_paiement, d.ecriture, d.motif,
           (select count(*) from pieces_projet x where x.depense_id = d.id and x.nature in ('preuve_paiement', 'facture')) as preuves
    from depenses d
      left join projets p on p.id = d.projet_id
      left join tiers f on f.id = d.fournisseur_id
      left join users ud on ud.id = d.demandee_par_user_id
      left join users ua on ua.id = d.approuvee_par_user_id
      left join users up on up.id = d.payee_par_user_id
    where d.organization_id = ${organizationId} and d.deleted_at is null
      ${projetId ? sql`and d.projet_id = ${projetId}` : sql``}
    order by case d.statut when 'demandee' then 0 when 'approuvee' then 1 when 'payee' then 2 else 3 end, d.demandee_le desc
  `);
  const date = (v: string | Date | null) => (v === null ? null : new Date(v));
  return lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    projetId: l.projet_id,
    projet: l.projet,
    objet: l.objet,
    categorie: l.categorie,
    fournisseur: l.fournisseur,
    montant: Number(l.montant),
    tauxTva: Number(l.taux_tva),
    statut: l.statut,
    demandeeLe: new Date(l.demandee_le),
    demandeur: l.demandeur,
    demandeurId: l.demandee_par_user_id,
    approuveeLe: date(l.approuvee_le),
    approbateur: l.approbateur,
    payeeLe: date(l.payee_le),
    payeur: l.payeur,
    moyen: l.moyen,
    referencePaiement: l.reference_paiement,
    ecriture: l.ecriture,
    motif: l.motif,
    preuves: Number(l.preuves),
  }));
}

export interface PieceVue {
  id: string;
  nature: NaturePieceProjet;
  legende: string | null;
  nomFichier: string;
  typeMime: string;
  depenseId: string | null;
  depose: Date;
  auteur: string | null;
}

/**
 * Pièces d'un projet (y compris celles de ses dépenses). Sans URL : le
 * navigateur les fait signer une fois la page montée (`signerPiecesProjet`).
 */
export async function piecesDuProjet(organizationId: string, projetId: string): Promise<PieceVue[]> {
  const lignes = await db.execute<{
    id: string;
    nature: NaturePieceProjet;
    legende: string | null;
    nom_fichier: string;
    type_mime: string;
    depense_id: string | null;
    created_at: string | Date;
    auteur: string | null;
  }>(sql`
    select x.id, x.nature, x.legende, x.nom_fichier, x.type_mime, x.depense_id, x.created_at,
           u.full_name as auteur
    from pieces_projet x left join users u on u.id = x.depose_par_user_id
    where x.organization_id = ${organizationId} and x.projet_id = ${projetId}
    order by x.created_at desc
  `);
  return lignes.map((l) => ({
    id: l.id,
    nature: l.nature,
    legende: l.legende,
    nomFichier: l.nom_fichier,
    typeMime: l.type_mime,
    depenseId: l.depense_id,
    depose: new Date(l.created_at),
    auteur: l.auteur,
  }));
}

export interface FactureProjet {
  id: string;
  numero: string | null;
  nature: string;
  statut: string;
  datePiece: string | null;
  totalHt: number;
  totalTtc: number;
  regle: number;
}

/** Devis et factures rattachés au projet. */
async function facturesDuProjet(organizationId: string, projetId: string): Promise<FactureProjet[]> {
  const lignes = await db.execute<{
    id: string;
    numero: string | null;
    nature: string;
    statut: string;
    date_piece: string | Date | null;
    total_ht: string;
    total_ttc: string;
    regle: string;
  }>(sql`
    select p.id, p.numero, p.nature, p.statut, p.date_piece, p.total_ht, p.total_ttc,
           (select coalesce(sum(r.montant), 0) from reglements_piece r where r.piece_id = p.id and r.deleted_at is null) as regle
    from pieces_commerciales p
    where p.organization_id = ${organizationId} and p.projet_id = ${projetId} and p.deleted_at is null
    order by p.date_piece desc
  `);
  return lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    nature: l.nature,
    statut: l.statut,
    datePiece: iso(l.date_piece),
    totalHt: Number(l.total_ht),
    totalTtc: Number(l.total_ttc),
    regle: Number(l.regle),
  }));
}

export async function ficheProjet(
  organizationId: string,
  projetId: string,
): Promise<{ projet: ProjetVue; depenses: DepenseVue[]; pieces: PieceVue[]; factures: FactureProjet[] } | null> {
  const [ligne] = await db.execute<LigneProjet>(requeteProjets(organizationId, projetId));
  if (!ligne) return null;
  const [depenses, pieces, factures] = await Promise.all([
    listerDepenses(organizationId, projetId),
    piecesDuProjet(organizationId, projetId),
    facturesDuProjet(organizationId, projetId),
  ]);
  return { projet: versVue(ligne, new Date().toISOString().slice(0, 10)), depenses, pieces, factures };
}

/** Pièces d'une dépense hors projet, pour l'écran des dépenses. */
export async function piecesParDepense(organizationId: string): Promise<Map<string, PieceVue[]>> {
  const lignes = await db.execute<{
    id: string;
    nature: NaturePieceProjet;
    legende: string | null;
    nom_fichier: string;
    type_mime: string;
    depense_id: string;
    created_at: string | Date;
  }>(sql`
    select id, nature, legende, nom_fichier, type_mime, depense_id, created_at
    from pieces_projet where organization_id = ${organizationId} and depense_id is not null
    order by created_at
  `);
  const parDepense = new Map<string, PieceVue[]>();
  for (const l of lignes) {
    const vue: PieceVue = {
      id: l.id,
      nature: l.nature,
      legende: l.legende,
      nomFichier: l.nom_fichier,
      typeMime: l.type_mime,
      depenseId: l.depense_id,
      depose: new Date(l.created_at),
      auteur: null,
    };
    parDepense.set(l.depense_id, [...(parDepense.get(l.depense_id) ?? []), vue]);
  }
  return parDepense;
}

/** Membres actifs, pour désigner un responsable. */
export async function membresActifs(organizationId: string): Promise<{ userId: string; nom: string }[]> {
  const lignes = await db.execute<{ user_id: string; nom: string }>(sql`
    select m.user_id, u.full_name as nom
    from memberships m join users u on u.id = m.user_id
    where m.organization_id = ${organizationId} and m.status = 'actif'
    order by u.full_name
  `);
  return lignes.map((l) => ({ userId: l.user_id, nom: l.nom }));
}

/** Pour le tableau de bord : ce qui attend une signature, et ce qui a été payé sans preuve. */
export async function etatDepenses(organizationId: string): Promise<{ aApprouver: number; montantAApprouver: number; sansPreuve: number }> {
  const [l] = await db.execute<{ a_approuver: string; montant: string; sans_preuve: string }>(sql`
    select
      count(*) filter (where statut = 'demandee') as a_approuver,
      coalesce(sum(montant) filter (where statut = 'demandee'), 0) as montant,
      count(*) filter (where statut = 'payee' and not exists (
        select 1 from pieces_projet x where x.depense_id = depenses.id and x.nature in ('preuve_paiement', 'facture')
      )) as sans_preuve
    from depenses where organization_id = ${organizationId} and deleted_at is null
  `);
  return {
    aApprouver: Number(l?.a_approuver ?? 0),
    montantAApprouver: Number(l?.montant ?? 0),
    sansPreuve: Number(l?.sans_preuve ?? 0),
  };
}

export async function aUnProjet(organizationId: string): Promise<boolean> {
  const [l] = await db.execute<{ id: string }>(sql`select id from projets where organization_id = ${organizationId} limit 1`);
  return Boolean(l);
}
