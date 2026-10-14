import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import type { MoyenReglementPiece, NaturePiece, StatutPiece } from "./schema";

const enDateIso = (valeur: unknown): string | null =>
  valeur === null || valeur === undefined
    ? null
    : valeur instanceof Date
      ? valeur.toISOString().slice(0, 10)
      : String(valeur).slice(0, 10);

export interface PieceListee {
  id: string;
  nature: NaturePiece;
  numero: string | null;
  statut: StatutPiece;
  clientId: string;
  clientNom: string;
  projetId: string | null;
  datePiece: string;
  echeance: string | null;
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  regle: number;
  /** Facture émise, échéance passée, reste à payer : à relancer. */
  enRetard: boolean;
  ecritureNumero: string | null;
  origineNumero: string | null;
  depotId: string | null;
  notes: string | null;
  commercialId: string | null;
  contactId: string | null;
  contactNom: string | null;
}

/**
 * Les pièces de l'entreprise, avec ce qui a été réglé.
 *
 * Le réglé se somme dans une sous-requête : le joindre ligne à ligne
 * multiplierait chaque pièce par le nombre de ses règlements. Le retard se juge
 * en base, à l'instant de la requête, plutôt qu'avec l'horloge du serveur
 * d'affichage.
 */
export async function listerPieces(organizationId: string): Promise<PieceListee[]> {
  const lignes = await db.execute<{
    id: string;
    nature: NaturePiece;
    numero: string | null;
    statut: StatutPiece;
    client_id: string;
    client_nom: string;
    projet_id: string | null;
    date_piece: string | Date;
    echeance: string | Date | null;
    total_ht: string;
    total_tva: string;
    total_ttc: string;
    regle: string;
    en_retard: boolean;
    ecriture_numero: string | null;
    origine_numero: string | null;
    depot_id: string | null;
    notes: string | null;
    commercial_id: string | null;
    contact_id: string | null;
    contact_nom: string | null;
  }>(sql`
    select
      p.id, p.nature, p.numero, p.statut, p.client_id, p.client_nom, p.projet_id,
      p.date_piece, p.echeance, p.total_ht, p.total_tva, p.total_ttc,
      coalesce(r.total, 0) as regle,
      (p.nature = 'facture' and p.statut = 'emise' and p.echeance < current_date
        and coalesce(r.total, 0) < p.total_ttc) as en_retard,
      p.ecriture_numero,
      o.numero as origine_numero,
      p.depot_id, p.notes, p.commercial_id, p.contact_id, p.contact_nom
    from pieces_commerciales p
      left join (
        select piece_id, sum(montant) as total
        from reglements_piece
        where organization_id = ${organizationId} and deleted_at is null
        group by piece_id
      ) r on r.piece_id = p.id
      left join pieces_commerciales o on o.id = p.origine_id
    where p.organization_id = ${organizationId} and p.deleted_at is null
    order by p.date_piece desc, p.created_at desc
  `);

  return lignes.map((l) => ({
    id: l.id,
    nature: l.nature,
    numero: l.numero,
    statut: l.statut,
    clientId: l.client_id,
    clientNom: l.client_nom,
    projetId: l.projet_id,
    datePiece: enDateIso(l.date_piece) ?? "",
    echeance: enDateIso(l.echeance),
    totalHt: Number(l.total_ht),
    totalTva: Number(l.total_tva),
    totalTtc: Number(l.total_ttc),
    regle: Number(l.regle),
    enRetard: l.en_retard === true,
    ecritureNumero: l.ecriture_numero,
    origineNumero: l.origine_numero,
    depotId: l.depot_id,
    notes: l.notes,
    commercialId: l.commercial_id,
    contactId: l.contact_id,
    contactNom: l.contact_nom,
  }));
}

export interface LignePieceVue {
  articleId: string | null;
  designation: string;
  quantite: number;
  unite: string;
  prixUnitaireHt: number;
  remise: number;
  montantHt: number;
  tauxTva: number;
  compteVente: string;
}

export interface ReglementVue {
  numero: string;
  date: string;
  moyen: MoyenReglementPiece;
  montant: number;
  reference: string | null;
}

/** Lignes et règlements de toutes les pièces, indexés par pièce. */
export async function detailsPieces(organizationId: string): Promise<{
  lignes: Map<string, LignePieceVue[]>;
  reglements: Map<string, ReglementVue[]>;
}> {
  const [lignes, reglements] = await Promise.all([
    db.execute<{
      piece_id: string;
      article_id: string | null;
      designation: string;
      quantite: string;
      unite: string;
      prix_unitaire_ht: string;
      remise: string;
      montant_ht: string;
      taux_tva: number;
      compte_vente: string;
    }>(sql`
      select piece_id, article_id, designation, quantite, unite, prix_unitaire_ht,
             remise, montant_ht, taux_tva, compte_vente
      from lignes_piece
      where organization_id = ${organizationId}
      order by piece_id, ordre`),
    db.execute<{
      piece_id: string;
      numero: string;
      date_reglement: string | Date;
      moyen: MoyenReglementPiece;
      montant: string;
      reference: string | null;
    }>(sql`
      select piece_id, numero, date_reglement, moyen, montant, reference
      from reglements_piece
      where organization_id = ${organizationId} and deleted_at is null
      order by date_reglement, created_at`),
  ]);

  const parPiece = new Map<string, LignePieceVue[]>();
  for (const l of lignes) {
    const liste = parPiece.get(l.piece_id) ?? [];
    liste.push({
      articleId: l.article_id,
      designation: l.designation,
      quantite: Number(l.quantite),
      unite: l.unite,
      prixUnitaireHt: Number(l.prix_unitaire_ht),
      remise: Number(l.remise),
      montantHt: Number(l.montant_ht),
      tauxTva: Number(l.taux_tva),
      compteVente: l.compte_vente,
    });
    parPiece.set(l.piece_id, liste);
  }

  const regPiece = new Map<string, ReglementVue[]>();
  for (const r of reglements) {
    const liste = regPiece.get(r.piece_id) ?? [];
    liste.push({
      numero: r.numero,
      date: enDateIso(r.date_reglement) ?? "",
      moyen: r.moyen,
      montant: Number(r.montant),
      reference: r.reference,
    });
    regPiece.set(r.piece_id, liste);
  }

  return { lignes: parPiece, reglements: regPiece };
}

