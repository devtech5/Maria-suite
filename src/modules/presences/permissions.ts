/**
 * Permissions et absences : les règles, sans base ni React.
 *
 * Une PERMISSION couvre quelques heures d'une journée (rendez-vous médical,
 * démarche administrative) ; une ABSENCE, une ou plusieurs journées entières.
 * Toutes deux se demandent et se décident comme un congé, mais ne sont pas un
 * congé : elles n'entament pas le solde, sauf si le responsable en décide.
 *
 * La décision dit aussi comment le temps est TRAITÉ — payé, à récupérer,
 * déduit des congés, non payé — et ce choix est figé avec elle, comme les
 * jours d'un congé accordé.
 */

export const GENRES_PERMISSION = {
  heures: "Permission (quelques heures)",
  journees: "Absence (journées entières)",
} as const;
export type GenrePermission = keyof typeof GENRES_PERMISSION;

export const MOTIFS_PERMISSION = {
  medical: "Rendez-vous médical",
  administratif: "Démarche administrative",
  familial: "Événement familial",
  enfant: "Enfant malade",
  personnel: "Raison personnelle",
  autre: "Autre",
} as const;
export type MotifPermission = keyof typeof MOTIFS_PERMISSION;

export const TRAITEMENTS_PERMISSION = {
  payee: "Payée (permission exceptionnelle)",
  a_recuperer: "À récupérer",
  deduite_conges: "Déduite des congés",
  non_payee: "Non payée",
} as const;
export type TraitementPermission = keyof typeof TRAITEMENTS_PERMISSION;

export const valide = <T extends object>(table: T, v: unknown): v is keyof T => typeof v === "string" && Object.hasOwn(table, v);

/** Une permission d'heures se régularise après coup, mais pas indéfiniment. */
export const REGULARISATION_JOURS = 30;
/** Au-delà, ce n'est plus une absence : c'est un congé. */
export const ABSENCE_MAX_JOURS = 31;

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutesEntre(debut: string, fin: string): number {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return m(fin) - m(debut);
}

/** « 2 h 30 », « 45 min », « 3 h ». */
export function formatDuree(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Minutes converties en centièmes de jour, sur la durée de la journée de
 * l'entreprise ; arrondi au centième le plus proche, en entiers.
 */
export function centiemesDeMinutes(minutes: number, minutesJournee: number): number {
  if (minutesJournee <= 0 || minutes <= 0) return 0;
  return Math.floor((minutes * 200 + minutesJournee) / (2 * minutesJournee));
}

export interface SaisiePermissionBrute {
  genre: GenrePermission;
  debut: string;
  fin: string;
  heureDebut: string | null;
  heureFin: string | null;
}

/**
 * Contrôle une demande. Rend le motif du refus, ou `null`.
 * `pourAutrui` : saisie par un responsable, que la date passée n'arrête pas.
 */
export function refusPermission(s: SaisiePermissionBrute, aujourdhui: string, pourAutrui: boolean): string | null {
  if (s.genre === "heures") {
    if (s.fin !== s.debut) return "Une permission tient dans une seule journée ; pour plusieurs jours, demandez une absence.";
    if (!s.heureDebut || !s.heureFin || !HEURE.test(s.heureDebut) || !HEURE.test(s.heureFin)) return "Indiquez l'heure de départ et l'heure de retour.";
    if (minutesEntre(s.heureDebut, s.heureFin) <= 0) return "L'heure de retour doit suivre l'heure de départ.";
  } else {
    if (s.fin < s.debut) return "La fin précède le début.";
    const jours = (Date.parse(`${s.fin}T00:00:00Z`) - Date.parse(`${s.debut}T00:00:00Z`)) / 86_400_000 + 1;
    if (jours > ABSENCE_MAX_JOURS) return `Une absence couvre ${ABSENCE_MAX_JOURS} jours au plus ; au-delà, demandez un congé.`;
  }
  if (!pourAutrui) {
    const limite = new Date(Date.parse(`${aujourdhui}T00:00:00Z`) - REGULARISATION_JOURS * 86_400_000).toISOString().slice(0, 10);
    if (s.debut < limite) return `Une permission se régularise dans les ${REGULARISATION_JOURS} jours ; au-delà, voyez votre responsable.`;
  }
  return null;
}

/** Deux permissions se gênent-elles ? Même jour et heures qui se croisent, ou journées qui se chevauchent. */
export function permissionsSeChevauchent(
  a: { debut: string; fin: string; heureDebut: string | null; heureFin: string | null },
  b: { debut: string; fin: string; heureDebut: string | null; heureFin: string | null },
): boolean {
  if (!(a.debut <= b.fin && b.debut <= a.fin)) return false;
  // Une absence d'une journée entière couvre toutes les heures de ce jour.
  if (!a.heureDebut || !a.heureFin || !b.heureDebut || !b.heureFin) return true;
  return a.heureDebut < b.heureFin && b.heureDebut < a.heureFin;
}

export function formatNumeroPermission(annee: string): { cle: string; prefix: string; padding: number; periode: string } {
  return { cle: "permission", prefix: `PERM-${annee}-`, padding: 5, periode: annee };
}
