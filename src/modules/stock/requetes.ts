import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { type Article } from "@/modules/catalogue/schema";
// `mouvements_stock` n'apparaît que dans les requêtes SQL de ce fichier : les
// agrégats à `filter (where ...)` et les sous-requêtes par article n'ont pas
// d'équivalent lisible dans le constructeur de requêtes.
import { depots, type Depot, type TypeDepot, type TypeMouvement } from "./schema";

export async function listerDepots(
  organizationId: string,
  inclureFermes = false,
): Promise<Depot[]> {
  const filtres = [
    eq(depots.organizationId, organizationId),
    isNull(depots.deletedAt),
  ];
  if (!inclureFermes) filtres.push(eq(depots.actif, true));

  return db
    .select()
    .from(depots)
    .where(and(...filtres))
    .orderBy(desc(depots.parDefaut), asc(depots.nom));
}

/** Quantité et valeur d'un article dans un dépôt. */
export interface StockDepot {
  depotId: string;
  quantite: number;
  valeur: number;
}

export interface StockArticle {
  articleId: string;
  /** Toutes destinations confondues, en millièmes d'unité. */
  quantite: number;
  /** Au coût moyen pondéré, en francs entiers. */
  valeur: number;
  parDepot: StockDepot[];
}

/**
 * Stock de tous les articles, par dépôt.
 *
 * Une seule requête pour tout le catalogue, pas une par article : une supérette
 * de trois cents références ferait trois cents allers-retours vers Abidjan à
 * chaque affichage de l'écran.
 *
 * La valeur se calcule en base, en `numeric`, et non en JavaScript : la
 * quantité est en millièmes, le coût en francs, et leur produit doit être
 * divisé par mille une seule fois, à la fin. Arrondir chaque ligne avant de
 * sommer donnerait un écart de plusieurs francs sur un inventaire entier.
 */
export async function stocksParArticle(
  organizationId: string,
): Promise<Map<string, StockArticle>> {
  const lignes = await db.execute<{
    article_id: string;
    depot_id: string;
    quantite: string;
    valeur: string;
  }>(sql`
    select
      article_id,
      depot_id,
      coalesce(sum(quantite), 0) as quantite,
      round(coalesce(sum(quantite * cout_unitaire), 0)::numeric / 1000) as valeur
    from mouvements_stock
    where organization_id = ${organizationId}
      and deleted_at is null
    group by article_id, depot_id
  `);

  const stocks = new Map<string, StockArticle>();

  for (const ligne of lignes) {
    // `sum` sur un bigint revient en numeric, que le pilote rend en chaîne pour
    // ne pas perdre de précision. Quantités et francs restent très en deçà de
    // 2^53 : la conversion est sûre.
    const quantite = Number(ligne.quantite);
    const valeur = Number(ligne.valeur);

    const stock = stocks.get(ligne.article_id) ?? {
      articleId: ligne.article_id,
      quantite: 0,
      valeur: 0,
      parDepot: [],
    };

    stock.quantite += quantite;
    stock.valeur += valeur;
    stock.parDepot.push({ depotId: ligne.depot_id, quantite, valeur });

    stocks.set(ligne.article_id, stock);
  }

  return stocks;
}

export interface DepotValorise extends Depot {
  /** Références effectivement détenues, quantité non nulle. */
  references: number;
  /**
   * Somme brute des quantités, toutes unités confondues. À NE PAS AFFICHER :
   * additionner des kilos de poisson et des bouteilles d'eau ne produit aucune
   * grandeur. Seules la valeur en francs et le nombre de références se
   * comparent d'un dépôt à l'autre.
   */
  quantite: number;
  valeur: number;
}

/**
 * Les dépôts avec ce qu'ils contiennent.
 *
 * Un dépôt vide figure quand même dans la liste : il vient d'être créé, ou il a
 * été vidé, et le faire disparaître de l'écran donnerait à croire qu'il
 * n'existe plus.
 */
export async function depotsValorises(
  organizationId: string,
): Promise<DepotValorise[]> {
  const [liste, lignes] = await Promise.all([
    listerDepots(organizationId),
    db.execute<{
      depot_id: string;
      references: string;
      quantite: string;
      valeur: string;
    }>(sql`
      select
        depot_id,
        -- « references » est un mot réservé du SQL : sans guillemets, la
        -- requête ne se parse même pas.
        count(*) filter (where solde <> 0) as "references",
        coalesce(sum(solde), 0) as quantite,
        coalesce(sum(valeur), 0) as valeur
      from (
        select
          depot_id,
          article_id,
          sum(quantite) as solde,
          round(sum(quantite * cout_unitaire)::numeric / 1000) as valeur
        from mouvements_stock
        where organization_id = ${organizationId}
          and deleted_at is null
        group by depot_id, article_id
      ) as par_article
      group by depot_id
    `),
  ]);

  const contenus = new Map(
    lignes.map((ligne) => [
      ligne.depot_id,
      {
        references: Number(ligne.references),
        quantite: Number(ligne.quantite),
        valeur: Number(ligne.valeur),
      },
    ]),
  );

  return liste.map((depot) => ({
    ...depot,
    ...(contenus.get(depot.id) ?? { references: 0, quantite: 0, valeur: 0 }),
  }));
}

