/**
 * Services de l'entreprise : l'organigramme dans lequel se rangent les postes
 * et les collaborateurs.
 *
 * Fichier sans base ni React : la liste de départ sert à l'installation, à la
 * migration 0070 et aux tests ; les règles de libellé au serveur comme au
 * formulaire.
 *
 * Le découpage suit l'organisation courante d'une société ivoirienne à
 * plusieurs activités : une direction générale, des fonctions support
 * communes à tous les métiers, puis un service par métier exercé —
 * communication, BTP (études, travaux, contrôle), immobilier, mines,
 * conception de projets et recherche de financement. Chaque poste de
 * départ appartient à un seul service.
 *
 * Le service reste écrit en toutes lettres sur la fiche du collaborateur
 * (`employees.service`), comme le poste : le référentiel décide de ce qu'on
 * peut y choisir, et un renommage s'y propage.
 */

import { clePoste, POSTES_DE_DEPART } from "./postes";

export const POLES = {
  direction: { libelle: "Direction", description: "Pilotage du groupe." },
  support: { libelle: "Fonctions support", description: "Communes à toutes les activités." },
  metiers: { libelle: "Métiers", description: "Un service par activité exercée." },
} as const;

export type Pole = keyof typeof POLES;
export const LISTE_POLES = Object.keys(POLES) as Pole[];

export interface ServiceDeDepart {
  /** Sigle court, imprimé sur les étiquettes et l'organigramme : DAF, BET. */
  code: string;
  libelle: string;
  pole: Pole;
  /** Ce dont le service répond, en une phrase. */
  mission: string;
  /** Postes de `POSTES_DE_DEPART` rattachés au service. */
  postes: readonly (typeof POSTES_DE_DEPART)[number][];
}

export const SERVICES_DE_DEPART: readonly ServiceDeDepart[] = [
  // ------------------------------------------------------------ direction
  {
    code: "DG",
    libelle: "Direction générale",
    pole: "direction",
    mission: "Stratégie du groupe, arbitrage entre les activités, représentation de la société.",
    postes: ["PDG", "Directeur(trice) général(e)", "Gérant(e)", "Assistant(e) de direction"],
  },

  // ------------------------------------------------------ fonctions support
  {
    code: "DAF",
    libelle: "Administration et finances",
    pole: "support",
    mission: "Comptabilité SYSCOHADA, trésorerie, fiscalité DGI, contrôle de gestion et caisse.",
    postes: ["Responsable administratif et financier", "Comptable", "Caissier(ère)"],
  },
  {
    code: "RH",
    libelle: "Ressources humaines",
    pole: "support",
    mission: "Recrutement, contrats, paie, CNPS, formation, discipline et règlement intérieur.",
    postes: ["Responsable des ressources humaines", "Chargé(e) des ressources humaines"],
  },
  {
    code: "JUR",
    libelle: "Juridique et conformité",
    pole: "support",
    mission: "Contrats, contentieux, droit foncier et minier, conformité réglementaire.",
    postes: ["Juriste"],
  },
  {
    code: "SAP",
    libelle: "Secrétariat, accueil et protocole",
    pole: "support",
    mission: "Accueil des visiteurs, standard, courrier entrant et sortant, protocole.",
    postes: ["Secrétaire", "Réceptionniste", "Assistant(e)", "Homme de main / Protocole"],
  },
  {
    code: "MGL",
    libelle: "Moyens généraux et logistique",
    pole: "support",
    mission: "Véhicules et chauffeurs, magasin, fournitures, entretien des locaux, gardiennage.",
    postes: ["Chauffeur-livreur", "Magasinier(ère)", "Agent d'entretien", "Ménagère", "Gardien"],
  },
  {
    code: "ACH",
    libelle: "Achats et approvisionnements",
    pole: "support",
    mission: "Consultation des fournisseurs, commandes, réceptions, approvisionnement des chantiers.",
    postes: ["Responsable des achats"],
  },
  {
    code: "DSI",
    libelle: "Informatique",
    pole: "support",
    mission: "Parc informatique, réseau, logiciels, messagerie et sécurité des données.",
    postes: ["Informaticien"],
  },
  {
    code: "QHSE",
    libelle: "Qualité, hygiène, sécurité et environnement",
    pole: "support",
    mission: "Sécurité des chantiers et des sites miniers, études d'impact, démarche qualité.",
    postes: ["Responsable QHSE"],
  },
  {
    code: "COM",
    libelle: "Commercial et développement",
    pole: "support",
    mission: "Prospection, relation client, offres commerciales, suivi des ventes et de l'après-vente.",
    postes: ["Responsable commercial(e)", "Commercial(e)", "Délégué(e) médical(e)", "Technicien(ne) biomédical(e)"],
  },

  // ---------------------------------------------------------------- métiers
  {
    code: "CEV",
    libelle: "Communication et événementiel",
    pole: "metiers",
    mission: "Stratégie de communication, création graphique, digital, audiovisuel, relations presse, événements.",
    postes: ["Chargé(e) de communication", "Graphiste", "Community manager"],
  },
  {
    code: "BET",
    libelle: "Bureau d'études et architecture",
    pole: "metiers",
    mission: "Conception des ouvrages : plans, études techniques, métrés, devis estimatifs, permis de construire.",
    postes: ["Architecte", "Ingénieur(e) génie civil", "Dessinateur(trice) projeteur(se)", "Métreur(se)"],
  },
  {
    code: "TRV",
    libelle: "Travaux et chantiers",
    pole: "metiers",
    mission: "Exécution des chantiers BTP : conduite des travaux, équipes, intervenants, matériaux et engins.",
    postes: ["Conducteur(trice) de travaux", "Chef de chantier", "Technicien BTP"],
  },
  {
    code: "CTL",
    libelle: "Suivi et contrôle des travaux",
    pole: "metiers",
    mission: "Contrôle des ouvrages, attachements, réceptions provisoire et définitive, missions de contrôle pour des maîtres d'ouvrage.",
    postes: ["Contrôleur(se) de travaux"],
  },
  {
    code: "IMM",
    libelle: "Immobilier et foncier",
    pole: "metiers",
    mission: "Promotion, lotissements, gestion locative, vente de biens et procédures foncières.",
    postes: ["Gestionnaire immobilier", "Géomètre-topographe"],
  },
  {
    code: "MIN",
    libelle: "Mines et géologie",
    pole: "metiers",
    mission: "Permis, prospection, géologie, exploitation minière et suivi environnemental des sites.",
    postes: ["Géologue", "Ingénieur(e) des mines"],
  },
  {
    code: "IPF",
    libelle: "Conception de projets et financement",
    pole: "metiers",
    mission: "Montage de projets, études de faisabilité, dossiers bailleurs et banques, levée de fonds, partenariats.",
    postes: ["Chef de projet", "Chargé(e) de recherche de financement", "Analyste financier(ère)"],
  },
];

