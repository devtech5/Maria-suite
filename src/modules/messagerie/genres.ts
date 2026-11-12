/**
 * Genres de message de la messagerie interne, hors texte et fichier : le
 * sondage, l'événement et la carte de contact. Règles pures, sans base ni
 * React ; les tests sont dans `tests/messagerie-genres.test.ts`.
 *
 * Un message structuré garde un `corps` lisible (la question, le titre, le
 * nom) : la liste des discussions, la recherche et le message d'origine
 * d'une notification n'ont pas à connaître les genres.
 */

export const GENRES = ["texte", "sondage", "evenement", "contact"] as const;
export type Genre = (typeof GENRES)[number];

export const estGenre = (v: unknown): v is Genre => typeof v === "string" && (GENRES as readonly string[]).includes(v);

export interface DonneesSondage {
  question: string;
  options: string[];
  /** Plusieurs réponses permises. */
  multiple: boolean;
}

export interface DonneesEvenement {
  titre: string;
  /** Jour, `AAAA-MM-JJ`. */
  date: string;
  /** Heure, `HH:MM`, ou nulle pour une journée entière. */
  heure: string | null;
  lieu: string | null;
  description: string | null;
}

export interface DonneesContact {
  userId: string;
  nom: string;
}

export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 12;
export const REPONSES_EVENEMENT = ["oui", "peut_etre", "non"] as const;
export type ReponseEvenement = (typeof REPONSES_EVENEMENT)[number];
export const LIBELLES_REPONSE: Record<ReponseEvenement, string> = { oui: "Je viens", peut_etre: "Peut-être", non: "Je ne viens pas" };

const nettoyer = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const estJour = (v: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export function validerSondage(brut: { question?: unknown; options?: unknown; multiple?: unknown }): DonneesSondage | { erreur: string } {
  const question = nettoyer(brut.question);
  if (question.length < 3) return { erreur: "Posez la question du sondage (3 caractères au moins)." };
  if (question.length > 200) return { erreur: "Question trop longue : 200 caractères au plus." };
  const saisies = Array.isArray(brut.options) ? brut.options.map(nettoyer).filter(Boolean) : [];
  const options: string[] = [];
  for (const o of saisies) if (!options.some((x) => x.toLocaleLowerCase("fr") === o.toLocaleLowerCase("fr"))) options.push(o);
  if (options.length < OPTIONS_MIN) return { erreur: "Proposez au moins deux réponses différentes." };
  if (options.length > OPTIONS_MAX) return { erreur: `Douze réponses au plus.` };
  if (options.some((o) => o.length > 100)) return { erreur: "Une réponse est trop longue : 100 caractères au plus." };
  return { question, options, multiple: brut.multiple === true };
}

export function validerEvenement(brut: { titre?: unknown; date?: unknown; heure?: unknown; lieu?: unknown; description?: unknown }): DonneesEvenement | { erreur: string } {
  const titre = nettoyer(brut.titre);
  if (titre.length < 3) return { erreur: "Donnez un titre à l'événement (3 caractères au moins)." };
  if (titre.length > 120) return { erreur: "Titre trop long : 120 caractères au plus." };
  const date = nettoyer(brut.date);
  if (!estJour(date)) return { erreur: "Choisissez la date de l'événement." };
  const heure = nettoyer(brut.heure);
  if (heure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) return { erreur: "Heure invalide." };
  const lieu = nettoyer(brut.lieu);
  const description = typeof brut.description === "string" ? brut.description.trim() : "";
  if (lieu.length > 160) return { erreur: "Lieu trop long : 160 caractères au plus." };
  if (description.length > 1000) return { erreur: "Description trop longue : 1 000 caractères au plus." };
  return { titre, date, heure: heure || null, lieu: lieu || null, description: description || null };
}

export interface Vote {
  userId: string;
  valeur: string;
}

export interface ResultatSondage {
  options: { texte: string; votes: number; part: number; moi: boolean }[];
  votants: number;
}

/** Dépouille un sondage. Les parts sont des pourcentages entiers des votants, jamais un flottant. */
export function depouillerSondage(options: string[], votes: Vote[], moi: string): ResultatSondage {
  const votants = new Set(votes.map((v) => v.userId)).size;
  return {
    votants,
    options: options.map((texte, i) => {
      const pour = votes.filter((v) => v.valeur === String(i));
      return {
        texte,
        votes: pour.length,
        part: votants === 0 ? 0 : Math.floor((pour.length * 100) / votants),
        moi: pour.some((v) => v.userId === moi),
      };
    }),
  };
}

/** Les indices de réponse valables pour un sondage, sans doublon ; une seule si le sondage n'est pas à choix multiple. */
export function choixValides(choix: unknown, nombreOptions: number, multiple: boolean): number[] | { erreur: string } {
  const liste = Array.isArray(choix) ? choix : [];
  const indices = [...new Set(liste.filter((c): c is number => Number.isInteger(c) && c >= 0 && c < nombreOptions))];
  if (indices.length !== new Set(liste).size) return { erreur: "Réponse inconnue." };
  if (!multiple && indices.length > 1) return { erreur: "Une seule réponse est permise." };
  return indices;
}

export interface ResultatEvenement {
  oui: number;
  peutEtre: number;
  non: number;
  moi: ReponseEvenement | null;
}

export function depouillerEvenement(votes: Vote[], moi: string): ResultatEvenement {
  const compte = (r: ReponseEvenement) => votes.filter((v) => v.valeur === r).length;
  const sienne = votes.find((v) => v.userId === moi)?.valeur;
  return { oui: compte("oui"), peutEtre: compte("peut_etre"), non: compte("non"), moi: (REPONSES_EVENEMENT as readonly string[]).includes(sienne ?? "") ? (sienne as ReponseEvenement) : null };
}

/** Texte lisible gardé dans `corps` : l'aperçu de la liste et la recherche. */
export function corpsDuGenre(genre: Genre, donnees: DonneesSondage | DonneesEvenement | DonneesContact): string {
  if (genre === "sondage") return `📊 ${(donnees as DonneesSondage).question}`;
  if (genre === "evenement") return `📅 ${(donnees as DonneesEvenement).titre}`;
  return `👤 ${(donnees as DonneesContact).nom}`;
}
