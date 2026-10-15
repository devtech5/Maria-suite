import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";

import {
  employees,
  workers,
  type Employe,
  type ModeRemuneration,
} from "./schema";

// ------------------------------------------------------------------ salariés

/**
 * Les salariés de l'entreprise, les partis exclus par défaut.
 *
 * Un salarié parti reste en base — ses bulletins et ses déclarations doivent
 * rester lisibles — mais il ne compte plus dans la masse salariale du mois.
 */
export async function listerSalaries(
  organizationId: string,
  inclureSortis = false,
): Promise<Employe[]> {
  const filtres = [
    eq(employees.organizationId, organizationId),
    isNull(employees.deletedAt),
  ];
  if (!inclureSortis) filtres.push(eq(employees.actif, true));

  return db
    .select()
    .from(employees)
    .where(and(...filtres))
    .orderBy(asc(employees.matricule));
}

/** L'entreprise a-t-elle au moins un salarié ? Sert aux écrans vides. */
export async function aUnSalarie(organizationId: string): Promise<boolean> {
  const [salarie] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.organizationId, organizationId))
    .limit(1);

  return Boolean(salarie);
}

// -------------------------------------------------------------- intervenants

export interface IntervenantAvecCompte {
  id: string;
  code: string;
  nom: string;
  qualification: string;
  telephone: string | null;
  mode: ModeRemuneration;
  taux: number;
  uniteLibelle: string;
  affectation: string | null;
  actif: boolean;
  /** Quantité pointée, en millièmes de l'unité du mode. */
  pointe: number;
  /** Somme des pointages, en francs. */
  engage: number;
  /** Somme des bons de paiement, en francs. */
  regle: number;
  /** Ce qui reste dû : engagé moins réglé. Négatif quand l'avance dépasse. */
  du: number;
}

/**
 * Les intervenants et leur compte, en une requête.
 *
 * Les cumuls viennent des lignes, jamais d'une colonne tenue à côté : ce qui
 * est dû est la somme des pointages moins la somme des bons de paiement, et
 * rien d'autre. Un compteur entretenu sur la fiche finirait par diverger dès
 * qu'un pointage arrive en retard du chantier.
 *
 * Les agrégats se font en sous-requêtes séparées, et non par deux jointures :
 * joindre pointages ET bons sur la même ligne multiplierait chaque pointage
 * par le nombre de bons, et l'engagé afficherait le triple du réel.
 */
export async function listerIntervenants(
  organizationId: string,
  inclureFermes = false,
): Promise<IntervenantAvecCompte[]> {
  const lignes = await db.execute<{
    id: string;
    code: string;
    nom: string;
    qualification: string;
    telephone: string | null;
    mode: ModeRemuneration;
    taux: string;
    unite_libelle: string;
    affectation: string | null;
    actif: boolean;
    pointe: string;
    engage: string;
    regle: string;
  }>(sql`
    select
      w.id,
      w.code,
      w.nom,
      w.qualification,
      w.telephone,
      w.mode,
      w.taux,
      w.unite_libelle,
      w.affectation,
      w.actif,
      coalesce(p.pointe, 0) as pointe,
      coalesce(p.engage, 0) as engage,
      coalesce(b.regle, 0) as regle
    from workers w
      left join (
        select worker_id,
               sum(quantite) as pointe,
               sum(montant) as engage
        from pointages
        where organization_id = ${organizationId} and deleted_at is null
        group by worker_id
      ) p on p.worker_id = w.id
      left join (
        select worker_id, sum(montant) as regle
        from bons_paiement
        where organization_id = ${organizationId} and deleted_at is null
        group by worker_id
      ) b on b.worker_id = w.id
    where w.organization_id = ${organizationId}
      and w.deleted_at is null
      ${inclureFermes ? sql`` : sql`and w.actif`}
    order by w.affectation asc nulls last, w.nom asc
  `);

  return lignes.map((ligne) => {
    const engage = Number(ligne.engage);
    const regle = Number(ligne.regle);

    return {
      id: ligne.id,
      code: ligne.code,
      nom: ligne.nom,
      qualification: ligne.qualification,
      telephone: ligne.telephone,
      mode: ligne.mode,
      taux: Number(ligne.taux),
      uniteLibelle: ligne.unite_libelle,
      affectation: ligne.affectation,
      actif: ligne.actif,
      pointe: Number(ligne.pointe),
      engage,
      regle,
      du: engage - regle,
    };
  });
}

/** L'entreprise a-t-elle au moins un intervenant ? */
export async function aUnIntervenant(organizationId: string): Promise<boolean> {
  const [intervenant] = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.organizationId, organizationId))
    .limit(1);

  return Boolean(intervenant);
}

// ----------------------------------------------------------------- pointages

export interface LignePointage {
  id: string;
  piece: string;
  intervenantNom: string;
  intervenantCode: string;
  quantite: number;
  taux: number;
  uniteLibelle: string;
  montant: number;
  affectation: string | null;
  motif: string | null;
  effectueLe: Date;
  auteur: string | null;
}

// ------------------------------------------------------------ bons de paiement

export interface LigneBonPaiement {
  id: string;
  numero: string;
  intervenantNom: string;
  montant: number;
  moyen: string;
  reference: string | null;
  ecritureNumero: string | null;
  payeLe: Date;
}

/**
 * Salariés en poste, pour un choix de personne : conducteur d'un véhicule,
 * utilisateur d'un poste informatique.
 */
export async function salariesEnPoste(organizationId: string): Promise<{ id: string; nom: string; matricule: string }[]> {
  return db
    .select({ id: employees.id, nom: employees.nom, matricule: employees.matricule })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt)))
    .orderBy(asc(employees.nom));
}