export interface LigneJournal {
  id: string;
  type: TypeMouvement;
  piece: string;
  quantite: number;
  coutUnitaire: number;
  motif: string | null;
  effectueLe: Date;
  articleDesignation: string;
  articleUnite: Article["unite"];
  depotNom: string;
  depotType: TypeDepot;
  /** Autre dépôt d'un transfert. Nul partout ailleurs. */
  depotVersNom: string | null;
  auteur: string | null;
}

/**
 * Journal des mouvements, du plus récent au plus ancien.
 *
 * Borné : le journal d'un magasin qui tourne dépasse le million de lignes en un
 * an, et personne ne lit au-delà des dernières pages.
 */
export async function listerMouvements(
  organizationId: string,
  limite = 60,
): Promise<LigneJournal[]> {
  const lignes = await db.execute<{
    id: string;
    type: TypeMouvement;
    piece: string;
    quantite: string;
    cout_unitaire: string;
    motif: string | null;
    effectue_le: Date;
    article_designation: string;
    article_unite: Article["unite"];
    depot_nom: string;
    depot_type: TypeDepot;
    depot_vers_nom: string | null;
    auteur: string | null;
  }>(sql`
    select
      m.id,
      m.type,
      m.piece,
      m.quantite,
      m.cout_unitaire,
      m.motif,
      m.effectue_le,
      a.designation as article_designation,
      a.unite as article_unite,
      d.nom as depot_nom,
      d.type as depot_type,
      c.nom as depot_vers_nom,
      u.full_name as auteur
    from mouvements_stock m
      join articles a on a.id = m.article_id
      join depots d on d.id = m.depot_id
      left join depots c on c.id = m.depot_contrepartie_id
      left join users u on u.id = m.user_id
    where m.organization_id = ${organizationId}
      and m.deleted_at is null
    order by m.effectue_le desc, m.created_at desc
    limit ${limite}
  `);

  return lignes.map((ligne) => ({
    id: ligne.id,
    type: ligne.type,
    piece: ligne.piece,
    quantite: Number(ligne.quantite),
    coutUnitaire: Number(ligne.cout_unitaire),
    motif: ligne.motif,
    effectueLe: new Date(ligne.effectue_le),
    articleDesignation: ligne.article_designation,
    articleUnite: ligne.article_unite,
    depotNom: ligne.depot_nom,
    depotType: ligne.depot_type,
    depotVersNom: ligne.depot_vers_nom,
    auteur: ligne.auteur,
  }));
}

export interface AlerteStock {
  articleId: string;
  designation: string;
  reference: string;
  unite: Article["unite"];
  quantite: number;
  seuil: number;
  prixAchat: number;
  /** Sorties de type vente constatées sur les trente derniers jours. */
  ventes30j: number;
  fournisseurId: string | null;
  fournisseurNom: string | null;
  delaiJours: number;
}

/**
 * Articles à commander : ceux dont le stock est passé sous leur seuil.
 *
 * Les ventes des trente derniers jours viennent des mouvements, pas d'un
 * compteur : c'est ce qui permet de dire dans combien de jours l'article
 * manquera, et donc de commander avant la rupture plutôt qu'après.
 *
 * Les articles sans seuil sont écartés. Un seuil à zéro ne veut pas dire
 * « alerte tout le temps » mais « pas de réapprovisionnement automatique » —
 * c'est le cas du frais qu'on achète au marché chaque matin.
 */
export async function alertesReapprovisionnement(
  organizationId: string,
): Promise<AlerteStock[]> {
  const lignes = await db.execute<{
    article_id: string;
    designation: string;
    reference: string;
    unite: Article["unite"];
    quantite: string;
    seuil: string;
    prix_achat: string;
    ventes30j: string;
    fournisseur_id: string | null;
    fournisseur_nom: string | null;
    delai_jours: number;
  }>(sql`
    select
      a.id as article_id,
      a.designation,
      a.reference,
      a.unite,
      coalesce(s.quantite, 0) as quantite,
      a.seuil_alerte as seuil,
      a.prix_achat,
      coalesce(v.vendu, 0) as ventes30j,
      f.id as fournisseur_id,
      f.nom as fournisseur_nom,
      coalesce(f.delai_livraison_jours, 0) as delai_jours
    from articles a
      left join (
        select article_id, sum(quantite) as quantite
        from mouvements_stock
        where organization_id = ${organizationId} and deleted_at is null
        group by article_id
      ) s on s.article_id = a.id
      left join (
        select article_id, -sum(quantite) as vendu
        from mouvements_stock
        where organization_id = ${organizationId}
          and deleted_at is null
          and type = 'vente'
          and effectue_le >= now() - interval '30 days'
        group by article_id
      ) v on v.article_id = a.id
      left join tiers f on f.id = a.fournisseur_id
    where a.organization_id = ${organizationId}
      and a.deleted_at is null
      and a.actif
      and a.suivi_stock
      and a.seuil_alerte > 0
      and coalesce(s.quantite, 0) <= a.seuil_alerte
    order by coalesce(s.quantite, 0) asc, a.designation asc
  `);

  return lignes.map((ligne) => ({
    articleId: ligne.article_id,
    designation: ligne.designation,
    reference: ligne.reference,
    unite: ligne.unite,
    quantite: Number(ligne.quantite),
    seuil: Number(ligne.seuil),
    prixAchat: Number(ligne.prix_achat),
    ventes30j: Number(ligne.ventes30j),
    fournisseurId: ligne.fournisseur_id,
    fournisseurNom: ligne.fournisseur_nom,
    delaiJours: Number(ligne.delai_jours),
  }));
}

