import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";
import { contactsParTiers, libelleContact } from "@/modules/tiers/contacts";
import { articles, famillesArticle } from "@/modules/catalogue/schema";
import { depots } from "@/modules/stock/schema";
import { tiers } from "@/modules/tiers/schema";

import { lignesSuivies } from "./creation";
import type { StatutCommande } from "./calcul";
import { commandesAchat, facturesFournisseur } from "./schema";

const jour = (v: string | Date | null) => (v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export interface CommandeVue {
  id: string;
  numero: string;
  fournisseurId: string;
  fournisseur: string;
  dateCommande: string;
  livraisonPrevue: string | null;
  statut: StatutCommande;
  totalTtc: number;
  facture: number;
  depot: string | null;
}

/**
 * Les commandes de l'écran Achats : toutes celles en cours, et les autres
 * touchées depuis cent vingt jours.
 *
 * Avec `filtres`, la recherche porte sur tout l'historique, en base : sans
 * quoi une commande soldée l'an dernier ne se retrouverait jamais.
 */
export async function listerCommandes(organizationId: string, filtres?: FiltresListe): Promise<CommandeVue[]> {
  const recherche = filtres?.actif
    ? and(
        motsDans([sql`c.numero`, sql`c.fournisseur_nom`, sql`c.contact_nom`, sql`c.notes`, sql`d.nom`], motsRecherche(filtres.q)),
        dansPeriodeSql(sql`c.date_commande`, filtres.periode),
      )
    : undefined;
  const lignes = await db.execute<{
    id: string;
    numero: string;
    fournisseur_id: string;
    fournisseur_nom: string;
    date_commande: string | Date;
    livraison_prevue: string | Date | null;
    statut: StatutCommande;
    total_ttc: string;
    facture: string;
    depot: string | null;
  }>(sql`
    select c.id, c.numero, c.fournisseur_id, c.fournisseur_nom, c.date_commande, c.livraison_prevue, c.statut, c.total_ttc,
           coalesce((select sum(f.total_ttc) from factures_fournisseur f where f.commande_id = c.id and f.statut = 'comptabilisee'), 0) as facture,
           d.nom as depot
    from commandes_achat c left join depots d on d.id = c.depot_id
    where c.organization_id = ${organizationId} and c.deleted_at is null
      and ${recherche ?? sql`(c.statut in ('brouillon', 'envoyee', 'partielle') or c.updated_at > now() - interval '120 days')`}
    order by case c.statut when 'brouillon' then 0 when 'envoyee' then 1 when 'partielle' then 2 else 3 end, c.date_commande desc, c.numero desc
    limit 300
  `);
  return lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    fournisseurId: l.fournisseur_id,
    fournisseur: l.fournisseur_nom,
    dateCommande: jour(l.date_commande)!,
    livraisonPrevue: jour(l.livraison_prevue),
    statut: l.statut,
    totalTtc: Number(l.total_ttc),
    facture: Number(l.facture),
    depot: l.depot,
  }));
}

export async function commandeDetail(organizationId: string, id: string) {
  const [c] = await db
    .select()
    .from(commandesAchat)
    .where(and(eq(commandesAchat.id, id), eq(commandesAchat.organizationId, organizationId)));
  if (!c) return null;
  const [lignes, receptions, factures, depot] = await Promise.all([
    lignesSuivies(db, organizationId, id),
    db.execute<{ id: string; numero: string; date_reception: string | Date; bordereau: string | null; depot: string; auteur: string | null; lignes: string }>(sql`
      select r.id, r.numero, r.date_reception, r.bordereau, d.nom as depot, u.full_name as auteur,
             (select count(*) from lignes_reception_achat x where x.reception_id = r.id) as lignes
      from receptions_achat r join depots d on d.id = r.depot_id left join users u on u.id = r.user_id
      where r.commande_id = ${id} and r.organization_id = ${organizationId}
      order by r.date_reception, r.numero
    `),
    db
      .select({
        id: facturesFournisseur.id,
        numero: facturesFournisseur.numero,
        reference: facturesFournisseur.referenceFournisseur,
        totalTtc: facturesFournisseur.totalTtc,
        statut: facturesFournisseur.statut,
        dateFacture: facturesFournisseur.dateFacture,
      })
      .from(facturesFournisseur)
      .where(and(eq(facturesFournisseur.commandeId, id), eq(facturesFournisseur.organizationId, organizationId))),
    c.depotId ? db.select({ nom: depots.nom }).from(depots).where(eq(depots.id, c.depotId)) : Promise.resolve([]),
  ]);
  // Ce qui est déjà facturé, ligne par ligne : pour proposer à la facture le reçu non encore facturé.
  const facturees = await db.execute<{ ligne: string; quantite: string }>(sql`
    select l.ligne_commande_id as ligne, sum(l.quantite) as quantite
    from lignes_facture_fournisseur l join factures_fournisseur f on f.id = l.facture_id
    where f.commande_id = ${id} and f.statut = 'comptabilisee' and l.ligne_commande_id is not null
    group by l.ligne_commande_id
  `);
  const parLigne = new Map(facturees.map((f) => [f.ligne, Number(f.quantite)]));
  return {
    commande: { ...c, dateCommande: jour(c.dateCommande)!, livraisonPrevue: jour(c.livraisonPrevue), depot: depot[0]?.nom ?? null },
    lignes: lignes.map((l) => ({ ...l, facturee: parLigne.get(l.id) ?? 0 })),
    receptions: receptions.map((r) => ({ ...r, date_reception: jour(r.date_reception)!, lignes: Number(r.lignes) })),
    factures: factures.map((f) => ({ ...f, dateFacture: jour(f.dateFacture)! })),
  };
}

