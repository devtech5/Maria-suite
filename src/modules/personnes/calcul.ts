/**
 * Personnel : règles pures, sans base ni React.
 */

/**
 * Matricule d'un salarié : MG-2601-007.
 *
 *   MG    — MARIA GROUP ;
 *   2601  — année et mois d'entrée (janvier 2026) ;
 *   007   — rang dans l'effectif : septième salarié enregistré.
 *
 * Le rang suit l'ordre d'enregistrement et ne se réutilise jamais : un départ
 * ne libère pas son numéro, sans quoi deux personnes porteraient le même
 * rang sur des papiers d'époques différentes. La date d'embauche ne se
 * modifie pas après coup, le matricule reste donc vrai.
 */
export const PREFIXE_MATRICULE = "MG";

/** Trois chiffres de rang ; au-delà de 999, le rang s'allonge sans se tronquer. */
const CHIFFRES_RANG = 3;

export function formaterMatricule(debut: string, rang: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut)) throw new Error("Date d'embauche illisible.");
  if (!Number.isInteger(rang) || rang < 1) throw new Error("Rang dans l'effectif invalide.");
  const aamm = debut.slice(2, 4) + debut.slice(5, 7);
  return `${PREFIXE_MATRICULE}-${aamm}-${String(rang).padStart(CHIFFRES_RANG, "0")}`;
}

/** Ce qu'un matricule dit de son porteur, ou nul s'il n'est pas au format. */
export function lireMatricule(matricule: string): { annee: number; mois: number; rang: number } | null {
  const m = new RegExp(`^${PREFIXE_MATRICULE}-(\\d{2})(\\d{2})-(\\d{${CHIFFRES_RANG},})$`).exec(matricule);
  if (!m) return null;
  const mois = Number(m[2]);
  if (mois < 1 || mois > 12) return null;
  return { annee: 2000 + Number(m[1]), mois, rang: Number(m[3]) };
}

/** Durée proposée pour une période d'essai, en mois. */
export const MOIS_ESSAI = 3;

/**
 * Dernier jour d'une période d'essai de `mois` mois : la veille du même
 * quantième, `mois` mois plus tard. Entrée le 5 janvier, fin le 4 avril.
 * Quand ce quantième n'existe pas (entrée le 31 janvier, pas de 31 avril),
 * la période court jusqu'au dernier jour du mois : le 30 avril.
 */
export function finEssai(debut: string, mois: number = MOIS_ESSAI): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(debut);
  if (!m) throw new Error("Date d'embauche illisible.");
  const [annee, moisDebut, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const total = moisDebut - 1 + mois;
  const anneeFin = annee + Math.floor(total / 12);
  const moisFin = (total % 12) + 1;
  const dernierDuMois = new Date(Date.UTC(anneeFin, moisFin, 0)).getUTCDate();
  const fin =
    jour > dernierDuMois
      ? new Date(Date.UTC(anneeFin, moisFin - 1, dernierDuMois))
      : new Date(Date.UTC(anneeFin, moisFin - 1, jour - 1));
  return fin.toISOString().slice(0, 10);
}

/**
 * Lien entre le salarié et la personne à prévenir. Une liste plutôt qu'un
 * texte libre : « épouse », « Epouse » et « femme » ne doivent pas faire
 * trois réponses dans un registre du personnel.
 */
export const LIENS_URGENCE = {
  epoux: "Époux",
  epouse: "Épouse",
  conjoint: "Conjoint ou conjointe",
  pere: "Père",
  mere: "Mère",
  fils: "Fils",
  fille: "Fille",
  frere: "Frère",
  soeur: "Sœur",
  oncle: "Oncle",
  tante: "Tante",
  cousin: "Cousin",
  cousine: "Cousine",
  tuteur: "Tuteur ou tutrice",
  ami: "Ami",
  amie: "Amie",
  autre: "Autre",
} as const;

export type LienUrgence = keyof typeof LIENS_URGENCE;

export function lienUrgenceConnu(valeur: string): valeur is LienUrgence {
  return valeur in LIENS_URGENCE;
}

/**
 * Ancienneté entre l'entrée et un jour donné, en années et mois révolus.
 *
 * Un mois est révolu quand le quantième d'entrée est atteint : entré le 31
 * janvier, on compte un mois le 28 février (dernier jour du mois). Nulle
 * avant l'entrée, pour une date d'embauche encore à venir.
 */
export function anciennete(debut: string, jour: string): { annees: number; mois: number } | null {
  const lire = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) throw new Error("Date illisible.");
    return { a: Number(m[1]), m: Number(m[2]), j: Number(m[3]) };
  };
  const d = lire(debut);
  const f = lire(jour);
  if (jour < debut) return null;
  let mois = (f.a - d.a) * 12 + (f.m - d.m);
  const dernierJour = new Date(Date.UTC(f.a, f.m, 0)).getUTCDate();
  if (f.j < Math.min(d.j, dernierJour)) mois -= 1;
  return { annees: Math.floor(mois / 12), mois: mois % 12 };
}

/** « 2 ans et 3 mois », « 5 mois », « moins d'un mois ». */
export function libelleAnciennete(duree: { annees: number; mois: number } | null): string {
  if (!duree) return "Entrée à venir";
  const { annees, mois } = duree;
  const a = annees > 0 ? `${annees} an${annees > 1 ? "s" : ""}` : "";
  const m = mois > 0 ? `${mois} mois` : "";
  if (a && m) return `${a} et ${m}`;
  return a || m || "Moins d'un mois";
}

/**
 * Vrai si placer `superieurId` au-dessus de `employeeId` ferait une boucle :
 * le salarié deviendrait, par la chaîne, le supérieur de son supérieur.
 *
 * `superieurDe` donne le supérieur actuel de chaque salarié. La remontée
 * s'arrête au sommet ; une chaîne déjà bouclée en base (qui ne devrait pas
 * exister) est traitée comme une boucle plutôt que de tourner sans fin.
 */
export function formeUneBoucle(employeeId: string, superieurId: string | null, superieurDe: Map<string, string | null>): boolean {
  const vus = new Set<string>();
  for (let courant = superieurId; courant; courant = superieurDe.get(courant) ?? null) {
    if (courant === employeeId || vus.has(courant)) return true;
    vus.add(courant);
  }
  return false;
}
