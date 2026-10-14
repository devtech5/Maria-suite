import "server-only";

import { newId } from "@/lib/ids";
import { montantLigne, versQuantite } from "@/lib/quantite";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import {
  creerIntervenantDans,
  creerSalarieDans,
} from "@/modules/personnes/creation";
import { pointages, type ModeRemuneration, type TypeContrat } from "@/modules/personnes/schema";

/**
 * Amorçage du personnel de démonstration.
 *
 * Ces tableaux ont longtemps servi d'affichage : les écrans RH lisaient
 * directement le jeu en mémoire. Ils ne servent plus qu'à VERSER en base — les
 * salariés, les intervenants et leurs pointages traversent désormais les
 * contraintes, la numérotation et le journal d'audit, comme le ferait une
 * saisie réelle.
 *
 * Le barème social et le calcul du bulletin ont quitté ce fichier : ils vivent
 * dans `@/modules/personnes/paie`, où ils sont testés. Un moteur de paie n'a
 * rien à faire dans un jeu d'essai.
 */

// ------------------------------------------------------------------ salariés

export interface SalarieDemo {
  matricule: string;
  nom: string;
  poste: string;
  contrat: TypeContrat;
  /** Dates nues, format ISO. */
  debut: string;
  fin?: string;
  salaireBase: number;
  numeroCnps?: string;
}

export const SALARIES_DEMO: SalarieDemo[] = [
  { matricule: "MG-2303-001", nom: "Koffi Bernard", poste: "Gérant", contrat: "cdi", debut: "2023-03-01", salaireBase: 450_000, numeroCnps: "0123456789" },
  { matricule: "MG-2406-002", nom: "Amani Tatiana", poste: "Caissière", contrat: "cdi", debut: "2024-06-15", salaireBase: 180_000, numeroCnps: "0123456790" },
  { matricule: "MG-2602-003", nom: "Aya Danielle", poste: "Caissière", contrat: "cdd", debut: "2026-02-01", fin: "2026-08-31", salaireBase: 165_000, numeroCnps: "0123456791" },
  { matricule: "MG-2409-004", nom: "Sékou Diarra", poste: "Magasinier", contrat: "cdi", debut: "2024-09-10", salaireBase: 210_000, numeroCnps: "0123456792" },
  { matricule: "MG-2604-005", nom: "Konan Michel", poste: "Livreur", contrat: "cdd", debut: "2026-04-01", fin: "2026-09-30", salaireBase: 155_000, numeroCnps: "0123456793" },
  { matricule: "MG-2501-006", nom: "Traoré Fatou", poste: "Comptable", contrat: "cdi", debut: "2025-01-05", salaireBase: 320_000, numeroCnps: "0123456794" },
  // Sans numéro CNPS : l'absence est un cas réel, et l'écran doit la signaler
  // plutôt que de laisser une case vide qu'on ne remarque pas.
  { matricule: "MG-2607-007", nom: "Yao Prince", poste: "Stagiaire", contrat: "stage", debut: "2026-07-01", fin: "2026-09-30", salaireBase: 75_000 },
];

// -------------------------------------------------------------- intervenants

export interface IntervenantDemo {
  nom: string;
  qualification: string;
  telephone: string;
  mode: ModeRemuneration;
  /** Taux exprimé dans l'unité du mode : par jour, par tâche, par m². */
  taux: number;
  uniteLibelle: string;
  chantier: string;
  /** Quantité pointée sur la période, en unités humaines. */
  pointe: number;
}

export const INTERVENANTS_DEMO: IntervenantDemo[] = [
  { nom: "Ouattara Ibrahim", qualification: "Maçon", telephone: "+225 07 11 22 33 44", mode: "journee", taux: 8_000, uniteLibelle: "jour", chantier: "Villa Riviera 3", pointe: 18 },
  { nom: "Bamba Souleymane", qualification: "Maçon", telephone: "+225 05 66 77 88 99", mode: "unite", taux: 3_500, uniteLibelle: "m² enduit", chantier: "Villa Riviera 3", pointe: 62 },
  { nom: "Koné Salif", qualification: "Ferrailleur", telephone: "+225 01 44 55 66 77", mode: "journee", taux: 9_000, uniteLibelle: "jour", chantier: "Immeuble Cocody", pointe: 22 },
  { nom: "Diomandé Adama", qualification: "Manœuvre", telephone: "+225 07 88 99 00 11", mode: "journee", taux: 5_000, uniteLibelle: "jour", chantier: "Immeuble Cocody", pointe: 24 },
  { nom: "Coulibaly Yaya", qualification: "Coffreur", telephone: "+225 05 33 22 11 00", mode: "tache", taux: 45_000, uniteLibelle: "coffrage", chantier: "Villa Riviera 3", pointe: 3 },
  { nom: "N'Guessan Paul", qualification: "Peintre", telephone: "+225 01 77 66 55 44", mode: "unite", taux: 1_200, uniteLibelle: "m² peint", chantier: "Villa Riviera 3", pointe: 210 },
  { nom: "Touré Mamadou", qualification: "Chauffeur occasionnel", telephone: "+225 07 22 33 44 55", mode: "journee", taux: 12_000, uniteLibelle: "jour", chantier: "Livraisons Abidjan", pointe: 9 },
];

