import type { NatureMission, StatutMission, TypePreuve } from "./schema";

/**
 * Règles de suivi d'une mission.
 *
 * Logique pure, sans base ni React : c'est ici que se décident l'avancement, la
 * validité d'une étape et le statut qui en découle. Le serveur les applique, les
 * tests les figent, l'écran les relit — jamais trois versions de la règle.
 */

export interface EtapeSuivie {
  id: string;
  ordre: number;
  libelle: string;
  preuvesRequises: TypePreuve[];
  faiteLe: Date | null;
}

/** Part accomplie, en pour cent entier. Rien à faire vaut 0 et non une division par zéro. */
export function pourcentage(faites: number, total: number): number {
  return total === 0 ? 0 : Math.round((faites * 100) / total);
}

/** Part d'étapes accomplies, en pour cent entier. */
export function avancement(etapes: Pick<EtapeSuivie, "faiteLe">[]): number {
  return pourcentage(
    etapes.filter((etape) => etape.faiteLe !== null).length,
    etapes.length,
  );
}

/**
 * Preuves qui manquent pour clore une étape, sans doublon et dans l'ordre où
 * elles sont exigées. Vide : l'étape peut se valider.
 *
 * Deux photos exigées ne se réclament qu'une fois : le contrôle porte sur la
 * NATURE de la preuve, la quantité relève du jugement du chef d'équipe.
 */
export function preuvesManquantes(
  requises: TypePreuve[],
  presentes: TypePreuve[],
): TypePreuve[] {
  const dispo = new Set(presentes);
  const vus = new Set<TypePreuve>();
  const manque: TypePreuve[] = [];

  for (const type of requises) {
    if (dispo.has(type) || vus.has(type)) continue;
    vus.add(type);
    manque.push(type);
  }
  return manque;
}

/** Première étape non accomplie, c'est-à-dire celle qu'on attend du terrain. */
export function etapeCourante<T extends Pick<EtapeSuivie, "faiteLe" | "ordre">>(
  etapes: T[],
): T | null {
  const triees = [...etapes].sort((a, b) => a.ordre - b.ordre);
  return triees.find((etape) => etape.faiteLe === null) ?? null;
}

/**
 * Une étape ne se valide que dans l'ordre. Sauter la remise du colis pour
 * valider « livré » laisserait une mission terminée sans le moindre transit.
 */
export function estValidableEnOrdre(
  etapes: Pick<EtapeSuivie, "id" | "faiteLe" | "ordre">[],
  etapeId: string,
): boolean {
  const courante = etapeCourante(etapes);
  return courante !== null && courante.id === etapeId;
}

/**
 * Statut d'une mission après validation d'une étape.
 *
 * La première étape démarre la mission, la dernière la termine. Une mission
 * échouée ou annulée ne change plus de statut en validant une étape : l'issue a
 * été posée par une personne, avec son motif, et une case cochée ne la défait pas.
 */
export function statutApresEtape(
  actuel: StatutMission,
  etapes: Pick<EtapeSuivie, "faiteLe">[],
): StatutMission {
  if (actuel === "echouee" || actuel === "annulee") return actuel;
  if (etapes.length === 0) return actuel;

  const faites = etapes.filter((etape) => etape.faiteLe !== null).length;
  if (faites === etapes.length) return "terminee";
  if (faites > 0) return "en_cours";
  return "planifiee";
}

/** Une mission close (terminée, échouée, annulée) n'accepte plus de preuve. */
export function estOuverte(statut: StatutMission): boolean {
  return statut === "planifiee" || statut === "en_cours";
}

// --------------------------------------------------------------- géographie

/**
 * Convertit des degrés décimaux en micro-degrés entiers.
 *
 * C'est le seul endroit où un flottant touche une position : le GPS du
 * téléphone en livre un, la base n'en stocke pas.
 */
export function versMicroDegres(degres: number): number {
  return Math.round(degres * 1_000_000);
}

/** Latitude et longitude valides, en micro-degrés. */
export function positionValide(latitudeMicro: number, longitudeMicro: number): boolean {
  return (
    Number.isInteger(latitudeMicro) &&
    Number.isInteger(longitudeMicro) &&
    Math.abs(latitudeMicro) <= 90_000_000 &&
    Math.abs(longitudeMicro) <= 180_000_000
  );
}

/** « 5,345317 N, 4,024429 O » : lisible au téléphone, sans bibliothèque de cartes. */
export function libellePosition(latitudeMicro: number, longitudeMicro: number): string {
  const decimal = (micro: number) =>
    (Math.abs(micro) / 1_000_000).toFixed(6).replace(".", ",");
  return (
    `${decimal(latitudeMicro)} ${latitudeMicro >= 0 ? "N" : "S"}, ` +
    `${decimal(longitudeMicro)} ${longitudeMicro >= 0 ? "E" : "O"}`
  );
}

// ----------------------------------------------------------------- gabarits

export const PREFIXE_MISSION: Record<NatureMission, string> = {
  livraison: "LIV",
  chantier: "CHT",
  collecte: "COL",
  // « PRJ » est le numéro des projets eux-mêmes : une mission de projet en prend un autre.
  projet: "MPR",
  intervention: "INT",
};

export interface GabaritEtape {
  libelle: string;
  preuves: TypePreuve[];
}

/**
 * Étapes usuelles par nature. Elles s'ajustent à la création : un gabarit fait
 * gagner la saisie, il n'enferme pas.
 */
export const GABARITS: Record<NatureMission, GabaritEtape[]> = {
  livraison: [
    { libelle: "Colis collecté au dépôt", preuves: ["photo", "position"] },
    { libelle: "En transit", preuves: ["position"] },
    { libelle: "Remis au destinataire", preuves: ["photo", "signature", "position"] },
  ],
  chantier: [
    { libelle: "Matériaux réceptionnés", preuves: ["photo", "note"] },
    { libelle: "Travaux en cours", preuves: ["photo"] },
    { libelle: "Réception du lot", preuves: ["photo", "signature"] },
  ],
  collecte: [
    { libelle: "Zone parcourue", preuves: ["formulaire", "position"] },
    { libelle: "Données contrôlées", preuves: ["note"] },
  ],
  projet: [
    { libelle: "Lancement", preuves: ["note"] },
    { libelle: "Réalisation", preuves: ["photo"] },
    { libelle: "Livraison", preuves: ["signature"] },
  ],
  intervention: [
    { libelle: "Arrivée sur site", preuves: ["position"] },
    { libelle: "Intervention réalisée", preuves: ["photo", "note"] },
    { libelle: "Validation client", preuves: ["signature"] },
  ],
};

export const LIBELLE_NATURE: Record<NatureMission, string> = {
  livraison: "Livraison",
  chantier: "Chantier",
  collecte: "Collecte",
  projet: "Projet",
  intervention: "Intervention",
};

export const LIBELLE_STATUT: Record<StatutMission, string> = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  echouee: "Échouée",
  annulee: "Annulée",
};

export const LIBELLE_PREUVE: Record<TypePreuve, string> = {
  photo: "Photo",
  position: "Position",
  signature: "Signature",
  note: "Note",
  formulaire: "Formulaire",
};

// ---------------------------------------------------------------- formulaires

/** Clé stable d'un champ, tirée de son libellé : « Nom du gérant » -> nom_du_gerant. */
export function cleDeChamp(libelle: string, deja: Set<string>): string {
  const base =
    libelle
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "champ";
  let cle = base;
  for (let rang = 2; deja.has(cle); rang += 1) cle = `${base}_${rang}`;
  deja.add(cle);
  return cle;
}
