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

/**
 * Les postes de MARIA GROUP SARL, dans l'ordre où la direction les a listés :
 * les douze premiers (migration 0064), les postes complémentaires
 * (migration 0066), puis ceux des services métiers — communication, BTP,
 * immobilier, mines, recherche de financement — et des fonctions support
 * qui manquaient (migration 0070, `services.ts`).
 */
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
  "Agent d'entretien",
  "Assistant(e) de direction",
  "Caissier(ère)",
  "Chauffeur-livreur",
  "Délégué(e) médical(e)",
  "Directeur(trice) général(e)",
  "Gérant(e)",
  "Magasinier(ère)",
  "Responsable administratif et financier",
  "Responsable commercial(e)",
  "Responsable des achats",
  "Secrétaire",
  "Technicien(ne) biomédical(e)",
  "Responsable des ressources humaines",
  "Chargé(e) des ressources humaines",
  "Juriste",
  "Responsable QHSE",
  "Chargé(e) de communication",
  "Graphiste",
  "Community manager",
  "Ingénieur(e) génie civil",
  "Dessinateur(trice) projeteur(se)",
  "Métreur(se)",
  "Conducteur(trice) de travaux",
  "Chef de chantier",
  "Contrôleur(se) de travaux",
  "Gestionnaire immobilier",
  "Géomètre-topographe",
  "Géologue",
  "Ingénieur(e) des mines",
  "Chargé(e) de recherche de financement",
  "Analyste financier(ère)",
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

/** Un poste actuel, plusieurs, ou aucun : ce que la fiche porte déjà. */
type Actuels = string | readonly string[] | null | undefined;

function listeActuels(actuels: Actuels): string[] {
  const liste = typeof actuels === "string" ? [actuels] : [...(actuels ?? [])];
  return liste.map(normaliserLibellePoste).filter(Boolean);
}

/**
 * Les postes à proposer dans une liste de choix.
 *
 * Les postes actifs, dans leur ordre, précédés des postes actuels du salarié
 * qui n'y figurent pas : un poste retiré du référentiel ou saisi avant lui
 * reste affiché sur la fiche qui le porte, plutôt que de disparaître au
 * premier enregistrement.
 */
export function optionsPoste(actifs: string[], actuels?: Actuels): string[] {
  const absents: string[] = [];
  for (const a of listeActuels(actuels)) {
    const cle = clePoste(a);
    if (!actifs.some((p) => clePoste(p) === cle) && !absents.some((p) => clePoste(p) === cle)) absents.push(a);
  }
  return [...absents, ...actifs];
}

/**
 * Le poste à enregistrer pour un choix : son libellé tel que le référentiel
 * l'écrit, ou un poste que la fiche portait déjà. Nul pour tout autre texte —
 * le formulaire ne propose qu'une liste, et le serveur n'accepte qu'elle.
 */
export function posteRetenu(choisi: string, actifs: string[], actuels?: Actuels): string | null {
  const cle = clePoste(choisi);
  if (!cle) return null;
  return optionsPoste(actifs, actuels).find((p) => clePoste(p) === cle) ?? null;
}

/**
 * Les postes d'une personne : le principal d'abord, puis les autres, sans
 * doublon (casse ignorée) ni répétition du principal. Une personne peut
 * occuper plusieurs postes ; le principal est celui qu'imprime le bulletin.
 */
export function selectionPostes(principal: string, autres: readonly string[]): string[] {
  const resultat: string[] = [];
  for (const p of [principal, ...autres].map(normaliserLibellePoste)) {
    if (p && !resultat.some((r) => clePoste(r) === clePoste(p))) resultat.push(p);
  }
  return resultat;
}

/**
 * Valide un choix de postes contre le référentiel : chaque poste doit être
 * actif, ou déjà porté par la fiche. Rend les libellés exacts du référentiel,
 * principal en tête, ou le premier poste refusé.
 */
export function postesRetenus(
  principal: string,
  autres: readonly string[],
  actifs: string[],
  actuels?: Actuels,
): { ok: true; postes: string[] } | { ok: false; refuse: string } {
  const choisis = selectionPostes(principal, autres);
  if (choisis.length === 0) return { ok: false, refuse: "" };
  const postes: string[] = [];
  for (const c of choisis) {
    const retenu = posteRetenu(c, actifs, actuels);
    if (!retenu) return { ok: false, refuse: c };
    if (!postes.some((p) => clePoste(p) === clePoste(retenu))) postes.push(retenu);
  }
  return { ok: true, postes };
}
