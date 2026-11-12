/**
 * Courrier et colis : les règles, sans base ni React.
 *
 * Un REGISTRE UNIQUE pour l'entreprise : chaque pli arrivé reçoit
 * `CA-AAAA-NNNNN`, chaque pli parti `CD-AAAA-NNNNN`, sans trou ni doublon.
 *
 * À l'arrivée, le secrétariat ENREGISTRE (scan joint), la direction IMPUTE
 * à une personne — avec un service, des instructions et un délai de
 * réponse —, la personne ACCUSE RÉCEPTION, puis le TRAITE (réponse faite,
 * ou classé). Un courrier imputé non traité à son délai est relancé.
 *
 * Au départ, le pli se prépare, part (transporteur, numéro de suivi), puis
 * est REMIS contre décharge.
 */

export const SENS = ["arrivee", "depart"] as const;
export type Sens = (typeof SENS)[number];

export const STATUTS_ARRIVEE = ["enregistre", "impute", "recu", "traite"] as const;
export const STATUTS_DEPART = ["a_expedier", "expedie", "remis"] as const;
export type StatutArrivee = (typeof STATUTS_ARRIVEE)[number];
export type StatutDepart = (typeof STATUTS_DEPART)[number];
export type StatutPli = StatutArrivee | StatutDepart;

export const LIBELLE_STATUT: Record<StatutPli, string> = {
  enregistre: "À imputer",
  impute: "Imputé",
  recu: "Reçu",
  traite: "Traité",
  a_expedier: "À expédier",
  expedie: "Expédié",
  remis: "Remis",
};

export const NATURES = {
  lettre: "Lettre",
  recommande: "Lettre recommandée",
  colis: "Colis",
  facture: "Facture",
  document: "Document officiel",
  invitation: "Invitation",
  autre: "Autre",
} as const;
export type Nature = keyof typeof NATURES;

export const CANAUX = {
  main_propre: "En main propre",
  coursier: "Coursier",
  yango: "Yango",
  poste: "La Poste",
  transporteur: "Transporteur (DHL, Chronopost…)",
  email: "Courriel",
  autre: "Autre",
  // Une entité de livraison ajoutée par le secrétariat : son nom est dans `transporteur`.
  entite: "Entité de livraison",
} as const;
export type Canal = keyof typeof CANAUX;

/** Les canaux qu'on choisit dans la liste : l'entité de livraison s'y ajoute par son nom, pas par sa clé. */
export const CANAUX_PROPOSES = Object.entries(CANAUX).filter(([cle]) => cle !== "entite") as [Exclude<Canal, "entite">, string][];

/** Valeur du choix « une entité qui n'est pas encore dans la liste ». */
export const NOUVELLE_ENTITE = "__nouvelle__";
/** Préfixe d'une entité de livraison déjà connue : `entite:Glovo`. */
export const PREFIXE_ENTITE = "entite:";

const sansAccent = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nomPropre = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * Ce que dit le choix « Arrivé par » : un canal de la liste, une entité déjà
 * connue (`entite:Glovo`), ou une entité nouvelle saisie à la main.
 *
 * Un nom qui est déjà un canal de la liste (« yango », « La Poste ») rend
 * CE canal, jamais une entité en double ; un nom déjà connu garde son
 * orthographe d'origine, casse et accents ignorés. Seule une entité vraiment
 * nouvelle s'ajoute — elle est proposée ensuite à tout le secrétariat.
 */
export function lireCanal(brut: string, entiteSaisie: string, connues: readonly string[]): { canal: Canal; transporteur: string | null } | { erreur: string } {
  if (brut !== NOUVELLE_ENTITE && !brut.startsWith(PREFIXE_ENTITE)) {
    return canalValide(brut) && brut !== "entite" ? { canal: brut, transporteur: null } : { erreur: "Indiquez comment le pli est arrivé." };
  }
  const nom = nomPropre(brut === NOUVELLE_ENTITE ? entiteSaisie : brut.slice(PREFIXE_ENTITE.length));
  if (nom.length < 2) return { erreur: "Indiquez le nom de l'entité qui livre." };
  if (nom.length > 80) return { erreur: "Le nom de l'entité dépasse 80 caractères." };
  const cle = sansAccent(nom);
  const integre = CANAUX_PROPOSES.find(([k, libelle]) => k !== "autre" && (sansAccent(libelle) === cle || sansAccent(libelle.split("(")[0].trim()) === cle));
  if (integre) return { canal: integre[0], transporteur: null };
  const connue = connues.find((c) => sansAccent(c) === cle);
  return { canal: "entite", transporteur: connue ?? nom };
}

