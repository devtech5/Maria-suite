import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";

import type { Priorite, Statut } from "./calcul";

export interface TacheVue {
  id: string;
  numero: string;
  titre: string;
  description: string | null;
  priorite: Priorite;
  statut: Statut;
  echeance: string | null;
  creeParUserId: string;
  createur: string;
  assigneeUserId: string;
  /** Salarié du Personnel, quand la tâche lui a été confiée. */
  assigneeEmployeId: string | null;
  assignee: string;
  /** Salarié sans compte actif : l'auteur suit la tâche pour lui. */
  sansCompte: boolean;
  creeLe: Date;
  attribueeLe: Date;
  demarreeLe: Date | null;
  termineeLe: Date | null;
  terminateur: string | null;
  compteRendu: string | null;
  annuleeLe: Date | null;
  motifAnnulation: string | null;
}

type Ligne = {
  id: string;
  numero: string;
  titre: string;
  description: string | null;
  priorite: Priorite;
  statut: Statut;
  echeance: string | Date | null;
  cree_par_user_id: string;
  createur: string | null;
  assignee_user_id: string;
  assignee_employe_id: string | null;
  assignee: string | null;
  sans_compte: boolean;
  cree_le: string | Date;
  attribuee_le: string | Date;
  demarree_le: string | Date | null;
  terminee_le: string | Date | null;
  terminateur: string | null;
  compte_rendu: string | null;
  annulee_le: string | Date | null;
  motif_annulation: string | null;
};

const enDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
const peutEtre = (v: string | Date | null) => (v ? enDate(v) : null);
/** Une colonne `date` revient en chaîne ou en Date selon le pilote : on la ramène au jour ISO. */
const jour = (v: string | Date | null) => (v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : v.slice(0, 10));

export type VueTaches = "miennes" | "confiees" | "toutes";

/**
 * Tâches d'une vue.
 *
 *   miennes — celles que j'exécute ;
 *   confiees — celles que j'ai créées pour d'autres ;
 *   toutes   — toute l'entreprise, pour qui attribue.
 *
 * Le filtre sur l'entreprise est posé ici, jamais par l'appelant.
 */
export async function listerTaches(organizationId: string, userId: string, vue: VueTaches): Promise<TacheVue[]> {
  const filtre: SQL =
    vue === "miennes"
      ? sql`t.assignee_user_id = ${userId}`
      : vue === "confiees"
        ? sql`t.cree_par_user_id = ${userId} and (t.assignee_user_id <> ${userId} or (e.id is not null and e.user_id is distinct from ${userId}))`
        : sql`true`;

  const lignes = await db.execute<Ligne>(sql`
    select t.id, t.numero, t.titre, t.description, t.priorite, t.statut, t.echeance,
           t.cree_par_user_id, c.full_name as createur,
           t.assignee_user_id, t.assignee_employe_id, coalesce(e.nom, a.full_name) as assignee,
           (e.id is not null and e.user_id is distinct from t.assignee_user_id) as sans_compte,
           t.created_at as cree_le, t.attribuee_le, t.demarree_le, t.terminee_le,
           f.full_name as terminateur, t.compte_rendu, t.annulee_le, t.motif_annulation
    from taches t
    left join users c on c.id = t.cree_par_user_id
    left join users a on a.id = t.assignee_user_id
    left join employees e on e.id = t.assignee_employe_id
    left join users f on f.id = t.terminee_par_user_id
    where t.organization_id = ${organizationId} and t.deleted_at is null and ${filtre}
      -- Les tâches closes depuis plus de 30 jours quittent l'écran ; elles restent au journal.
      and (t.statut in ('a_faire', 'en_cours') or coalesce(t.terminee_le, t.annulee_le, t.updated_at) > now() - interval '30 days')
    order by t.created_at desc
    limit 500
  `);

  return lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    titre: l.titre,
    description: l.description,
    priorite: l.priorite,
    statut: l.statut,
    echeance: jour(l.echeance),
    creeParUserId: l.cree_par_user_id,
    createur: l.createur ?? "Ancien membre",
    assigneeUserId: l.assignee_user_id,
    assigneeEmployeId: l.assignee_employe_id,
    assignee: l.assignee ?? "Ancien membre",
    sansCompte: Boolean(l.sans_compte),
    creeLe: enDate(l.cree_le),
    attribueeLe: enDate(l.attribuee_le),
    demarreeLe: peutEtre(l.demarree_le),
    termineeLe: peutEtre(l.terminee_le),
    terminateur: l.terminateur,
    compteRendu: l.compte_rendu,
    annuleeLe: peutEtre(l.annulee_le),
    motifAnnulation: l.motif_annulation,
  }));
}

export interface TacheEnRetard {
  id: string;
  numero: string;
  titre: string;
  priorite: Priorite;
  echeance: string;
  assignee: string;
  mienne: boolean;
}

/**
 * Tâches ouvertes dont l'échéance est passée, pour le tableau de bord : les
 * siennes, et celles de toute l'équipe pour qui attribue. Les plus anciennes
 * d'abord — ce sont elles qui coûtent.
 *
 * La date du jour vient de l'appelant, en jour ISO : le serveur et l'écran
 * des tâches jugent le retard au même jour.
 */
export async function tachesEnRetard(
  organizationId: string,
  userId: string,
  equipe: boolean,
  aujourdhui: string,
): Promise<{ liste: TacheEnRetard[]; miennes: number; autres: number }> {
  const lignes = await db.execute<{
    id: string;
    numero: string;
    titre: string;
    priorite: Priorite;
    echeance: string | Date;
    assignee_user_id: string;
    assignee: string | null;
  }>(sql`
    select t.id, t.numero, t.titre, t.priorite, t.echeance, t.assignee_user_id, coalesce(e.nom, u.full_name) as assignee
    from taches t
      left join users u on u.id = t.assignee_user_id
      left join employees e on e.id = t.assignee_employe_id
    where t.organization_id = ${organizationId} and t.deleted_at is null
      and t.statut in ('a_faire', 'en_cours')
      and t.echeance < ${aujourdhui}::date
      and (${equipe} or t.assignee_user_id = ${userId})
    order by t.echeance, t.created_at
    limit 200
  `);
  const liste = lignes.map((l) => ({
    id: l.id,
    numero: l.numero,
    titre: l.titre,
    priorite: l.priorite,
    echeance: jour(l.echeance)!,
    assignee: l.assignee ?? "Ancien membre",
    mienne: l.assignee_user_id === userId,
  }));
  const miennes = liste.filter((t) => t.mienne).length;
  return { liste, miennes, autres: liste.length - miennes };
}

/** Un salarié du Personnel, tel que le propose le choix de l'exécutant. */
export interface SalariePropose {
  id: string;
  nom: string;
  poste: string;
  userId: string | null;
}

/**
 * Le Personnel en activité, par nom, avec sa fonction : la liste où l'on
 * choisit à qui confier une tâche. Elle vient du module Personnel, rien ne se
 * ressaisit ici.
 */
export async function personnelActif(organizationId: string): Promise<SalariePropose[]> {
  const lignes = await db.execute<{ id: string; nom: string; poste: string; user_id: string | null }>(sql`
    select e.id, e.nom, e.poste, e.user_id
    from employees e
    where e.organization_id = ${organizationId} and e.actif and e.deleted_at is null
    order by e.nom
  `);
  return lignes.map((l) => ({ id: l.id, nom: l.nom, poste: l.poste, userId: l.user_id }));
}
