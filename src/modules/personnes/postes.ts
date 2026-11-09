/**
 * Postes de travail : le référentiel dans lequel se choisit le poste d'un
 * salarié.
 *
 * Fichier sans base ni React : la liste de départ sert à l'installation et
 * aux tests, les règles de libellé au serveur comme au formulaire.
 *
 * Le poste reste écrit en toutes lettres sur la fiche du salarié
 * (`employees.poste`) : le bulletin, le contrat et l'annuaire le lisent tel
 * quel. Le référentiel décide de ce qu'on peut y choisir, et un renommage s'y
 * propage aux salariés qui l'occupent.
 */

/** Les postes de MARIA GROUP SARL, dans l'ordre où la direction les a listés. */
export const POSTES_DE_DEPART = [
  "Assistant(e)",
  "Comptable",
  "Chef de projet",
  "Commercial(e)",
  "Architecte",
  "Technicien BTP",
  "Réceptionniste",
  "Informaticien",
  "Homme de main / Protocole",
  "PDG",
  "Ménagère",
  "Gardien",
] as const;

export const LONGUEUR_MAX_POSTE = 80;

/** Espaces de tête et de queue retirés, espaces multiples réduits à un seul. */
export function normaliserLibellePoste(saisie: string): string {
  return saisie.replace(/\s+/g, " ").trim();
}

/** Clé de comparaison : « comptable » et « Comptable » désignent le même poste. */
export function clePoste(libelle: string): string {
  return normaliserLibellePoste(libelle).toLocaleLowerCase("fr");
}

/** Motif de refus d'un libellé, ou null s'il convient. */
export function motifRefusLibellePoste(libelle: string, existants: string[]): string | null {
  const propre = normaliserLibellePoste(libelle);
  if (propre.length < 2) return "Indiquez le nom du poste.";
  if (propre.length > LONGUEUR_MAX_POSTE) return `Un nom de poste tient en ${LONGUEUR_MAX_POSTE} caractères.`;
  const cle = clePoste(propre);
  if (existants.some((e) => clePoste(e) === cle)) return "Ce poste existe déjà.";
  return null;
}

/**
 * Les postes à proposer dans une liste de choix.
 *
 * Les postes actifs, dans leur ordre, plus le poste actuel du salarié s'il
 * n'y figure pas : un poste retiré du référentiel ou saisi avant lui reste
 * affiché sur la fiche qui le porte, plutôt que de disparaître au premier
 * enregistrement.
 */
export function optionsPoste(actifs: string[], actuel?: string | null): string[] {
  const courant = actuel ? normaliserLibellePoste(actuel) : "";
  if (!courant || actifs.some((p) => clePoste(p) === clePoste(courant))) return actifs;
  return [courant, ...actifs];
}

/**
 * Le poste à enregistrer pour un choix : son libellé tel que le référentiel
 * l'écrit, ou le poste que la fiche portait déjà. Nul pour tout autre texte —
 * le formulaire ne propose qu'une liste, et le serveur n'accepte qu'elle.
 */
export function posteRetenu(choisi: string, actifs: string[], actuel?: string | null): string | null {
  const cle = clePoste(choisi);
  if (!cle) return null;
  return optionsPoste(actifs, actuel).find((p) => clePoste(p) === cle) ?? null;
}