export interface ArticleFacturable {
  id: string;
  designation: string;
  unite: string;
  /** Prix de rayon TTC, ramené hors taxes pour la facture. */
  prixHt: number;
  tauxTva: number;
  compteVente: string;
}

export interface OptionsPiece {
  clients: { id: string; nom: string; compte: string | null }[];
  /** Contacts actifs par client, le principal en tête. */
  contacts: Record<string, { id: string; libelle: string; principal: boolean }[]>;
  articles: ArticleFacturable[];
  depots: { id: string; nom: string }[];
  projets: { id: string; libelle: string }[];
  commerciaux: { id: string; nom: string }[];
  /** Commercial lié à l'utilisateur connecté : proposé par défaut. */
  commercialParDefaut: string | null;
}

/**
 * Listes de choix du formulaire de pièce.
 *
 * Le prix proposé est le prix de rayon ramené HORS TAXES : un article marqué
 * 1 180 F TTC à 18 % se facture 1 000 F HT. La saisie reste libre — une
 * facture entre entreprises se négocie.
 */
export async function optionsPiece(organizationId: string, userId?: string): Promise<OptionsPiece> {
  const [clients, articles, depots, projets, commerciaux, contacts] = await Promise.all([
    db.execute<{ id: string; nom: string; compte: string | null }>(sql`
      select id, nom, compte_client as compte from tiers
      where organization_id = ${organizationId} and est_client and actif
        and deleted_at is null
      order by nom`),
    db.execute<{
      id: string;
      designation: string;
      unite: string;
      prix_vente: string;
      taux_tva: number;
      compte_vente: string;
    }>(sql`
      select a.id, a.designation, a.unite, a.prix_vente,
             coalesce(a.taux_tva, f.taux_tva, 1800) as taux_tva,
             coalesce(a.compte_vente, f.compte_vente, '701') as compte_vente
      from articles a
        left join familles_article f on f.id = a.famille_id
      where a.organization_id = ${organizationId} and a.actif and a.deleted_at is null
      order by a.designation`),
    db.execute<{ id: string; nom: string }>(sql`
      select id, nom from depots
      where organization_id = ${organizationId} and deleted_at is null
      order by created_at`),
    db.execute<{ id: string; libelle: string }>(sql`
      select id, code || ' · ' || nom as libelle from projets
      where organization_id = ${organizationId} and deleted_at is null
        and statut not in ('termine', 'annule')
      order by code desc`),
    db.execute<{ id: string; nom: string; user_id: string | null }>(sql`
      select c.id, coalesce(e.nom, u.full_name, c.nom) as nom, c.user_id
      from commerciaux c
        left join employees e on e.id = c.employee_id
        left join users u on u.id = c.user_id
      where c.organization_id = ${organizationId} and c.actif and c.deleted_at is null
      order by 2`),
    db.execute<{ id: string; tiers_id: string; nom: string; fonction: string | null; principal: boolean }>(sql`
      select id, tiers_id, nom, fonction, principal from contacts_tiers
      where organization_id = ${organizationId} and actif
      order by principal desc, nom`),
  ]);
  const contactsParClient: OptionsPiece["contacts"] = {};
  for (const c of contacts) {
    (contactsParClient[c.tiers_id] ??= []).push({ id: c.id, libelle: c.fonction ? `${c.nom}, ${c.fonction}` : c.nom, principal: c.principal === true });
  }

  return {
    clients: [...clients],
    contacts: contactsParClient,
    articles: articles.map((a) => {
      const taux = Number(a.taux_tva);
      const ttc = Number(a.prix_vente);
      return {
        id: a.id,
        designation: a.designation,
        unite: a.unite,
        prixHt: Math.round((ttc * 10_000) / (10_000 + taux)),
        tauxTva: taux,
        compteVente: a.compte_vente,
      };
    }),
    depots: [...depots],
    projets: [...projets],
    commerciaux: commerciaux.map((c) => ({ id: c.id, nom: c.nom })),
    commercialParDefaut: (userId && commerciaux.find((c) => c.user_id === userId)?.id) || null,
  };
}

/** Factures en retard, pour le tableau de bord. */
export async function etatFacturation(organizationId: string): Promise<{
  enRetard: number;
  montantEnRetard: number;
}> {
  const [ligne] = await db.execute<{ nombre: string; montant: string }>(sql`
    select count(*) as nombre, coalesce(sum(p.total_ttc - coalesce(r.total, 0)), 0) as montant
    from pieces_commerciales p
      left join (
        select piece_id, sum(montant) as total from reglements_piece
        where organization_id = ${organizationId} and deleted_at is null
        group by piece_id
      ) r on r.piece_id = p.id
    where p.organization_id = ${organizationId}
      and p.nature = 'facture' and p.statut = 'emise'
      and p.echeance < current_date
      and coalesce(r.total, 0) < p.total_ttc
  `);

  return { enRetard: Number(ligne?.nombre ?? 0), montantEnRetard: Number(ligne?.montant ?? 0) };
}
