import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";

import { jugerEcheance, type Jugement } from "./echeance";
import {
  actifs,
  type NatureEcheance,
  type NatureIntervention,
  type StatutActif,
  type TypeActif,
} from "./schema";

// -------------------------------------------------------------------- actifs

export interface ActifSuivi {
  id: string;
  code: string;
  designation: string;
  type: TypeActif;
  statut: StatutActif;
  site: string | null;
  dateAcquisition: string | null;
  valeurAcquisition: number;
  uniteCompteur: string | null;
  /** Nom de la personne à qui l'actif est confié, quelle que soit sa nature. */
  affecteA: string | null;
  /** Salarié affecté, quand c'en est un : conducteur, utilisateur d'un poste. */
  employeId: string | null;
  /** Client propriétaire. Nul quand l'actif appartient à l'entreprise. */
  proprietaire: string | null;
  /** Somme des interventions non facturables : ce que l'actif a coûté. */
  coutMaintenance: number;
  interventions: number;
  /** Dernier relevé connu, le plus RÉCENT et non le plus élevé. */
  compteur: number | null;
}

/**
 * Le parc, avec ce que chaque actif a coûté et son dernier relevé.
 *
 * Une seule requête pour tout le parc, pas une par actif. Les deux agrégats
 * passent par des sous-requêtes séparées : les joindre ensemble multiplierait
 * chaque intervention par le nombre de relevés, et le coût d'entretien
 * afficherait le triple du réel.
 *
 * Le compteur courant sort d'un `distinct on ... order by releve_le desc` :
 * c'est le dernier constat qui fait foi. Prendre le maximum ferait attendre
 * l'entretien suivant pendant deux cent mille kilomètres après un
 * remplacement de compteur.
 */
export async function listerActifs(
  organizationId: string,
): Promise<ActifSuivi[]> {
  const lignes = await db.execute<{
    id: string;
    code: string;
    designation: string;
    type: TypeActif;
    statut: StatutActif;
    site: string | null;
    date_acquisition: string | null;
    valeur_acquisition: string;
    unite_compteur: string | null;
    employe_id: string | null;
    affecte_a: string | null;
    proprietaire: string | null;
    cout_maintenance: string;
    interventions: string;
    compteur: string | null;
  }>(sql`
    select
      a.id,
      a.code,
      a.designation,
      a.type,
      a.statut,
      a.site,
      a.date_acquisition,
      a.valeur_acquisition,
      a.unite_compteur,
      a.employe_id,
      coalesce(e.nom, w.nom) as affecte_a,
      t.nom as proprietaire,
      coalesce(i.cout, 0) as cout_maintenance,
      coalesce(i.nombre, 0) as interventions,
      c.valeur as compteur
    from actifs a
      left join employees e on e.id = a.employe_id
      left join workers w on w.id = a.intervenant_id
      left join tiers t on t.id = a.proprietaire_id
      left join (
        select
          actif_id,
          count(*) as nombre,
          -- Une intervention facturable est un produit à venir, pas une
          -- charge : la compter dans le coût du parc ferait passer le chiffre
          -- d'affaires d'un garage pour ses frais d'entretien.
          sum(cout) filter (where not facturable) as cout
        from interventions
        where organization_id = ${organizationId} and deleted_at is null
        group by actif_id
      ) i on i.actif_id = a.id
      left join (
        select distinct on (actif_id) actif_id, valeur
        from releves_compteur
        where organization_id = ${organizationId} and deleted_at is null
        order by actif_id, releve_le desc, created_at desc
      ) c on c.actif_id = a.id
    where a.organization_id = ${organizationId}
      and a.deleted_at is null
    order by a.code asc
  `);

  return lignes.map((ligne) => ({
    id: ligne.id,
    code: ligne.code,
    designation: ligne.designation,
    type: ligne.type,
    statut: ligne.statut,
    site: ligne.site,
    dateAcquisition: ligne.date_acquisition,
    valeurAcquisition: Number(ligne.valeur_acquisition),
    uniteCompteur: ligne.unite_compteur,
    affecteA: ligne.affecte_a,
    employeId: ligne.employe_id,
    proprietaire: ligne.proprietaire,
    coutMaintenance: Number(ligne.cout_maintenance),
    interventions: Number(ligne.interventions),
    compteur: ligne.compteur === null ? null : Number(ligne.compteur),
  }));
}

/** L'entreprise suit-elle au moins un actif ? Sert aux écrans vides. */
export async function aUnActif(organizationId: string): Promise<boolean> {
  const [actif] = await db
    .select({ id: actifs.id })
    .from(actifs)
    .where(eq(actifs.organizationId, organizationId))
    .limit(1);

  return Boolean(actif);
}

// -------------------------------------------------------------- interventions

export interface LigneIntervention {
  id: string;
  numero: string;
  actifCode: string;
  actifDesignation: string;
  nature: NatureIntervention;
  libelle: string;
  prestataire: string | null;
  cout: number;
  facturable: boolean;
  /** Client à facturer, quand l'actif lui appartient. */
  client: string | null;
  compteur: number | null;
  uniteCompteur: string | null;
  effectueeLe: Date;
}

