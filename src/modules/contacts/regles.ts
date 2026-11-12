/**
 * Règles pures de l'annuaire : adresses professionnelles, numéros,
 * affectation par service, recherche. Sans base ni React : testées seules,
 * appliquées à l'identique par le serveur et les écrans.
 */

import { adresseAutorisee, DOMAINE_AUTORISE, normaliserEmail } from "@/lib/auth/identifiants";
import { normaliserTelephone } from "@/modules/communication/calcul";
import { cleService } from "@/modules/personnes/services";

// ---------------------------------------------------------------- adresses

/**
 * L'adresse saisie, normalisée, ou le motif du refus. Passe par
 * `adresseAutorisee` : une adresse hors du domaine de l'entreprise n'entre
 * pas dans l'annuaire des adresses professionnelles.
 */
export function adresseProValide(saisie: string): { ok: true; adresse: string } | { ok: false; message: string } {
  const adresse = normaliserEmail(saisie);
  if (!adresse) return { ok: false, message: "Cette adresse e-mail n'est pas valide." };
  if (!adresseAutorisee(adresse)) return { ok: false, message: `Seules les adresses @${DOMAINE_AUTORISE} figurent dans l'annuaire.` };
  return { ok: true, adresse };
}

export const LONGUEUR_MAX_LIBELLE = 120;

// ----------------------------------------------------------------- numéros

export const NATURES_NUMERO = { mobile: "Mobile", fixe: "Fixe", whatsapp: "WhatsApp" } as const;
export type NatureNumero = keyof typeof NATURES_NUMERO;
export const LISTE_NATURES = Object.keys(NATURES_NUMERO) as NatureNumero[];

export const USAGES_NUMERO = { professionnel: "Professionnel", personnel: "Personnel" } as const;
export type UsageNumero = keyof typeof USAGES_NUMERO;
export const LISTE_USAGES = Object.keys(USAGES_NUMERO) as UsageNumero[];

export const natureValide = (v: string): v is NatureNumero => v in NATURES_NUMERO;
export const usageValide = (v: string): v is UsageNumero => v in USAGES_NUMERO;

/** Numéro en chiffres au format international, ou le motif du refus. */
export function numeroValide(saisie: string): { ok: true; numero: string } | { ok: false; message: string } {
  const numero = normaliserTelephone(saisie);
  if (!numero) return { ok: false, message: "Ce numéro n'est pas valide : dix chiffres pour un numéro ivoirien, ou « + » et l'indicatif." };
  return { ok: true, numero };
}

/**
 * Affichage : `+225 07 07 12 34 56`. Un numéro ivoirien se découpe par
 * paires, un autre par groupes de trois sous son indicatif.
 */