export interface FactureVue {
  id: string;
  numero: string;
  reference: string;
  fournisseurId: string;
  fournisseur: string;
  commande: string | null;
  dateFacture: string;
  echeance: string;
  totalTtc: number;
  regle: number;
  reste: number;
  statut: "comptabilisee" | "annulee";
  ecriture: string;
  avecJustificatif: boolean;
  reglements: { numero: string; date: string; montant: number; compte: string; ecriture: string }[];
}

/**
 * Factures fournisseurs, cinq cents au plus.
 *
 * `recherche` filtre en base, avant la limite : numéro, référence du
 * fournisseur, fournisseur, commande, note ; et la période sur la date de
 * facture ou sur l'échéance, selon `periodeSur`.
 */
export async function listerFactures(
  organizationId: string,
  filtre: {
    fournisseurId?: string | null;
    ouvertesSeulement?: boolean;
    recherche?: FiltresListe;
    periodeSur?: "date_facture" | "echeance";
  } = {},
): Promise<FactureVue[]> {
  const recherche = filtre.recherche?.actif
    ? and(
        motsDans([sql`f.numero`, sql`f.reference_fournisseur`, sql`f.fournisseur_nom`, sql`c.numero`, sql`f.notes`], motsRecherche(filtre.recherche.q)),
        dansPeriodeSql(filtre.periodeSur === "echeance" ? sql`f.echeance` : sql`f.date_facture`, filtre.recherche.periode),
      )
    : undefined;
  const lignes = await db.execute<{
    id: string;
    numero: string;
    reference_fournisseur: string;
    fournisseur_id: string;
    fournisseur_nom: string;
    commande: string | null;
    date_facture: string | Date;
    echeance: string | Date;
    total_ttc: string;
    statut: "comptabilisee" | "annulee";
    ecriture: string;
    justificatif_chemin: string | null;
    reglements: FactureVue["reglements"] | string | null;
  }>(sql`
    select f.id, f.numero, f.reference_fournisseur, f.fournisseur_id, f.fournisseur_nom, c.numero as commande,
           f.date_facture, f.echeance, f.total_ttc, f.statut, f.ecriture, f.justificatif_chemin,
           (select coalesce(json_agg(json_build_object('numero', r.numero, 'date', r.date_reglement, 'montant', r.montant,
                    'compte', t.nom, 'ecriture', r.ecriture) order by r.date_reglement), '[]'::json)
              from reglements_fournisseur r join comptes_tresorerie t on t.id = r.compte_tresorerie_id
             where r.facture_id = f.id) as reglements
    from factures_fournisseur f left join commandes_achat c on c.id = f.commande_id
    where f.organization_id = ${organizationId} and f.deleted_at is null
      and (${filtre.fournisseurId ?? null}::uuid is null or f.fournisseur_id = ${filtre.fournisseurId ?? null}::uuid)
      and ${recherche ?? sql`true`}
    order by f.echeance, f.numero
    limit 500
  `);
  const vues = lignes.map((l) => {
    const regs = (typeof l.reglements === "string" ? JSON.parse(l.reglements) : (l.reglements ?? [])) as { numero: string; date: string; montant: string | number; compte: string; ecriture: string }[];
    const reglements = regs.map((r) => ({ ...r, date: String(r.date).slice(0, 10), montant: Number(r.montant) }));
    const totalTtc = Number(l.total_ttc);
    const regle = reglements.reduce((s, r) => s + r.montant, 0);
    return {
      id: l.id,
      numero: l.numero,
      reference: l.reference_fournisseur,
      fournisseurId: l.fournisseur_id,
      fournisseur: l.fournisseur_nom,
      commande: l.commande,
      dateFacture: jour(l.date_facture)!,
      echeance: jour(l.echeance)!,
      totalTtc,
      regle,
      reste: l.statut === "annulee" ? 0 : totalTtc - regle,
      statut: l.statut,
      ecriture: l.ecriture,
      avecJustificatif: Boolean(l.justificatif_chemin),
      reglements,
    };
  });
  return filtre.ouvertesSeulement ? vues.filter((v) => v.reste > 0) : vues;
}