export function natureValide(v: unknown): v is Nature {
  return typeof v === "string" && Object.hasOwn(NATURES, v);
}

export function canalValide(v: unknown): v is Canal {
  return typeof v === "string" && Object.hasOwn(CANAUX, v);
}

/** Les gestes permis, de statut à statut. Réimputer reste possible tant que le pli n'est pas traité. */
const PASSAGES: Record<StatutPli, readonly StatutPli[]> = {
  enregistre: ["impute"],
  impute: ["impute", "recu", "traite"],
  recu: ["impute", "traite"],
  traite: [],
  a_expedier: ["expedie"],
  expedie: ["remis"],
  remis: [],
};

export function passagePermis(de: StatutPli, vers: StatutPli): boolean {
  return PASSAGES[de].includes(vers);
}

export function statutInitial(sens: Sens): StatutPli {
  return sens === "arrivee" ? "enregistre" : "a_expedier";
}

/** Numéro du registre : `CA-2026-00042` à l'arrivée, `CD-2026-00042` au départ ; compteur annuel. */
export function formatNumero(sens: Sens, annee: number): { cle: string; prefix: string; padding: number; periode: string } {
  const code = sens === "arrivee" ? "CA" : "CD";
  return { cle: `courrier:${code}`, prefix: `${code}-${annee}-`, padding: 5, periode: String(annee) };
}

/** En retard : imputé, pas encore traité, délai de réponse dépassé (jour civil « AAAA-MM-JJ »). */
export function enRetard(p: { statut: StatutPli; delaiReponse: string | null }, aujourdhui: string): boolean {
  return (p.statut === "impute" || p.statut === "recu") && p.delaiReponse !== null && p.delaiReponse < aujourdhui;
}

/** Une relance par jour au plus : la cloche ne doit pas devenir un bruit. */
export const RELANCE_MIN_MS = 20 * 60 * 60_000;

export function relanceDue(p: { statut: StatutPli; delaiReponse: string | null; derniereRelanceLe: Date | null }, aujourdhui: string, maintenant: Date): boolean {
  if (!enRetard(p, aujourdhui)) return false;
  return !p.derniereRelanceLe || maintenant.getTime() - p.derniereRelanceLe.getTime() >= RELANCE_MIN_MS;
}

/** Jours de retard, entiers, sur des jours civils. */
export function joursDeRetard(delaiReponse: string, aujourdhui: string): number {
  return Math.max(0, Math.round((Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${delaiReponse}T00:00:00Z`)) / 86_400_000));
}

export interface SaisiePli {
  objet: string;
  correspondant: string;
  reference: string;
  nature: string;
  canal: string;
  /** Nom de l'entité qui livre, quand le canal est « nouvelle entité ». */
  entite?: string;
  dateDocument: string;
}

export const LONGUEURS = { objet: 200, correspondant: 160, reference: 80 } as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ce qui empêche d'enregistrer un pli, ou null. */
export function refusSaisie(s: SaisiePli, sens: Sens): string | null {
  if (s.objet.trim().length < 2) return "Indiquez l'objet du courrier.";
  if (s.correspondant.trim().length < 2) return sens === "arrivee" ? "Indiquez l'expéditeur." : "Indiquez le destinataire.";
  if (s.objet.trim().length > LONGUEURS.objet) return `L'objet dépasse ${LONGUEURS.objet} caractères.`;
  if (s.correspondant.trim().length > LONGUEURS.correspondant) return `Le correspondant dépasse ${LONGUEURS.correspondant} caractères.`;
  if (s.reference.trim().length > LONGUEURS.reference) return `La référence dépasse ${LONGUEURS.reference} caractères.`;
  if (!natureValide(s.nature)) return "Choisissez la nature du pli.";
  if (!canalValide(s.canal)) return sens === "arrivee" ? "Indiquez comment le pli est arrivé." : "Indiquez comment le pli part.";
  if (s.dateDocument && !DATE.test(s.dateDocument)) return "La date du document est illisible.";
  return null;
}

/** Ce qui empêche une imputation, ou null. */
export function refusImputation(i: { userId: string | null; delaiReponse: string; instructions: string }, aujourdhui: string): string | null {
  if (!i.userId) return "Choisissez la personne à qui le courrier est imputé.";
  if (i.delaiReponse && !DATE.test(i.delaiReponse)) return "Le délai de réponse est illisible.";
  if (i.delaiReponse && i.delaiReponse < aujourdhui) return "Le délai de réponse ne peut pas être déjà passé.";
  if (i.instructions.trim().length > 1000) return "Les instructions dépassent 1 000 caractères.";
  return null;
}
