import "server-only";

import { type Transaction } from "@/lib/sequences";
import {
  creerActifDans,
  creerEcheanceDans,
  enregistrerInterventionDans,
} from "@/modules/actifs/creation";
import type {
  NatureEcheance,
  NatureIntervention,
  StatutActif,
  TypeActif,
} from "@/modules/actifs/schema";

/**
 * Amorçage du parc de démonstration.
 *
 * Un seul moteur porte cinq entrées du périmètre : parc informatique, parc
 * automobile, garage, gestion de flotte et patrimoine. Ce sont le même objet —
 * une chose affectée à quelqu'un, entretenue, avec des échéances et un coût
 * cumulé — et seuls le type et les échéances usuelles changent.
 *
 * Ce jeu ne s'affiche plus : il se VERSE en base. Le coût de maintenance et
 * les relevés de compteur n'y figurent donc pas en colonne — ils naissent des
 * interventions enregistrées plus bas, comme sur une entreprise réelle.
 */

export interface ActifDemo {
  code: string;
  designation: string;
  type: TypeActif;
  statut: StatutActif;
  /** Nom du collaborateur ou de l'intervenant à qui l'actif est confié. */
  affecteA?: string;
  site: string;
  dateAcquisition: string;
  valeurAcquisition: number;
  compteurInitial?: number;
  /** Nom du client, quand l'actif ne nous appartient pas — cas du garage. */
  proprietaire?: string;
}

/**
 * Date du relevé de départ, antérieure à toutes les interventions du jeu.
 *
 * Le laisser à « maintenant » masquerait les relevés pris lors des
 * interventions : le compteur courant est le plus RÉCENT, et un relevé initial
 * daté d'aujourd'hui ferait reculer la Hilux de 86 800 à 85 100 km — donc
 * repousser sa vidange de mille sept cents kilomètres.
 */
const RELEVE_INITIAL_LE = new Date("2026-07-01T08:00:00Z");

export const ACTIFS_DEMO: ActifDemo[] = [
  { code: "VEH-001", designation: "Toyota Hilux — 1234 AB 01", type: "vehicule", statut: "actif", affecteA: "Konan Michel", site: "Abidjan", dateAcquisition: "2023-03-12", valeurAcquisition: 18_500_000, compteurInitial: 85_100 },
  { code: "VEH-002", designation: "Renault Kangoo — 5678 CD 01", type: "vehicule", statut: "entretien", affecteA: "Touré Mamadou", site: "Abidjan", dateAcquisition: "2024-09-05", valeurAcquisition: 9_800_000, compteurInitial: 40_900 },
  { code: "VEH-003", designation: "Yamaha AG100 — 9012 EF 01", type: "vehicule", statut: "actif", affecteA: "Diomandé Adama", site: "Bouaké", dateAcquisition: "2025-01-20", valeurAcquisition: 1_350_000, compteurInitial: 18_900 },
  { code: "INF-001", designation: "HP ProBook 450 — caisse principale", type: "informatique", statut: "actif", affecteA: "Amani Tatiana", site: "Abidjan", dateAcquisition: "2024-06-14", valeurAcquisition: 685_000 },
  { code: "INF-002", designation: "Dell OptiPlex — comptabilité", type: "informatique", statut: "actif", affecteA: "Traoré Fatou", site: "Abidjan", dateAcquisition: "2025-01-05", valeurAcquisition: 540_000 },
  { code: "INF-003", designation: "Imprimante ticket Epson TM-T20", type: "informatique", statut: "immobilise", site: "Abidjan", dateAcquisition: "2024-06-14", valeurAcquisition: 185_000 },
  { code: "INF-004", designation: "Tablette Samsung Tab A9 — caisse 2", type: "informatique", statut: "actif", affecteA: "Aya Danielle", site: "Abidjan", dateAcquisition: "2026-02-02", valeurAcquisition: 210_000 },
  { code: "ENG-001", designation: "Bétonnière 350 L", type: "engin", statut: "actif", affecteA: "Ouattara Ibrahim", site: "Villa Riviera 3", dateAcquisition: "2025-07-18", valeurAcquisition: 1_150_000, compteurInitial: 1_180 },
  { code: "ENG-002", designation: "Groupe électrogène 15 kVA", type: "engin", statut: "entretien", site: "Immeuble Cocody", dateAcquisition: "2024-11-03", valeurAcquisition: 3_400_000, compteurInitial: 2_700 },
  { code: "MOB-001", designation: "Chambre froide 8 m³", type: "mobilier", statut: "actif", site: "Abidjan", dateAcquisition: "2023-05-22", valeurAcquisition: 4_200_000 },
];

export interface InterventionDemo {
  /** Code de l'actif concerné. */
  actif: string;
  nature: NatureIntervention;
  libelle: string;
  /** Date nue ISO. */
  date: string;
  prestataire: string;
  cout: number;
  compteur?: number;
}

