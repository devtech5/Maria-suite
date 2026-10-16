import type { Droit } from "@/lib/droits/catalogue";

/**
 * Fiches que l'on peut mettre en off, réactiver ou supprimer depuis leur écran.
 *
 * Un seul circuit pour toutes (`./geste.ts`) : droit vérifié, organisation
 * filtrée, version incrémentée, trace d'audit dans la même transaction. Une
 * fiche s'ajoute ici, pas dans une nouvelle action serveur.
 *
 * Supprimer est logique (`deleted_at`, répliqué) et réservé aux fiches que
 * rien n'utilise : la base dit elle-même qui pointe vers la ligne (clés
 * étrangères), et une fiche référencée se met en off. Une pièce engagée —
 * écriture, facture émise, règlement, bulletin — ne passe jamais par ici :
 * elle s'annule ou se contre-passe dans son module.
 *
 * Aucune dépendance serveur : l'écran lit ce registre pour savoir quels
 * gestes proposer.
 */

export interface Fille {
  table: string;
  /** Colonne qui pointe vers la fiche. */
  colonne: string;
  /** Clé de la ligne fille : `id`, ou la colonne elle-même pour une extension un pour un. */
  cle: string;
}

export interface DefinitionFiche {
  /** Table SQL. Porte `id`, `organization_id`, `version`, `updated_at`, `deleted_at`. */
  table: string;
  /** Colonne SQL du libellé, recopiée dans le journal. */
  libelle: string;
  /** « ce tiers », « ce véhicule » : pour les messages. */
  designation: string;
  /** Mettre en off et réactiver. */
  gerer: Droit;
  supprimer: Droit;
  /** La table porte `actif` : la fiche se met en off. Sinon, seule la suppression est proposée. */
  actif: boolean;
  /**
   * Extensions qui n'existent que par la fiche (contacts d'un tiers, fiche
   * véhicule d'un actif) : supprimées avec elle, et leurs propres usages
   * comptent comme ceux de la fiche.
   */
  filles?: readonly Fille[];
  /** Écrans à rafraîchir après le geste. */
  chemins: readonly string[];
}

export const FICHES = {
  tiers: {
    table: "tiers",
    libelle: "nom",
    designation: "ce tiers",
    gerer: "tiers.fiche.gerer",
    supprimer: "tiers.fiche.supprimer",
    actif: true,
    filles: [{ table: "contacts_tiers", colonne: "tiers_id", cle: "id" }],
    chemins: ["/commercial", "/achats", "/prestataires"],
  },
  commercial: {
    table: "commerciaux",
    libelle: "nom",
    designation: "ce commercial",
    gerer: "commercial.commission.gerer",
    supprimer: "tiers.fiche.supprimer",
    actif: true,
    chemins: ["/commercial"],
  },
  salarie: {
    table: "employees",
    libelle: "nom",
    designation: "ce salarié",
    gerer: "personnes.salarie.gerer",
    supprimer: "personnes.fiche.supprimer",
    // Pour un salarié, ne plus être actif, c'est sortir des effectifs : date de
    // fin, solde de tout compte. Ce circuit-là appartient au module.
    actif: false,
    chemins: ["/rh", "/presences", "/planning"],
  },
  intervenant: {
    table: "workers",
    libelle: "nom",
    designation: "cet intervenant",
    gerer: "personnes.intervenant.gerer",
    supprimer: "personnes.fiche.supprimer",
    actif: true,
    chemins: ["/rh"],
  },
  compte_tresorerie: {
    table: "comptes_tresorerie",
    libelle: "nom",
    designation: "ce compte",
    gerer: "tresorerie.compte.gerer",
    supprimer: "tresorerie.compte.supprimer",
    actif: true,
    chemins: ["/tresorerie"],
  },
  site_securite: {
    table: "sites_securite",
    libelle: "nom",
    designation: "ce site",
    gerer: "securite.gerer",
    supprimer: "securite.fiche.supprimer",
    actif: true,
    chemins: ["/securite"],
  },
  camera: {
    table: "cameras",
    libelle: "nom",
    designation: "cette caméra",
    gerer: "securite.gerer",
    supprimer: "securite.fiche.supprimer",
    actif: true,
    chemins: ["/securite"],
  },
  actif: {
    table: "actifs",
    libelle: "designation",
    designation: "cet actif",
    gerer: "actifs.fiche.gerer",
    supprimer: "actifs.fiche.supprimer",
    // Hors service, réformé : l'actif a son propre statut, tenu par son module.
    actif: false,
    filles: [
      { table: "vehicules", colonne: "actif_id", cle: "actif_id" },
      { table: "equipements_informatiques", colonne: "actif_id", cle: "actif_id" },
      // Posées d'office à la création (assurance, visite, kilométrage de départ) :
      // elles n'engagent rien. Pleins et interventions, eux, coûtent : ils bloquent.
      { table: "echeances", colonne: "actif_id", cle: "id" },
      { table: "releves_compteur", colonne: "actif_id", cle: "id" },
    ],
    chemins: ["/actifs", "/parc-auto", "/parc-informatique"],
  },
} as const satisfies Record<string, DefinitionFiche>;

export type TypeFiche = keyof typeof FICHES;

export type Geste = "desactiver" | "reactiver" | "supprimer";

export function estTypeFiche(type: string): type is TypeFiche {
  return Object.hasOwn(FICHES, type);
}

/** Droit qu'exige un geste sur une fiche. */
export function droitDuGeste(type: TypeFiche, geste: Geste): Droit {
  return geste === "supprimer" ? FICHES[type].supprimer : FICHES[type].gerer;
}
