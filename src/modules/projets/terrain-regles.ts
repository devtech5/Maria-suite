/**
 * Équipe d'un projet et collecte terrain : les règles, sans base ni React.
 *
 * Le CHEF DE PROJET est le responsable du projet (`projets.responsable_user_id`).
 * Il confie du personnel au projet — INTERNE (choisi dans le personnel) ou
 * EXTERNE (enregistré sur place) — et nomme le SUPERVISEUR. Les AGENTS
 * exercent le projet : ils relèvent des données sur le terrain, avec des
 * preuves (photo, capture d'écran, position GPS) qui remontent au superviseur
 * et au chef de projet, pour la traçabilité.
 *
 * Un externe n'a pas de compte (seules les adresses de l'entreprise ouvrent
 * la plateforme) : un agent ou le superviseur saisit le relevé POUR LUI. Le
 * relevé garde les deux : qui a exercé, et quel compte l'a saisi.
 */

export const ROLES_EQUIPE = ["superviseur", "agent"] as const;
export type RoleEquipe = (typeof ROLES_EQUIPE)[number];

export const LIBELLE_ROLE: Record<RoleEquipe, string> = { superviseur: "Superviseur", agent: "Agent" };

export const ORIGINES_MEMBRE = ["interne", "externe"] as const;
export type OrigineMembre = (typeof ORIGINES_MEMBRE)[number];

export const estRole = (v: unknown): v is RoleEquipe => v === "superviseur" || v === "agent";
export const estOrigine = (v: unknown): v is OrigineMembre => v === "interne" || v === "externe";

export const STATUTS_RELEVE = ["soumis", "valide", "a_refaire"] as const;
export type StatutReleve = (typeof STATUTS_RELEVE)[number];

export const LIBELLE_STATUT_RELEVE: Record<StatutReleve, string> = { soumis: "À examiner", valide: "Validé", a_refaire: "À refaire" };

export const NATURES_PREUVE = ["photo", "capture"] as const;
export type NaturePreuve = (typeof NATURES_PREUVE)[number];

export const LIBELLE_PREUVE: Record<NaturePreuve, string> = { photo: "Photo", capture: "Capture d'écran" };

/** Un relevé porte au plus ce nombre de preuves : de quoi montrer un chantier, pas un album. */
export const PREUVES_MAX = 8;

/** Un projet clos ne reçoit plus de relevé. */
export const projetOuvertAuTerrain = (statut: string): boolean => statut === "preparation" || statut === "en_cours";

export interface Acteur {
  userId: string;
  /** Droit `projet.gerer` : l'encadrement voit et règle tout. */
  gestionnaire: boolean;
}

export interface ProjetRoles {
  responsableUserId: string | null;
}

export interface MembreRole {
  userId: string | null;
  role: RoleEquipe;
  actif: boolean;
}

export const estChef = (a: Acteur, p: ProjetRoles): boolean => p.responsableUserId !== null && p.responsableUserId === a.userId;

/** Confier du personnel, nommer le superviseur : le chef de projet, ou l'encadrement. */
export const peutGererEquipe = (a: Acteur, p: ProjetRoles): boolean => a.gestionnaire || estChef(a, p);

export const estSuperviseurDe = (a: Acteur, equipe: readonly MembreRole[]): boolean => equipe.some((m) => m.actif && m.role === "superviseur" && m.userId === a.userId);

/** Voir tous les relevés du projet et les examiner : chef, superviseur, encadrement. */
export const peutExaminer = (a: Acteur, p: ProjetRoles, equipe: readonly MembreRole[]): boolean => a.gestionnaire || estChef(a, p) || estSuperviseurDe(a, equipe);

/** Relever sur le terrain : un membre en poste avec un compte — agent ou superviseur. */
export const peutReleverSur = (a: Acteur, equipe: readonly MembreRole[]): boolean => equipe.some((m) => m.actif && m.userId === a.userId);

/**
 * Pour qui saisir un relevé : pour soi si l'on est en poste ; pour un autre,
 * l'encadrement ; et tout membre peut saisir pour un EXTERNE, qui n'a pas de
 * compte pour le faire lui-même.
 */
export function peutSaisirPour(a: Acteur, p: ProjetRoles, equipe: readonly MembreRole[], cible: { userId: string | null; origine: OrigineMembre }): boolean {
  if (cible.userId !== null && cible.userId === a.userId) return peutReleverSur(a, equipe);
  if (peutExaminer(a, p, equipe)) return true;
  return peutReleverSur(a, equipe) && cible.origine === "externe";
}

/**
 * Coordonnées en MILLIONIÈMES de degré, entiers — comme les preuves de
 * mission : 5,345678° s'écrit 5345678. Jamais de flottant en base.
 */
export function enMicroDegres(valeur: number): number {
  return Math.round(valeur * 1_000_000);
}

export const deMicroDegres = (micro: number): number => micro / 1_000_000;

export interface Position {
  latitudeMicro: number;
  longitudeMicro: number;
  /** Précision annoncée par l'appareil, en mètres. */
  precisionM: number | null;
}

/** Une position lisible et plausible, ou une erreur : un GPS à (0, 0) n'est pas une preuve. */
export function lirePosition(latitude: unknown, longitude: unknown, precision?: unknown): Position | { erreur: string } {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lon = typeof longitude === "number" ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { erreur: "La position GPS est illisible." };
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { erreur: "La position GPS est hors du globe." };
  if (lat === 0 && lon === 0) return { erreur: "La position GPS n'a pas été relevée par l'appareil." };
  const p = typeof precision === "number" ? precision : Number(precision);
  return { latitudeMicro: enMicroDegres(lat), longitudeMicro: enMicroDegres(lon), precisionM: Number.isFinite(p) && p >= 0 ? Math.round(p) : null };
}

/** Lien vers la carte, pour vérifier où le relevé a été pris. */
export function lienCarte(latitudeMicro: number, longitudeMicro: number): string {
  const lat = deMicroDegres(latitudeMicro).toFixed(6);
  const lon = deMicroDegres(longitudeMicro).toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

export const libellePosition = (latitudeMicro: number, longitudeMicro: number): string =>
  `${deMicroDegres(latitudeMicro).toFixed(5)}, ${deMicroDegres(longitudeMicro).toFixed(5)}`;

/** Avancement déclaré : un pourcentage entier, ou rien. */
export function lireAvancement(valeur: unknown): number | null | "invalide" {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = typeof valeur === "number" ? valeur : Number(String(valeur).replace(",", "."));
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : "invalide";
}

/** Ce qui manque à un relevé pour valoir preuve : une position et au moins une photo ou capture. */
export function manqueAuReleve(preuves: number, position: boolean): string | null {
  if (!position) return "Relevez votre position GPS : sans elle, le relevé n'est pas tracé.";
  if (preuves === 0) return "Joignez au moins une photo ou une capture d'écran.";
  if (preuves > PREUVES_MAX) return `${PREUVES_MAX} preuves au plus par relevé.`;
  return null;
}

/** Le statut où un examinateur peut mener un relevé : le valider, ou le renvoyer avec un motif. */
export function decisionPermise(statutActuel: StatutReleve, decision: StatutReleve, commentaire: string): string | null {
  if (decision === "soumis") return "Un relevé examiné ne revient pas à « à examiner ».";
  if (decision === "a_refaire" && commentaire.trim().length < 3) return "Dites ce qu'il faut refaire.";
  if (statutActuel === decision && decision === "valide") return "Ce relevé est déjà validé.";
  return null;
}
