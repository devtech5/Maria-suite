/**
 * Présences et congés : les règles, sans base ni React.
 *
 * Les jours de congé se comptent en CENTIÈMES de jour, entiers : 2,2 jours
 * acquis par mois se stockent 220. Même règle que l'argent — un solde
 * calculé en flottant finit par afficher 25,999999 jours.
 */

/** Jour ISO `AAAA-MM-JJ` dans le fuseau de l'entreprise (Abidjan par défaut). */
export function jourLocal(instant: Date, fuseau = "Africa/Abidjan"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Heure `HH:MM` dans le fuseau de l'entreprise. */
export function heureLocale(instant: Date, fuseau = "Africa/Abidjan"): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: fuseau, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

/** Écart entre l'heure locale du fuseau et UTC, en millisecondes, à cet instant. */
function decalageMs(instant: Date, fuseau: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** L'instant qui correspond à `jour` à `heure`, heure locale du fuseau. */
export function instantLocal(jour: string, heure: string, fuseau = "Africa/Abidjan"): Date {
  const naif = Date.parse(`${jour}T${heure}:00Z`);
  return new Date(naif - decalageMs(new Date(naif), fuseau));
}

export function minutesDe(heure: string): number {
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + m;
}

export function heureValide(heure: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(heure);
}

/** Minutes de retard au-delà de la tolérance ; 0 si à l'heure. */
export function retardMinutes(arrivee: string, heureArrivee: string, tolerance: number): number {
  const ecart = minutesDe(arrivee) - minutesDe(heureArrivee);
  return ecart > tolerance ? ecart : 0;
}

// ------------------------------------------------------------- calendrier

function versDate(jour: string): Date {
  return new Date(`${jour}T00:00:00Z`);
}

export function versJour(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ajouterJours(jour: string, n: number): string {
  const d = versDate(jour);
  d.setUTCDate(d.getUTCDate() + n);
  return versJour(d);
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function jourSemaine(jour: string): number {
  const j = versDate(jour).getUTCDay();
  return j === 0 ? 7 : j;
}

export function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let j = debut; j <= fin; j = ajouterJours(j, 1)) jours.push(j);
  return jours;
}

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Butcher). */
export function paques(annee: number): string {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

export interface JourFerie {
  jour: string;
  libelle: string;
}

/**
 * Fériés connus d'avance, par pays : dates fixes et fêtes calées sur Pâques.
 *
 * Les fêtes musulmanes (Korité, Tabaski, Maouloud, Nuit du Destin) suivent
 * le calendrier lunaire et sont fixées chaque année par décret : elles se
 * saisissent à la main, jamais devinées.
 */
const FERIES_PAR_PAYS: Record<string, { fixes: [string, string][]; depuisPaques: [number, string][] }> = {
  CI: {
    fixes: [
      ["01-01", "Jour de l'an"],
      ["05-01", "Fête du travail"],
      ["08-07", "Fête de l'indépendance"],
      ["08-15", "Assomption"],
      ["11-01", "Toussaint"],
      ["11-15", "Journée nationale de la paix"],
      ["12-25", "Noël"],
    ],
    depuisPaques: [
      [1, "Lundi de Pâques"],
      [39, "Ascension"],
      [50, "Lundi de Pentecôte"],
    ],
  },
};

export function feriesProposes(pays: string, annee: number): JourFerie[] {
  const regle = FERIES_PAR_PAYS[pays.toUpperCase()];
  if (!regle) return [];
  const p = paques(annee);
  return [
    ...regle.fixes.map(([md, libelle]) => ({ jour: `${annee}-${md}`, libelle })),
    ...regle.depuisPaques.map(([n, libelle]) => ({ jour: ajouterJours(p, n), libelle })),
  ].sort((a, b) => a.jour.localeCompare(b.jour));
}

// ----------------------------------------------------------------- congés

export interface RegleConges {
  /** Centièmes de jour acquis par mois de service : 220 = 2,2 jours. */
  centiemesParMois: number;
  /** `ouvrables` : du lundi au samedi. `ouvres` : les jours travaillés de l'entreprise. */
  decompte: "ouvrables" | "ouvres";
  /** D'où vient la règle, pour qui la vérifie. */
  source: string;
}

/**
 * Règle légale par pays. Ce qui n'est pas connu ici se règle sur l'écran et
 * reste signalé « à vérifier » tant que personne ne l'a attesté.
 */
const REGLES_CONGES: Record<string, RegleConges> = {
  CI: { centiemesParMois: 220, decompte: "ouvrables", source: "Code du travail ivoirien : 2,2 jours ouvrables par mois de service effectif." },
  SN: { centiemesParMois: 200, decompte: "ouvrables", source: "Code du travail sénégalais : 2 jours ouvrables par mois de service effectif." },
};

export const REGLE_CONGES_INCONNUE: RegleConges = { centiemesParMois: 200, decompte: "ouvrables", source: "Règle du pays non renseignée : à régler et faire vérifier." };

export function regleConges(pays: string | null | undefined): RegleConges {
  return (pays && REGLES_CONGES[pays.toUpperCase()]) || REGLE_CONGES_INCONNUE;
}

export interface OptionsDecompte {
  decompte: "ouvrables" | "ouvres";
  /** Jours travaillés de l'entreprise, ISO (1 = lundi). */
  joursTravailles: readonly number[];
  feries: ReadonlySet<string>;
}

/** Vrai si le jour se décompte d'un congé : ni dimanche (ou jour chômé), ni férié. */
export function jourDecompte(jour: string, o: OptionsDecompte): boolean {
  if (o.feries.has(jour)) return false;
  const js = jourSemaine(jour);
  return o.decompte === "ouvrables" ? js !== 7 : o.joursTravailles.includes(js);
}

/**
 * Jours décomptés d'un congé, en centièmes. Une demi-journée en tête
 * (départ l'après-midi) ou en queue (retour l'après-midi) retire 50.
 */
export function joursDecomptes(
  debut: string,
  fin: string,
  o: OptionsDecompte,
  demi: { debut?: boolean; fin?: boolean } = {},
): number {
  if (fin < debut) return 0;
  const jours = joursEntre(debut, fin);
  let total = jours.filter((j) => jourDecompte(j, o)).length * 100;
  if (demi.debut && jourDecompte(debut, o)) total -= 50;
  if (demi.fin && fin !== debut && jourDecompte(fin, o)) total -= 50;
  if (demi.fin && fin === debut && !demi.debut && jourDecompte(fin, o)) total -= 50;
  return Math.max(0, total);
}

/** Mois de service ENTIERS entre deux jours : du 15 janvier au 6 octobre, 8. */
export function moisComplets(depuis: string, jusqua: string): number {
  if (jusqua < depuis) return 0;
  const [a1, m1, j1] = depuis.split("-").map(Number);
  const [a2, m2, j2] = jusqua.split("-").map(Number);
  let mois = (a2 - a1) * 12 + (m2 - m1);
  if (j2 < j1) mois -= 1;
  return Math.max(0, mois);
}

export interface ElementsSolde {
  /** Début du décompte : la dernière reprise de solde, sinon l'embauche. */
  depuis: string;
  aujourdhui: string;
  centiemesParMois: number;
  /** Solde repris à `depuis` (0 sans reprise). */
  reprise: number;
  /** Ajustements postérieurs (majorations, corrections), signés. */
  ajustements: number;
  /** Congés payés approuvés depuis `depuis`. */
  pris: number;
  /** Congés payés demandés, pas encore décidés. */
  enAttente: number;
}

export interface Solde {
  acquis: number;
  pris: number;
  enAttente: number;
  /** Disponible aujourd'hui, avant les demandes en attente. */
  solde: number;
  /** Ce qui restera si les demandes en attente sont accordées. */
  apresDemandes: number;
}

export function calculerSolde(e: ElementsSolde): Solde {
  const acquis = moisComplets(e.depuis, e.aujourdhui) * e.centiemesParMois;
  const solde = e.reprise + acquis + e.ajustements - e.pris;
  return { acquis, pris: e.pris, enAttente: e.enAttente, solde, apresDemandes: solde - e.enAttente };
}

/** « 26,4 j », « 1 j », « 0,5 j ». */
export function formatJours(centiemes: number): string {
  const v = centiemes / 100;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} j`;
}

export const NATURES_CONGE = {
  paye: { libelle: "Congé payé", decompteSolde: true },
  maladie: { libelle: "Maladie", decompteSolde: false },
  maternite: { libelle: "Maternité", decompteSolde: false },
  paternite: { libelle: "Paternité", decompteSolde: false },
  evenement_familial: { libelle: "Événement familial", decompteSolde: false },
  sans_solde: { libelle: "Sans solde", decompteSolde: false },
  recuperation: { libelle: "Récupération", decompteSolde: false },
  autre: { libelle: "Autre absence", decompteSolde: false },
} as const;
export type NatureConge = keyof typeof NATURES_CONGE;

export const STATUTS_CONGE = {
  demande: "En attente",
  approuve: "Accordé",
  refuse: "Refusé",
  annule: "Annulé",
} as const;
export type StatutConge = keyof typeof STATUTS_CONGE;

/** Deux périodes se chevauchent-elles ? Bornes incluses. */
export function chevauche(a: { debut: string; fin: string }, b: { debut: string; fin: string }): boolean {
  return a.debut <= b.fin && b.debut <= a.fin;
}

// ------------------------------------------------------------- registre

export type EtatJour =
  | { etat: "present"; arrivee: string; derniere: string; retard: number }
  | { etat: "conge"; nature: NatureConge }
  | { etat: "permission" }
  | { etat: "ferie"; libelle: string }
  | { etat: "repos" }
  | { etat: "absent" }
  | { etat: "avenir" }
  | { etat: "hors_contrat" };

export interface ContexteJour {
  jour: string;
  aujourdhui: string;
  /** Heure locale courante, pour ne pas dire « absent » à 7 h du matin. */
  maintenant: string;
  heureArrivee: string;
  tolerance: number;
  joursTravailles: readonly number[];
  feries: ReadonlyMap<string, string>;
  contrat: { debut: string; fin: string | null };
  presence?: { arrivee: string; derniere: string };
  conge?: NatureConge;
  /** Absence accordée (journée entière), hors congé. */
  permission?: boolean;
}

/**
 * État d'un salarié pour un jour donné. Une présence pointée l'emporte sur
 * tout — quelqu'un venu un jour férié est venu.
 */
export function etatDuJour(c: ContexteJour): EtatJour {
  if (c.presence) return { etat: "present", arrivee: c.presence.arrivee, derniere: c.presence.derniere, retard: retardMinutes(c.presence.arrivee, c.heureArrivee, c.tolerance) };
  if (c.jour < c.contrat.debut || (c.contrat.fin && c.jour > c.contrat.fin)) return { etat: "hors_contrat" };
  if (c.conge) return { etat: "conge", nature: c.conge };
  if (c.permission) return { etat: "permission" };
  const ferie = c.feries.get(c.jour);
  if (ferie) return { etat: "ferie", libelle: ferie };
  if (!c.joursTravailles.includes(jourSemaine(c.jour))) return { etat: "repos" };
  if (c.jour > c.aujourdhui) return { etat: "avenir" };
  if (c.jour === c.aujourdhui && minutesDe(c.maintenant) <= minutesDe(c.heureArrivee) + c.tolerance) return { etat: "avenir" };
  return { etat: "absent" };
}

export const LIBELLES_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
