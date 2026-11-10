/**
 * Anniversaires des collaborateurs : les règles, sans base ni React.
 *
 * Tout se compte en JOURS CIVILS « AAAA-MM-JJ », dans le fuseau de
 * l'entreprise : un anniversaire tombe le 12 novembre à Abidjan, pas « dans
 * 24 heures » à compter d'un instant UTC.
 *
 * Né un 29 février : l'anniversaire se fête le 28 février les années non
 * bissextiles — le dernier jour de février, comme le compte la plupart des
 * administrations ; il ne saute ainsi jamais une année.
 */

/** La direction est prévenue jusqu'à une semaine avant, une fois. */
export const RAPPEL_JOURS = 7;

/** Fenêtre affichée à l'équipe : ce qui arrive dans le mois qui vient. */
export const HORIZON_JOURS = 31;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const;
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function bissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

function deuxChiffres(n: number): string {
  return String(n).padStart(2, "0");
}

/** Le jour où l'on fête, cette année-là, une naissance de ce mois et de ce jour. */
function jourDeFete(annee: number, mois: number, jour: number): string {
  const j = mois === 2 && jour === 29 && !bissextile(annee) ? 28 : jour;
  return `${annee}-${deuxChiffres(mois)}-${deuxChiffres(j)}`;
}

function ecartJours(du: string, au: string): number {
  return Math.round((Date.parse(`${au}T00:00:00Z`) - Date.parse(`${du}T00:00:00Z`)) / 86_400_000);
}

export interface ProchainAnniversaire {
  /** Jour de la fête : « 2026-11-12 ». */
  jour: string;
  /** Jours d'ici là : 0 aujourd'hui, 1 demain. */
  dans: number;
  /** Âge atteint ce jour-là. */
  age: number;
}

/**
 * Le prochain anniversaire d'une personne née `naissance`, vu depuis
 * `aujourdhui` — aujourd'hui compris. Nul pour une date illisible ou
 * postérieure à aujourd'hui.
 */
export function prochainAnniversaire(naissance: string | null | undefined, aujourdhui: string): ProchainAnniversaire | null {
  const n = naissance ? DATE_ISO.exec(naissance) : null;
  const a = DATE_ISO.exec(aujourdhui);
  if (!n || !a || naissance! > aujourdhui) return null;
  const [anneeN, moisN, jourN] = [Number(n[1]), Number(n[2]), Number(n[3])];
  if (moisN < 1 || moisN > 12 || jourN < 1 || jourN > 31) return null;
  const anneeA = Number(a[1]);

  let annee = anneeA;
  let jour = jourDeFete(annee, moisN, jourN);
  if (jour < aujourdhui) {
    annee += 1;
    jour = jourDeFete(annee, moisN, jourN);
  }
  return { jour, dans: ecartJours(aujourdhui, jour), age: annee - anneeN };
}

export interface PersonneNee {
  id: string;
  nom: string;
  dateNaissance: string | null;
}

export type AnniversaireAVenir<P extends PersonneNee> = P & ProchainAnniversaire;

/**
 * Les anniversaires des `horizon` prochains jours, aujourd'hui compris, du
 * plus proche au plus lointain, puis par nom.
 */
export function anniversairesAVenir<P extends PersonneNee>(personnes: readonly P[], aujourdhui: string, horizon = HORIZON_JOURS): AnniversaireAVenir<P>[] {
  return personnes
    .flatMap((p) => {
      const prochain = prochainAnniversaire(p.dateNaissance, aujourdhui);
      return prochain && prochain.dans <= horizon ? [{ ...p, ...prochain }] : [];
    })
    .sort((x, y) => x.dans - y.dans || x.nom.localeCompare(y.nom, "fr"));
}

/** Les anniversaires d'un mois donné (« 2026-11 »), par jour : pour le calendrier. */
export function anniversairesDuMois<P extends PersonneNee>(personnes: readonly P[], mois: string): Map<string, P[]> {
  const parJour = new Map<string, P[]>();
  const annee = Number(mois.slice(0, 4));
  for (const p of personnes) {
    const n = p.dateNaissance ? DATE_ISO.exec(p.dateNaissance) : null;
    if (!n || `${n[1]}-${n[2]}` > mois) continue;
    const jour = jourDeFete(annee, Number(n[2]), Number(n[3]));
    if (jour.slice(0, 7) !== mois) continue;
    parJour.set(jour, [...(parJour.get(jour) ?? []), p]);
  }
  return parJour;
}

/** « aujourd'hui », « demain », « dans 3 jours » ; au-delà d'une semaine, la date. */
export function quandAnniversaire(a: { jour: string; dans: number }): string {
  if (a.dans === 0) return "aujourd'hui";
  if (a.dans === 1) return "demain";
  if (a.dans < 7) return `${JOURS[new Date(`${a.jour}T12:00:00Z`).getUTCDay()]} (dans ${a.dans} jours)`;
  return dateLisible(a.jour);
}

/** « jeudi 12 novembre ». */
export function dateLisible(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** « 12 novembre » : le jour et le mois, sans l'année — ce que voit l'équipe. */
export function jourEtMois(naissance: string): string {
  const n = DATE_ISO.exec(naissance);
  return n ? `${Number(n[3])} ${MOIS[Number(n[2]) - 1]}` : "";
}

export function prenom(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? nom;
}

// ------------------------------------------------------------ annonces

export type NatureAnnonce = "rappel" | "jour";

/**
 * Ce qu'il y a à annoncer aujourd'hui pour une personne : la fête du jour,
 * ou le rappel à la direction dans la semaine qui précède. Le rappel part à
 * la première occasion de la fenêtre — un jour où personne n'ouvre Maria
 * Suite ne le fait pas manquer —, une seule fois grâce au journal des envois.
 */
export function annonceDuJour(prochain: ProchainAnniversaire | null): NatureAnnonce | null {
  if (!prochain) return null;
  if (prochain.dans === 0) return "jour";
  if (prochain.dans <= RAPPEL_JOURS) return "rappel";
  return null;
}
