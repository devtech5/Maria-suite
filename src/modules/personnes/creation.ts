import "server-only";

import { and, eq, like } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { ecritureBonPaiement, type MoyenBonPaiement } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { montantLigne } from "@/lib/quantite";
import { prochainNumero, prochainNumeroLibre, type Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";

import {
  bonsPaiement,
  employees,
  pointages,
  workers,
  type ModeRemuneration,
  type TypeContrat,
} from "./schema";
import { finEssai, formaterMatricule } from "./calcul";

/** Date nue d'un horodatage, pour la comptabilité. */
function isoDe(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ salariés

export interface NouveauSalarie {
  nom: string;
  poste: string;
  contrat?: TypeContrat;
  /** Dates nues, format ISO : 2026-03-01. */
  debut: string;
  fin?: string | null;
  salaireBase: number;
  numeroCnps?: string | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  notes?: string | null;
  /** Matricule imposé. Nul : attribué par le compteur. */
  matricule?: string | null;
}

/**
 * Embauche un salarié et lui attribue son matricule, dans une transaction.
 *
 * Le terme du contrat est NORMALISÉ avant l'insertion plutôt que laissé au
 * formulaire : un CDI saisi avec une date de fin oubliée dans le champ ferait
 * apparaître un contrat qui expire là où il n'y a aucune échéance.
 */
export async function creerSalarieDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauSalarie,
  userId?: string,
): Promise<{ id: string; matricule: string }> {
  const contrat = donnees.contrat ?? "cdi";
  // Une période d'essai sans terme saisi dure `MOIS_ESSAI` mois.
  const fin = contrat === "cdi" ? null : (donnees.fin ?? (contrat === "essai" ? finEssai(donnees.debut) : null));

  if (contrat !== "cdi" && !fin) {
    throw new Error("Un contrat à durée déterminée porte un terme.");
  }
  if (fin && fin < donnees.debut) {
    throw new Error("Le terme du contrat précède son début.");
  }

  const matricule = donnees.matricule?.trim() || (await matriculeLibre(tx, organizationId, donnees.debut));

  const id = newId();

  await tx.insert(employees).values({
    id,
    organizationId,
    matricule,
    nom: donnees.nom.trim(),
    poste: donnees.poste.trim(),
    contrat,
    debut: donnees.debut,
    fin,
    salaireBase: donnees.salaireBase,
    numeroCnps: donnees.numeroCnps ?? null,
    telephone: donnees.telephone ?? null,
    email: donnees.email ?? null,
    adresse: donnees.adresse ?? null,
    notes: donnees.notes ?? null,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "salarie.embaucher",
      entityType: "employe",
      entityId: id,
      after: { matricule, nom: donnees.nom, contrat, salaireBase: donnees.salaireBase },
    });
  }

  return { id, matricule };
}

/**
 * Prochain matricule libre : MG-2601-007, date d'entrée puis rang dans
 * l'effectif (`formaterMatricule`). Le rang vient du compteur `matricule`,
 * recalé sur l'effectif existant par la migration qui a renuméroté.
 *
 * Un matricule imposé — reprise, démonstration — ne fait pas avancer le
 * compteur : sans ce saut, l'embauche suivante recevrait un rang déjà porté.
 */
async function matriculeLibre(tx: Transaction, organizationId: string, debut: string): Promise<string> {
  const rang = await prochainNumeroLibre(tx, organizationId, { cle: "matricule", padding: 1 }, async (candidat) => {
    const [pris] = await tx
      .select({ id: employees.id })
      .from(employees)
      // Le rang est pris quel que soit le mois : MG-2501-007 interdit MG-2601-007.
      .where(and(eq(employees.organizationId, organizationId), like(employees.matricule, formaterMatricule(debut, Number(candidat)).replace(/-\d{4}-/, "-____-"))))
      .limit(1);
    return Boolean(pris);
  });
  return formaterMatricule(debut, Number(rang));
}

/**
 * Prochain code d'intervenant libre. Compteur distinct de celui des salariés :
 * mélanger les deux suites ferait sauter des matricules chez les uns au profit
 * des autres, et laisserait croire à des départs qui n'ont pas eu lieu.
 */
