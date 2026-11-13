import type { Priorite, Statut } from "@/modules/taches/calcul";
import type { OptionsColonne, TypeColonne } from "@/modules/taches/colonnes";

/** Une colonne personnalisée du tableau, commune à toute l'entreprise. */
export interface ColonneAffichee {
  id: string;
  libelle: string;
  type: TypeColonne;
  options: OptionsColonne;
}

/** Une tâche telle que l'écran la reçoit : dates en jours ISO ou en instants ISO, rien d'autre. */
export interface TacheAffichee {
  id: string;
  numero: string;
  titre: string;
  description: string | null;
  priorite: Priorite;
  statut: Statut;
  echeance: string | null;
  /** Premier jour prévu : la barre du Gantt part de là. */
  dateDebut: string | null;
  creeParUserId: string;
  createur: string;
  assigneeUserId: string;
  assigneeEmployeId: string | null;
  assignee: string;
  /** Collaborateur sans compte : l'auteur suit la tâche pour lui. */
  sansCompte: boolean;
  creeLeIso: string;
  majLeIso: string;
  termineeLeIso: string | null;
  terminateur: string | null;
  compteRendu: string | null;
  motifAnnulation: string | null;
  /** Valeurs des colonnes personnalisées, par identifiant de colonne. */
  valeurs: Record<string, string>;
}
