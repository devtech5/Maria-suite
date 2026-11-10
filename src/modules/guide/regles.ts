/**
 * Guide d'utilisation : les règles, sans base ni React.
 *
 * Le guide est celui de L'APPLICATION : un chapitre par entrée du menu, et
 * il suit le même filtre que le menu — une personne n'y lit que les modules
 * qu'elle peut ouvrir. S'y ajoutent les chapitres de tous (premiers pas,
 * règlement intérieur).
 *
 * Le parcours du nouveau venu, c'est ce guide-là : chaque chapitre se
 * marque lu, puis un quiz tiré de SES chapitres valide le parcours. Les RH
 * voient qui a terminé.
 */

/** Un repère numéroté posé sur une capture : position en pourcentage, et ce qu'il désigne. */
export interface Repere {
  /** Sélecteur Playwright de l'élément désigné, lu par `scripts/captures-guide.ts`. */
  cible: string;
  texte: string;
}

export interface Capture {
  /** Fichier sous `public/guide/`, sans extension. */
  fichier: string;
  /** Page photographiée, adresse de l'application. */
  page: string;
  alt: string;
  reperes: Repere[];
}

export interface Section {
  ancre: string;
  titre: string;
  /** Sous-écran que la section décrit : l'aide « ? » de cette page y mène. */
  chemin?: string;
  texte: string[];
  etapes?: string[];
  capture?: Capture;
}

export interface Question {
  /** Stable : la correction s'y réfère, le texte peut changer. */
  cle: string;
  question: string;
  choix: string[];
  /** Rang de la bonne réponse dans `choix`. */
  bonne: number;
  explication: string;
}

export interface Chapitre {
  cle: string;
  titre: string;
  /**
   * Entrée du menu que le chapitre explique (`href` de `GROUPES_MODULES`).
   * Nulle : chapitre de tous, toujours au parcours.
   */
  entree: string | null;
  resume: string;
  sections: Section[];
  quiz: Question[];
}

/** Part des bonnes réponses qui valide le parcours, en pourcentage entier. */
export const SEUIL_REUSSITE = 80;

/** Questions au plus dans un quiz, pour qu'il reste un quiz et pas un examen. */
export const QUESTIONS_MAX = 12;

/**
 * Les chapitres d'une personne : ceux de tous, puis ceux des entrées du menu
 * qu'elle voit, dans l'ordre du guide.
 */
export function chapitresPour(chapitres: readonly Chapitre[], entreesVisibles: Iterable<string>): Chapitre[] {
  const visibles = new Set(entreesVisibles);
  return chapitres.filter((c) => c.entree === null || visibles.has(c.entree));
}

/** Un chemin relève d'une racine s'il est elle ou s'il en descend — « /stockage » n'est pas « /stock ». */
function relevDe(chemin: string, racine: string): boolean {
  if (racine === "/") return chemin === "/";
  return chemin === racine || chemin.startsWith(`${racine}/`);
}

export interface CheminAide {
  /** Racine d'écran : « /stock », « /stock/mouvements ». */
  chemin: string;
  /** Où mène le « ? » : « /guide/stock#mouvements ». */
  href: string;
}

/**
 * Les écrans couverts par les chapitres d'une personne, et la section du
 * guide que leur « ? » ouvre : la racine du menu mène au chapitre, le
 * sous-écran d'une section à cette section. `racines` : racine de chaque
 * entrée du menu.
 */
export function cheminsAide(chapitres: readonly Chapitre[], racines: ReadonlyMap<string, string>): CheminAide[] {
  const liste: CheminAide[] = [];
  for (const c of chapitres) {
    if (c.entree) liste.push({ chemin: racines.get(c.entree) ?? c.entree, href: `/guide/${c.cle}` });
    for (const s of c.sections) if (s.chemin) liste.push({ chemin: s.chemin, href: `/guide/${c.cle}#${s.ancre}` });
  }
  return liste;
}

/** Le « ? » de la page courante : la racine la plus précise qui la couvre, sinon le sommaire du guide. */
export function aideDe(chemin: string, aides: readonly CheminAide[]): string {
  let meilleure: CheminAide | null = null;
  // À longueur égale, la dernière l'emporte : une section suit l'entrée de son chapitre, et la précise.
  for (const a of aides) if (relevDe(chemin, a.chemin) && (!meilleure || a.chemin.length >= meilleure.chemin.length)) meilleure = a;
  return meilleure?.href ?? "/guide";
}

export interface Progression {
  lus: number;
  total: number;
  /** Pourcentage entier, arrondi vers le bas. */
  pourcent: number;
  /** Le premier chapitre non lu, pour « Continuer ». */
  suivant: string | null;
}

export function progression(chapitres: readonly Chapitre[], lus: Iterable<string>): Progression {
  const faits = new Set(lus);
  const comptes = chapitres.filter((c) => faits.has(c.cle)).length;
  const total = chapitres.length;
  return {
    lus: comptes,
    total,
    pourcent: total === 0 ? 0 : Math.floor((comptes * 100) / total),
    suivant: chapitres.find((c) => !faits.has(c.cle))?.cle ?? null,
  };
}

/** Graine stable d'un texte (FNV-1a) : le même compte retrouve le même quiz dans la journée. */
function graine(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function aleatoire(depart: number): () => number {
  let a = depart;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Le quiz d'une personne : au plus `QUESTIONS_MAX` questions tirées de ses
 * chapitres, une par chapitre d'abord pour couvrir le parcours, puis les
 * autres. Déterministe pour une même `cle` (compte + jour) : recharger la
 * page ne change pas les questions en cours de réponse.
 */
export function tirerQuiz(chapitres: readonly Chapitre[], cle: string, max = QUESTIONS_MAX): Question[] {
  const hasard = aleatoire(graine(cle));
  const melanger = <T,>(liste: T[]): T[] => {
    const copie = [...liste];
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(hasard() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  };
  const premieres: Question[] = [];
  const reste: Question[] = [];
  for (const c of melanger([...chapitres])) {
    const questions = melanger(c.quiz);
    if (questions[0]) premieres.push(questions[0]);
    reste.push(...questions.slice(1));
  }
  return [...premieres, ...melanger(reste)].slice(0, max);
}

export interface Correction {
  bonnes: number;
  total: number;
  pourcent: number;
  reussi: boolean;
  details: { cle: string; donnee: number | null; bonne: number; juste: boolean; explication: string }[];
}

/** Corrige les réponses (rang du choix par clé de question). Une question sans réponse est fausse. */
export function corriger(questions: readonly Question[], reponses: Readonly<Record<string, number | null | undefined>>): Correction {
  const details = questions.map((q) => {
    const donnee = reponses[q.cle];
    const valide = typeof donnee === "number" && Number.isInteger(donnee) && donnee >= 0 && donnee < q.choix.length ? donnee : null;
    return { cle: q.cle, donnee: valide, bonne: q.bonne, juste: valide === q.bonne, explication: q.explication };
  });
  const bonnes = details.filter((d) => d.juste).length;
  const total = questions.length;
  const pourcent = total === 0 ? 0 : Math.floor((bonnes * 100) / total);
  return { bonnes, total, pourcent, reussi: total > 0 && pourcent >= SEUIL_REUSSITE, details };
}

/** Le parcours est terminé quand tout est lu et le quiz réussi. */
export function parcoursTermine(p: Progression, quizReussi: boolean): boolean {
  return p.total > 0 && p.lus === p.total && quizReussi;
}