async function codeIntervenantLibre(tx: Transaction, organizationId: string): Promise<string> {
  return prochainNumeroLibre(tx, organizationId, { cle: "intervenant", prefix: "I", padding: 4 }, async (candidat) => {
    const [pris] = await tx
      .select({ id: workers.id })
      .from(workers)
      .where(and(eq(workers.organizationId, organizationId), eq(workers.code, candidat)))
      .limit(1);
    return Boolean(pris);
  });
}

/** Même chose, hors d'une transaction existante. */
export async function creerSalariePour(
  organizationId: string,
  donnees: NouveauSalarie,
  userId?: string,
): Promise<{ id: string; matricule: string }> {
  return db.transaction((tx) => creerSalarieDans(tx, organizationId, donnees, userId));
}

// -------------------------------------------------------------- intervenants

export interface NouvelIntervenant {
  nom: string;
  qualification: string;
  mode?: ModeRemuneration;
  taux: number;
  uniteLibelle?: string;
  telephone?: string | null;
  telephonePaiement?: string | null;
  affectation?: string | null;
  notes?: string | null;
  code?: string | null;
}

/** Unité par défaut du taux, déduite du mode de rémunération. */
const UNITE_PAR_MODE: Record<ModeRemuneration, string> = {
  journee: "jour",
  tache: "tâche",
  unite: "unité",
  forfait: "forfait",
};

export async function creerIntervenantDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelIntervenant,
  userId?: string,
): Promise<{ id: string; code: string }> {
  const mode = donnees.mode ?? "journee";

  const code = donnees.code?.trim() || (await codeIntervenantLibre(tx, organizationId));

  const id = newId();

  await tx.insert(workers).values({
    id,
    organizationId,
    code,
    nom: donnees.nom.trim(),
    qualification: donnees.qualification.trim(),
    mode,
    taux: donnees.taux,
    uniteLibelle: donnees.uniteLibelle?.trim() || UNITE_PAR_MODE[mode],
    telephone: donnees.telephone ?? null,
    telephonePaiement: donnees.telephonePaiement ?? null,
    affectation: donnees.affectation ?? null,
    notes: donnees.notes ?? null,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "intervenant.creer",
      entityType: "intervenant",
      entityId: id,
      after: { code, nom: donnees.nom, mode, taux: donnees.taux },
    });
  }

  return { id, code };
}

export async function creerIntervenantPour(
  organizationId: string,
  donnees: NouvelIntervenant,
  userId?: string,
): Promise<{ id: string; code: string }> {
  return db.transaction((tx) =>
    creerIntervenantDans(tx, organizationId, donnees, userId),
  );
}

// ----------------------------------------------------------------- pointages

export interface NouveauPointage {
  workerId: string;
  /** Quantité SIGNÉE, en millièmes : 18 jours = 18000. Négative pour corriger. */
  quantite: number;
  /** Taux imposé. Nul : celui de la fiche de l'intervenant. */
  taux?: number | null;
  affectation?: string | null;
  piece?: string | null;
  motif?: string | null;
  effectueLe?: Date;
}

/**
 * Enregistre un pointage, taux et montant figés sur la ligne.
 *
 * Le montant se calcule ICI, une seule fois, et se stocke. Le recalculer à
 * chaque affichage rejouerait l'arrondi de la division par mille à chaque
 * lecture : sur un chantier de quarante intervenants, l'écart entre l'écran du
 * chef d'équipe et celui du gérant se compterait en milliers de francs, sans
 * que personne ne sache lequel a raison.
 */
export async function enregistrerPointageDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauPointage,
  userId?: string,
): Promise<{ id: string; piece: string; montant: number }> {
  if (donnees.quantite === 0) {
    throw new Error("Un pointage à zéro ne constate rien.");
  }

  const [intervenant] = await tx
    .select({
      id: workers.id,
      nom: workers.nom,
      mode: workers.mode,
      taux: workers.taux,
      uniteLibelle: workers.uniteLibelle,
      affectation: workers.affectation,
      actif: workers.actif,
    })
    .from(workers)
    .where(
      and(
        eq(workers.id, donnees.workerId),
        eq(workers.organizationId, organizationId),
      ),
    );

  if (!intervenant) throw new Error("Intervenant introuvable.");
  if (!intervenant.actif) {
    throw new Error(`« ${intervenant.nom} » n'intervient plus : son pointage est fermé.`);
  }

  const taux = donnees.taux ?? intervenant.taux;
  if (taux < 0) throw new Error("Un taux négatif ne rémunère rien.");

  const piece =
    donnees.piece?.trim() ||
    (await prochainNumero(tx, organizationId, {
      cle: "pointage",
      prefix: "PT-",
      padding: 6,
    }));

  const montant = montantLigne(taux, donnees.quantite);
  const id = newId();

  await tx.insert(pointages).values({
    id,
    organizationId,
    workerId: intervenant.id,
    quantite: donnees.quantite,
    taux,
    mode: intervenant.mode,
    uniteLibelle: intervenant.uniteLibelle,
    montant,
    affectation: donnees.affectation ?? intervenant.affectation,
    piece,
    motif: donnees.motif ?? null,
    effectueLe: donnees.effectueLe ?? new Date(),
    userId: userId ?? null,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "pointage.saisir",
      entityType: "pointage",
      entityId: id,
      after: { piece, intervenant: intervenant.nom, quantite: donnees.quantite, montant },
    });
  }

  return { id, piece, montant };
}