export const INTERVENTIONS_DEMO: InterventionDemo[] = [
  { actif: "VEH-001", nature: "controle", libelle: "Visite technique annuelle", date: "2026-08-04", prestataire: "SICTA", cout: 35_000, compteur: 85_100 },
  { actif: "ENG-001", nature: "correctif", libelle: "Réparation moteur électrique", date: "2026-07-28", prestataire: "Atelier interne", cout: 94_000, compteur: 1_180 },
  { actif: "INF-003", nature: "correctif", libelle: "Tête d'impression HS", date: "2026-08-12", prestataire: "Ivoire Informatique", cout: 62_000 },
  { actif: "VEH-001", nature: "preventif", libelle: "Vidange et filtres", date: "2026-08-18", prestataire: "Garage Adjamé Auto", cout: 92_000, compteur: 86_800 },
  { actif: "ENG-002", nature: "preventif", libelle: "Vidange 250 h", date: "2026-08-23", prestataire: "Atelier interne", cout: 48_000, compteur: 2_870 },
  { actif: "VEH-002", nature: "correctif", libelle: "Remplacement embrayage", date: "2026-08-24", prestataire: "Garage Adjamé Auto", cout: 385_000, compteur: 41_200 },
];

export interface EcheanceDemo {
  actif: string;
  nature: NatureEcheance;
  libelle?: string;
  /** Date nue ISO. Absente quand l'échéance ne se déclenche qu'au compteur. */
  echeanceLe?: string;
  compteurCible?: number;
}

export const ECHEANCES_DEMO: EcheanceDemo[] = [
  { actif: "VEH-003", nature: "assurance", echeanceLe: "2026-08-31" },
  { actif: "VEH-003", nature: "visite", libelle: "Visite technique", echeanceLe: "2026-08-18" },
  { actif: "VEH-002", nature: "visite", libelle: "Visite technique", echeanceLe: "2026-09-12" },
  { actif: "VEH-001", nature: "assurance", echeanceLe: "2026-11-15" },
  { actif: "INF-004", nature: "garantie", libelle: "Garantie constructeur", echeanceLe: "2028-02-02" },
  // Purement au compteur : la vidange suivante ne dépend d'aucune date.
  { actif: "VEH-001", nature: "entretien", libelle: "Vidange", compteurCible: 90_000 },
  { actif: "ENG-002", nature: "entretien", libelle: "Vidange 250 h", compteurCible: 3_000 },
];

export interface ResultatParc {
  actifs: number;
  interventions: number;
  echeances: number;
  /**
   * Identifiants créés, par code. Les documents de démonstration s'y rattachent
   * — une carte grise vise VEH-001 — sans avoir à relire la base juste après
   * l'avoir écrite.
   */
  parCode: Map<string, string>;
}

/**
 * Verse le parc de démonstration dans une entreprise.
 *
 * `affectations` et `clients` associent un nom à un identifiant déjà en base :
 * l'amorçage du personnel et celui des tiers passent avant, et un actif confié
 * à quelqu'un qui n'existe pas resterait simplement non affecté plutôt que de
 * faire échouer toute l'installation.
 *
 * Les interventions passent par `enregistrerInterventionDans`, une par une, et
 * non par une insertion groupée : chacune produit son numéro, son relevé de
 * compteur, et c'est précisément ce chaînage qu'un jeu de démonstration doit
 * prouver. Elles sont peu nombreuses — le coût est sans commune mesure avec
 * les cinq cents mouvements de stock.
 */
export async function amorcerParc(
  tx: Transaction,
  organizationId: string,
  reperes: {
    employes: Map<string, string>;
    intervenants: Map<string, string>;
  },
  userId?: string,
): Promise<ResultatParc> {
  const parCode = new Map<string, string>();

  for (const actif of ACTIFS_DEMO) {
    const employeId = actif.affecteA ? reperes.employes.get(actif.affecteA) : undefined;
    const intervenantId =
      !employeId && actif.affecteA
        ? reperes.intervenants.get(actif.affecteA)
        : undefined;

    const { id } = await creerActifDans(
      tx,
      organizationId,
      {
        code: actif.code,
        designation: actif.designation,
        type: actif.type,
        statut: actif.statut,
        employeId: employeId ?? null,
        intervenantId: intervenantId ?? null,
        site: actif.site,
        dateAcquisition: actif.dateAcquisition,
        valeurAcquisition: actif.valeurAcquisition,
        compteurInitial: actif.compteurInitial ?? null,
        compteurInitialLe: RELEVE_INITIAL_LE,
      },
      userId,
    );

    parCode.set(actif.code, id);
  }

  // Dans l'ordre chronologique : le dernier relevé enregistré doit être le
  // plus récent, sinon le compteur courant repartirait en arrière.
  for (const intervention of INTERVENTIONS_DEMO) {
    const actifId = parCode.get(intervention.actif);
    if (!actifId) continue;

    await enregistrerInterventionDans(
      tx,
      organizationId,
      {
        actifId,
        nature: intervention.nature,
        libelle: intervention.libelle,
        prestataire: intervention.prestataire,
        cout: intervention.cout,
        compteur: intervention.compteur ?? null,
        // Midi UTC : minuit basculerait la veille dès que le serveur tourne à
        // l'ouest d'Abidjan.
        effectueeLe: new Date(`${intervention.date}T12:00:00Z`),
      },
      userId,
    );
  }

  let echeancesPosees = 0;

  for (const echeance of ECHEANCES_DEMO) {
    const actifId = parCode.get(echeance.actif);
    if (!actifId) continue;

    await creerEcheanceDans(
      tx,
      organizationId,
      {
        actifId,
        nature: echeance.nature,
        libelle: echeance.libelle ?? null,
        echeanceLe: echeance.echeanceLe ?? null,
        compteurCible: echeance.compteurCible ?? null,
      },
      userId,
    );
    echeancesPosees++;
  }

  return {
    actifs: parCode.size,
    interventions: INTERVENTIONS_DEMO.length,
    echeances: echeancesPosees,
    parCode,
  };
}