// ----------------------------------------------------------------- amorçage

export interface ResultatPersonnel {
  salaries: number;
  intervenants: number;
  pointages: number;
  /**
   * Identifiants créés, par nom. Le parc de démonstration en a besoin pour
   * affecter un fourgon à un chauffeur salarié et une bétonnière à un maçon —
   * sans quoi il faudrait relire la base juste après l'avoir écrite.
   */
  reperes: {
    employes: Map<string, string>;
    intervenants: Map<string, string>;
  };
}

/**
 * Verse le personnel de démonstration dans une entreprise.
 *
 * Les pointages sont insérés en BLOC, comme les mouvements de stock : chaque
 * intervenant reçoit une seule ligne portant tout ce qu'il a fait sur la
 * période. Passer par `enregistrerPointageDans` donnerait un numéro de bon par
 * ligne et autant d'allers-retours vers Abidjan, sans rien démontrer de plus.
 *
 * Les bons de paiement, eux, ne sont PAS amorcés : chacun pose une écriture
 * comptable, et sept écritures de charge injectées dans un exercice de
 * démonstration fausseraient le compte de résultat affiché par les états
 * financiers. Ce qui a été réglé se voit dans la démonstration à l'usage, en
 * émettant un vrai bon depuis l'écran.
 */
export async function amorcerPersonnel(
  tx: Transaction,
  organizationId: string,
  userId?: string,
): Promise<ResultatPersonnel> {
  const employes = new Map<string, string>();
  const intervenantsCrees = new Map<string, string>();

  for (const salarie of SALARIES_DEMO) {
    const { id } = await creerSalarieDans(
      tx,
      organizationId,
      {
        matricule: salarie.matricule,
        nom: salarie.nom,
        poste: salarie.poste,
        contrat: salarie.contrat,
        debut: salarie.debut,
        fin: salarie.fin ?? null,
        salaireBase: salarie.salaireBase,
        numeroCnps: salarie.numeroCnps ?? null,
      },
      userId,
    );

    employes.set(salarie.nom, id);
  }

  const lignes: (typeof pointages.$inferInsert)[] = [];

  for (const intervenant of INTERVENANTS_DEMO) {
    const { id } = await creerIntervenantDans(
      tx,
      organizationId,
      {
        nom: intervenant.nom,
        qualification: intervenant.qualification,
        telephone: intervenant.telephone,
        mode: intervenant.mode,
        taux: intervenant.taux,
        uniteLibelle: intervenant.uniteLibelle,
        affectation: intervenant.chantier,
      },
      userId,
    );

    intervenantsCrees.set(intervenant.nom, id);

    const quantite = versQuantite(intervenant.pointe);
    const piece = await prochainNumero(tx, organizationId, {
      cle: "pointage",
      prefix: "PT-",
      padding: 6,
    });

    lignes.push({
      id: newId(),
      organizationId,
      workerId: id,
      quantite,
      taux: intervenant.taux,
      mode: intervenant.mode,
      uniteLibelle: intervenant.uniteLibelle,
      // Même calcul que la saisie réelle, et non un produit écrit à la main :
      // un amorçage qui arrondit autrement que l'application produirait un
      // reste dû faux dès la première correction de pointage.
      montant: montantLigne(intervenant.taux, quantite),
      affectation: intervenant.chantier,
      piece,
      motif: "Pointage de période, jeu de démonstration",
      userId: userId ?? null,
    });
  }

  if (lignes.length > 0) await tx.insert(pointages).values(lignes);

  return {
    salaries: SALARIES_DEMO.length,
    intervenants: INTERVENANTS_DEMO.length,
    pointages: lignes.length,
    reperes: { employes, intervenants: intervenantsCrees },
  };
}
