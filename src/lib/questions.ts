/**
 * Mise en forme d'une question de confirmation : ce que la fenêtre affiche en
 * titre, en détail, et sur le bouton qui agit. Règles pures, sans navigateur.
 *
 * « Supprimer le bon BCI-2026-00001 ? Il disparaîtra de la liste. » donne le
 * titre « Supprimer le bon BCI-2026-00001 ? », le détail « Il disparaîtra de
 * la liste. » et un bouton rouge « Supprimer ».
 */

export interface QuestionMiseEnForme {
  titre: string;
  detail: string | null;
}

/** Coupe après le premier « ? » suivi d'un texte : la question en titre, la suite en détail. */
export function decouperQuestion(question: string): QuestionMiseEnForme {
  const texte = question.trim();
  const coupure = texte.search(/\?\s+\S/);
  if (coupure < 0) return { titre: texte, detail: null };
  return { titre: texte.slice(0, coupure + 1).trim(), detail: texte.slice(coupure + 1).trim() };
}

/** Gestes qui détruisent ou défont : leur bouton est rouge. */
const DESTRUCTEURS = new Set([
  "abandonner",
  "annuler",
  "déconnecter",
  "écarter",
  "effacer",
  "quitter",
  "remplacer",
  "retirer",
  "supprimer",
  "terminer",
]);

const INFINITIF = /^\p{Lu}\p{Ll}+(?:er|ir|re)$/u;

/**
 * Le libellé du bouton qui agit : le verbe de la question, à l'infinitif, en
 * tête (« Supprimer… ? ») ou juste avant le point d'interrogation (« …
 * Continuer ? »). À défaut, « Confirmer ».
 */
export function libelleAction(titre: string): { libelle: string; danger: boolean } {
  const mots = titre.replace(/[?!.:…]+\s*$/u, "").trim().split(/\s+/);
  const verbe = [mots[0], mots.at(-1)].find((m) => m !== undefined && INFINITIF.test(m));
  if (!verbe) return { libelle: "Confirmer", danger: false };
  return { libelle: verbe, danger: DESTRUCTEURS.has(verbe.toLocaleLowerCase("fr-FR")) };
}