export function formaterNumero(chiffres: string): string {
  const seuls = chiffres.replace(/\D/g, "");
  if (seuls.startsWith("225") && seuls.length === 13) return `+225 ${seuls.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
  return seuls ? `+${seuls}` : chiffres;
}

/** Les chiffres d'une saisie libre, pour comparer une fiche à un numéro enregistré. */
export const chiffresDe = (saisie: string): string => saisie.replace(/\D/g, "");

/** Deux saisies désignent le même abonné : « 07 07 12 34 56 » et « +225 0707123456 ». */
export function memeNumero(a: string, b: string): boolean {
  const x = normaliserTelephone(a) ?? chiffresDe(a);
  const y = normaliserTelephone(b) ?? chiffresDe(b);
  return x !== "" && x === y;
}

export interface NumeroAffiche {
  numero: string;
  nature: NatureNumero;
  usage: UsageNumero;
  /** `fiche` : le numéro de la fiche du collaborateur ; `annuaire` : un numéro ajouté ici. */
  origine: "fiche" | "annuaire";
  id?: string;
}

/**
 * Ce qu'une personne a le droit de lire. Sans le droit de gérer, les
 * numéros personnels ne sortent jamais : ils sont retirés ICI, avant tout
 * affichage, plutôt que cachés par l'écran.
 */
export function numerosVisibles<T extends { usage: UsageNumero }>(numeros: readonly T[], peutVoirPersonnels: boolean): T[] {
  return numeros.filter((n) => peutVoirPersonnels || n.usage === "professionnel");
}

/**
 * L'adresse e-mail personnelle de la fiche (`employees.email`), nette, ou
 * `null` : sans le droit de tenir l'annuaire elle ne sort jamais — elle est
 * retirée ICI, comme les numéros personnels. Pas de contrôle de domaine : c'est
 * l'adresse privée du collaborateur, souvent un Gmail.
 */
export function emailPersonnelVisible(email: string | null | undefined, peutVoirPersonnels: boolean): string | null {
  if (!peutVoirPersonnels) return null;
  const propre = (email ?? "").trim().toLowerCase();
  return propre || null;
}

/**
 * Les numéros d'un collaborateur : ceux de l'annuaire, plus celui de sa
 * fiche s'il n'y figure pas déjà. Le numéro de la fiche est personnel
 * (c'est celui que le collaborateur a donné à l'embauche), tant que
 * l'annuaire ne le porte pas comme professionnel.
 */
export function fusionnerNumeros(annuaire: readonly NumeroAffiche[], numeroFiche: string | null | undefined): NumeroAffiche[] {
  const propre = (numeroFiche ?? "").trim();
  if (!propre || annuaire.some((n) => memeNumero(n.numero, propre))) return [...annuaire];
  const normalise = normaliserTelephone(propre);
  return [...annuaire, { numero: normalise ?? propre, nature: "mobile", usage: "personnel", origine: "fiche" }];
}

// -------------------------------------------------------------- affectation

export interface ServiceRef {
  id: string;
  libelle: string;
}

export interface CollaborateurRef {
  id: string;
  /** Le service tel que la fiche l'écrit en toutes lettres. */
  service: string | null;
}

/** Le collaborateur appartient-il au service ? La fiche garde le libellé, la comparaison l'ignore casse et espaces. */
export function appartientAuService(collaborateur: Pick<CollaborateurRef, "service">, service: Pick<ServiceRef, "libelle">): boolean {
  return !!collaborateur.service && cleService(collaborateur.service) === cleService(service.libelle);
}

/**
 * Motif de refus d'une affectation, ou null. Le service d'abord : une adresse
 * ne va à un collaborateur que parmi le personnel du service choisi.
 */
export function motifRefusAffectation(
  choix: { serviceId: string | null; employeeId: string | null },
  service: ServiceRef | undefined,
  collaborateur: CollaborateurRef | undefined,
): string | null {
  if (!choix.serviceId) return choix.employeeId ? "Choisissez d'abord le service, puis la personne qui en fait partie." : null;
  if (!service) return "Service introuvable.";
  if (!choix.employeeId) return null;
  if (!collaborateur) return "Collaborateur introuvable.";
  if (!appartientAuService(collaborateur, service)) return `Ce collaborateur ne fait pas partie du service « ${service.libelle} ».`;
  return null;
}

export type StatutAffectation = "libre" | "service" | "titulaire" | "a_revoir";

/**
 * Où en est l'adresse : libre (aucun service), au service, à un titulaire, ou
 * « à revoir » quand le titulaire a changé de service depuis l'affectation.
 */
export function statutAffectation(
  adresse: { serviceId: string | null; employeeId: string | null },
  service: ServiceRef | undefined,
  titulaire: CollaborateurRef | undefined,
): StatutAffectation {
  if (!adresse.serviceId) return "libre";
  if (!adresse.employeeId) return "service";
  return service && titulaire && appartientAuService(titulaire, service) ? "titulaire" : "a_revoir";
}

// --------------------------------------------------------------- recherche

/** Minuscules sans accents ni espaces superflus : « Kôné  » trouve « kone ». */
export function normaliserRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tous les mots de la requête se retrouvent dans le texte, dans n'importe quel ordre. */
export function correspond(texte: string, requete: string): boolean {
  const mots = normaliserRecherche(requete).split(" ").filter(Boolean);
  if (mots.length === 0) return true;
  const botte = normaliserRecherche(texte);
  return mots.every((m) => botte.includes(m));
}

export interface LigneAnnuaire {
  id: string;
  nom: string;
  matricule: string;
  poste: string;
  service: string | null;
  emails: string[];
  numeros: { numero: string }[];
  /** Adresse personnelle, présente seulement pour qui a le droit de la lire. */
  emailPersonnel?: string | null;
}

/** Le texte où chercher dans la ligne d'un collaborateur : ses numéros s'y lisent en chiffres seuls ET formatés. */
export function texteAnnuaire(l: LigneAnnuaire): string {
  const numeros = l.numeros.map((n) => `${n.numero} ${chiffresDe(n.numero)} ${formaterNumero(n.numero)}`);
  return [l.nom, l.matricule, l.poste, l.service ?? "", ...l.emails, l.emailPersonnel ?? "", ...numeros].join(" ");
}

/** Annuaire du personnel filtré par texte et par service (libellé). */
export function filtrerAnnuaire<T extends LigneAnnuaire>(lignes: readonly T[], filtre: { q?: string; service?: string | null }): T[] {
  return lignes.filter((l) => {
    if (filtre.service && (!l.service || cleService(l.service) !== cleService(filtre.service))) return false;
    const q = filtre.q ?? "";
    // Des chiffres seuls cherchent un NUMÉRO, d'un seul tenant : « 05 05 00 »
    // ne doit pas retrouver un matricule T0003 dont un chiffre rappelle « 00 ».
    if (rechercheDeNumero(q)) {
      const chiffres = chiffresDe(q);
      return l.numeros.some((n) => chiffresDe(n.numero).includes(chiffres));
    }
    return correspond(texteAnnuaire(l), q);
  });
}

/** Une requête faite de chiffres (et de « + », d'espaces, de points ou de tirets), assez longue pour désigner un numéro. */
export function rechercheDeNumero(q: string): boolean {
  return /^[\d\s+.-]+$/.test(q) && chiffresDe(q).length >= 3;
}

export interface LigneAdresse {
  id: string;
  adresse: string;
  libelle: string | null;
  actif: boolean;
  serviceId: string | null;
  serviceLibelle: string | null;
  employeeId: string | null;
  titulaire: string | null;
  statut: StatutAffectation;
}

export type FiltreEtat = "toutes" | "libres" | "service_seul" | "a_revoir" | "fermees";
export const LIBELLE_ETAT: Record<FiltreEtat, string> = {
  toutes: "Toutes",
  libres: "Sans service",
  service_seul: "Sans titulaire",
  a_revoir: "À revoir",
  fermees: "Fermées",
};
export const LISTE_ETATS = Object.keys(LIBELLE_ETAT) as FiltreEtat[];

export function etatValide(v: unknown): v is FiltreEtat {
  return typeof v === "string" && v in LIBELLE_ETAT;
}

/** Adresses filtrées par texte, par service et par état d'affectation. Les fermées ne figurent que sous « Fermées ». */
export function filtrerAdresses(
  lignes: readonly LigneAdresse[],
  filtre: { q?: string; serviceId?: string | null; etat?: FiltreEtat },
): LigneAdresse[] {
  const etat = filtre.etat ?? "toutes";
  return lignes.filter((l) => {
    if (etat === "fermees") return !l.actif;
    if (!l.actif) return false;
    if (filtre.serviceId && l.serviceId !== filtre.serviceId) return false;
    if (etat === "libres" && l.statut !== "libre") return false;
    if (etat === "service_seul" && l.statut !== "service") return false;
    if (etat === "a_revoir" && l.statut !== "a_revoir") return false;
    return correspond([l.adresse, l.libelle ?? "", l.serviceLibelle ?? "", l.titulaire ?? ""].join(" "), filtre.q ?? "");
  });
}

/** Les adresses rangées par service, dans l'ordre des services ; les libres en dernier. */
export function grouperParService<T extends { serviceId: string | null }>(lignes: readonly T[], services: readonly ServiceRef[]): { service: ServiceRef | null; lignes: T[] }[] {
  const groupes = services.map((service) => ({ service: service as ServiceRef | null, lignes: lignes.filter((l) => l.serviceId === service.id) })).filter((g) => g.lignes.length > 0);
  const libres = lignes.filter((l) => !l.serviceId || !services.some((s) => s.id === l.serviceId));
  return libres.length > 0 ? [...groupes, { service: null, lignes: libres }] : groupes;
}

/**
 * Collaborateurs dont la fiche porte une adresse professionnelle que
 * l'annuaire ne liste pas encore : ce que « Reprendre les fiches » ajoute.
 */
export function adressesAReprendre(
  fiches: readonly { employeeId: string; emailProfessionnel: string | null }[],
  existantes: readonly string[],
): { employeeId: string; adresse: string }[] {
  const connues = new Set(existantes.map((a) => a.toLowerCase()));
  const vues = new Set<string>();
  const reprises: { employeeId: string; adresse: string }[] = [];
  for (const f of fiches) {
    const v = adresseProValide(f.emailProfessionnel ?? "");
    if (!v.ok || connues.has(v.adresse) || vues.has(v.adresse)) continue;
    vues.add(v.adresse);
    reprises.push({ employeeId: f.employeeId, adresse: v.adresse });
  }
  return reprises;
}