/**
 * Jours de vente restants avant la rupture.
 *
 * `Infinity` quand l'article ne s'est pas vendu depuis un mois : il n'y a pas
 * d'échéance à annoncer, et afficher « 0 jour » sur un article qui dort ferait
 * remonter en tête une commande dont personne n'a besoin.
 */
export function joursRestants(alerte: AlerteStock): number {
  const parJour = alerte.ventes30j / 30;
  if (parJour <= 0) return Infinity;
  return Math.floor(alerte.quantite / parJour);
}

/**
 * Quantité à commander : de quoi tenir le délai du fournisseur plus un mois de
 * réserve, déduction faite de ce qui reste. Jamais moins que le seuil.
 *
 * Le résultat est en millièmes d'unité, arrondi à l'unité entière supérieure :
 * on ne commande pas 4,3 sacs de riz.
 */
export function quantiteSuggeree(alerte: AlerteStock): number {
  const parJour = alerte.ventes30j / 30;
  const besoin = parJour * (alerte.delaiJours + 30) - alerte.quantite;
  return Math.max(alerte.seuil, Math.ceil(besoin / 1000) * 1000);
}

export interface ResumeStock {
  valeur: number;
  /** Même réserve que sur `DepotValorise` : ce total mêle les unités. */
  quantite: number;
  /** Articles suivis en stock, prestations exclues. */
  references: number;
  ruptures: number;
  sousSeuil: number;
}

/**
 * Indicateurs de tête de l'écran Stock.
 *
 * Les prestations sont écartées du décompte : une entreprise qui vend trois
 * services et deux marchandises n'a pas « cinq références en stock », et deux
 * ruptures sur cinq n'est pas le bon rapport.
 */
export async function resumeStock(organizationId: string): Promise<ResumeStock> {
  const [ligne] = await db.execute<{
    valeur: string;
    quantite: string;
    references: string;
    ruptures: string;
    sous_seuil: string;
  }>(sql`
    select
      coalesce(sum(valeur), 0) as valeur,
      coalesce(sum(solde), 0) as quantite,
      count(*) as "references",
      count(*) filter (where solde <= 0) as ruptures,
      count(*) filter (where solde > 0 and seuil_alerte > 0 and solde <= seuil_alerte)
        as sous_seuil
    from (
      select
        a.id,
        a.seuil_alerte,
        coalesce(sum(m.quantite), 0) as solde,
        coalesce(round(sum(m.quantite * m.cout_unitaire)::numeric / 1000), 0) as valeur
      from articles a
        left join mouvements_stock m
          on m.article_id = a.id
          and m.organization_id = a.organization_id
          and m.deleted_at is null
      where a.organization_id = ${organizationId}
        and a.deleted_at is null
        and a.actif
        and a.suivi_stock
      group by a.id, a.seuil_alerte
    ) as par_article
  `);

  return {
    valeur: Number(ligne?.valeur ?? 0),
    quantite: Number(ligne?.quantite ?? 0),
    references: Number(ligne?.references ?? 0),
    ruptures: Number(ligne?.ruptures ?? 0),
    sousSeuil: Number(ligne?.sous_seuil ?? 0),
  };
}

/** L'entreprise a-t-elle au moins un dépôt ? Sert aux écrans vides. */
export async function aUnDepot(organizationId: string): Promise<boolean> {
  const [depot] = await db
    .select({ id: depots.id })
    .from(depots)
    .where(and(eq(depots.organizationId, organizationId), isNull(depots.deletedAt)))
    .limit(1);

  return Boolean(depot);
}

/** Dépôt proposé par défaut à la saisie. Nul si l'entreprise n'en a aucun. */
export async function depotParDefaut(
  organizationId: string,
): Promise<Depot | null> {
  const [depot] = await db
    .select()
    .from(depots)
    .where(
      and(
        eq(depots.organizationId, organizationId),
        eq(depots.actif, true),
        isNull(depots.deletedAt),
      ),
    )
    .orderBy(desc(depots.parDefaut), asc(depots.nom))
    .limit(1);

  return depot ?? null;
}