export async function enregistrerPointagePour(
  organizationId: string,
  donnees: NouveauPointage,
  userId?: string,
): Promise<{ id: string; piece: string; montant: number }> {
  return db.transaction((tx) =>
    enregistrerPointageDans(tx, organizationId, donnees, userId),
  );
}

// ----------------------------------------------------------- bons de paiement

export interface NouveauBonPaiement {
  workerId: string;
  montant: number;
  moyen?: MoyenBonPaiement;
  reference?: string | null;
  notes?: string | null;
  payeLe?: Date;
}

/**
 * Verse un acompte ou un solde à un intervenant, et passe l'écriture.
 *
 * Le bon et son écriture vivent dans la MÊME transaction, comme le ticket et
 * la sienne : une coupure entre les deux laisserait de l'argent sorti du
 * tiroir sans charge en face, ou une charge sans décaissement.
 *
 * Rien n'empêche de payer plus que ce qui est pointé — une avance sur chantier
 * est courante, et la refuser obligerait à saisir un faux pointage pour la
 * régulariser. Le reste dû devient simplement négatif, et cela se voit.
 */
export async function enregistrerBonPaiementDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauBonPaiement,
  userId: string,
): Promise<{ id: string; numero: string; ecriture: string }> {
  if (donnees.montant <= 0) {
    throw new Error("Un bon de paiement sans montant n'a rien à verser.");
  }

  const [intervenant] = await tx
    .select({ id: workers.id, nom: workers.nom, code: workers.code })
    .from(workers)
    .where(
      and(
        eq(workers.id, donnees.workerId),
        eq(workers.organizationId, organizationId),
      ),
    );

  if (!intervenant) throw new Error("Intervenant introuvable.");

  const payeLe = donnees.payeLe ?? new Date();
  const moyen = donnees.moyen ?? "especes";

  const numero = await prochainNumero(tx, organizationId, {
    cle: "bon-paiement",
    prefix: "BP-",
    padding: 5,
  });

  const ecriture = ecritureBonPaiement({
    numero,
    date: isoDe(payeLe),
    intervenant: `${intervenant.code} ${intervenant.nom}`,
    montant: donnees.montant,
    moyen,
  });

  const id = newId();

  const numeroEcriture = await enregistrerEcritureDans(tx, ecriture, {
    organizationId,
    userId,
    origine: "bon_paiement",
    pieceId: id,
    exercice: String(payeLe.getFullYear()),
    dateIso: isoDe(payeLe),
  });

  await tx.insert(bonsPaiement).values({
    id,
    organizationId,
    numero,
    workerId: intervenant.id,
    montant: donnees.montant,
    moyen,
    reference: donnees.reference ?? null,
    ecritureNumero: numeroEcriture,
    payeLe,
    notes: donnees.notes ?? null,
    userId,
  });

  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "bon-paiement.regler",
    entityType: "bon_paiement",
    entityId: id,
    after: {
      numero,
      intervenant: intervenant.nom,
      montant: donnees.montant,
      moyen,
      ecriture: numeroEcriture,
    },
  });

  return { id, numero, ecriture: numeroEcriture };
}

export async function enregistrerBonPaiementPour(
  organizationId: string,
  donnees: NouveauBonPaiement,
  userId: string,
): Promise<{ id: string; numero: string; ecriture: string }> {
  return db.transaction((tx) =>
    enregistrerBonPaiementDans(tx, organizationId, donnees, userId),
  );
}
