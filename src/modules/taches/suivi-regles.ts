/**
 * Suivi d'une tâche, sans base : sous-tâches, mises à jour, fichiers,
 * activités. Importable depuis le navigateur — l'écran prévient, le serveur
 * rejoue toujours les mêmes règles.
 */

import { LIBELLE_PRIORITE, LIBELLE_STATUT, type Priorite, type Statut } from "./calcul";

export const TITRE_SOUS_TACHE_MAX = 200;
export const MESSAGE_MAX = 5000;
export const SOUS_TACHES_MAX = 100;
/** 10 Mo : un plan, un devis, quelques photos de chantier. */
export const FICHIER_MAX_OCTETS = 10 * 1024 * 1024;

/** Formats admis : PDF, images, bureautique, texte. Rien d'exécutable. */
export const TYPES_FICHIER: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};

export type Verdict<T> = { ok: true; valeur: T } | { ok: false; message: string };

export function normaliserTitreSousTache(titre: string): Verdict<string> {
  const propre = titre.trim().replace(/\s+/g, " ");
  if (propre.length < 2) return { ok: false, message: "Dites ce qu'il faut faire." };
  if (propre.length > TITRE_SOUS_TACHE_MAX) return { ok: false, message: `${TITRE_SOUS_TACHE_MAX} caractères au plus.` };
  return { ok: true, valeur: propre };
}

/**
 * Une mise à jour : le texte tel que tapé, lignes gardées, espaces de bout
 * retirés, trois lignes vides au plus d'affilée.
 */
export function normaliserMessage(corps: string): Verdict<string> {
  const propre = corps
    .replace(/\r\n?/g, "\n")
    .trim()
    .replace(/\n{4,}/g, "\n\n\n");
  if (propre.length === 0) return { ok: false, message: "La mise à jour est vide." };
  if (propre.length > MESSAGE_MAX) return { ok: false, message: `Mise à jour trop longue : ${MESSAGE_MAX} caractères au plus.` };
  return { ok: true, valeur: propre };
}

export function verifierFichier(f: { taille: number; typeMime: string }): Verdict<string> {
  if (f.taille <= 0) return { ok: false, message: "Fichier vide." };
  if (f.taille > FICHIER_MAX_OCTETS) return { ok: false, message: `Fichier trop lourd : ${Math.ceil(f.taille / 1024 / 1024)} Mo pour 10 Mo au plus.` };
  const extension = TYPES_FICHIER[f.typeMime];
  if (!extension) return { ok: false, message: "Format non accepté : PDF, image, document bureautique ou texte." };
  return { ok: true, valeur: extension };
}

/** « 2,4 Mo », « 830 Ko ». */
export function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(Math.round((octets * 10) / 1024 / 1024) / 10).toString().replace(".", ",")} Mo`;
}

export function avancement(sousTaches: { faite: boolean }[]): { faites: number; total: number } {
  return { faites: sousTaches.filter((s) => s.faite).length, total: sousTaches.length };
}

type Trace = Record<string, unknown> | null | undefined;

const chaine = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Une ligne du journal, dite en français : « a commencé la tâche »,
 * « a renseigné Montant : 1250000 ». Le nom de l'auteur se met devant.
 * Une action inconnue reste lisible plutôt que de disparaître.
 */
export function phraseActivite(action: string, apres: Trace, avant: Trace): string {
  switch (action) {
    case "tache.creer":
      return "a créé la tâche";
    case "tache.attribuer":
      return "a confié la tâche";
    case "tache.modifier": {
      const changes: string[] = [];
      if (avant && apres) {
        if (avant.titre !== apres.titre) changes.push("le titre");
        if (avant.priorite !== apres.priorite && chaine(apres.priorite))
          changes.push(`la priorité (${LIBELLE_PRIORITE[apres.priorite as Priorite] ?? apres.priorite})`);
        if (avant.echeance !== apres.echeance) changes.push(apres.echeance ? `l'échéance (${apres.echeance})` : "l'échéance (retirée)");
        if ((avant.dateDebut ?? null) !== (apres.dateDebut ?? null)) changes.push("le début prévu");
      }
      return changes.length ? `a modifié ${changes.join(", ")}` : "a modifié la tâche";
    }
    case "tache.demarrer":
      return "a commencé la tâche";
    case "tache.terminer":
      return chaine(apres?.compteRendu) ? `a terminé la tâche : « ${apres!.compteRendu} »` : "a terminé la tâche";
    case "tache.annuler":
      return chaine(apres?.motif) ? `a annulé la tâche : « ${apres!.motif} »` : "a annulé la tâche";
    case "tache.rouvrir":
      return "a rouvert la tâche";
    case "tache.champ": {
      const colonne = chaine(apres?.colonne) ?? "une colonne";
      const valeur = chaine(apres?.valeur);
      // `affiche` : la valeur lisible (nom d'étiquette, nombre et unité) ; les anciennes traces n'ont que la brute.
      return valeur === null ? `a vidé ${colonne}` : `a renseigné ${colonne} : ${chaine(apres?.affiche) ?? (valeur === "1" ? "oui" : valeur)}`;
    }
    case "tache.intervenant.ajouter":
      return `a ajouté ${chaine(apres?.nom) ?? "un intervenant"}`;
    case "tache.intervenant.retirer":
      return "a retiré un intervenant";
    case "tache.sous_tache.ajouter":
      return `a ajouté la sous-tâche « ${chaine(apres?.titre) ?? "…"} »`;
    case "tache.sous_tache.cocher":
      return `${apres?.faite ? "a coché" : "a décoché"} « ${chaine(apres?.titre) ?? "…"} »`;
    case "tache.sous_tache.modifier":
      return `a modifié la sous-tâche « ${chaine(apres?.titre) ?? "…"} »`;
    case "tache.sous_tache.supprimer":
      return `a retiré la sous-tâche « ${chaine(avant?.titre) ?? "…"} »`;
    case "tache.message":
      return "a publié une mise à jour";
    case "tache.message.cocher":
      return "a coché une case d'une mise à jour";
    case "tache.fichier.ajouter":
      return `a joint « ${chaine(apres?.nom) ?? "un fichier"} »`;
    case "tache.fichier.supprimer":
      return `a retiré « ${chaine(avant?.nom) ?? "un fichier"} »`;
    default: {
      const statut = chaine(apres?.statut) as Statut | null;
      return statut && LIBELLE_STATUT[statut] ? `a passé la tâche en « ${LIBELLE_STATUT[statut]} »` : action.replace(/^tache\./, "").replace(/[._]/g, " ");
    }
  }
}