export const LONGUEUR_MAX_SERVICE = 80;
export const LONGUEUR_MAX_CODE_SERVICE = 8;

/** Espaces de tête et de queue retirés, espaces multiples réduits à un seul. */
export function normaliserLibelleService(saisie: string): string {
  return saisie.replace(/\s+/g, " ").trim();
}

/** Clé de comparaison : « comptabilité » et « Comptabilité » désignent le même service. */
export function cleService(libelle: string): string {
  return normaliserLibelleService(libelle).toLocaleLowerCase("fr");
}

/** Sigle en majuscules, sans espace : « daf » → « DAF ». Vide si rien de lisible. */
export function normaliserCodeService(saisie: string): string {
  return saisie.replace(/[^\p{L}\p{N}-]/gu, "").toLocaleUpperCase("fr").slice(0, LONGUEUR_MAX_CODE_SERVICE);
}

/** Motif de refus d'un libellé, ou null s'il convient. */
export function motifRefusLibelleService(libelle: string, existants: readonly string[]): string | null {
  const propre = normaliserLibelleService(libelle);
  if (propre.length < 2) return "Indiquez le nom du service.";
  if (propre.length > LONGUEUR_MAX_SERVICE) return `Un nom de service tient en ${LONGUEUR_MAX_SERVICE} caractères.`;
  if (existants.some((e) => cleService(e) === cleService(propre))) return "Ce service existe déjà.";
  return null;
}

/** Le service de départ d'un poste, s'il en a un. */
export function serviceDuPoste(poste: string): ServiceDeDepart | undefined {
  const cle = clePoste(poste);
  return SERVICES_DE_DEPART.find((s) => s.postes.some((p) => clePoste(p) === cle));
}

/**
 * Services à proposer dans une liste de choix : les services actifs, dans
 * leur ordre, précédés du service que la fiche porte déjà s'il n'y figure
 * pas — un service retiré ou saisi à la main avant le référentiel reste
 * affiché plutôt que de disparaître au premier enregistrement.
 */
export function optionsService(actifs: readonly string[], actuel?: string | null): string[] {
  const propre = normaliserLibelleService(actuel ?? "");
  if (!propre || actifs.some((s) => cleService(s) === cleService(propre))) return [...actifs];
  return [propre, ...actifs];
}