export async function listerInterventions(
  organizationId: string,
  limite = 60,
  filtres?: FiltresListe,
): Promise<LigneIntervention[]> {
  // Filtrées en base, pas après coup : sinon la recherche ne verrait que les
  // soixante dernières.
  const recherche =
    filtres &&
    and(
      motsDans(
        [sql`i.numero`, sql`a.code`, sql`a.designation`, sql`i.libelle`, sql`i.nature::text`, sql`p.nom`, sql`i.prestataire`, sql`t.nom`],
        motsRecherche(filtres.q),
      ),
      dansPeriodeSql(sql`i.effectuee_le`, filtres.periode),
    );

  const lignes = await db.execute<{
    id: string;
    numero: string;
    actif_code: string;
    actif_designation: string;
    nature: NatureIntervention;
    libelle: string;
    prestataire: string | null;
    cout: string;
    facturable: boolean;
    client: string | null;
    compteur: string | null;
    unite_compteur: string | null;
    effectuee_le: Date;
  }>(sql`
    select
      i.id,
      i.numero,
      a.code as actif_code,
      a.designation as actif_designation,
      i.nature,
      i.libelle,
      -- Le prestataire extérieur a une fiche tiers ; l'atelier interne n'en a
      -- pas, et son nom reste en texte libre.
      coalesce(p.nom, i.prestataire) as prestataire,
      i.cout,
      i.facturable,
      t.nom as client,
      r.valeur as compteur,
      a.unite_compteur,
      i.effectuee_le
    from interventions i
      join actifs a on a.id = i.actif_id
      left join tiers p on p.id = i.prestataire_id
      left join tiers t on t.id = a.proprietaire_id
      left join releves_compteur r on r.intervention_id = i.id
    where i.organization_id = ${organizationId}
      and i.deleted_at is null
      and ${recherche ?? sql`true`}
    order by i.effectuee_le desc, i.created_at desc
    limit ${limite}
  `);

  return lignes.map((ligne) => ({
    id: ligne.id,
    numero: ligne.numero,
    actifCode: ligne.actif_code,
    actifDesignation: ligne.actif_designation,
    nature: ligne.nature,
    libelle: ligne.libelle,
    prestataire: ligne.prestataire,
    cout: Number(ligne.cout),
    facturable: ligne.facturable,
    client: ligne.client,
    compteur: ligne.compteur === null ? null : Number(ligne.compteur),
    uniteCompteur: ligne.unite_compteur,
    effectueeLe: new Date(ligne.effectuee_le),
  }));
}

// ----------------------------------------------------------------- échéances

export interface LigneEcheance extends Jugement {
  id: string;
  actifId: string;
  actifCode: string;
  actifDesignation: string;
  nature: NatureEcheance;
  libelle: string | null;
  echeanceLe: string | null;
  compteurCible: number | null;
  compteurActuel: number | null;
  uniteCompteur: string | null;
}

/**
 * Les échéances non honorées, de la plus urgente à la plus lointaine.
 *
 * Le tri se fait en JavaScript et non en SQL : mêler des jours et des
 * kilomètres demande de ramener les deux sur une même échelle, ce que
 * `jugerEcheance` fait — et cette règle doit rester testable sans base.
 */
export async function listerEcheances(
  organizationId: string,
  aujourdhui = new Date(),
): Promise<LigneEcheance[]> {
  const lignes = await db.execute<{
    id: string;
    actif_id: string;
    actif_code: string;
    actif_designation: string;
    nature: NatureEcheance;
    libelle: string | null;
    echeance_le: string | null;
    compteur_cible: string | null;
    compteur_actuel: string | null;
    unite_compteur: string | null;
  }>(sql`
    select
      ec.id,
      a.id as actif_id,
      a.code as actif_code,
      a.designation as actif_designation,
      ec.nature,
      ec.libelle,
      ec.echeance_le,
      ec.compteur_cible,
      c.valeur as compteur_actuel,
      a.unite_compteur
    from echeances ec
      join actifs a on a.id = ec.actif_id
      left join (
        select distinct on (actif_id) actif_id, valeur
        from releves_compteur
        where organization_id = ${organizationId} and deleted_at is null
        order by actif_id, releve_le desc, created_at desc
      ) c on c.actif_id = a.id
    where ec.organization_id = ${organizationId}
      and ec.deleted_at is null
      and ec.honoree_le is null
  `);

  return lignes
    .map((ligne) => {
      const compteurCible =
        ligne.compteur_cible === null ? null : Number(ligne.compteur_cible);
      const compteurActuel =
        ligne.compteur_actuel === null ? null : Number(ligne.compteur_actuel);

      return {
        id: ligne.id,
        actifId: ligne.actif_id,
        actifCode: ligne.actif_code,
        actifDesignation: ligne.actif_designation,
        nature: ligne.nature,
        libelle: ligne.libelle,
        echeanceLe: ligne.echeance_le,
        compteurCible,
        compteurActuel,
        uniteCompteur: ligne.unite_compteur,
        ...jugerEcheance(
          { echeanceLe: ligne.echeance_le, compteurCible, compteurActuel },
          aujourdhui,
        ),
      };
    })
    .sort((a, b) => a.rang - b.rang);
}

// ---------------------------------------------------------------- indicateurs

export interface ResumeParc {
  actifs: number;
  affectes: number;
  /** Valeur d'acquisition du parc PROPRE, actifs de clients exclus. */
  valeur: number;
  coutMaintenance: number;
  indisponibles: number;
}

export function resumeParc(liste: ActifSuivi[]): ResumeParc {
  // Un actif de client n'appartient pas à l'entreprise : compter sa valeur
  // gonflerait le patrimoine d'un garage de tout ce qui dort sur son parking.
  const propres = liste.filter((a) => a.proprietaire === null);

  return {
    actifs: liste.length,
    affectes: liste.filter((a) => a.affecteA !== null).length,
    valeur: propres.reduce((somme, a) => somme + a.valeurAcquisition, 0),
    coutMaintenance: liste.reduce((somme, a) => somme + a.coutMaintenance, 0),
    indisponibles: liste.filter(
      (a) => a.statut === "entretien" || a.statut === "immobilise",
    ).length,
  };
}