/** Fournisseurs actifs, pour la saisie, avec leurs contacts (le principal en tête). */
export async function fournisseursActifs(organizationId: string) {
  const [liste, contacts] = await Promise.all([
    db
      .select({ id: tiers.id, nom: tiers.nom, delaiLivraisonJours: tiers.delaiLivraisonJours })
      .from(tiers)
      .where(and(eq(tiers.organizationId, organizationId), eq(tiers.estFournisseur, true), eq(tiers.actif, true)))
      .orderBy(asc(tiers.nom)),
    contactsParTiers(organizationId),
  ]);
  return liste.map((f) => ({
    ...f,
    contacts: (contacts.get(f.id) ?? []).map((c) => ({ id: c.id, libelle: libelleContact(c), principal: c.principal })),
  }));
}

/** Articles achetables, avec leur prix d'achat, leur TVA et leur compte d'achat résolus par la famille. */
export async function articlesAchetables(organizationId: string) {
  const lignes = await db
    .select({
      id: articles.id,
      reference: articles.reference,
      designation: articles.designation,
      unite: articles.unite,
      prixAchat: articles.prixAchat,
      fournisseurId: articles.fournisseurId,
      tauxArticle: articles.tauxTva,
      compteArticle: articles.compteAchat,
      tauxFamille: famillesArticle.tauxTva,
      compteFamille: famillesArticle.compteAchat,
    })
    .from(articles)
    .leftJoin(famillesArticle, eq(famillesArticle.id, articles.familleId))
    .where(and(eq(articles.organizationId, organizationId), eq(articles.actif, true)))
    .orderBy(asc(articles.designation));
  return lignes.map((l) => ({
    id: l.id,
    reference: l.reference,
    designation: l.designation,
    unite: l.unite,
    prixAchat: l.prixAchat,
    fournisseurId: l.fournisseurId,
    tauxTva: l.tauxArticle ?? l.tauxFamille ?? 1800,
    compteAchat: l.compteArticle ?? l.compteFamille ?? "601",
  }));
}

export async function depotsActifs(organizationId: string) {
  return db
    .select({ id: depots.id, nom: depots.nom, parDefaut: depots.parDefaut })
    .from(depots)
    .where(and(eq(depots.organizationId, organizationId), eq(depots.actif, true)))
    .orderBy(asc(depots.nom));
}

export interface EtatAchats {
  facturesEchues: number;
  montantEchu: number;
  aPayerSous7Jours: number;
  livraisonsEnRetard: number;
}

/** Pour le tableau de bord : dettes échues, à payer dans la semaine, livraisons en retard. */
export async function etatAchats(organizationId: string): Promise<EtatAchats> {
  const [[d], [l]] = await Promise.all([
    db.execute<{ echues: string; montant: string; bientot: string }>(sql`
      with restes as (
        select f.echeance, f.total_ttc - coalesce((select sum(r.montant) from reglements_fournisseur r where r.facture_id = f.id), 0) as reste
        from factures_fournisseur f where f.organization_id = ${organizationId} and f.statut = 'comptabilisee'
      )
      select count(*) filter (where reste > 0 and echeance < current_date) as echues,
             coalesce(sum(reste) filter (where reste > 0 and echeance < current_date), 0) as montant,
             count(*) filter (where reste > 0 and echeance >= current_date and echeance <= current_date + 7) as bientot
      from restes
    `),
    db.execute<{ retard: string }>(sql`
      select count(*) as retard from commandes_achat
      where organization_id = ${organizationId} and statut in ('envoyee', 'partielle') and livraison_prevue < current_date
    `),
  ]);
  return {
    facturesEchues: Number(d?.echues ?? 0),
    montantEchu: Number(d?.montant ?? 0),
    aPayerSous7Jours: Number(d?.bientot ?? 0),
    livraisonsEnRetard: Number(l?.retard ?? 0),
  };
}

/** Dettes fournisseurs ouvertes, pour le plan de trésorerie : chacune à son échéance. */
export async function dettesOuvertes(organizationId: string): Promise<{ numero: string; fournisseur: string; echeance: string; reste: number }[]> {
  const lignes = await db.execute<{ numero: string; fournisseur_nom: string; reference_fournisseur: string; echeance: string | Date; reste: string }>(sql`
    select f.numero, f.fournisseur_nom, f.reference_fournisseur, f.echeance,
           f.total_ttc - coalesce((select sum(r.montant) from reglements_fournisseur r where r.facture_id = f.id), 0) as reste
    from factures_fournisseur f
    where f.organization_id = ${organizationId} and f.statut = 'comptabilisee'
  `);
  return lignes
    .map((l) => ({ numero: `${l.numero} (${l.reference_fournisseur})`, fournisseur: l.fournisseur_nom, echeance: jour(l.echeance)!, reste: Number(l.reste) }))
    .filter((l) => l.reste > 0);
}

