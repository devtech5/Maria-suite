"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { exigerEntreprise } from "@/lib/auth/dal";
import { exigerDroit, peut, refusDroit } from "@/lib/droits/garde";
import { violeContrainte } from "@/lib/erreurs-pg";
import { newId } from "@/lib/ids";
import { versQuantite } from "@/lib/quantite";

import {
  creerIntervenantDans,
  creerSalarieDans,
  enregistrerBonPaiementDans,
  enregistrerPointageDans,
} from "./creation";
import { ajouterPiecePour, changerPhotoPour, fichierDe } from "./dossier";
import { photoValide } from "./pieces";
import { posteRetenu } from "./postes";
import { postesActifs } from "./referentiel-postes";
import { employees, workers } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Un entier de francs saisi au clavier, espaces de milliers admis. */
const montant = z
  .string()
  .trim()
  .transform((valeur) => Number(valeur.replace(/[\s ]/g, "")))
  .pipe(z.number().int().min(0));

/** Une quantité saisie en unités humaines : « 1,5 » devient 1500 millièmes. */
const quantiteSaisie = z
  .string()
  .trim()
  .transform((valeur) => Number(valeur.replace(/[\s ]/g, "").replace(",", ".")))
  .pipe(z.number().positive("Indiquez une quantité supérieure à zéro."))
  .transform(versQuantite);

function texte(donnees: FormData, champ: string): string | undefined {
  const valeur = donnees.get(champ);
  if (typeof valeur !== "string") return undefined;
  const propre = valeur.trim();
  return propre === "" ? undefined : propre;
}

// ------------------------------------------------------------------ salariés

export interface EtatSalarie {
  erreur?: string;
  /** Matricule attribué au salarié embauché. */
  matricule?: string;
  /** Le salarié est embauché, mais une pièce jointe n'a pas suivi. */
  avertissement?: string;
}


const schemaSalarie = z.object({
  nom: z.string().trim().min(2, "Indiquez le nom du salarié."),
  poste: z.string().trim().min(2, "Indiquez le poste occupé."),
  contrat: z.enum(["cdi", "cdd", "stage", "essai"]),
  debut: z.string().regex(DATE_ISO, "Indiquez la date d'embauche."),
  fin: z.string().regex(DATE_ISO).optional(),
  salaireBase: montant,
  numeroCnps: z.string().trim().max(30).optional(),
  telephone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
});

export async function embaucherSalarie(
  _precedent: EtatSalarie,
  donnees: FormData,
): Promise<EtatSalarie> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return refus;

  const analyse = schemaSalarie.safeParse({
    nom: donnees.get("nom"),
    poste: donnees.get("poste"),
    contrat: donnees.get("contrat") ?? "cdi",
    debut: donnees.get("debut"),
    fin: texte(donnees, "fin"),
    salaireBase: String(donnees.get("salaireBase") ?? "0"),
    numeroCnps: texte(donnees, "numeroCnps"),
    telephone: texte(donnees, "telephone"),
    email: texte(donnees, "email"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  if (valeurs.contrat !== "cdi" && !valeurs.fin) {
    return { erreur: "Un contrat à durée déterminée porte un terme." };
  }

  // Le poste se choisit dans le référentiel : un texte libre qui n'y est pas
  // ferait reparaître la dispersion que la liste supprime.
  const poste = posteRetenu(valeurs.poste, await postesActifs(session.organizationId));
  if (!poste) return { erreur: "Choisissez le poste dans la liste. Un poste manquant s'ajoute dans l'onglet Postes." };

  let cree: { id: string; matricule: string };
  try {
    cree = await db.transaction((tx) =>
      creerSalarieDans(
        tx,
        session.organizationId,
        {
          nom: valeurs.nom,
          poste,
          contrat: valeurs.contrat,
          debut: valeurs.debut,
          fin: valeurs.fin ?? null,
          salaireBase: valeurs.salaireBase,
          numeroCnps: valeurs.numeroCnps ?? null,
          telephone: valeurs.telephone ?? null,
          email: valeurs.email ?? null,
        },
        session.userId,
      ),
    );
  } catch (erreur) {
    if (violeContrainte(erreur, "employees_matricule_unique")) return { erreur: "Ce matricule est déjà porté par un autre salarié." };
    if (erreur instanceof Error && !erreur.message.startsWith("Failed query")) return { erreur: erreur.message };
    console.error("Embauche refusée", erreur);
    return { erreur: "L'embauche n'a pas abouti. Réessayez." };
  }

  // Les pièces jointes à l'embauche suivent l'embauche, elles ne la
  // conditionnent pas : un CV refusé ne doit pas faire ressaisir le contrat.
  const avertissement = await joindreAEmbauche(session.organizationId, session.userId, cree.id, donnees);
  revalidatePath("/rh", "layout");
  return { matricule: cree.matricule, avertissement };
}

async function joindreAEmbauche(
  organizationId: string,
  userId: string,
  employeeId: string,
  donnees: FormData,
): Promise<string | undefined> {
  const photo = texte(donnees, "photo");
  const cv = await fichierDe(donnees, "cv");
  const lettre = await fichierDe(donnees, "lettre");
  if (!photo && !cv && !lettre) return undefined;
  if (!(await peut("personnes.dossier.gerer"))) {
    return "Salarié embauché, mais les pièces jointes n'ont pas été gardées : votre rôle ne permet pas de tenir les dossiers du personnel.";
  }

  const refus: string[] = [];
  if (photo) {
    if (photoValide(photo)) {
      await changerPhotoPour(organizationId, userId, employeeId, photo);
    } else {
      refus.push("photo illisible");
    }
  }
  for (const [nature, fichier] of [["cv", cv], ["lettre_motivation", lettre]] as const) {
    if (!fichier) continue;
    try {
      await ajouterPiecePour(organizationId, userId, employeeId, { nature }, fichier);
    } catch (erreur) {
      refus.push(erreur instanceof Error ? erreur.message : `${nature} refusé`);
    }
  }
  return refus.length > 0
    ? `Salarié embauché. À reprendre depuis sa fiche : ${refus.join(" ; ")}.`
    : undefined;
}

/**
 * Sort un salarié des effectifs. Sa fiche reste, ses bulletins aussi.
 *
 * Pas de suppression : un contrat de travail se conserve des années après le
 * départ, et l'effacer rendrait indéfendable toute déclaration passée.
 */
export async function sortirSalarie(donnees: FormData): Promise<void> {
  const session = await exigerDroit("personnes.salarie.gerer");
  const id = String(donnees.get("id") ?? "");

  const [sorti] = await db
    .update(employees)
    .set({
      actif: false,
      updatedAt: new Date(),
      version: sql`${employees.version} + 1`,
    })
    .where(
      and(
        eq(employees.id, id),
        eq(employees.organizationId, session.organizationId),
      ),
    )
    .returning({ id: employees.id, matricule: employees.matricule, nom: employees.nom });

  if (!sorti) return;

  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: session.organizationId,
    userId: session.userId,
    action: "salarie.sortir",
    entityType: "employe",
    entityId: sorti.id,
    after: { matricule: sorti.matricule, nom: sorti.nom, actif: false },
  });

  revalidatePath("/rh", "layout");
}

// -------------------------------------------------------------- intervenants

export interface EtatIntervenant {
  erreur?: string;
  /** Référence attribuée à l'intervenant créé. */
  code?: string;
}

const schemaIntervenant = z.object({
  nom: z.string().trim().min(2, "Indiquez le nom de l'intervenant."),
  qualification: z.string().trim().min(2, "Indiquez la qualification."),
  mode: z.enum(["journee", "tache", "unite", "forfait"]),
  taux: montant,
  uniteLibelle: z.string().trim().max(40).optional(),
  telephone: z.string().trim().max(30).optional(),
  telephonePaiement: z.string().trim().max(30).optional(),
  affectation: z.string().trim().max(80).optional(),
});

export async function creerIntervenant(
  _precedent: EtatIntervenant,
  donnees: FormData,
): Promise<EtatIntervenant> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("personnes.intervenant.gerer");
  if (refus) return refus;

  const analyse = schemaIntervenant.safeParse({
    nom: donnees.get("nom"),
    qualification: donnees.get("qualification"),
    mode: donnees.get("mode") ?? "journee",
    taux: String(donnees.get("taux") ?? "0"),
    uniteLibelle: texte(donnees, "uniteLibelle"),
    telephone: texte(donnees, "telephone"),
    telephonePaiement: texte(donnees, "telephonePaiement"),
    affectation: texte(donnees, "affectation"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  if (valeurs.taux <= 0) {
    return { erreur: "Indiquez le taux convenu : sans lui, aucun pointage ne chiffre." };
  }

  try {
    const { code } = await db.transaction((tx) =>
      creerIntervenantDans(
        tx,
        session.organizationId,
        {
          nom: valeurs.nom,
          qualification: valeurs.qualification,
          mode: valeurs.mode,
          taux: valeurs.taux,
          uniteLibelle: valeurs.uniteLibelle,
          telephone: valeurs.telephone ?? null,
          telephonePaiement: valeurs.telephonePaiement ?? null,
          affectation: valeurs.affectation ?? null,
        },
        session.userId,
      ),
    );

    revalidatePath("/rh", "layout");
    return { code };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}

/** Ferme un intervenant. Il quitte les listes de pointage, son compte reste. */
export async function fermerIntervenant(donnees: FormData): Promise<void> {
  const session = await exigerDroit("personnes.intervenant.gerer");
  const id = String(donnees.get("id") ?? "");

  const [ferme] = await db
    .update(workers)
    .set({
      actif: false,
      updatedAt: new Date(),
      version: sql`${workers.version} + 1`,
    })
    .where(
      and(eq(workers.id, id), eq(workers.organizationId, session.organizationId)),
    )
    .returning({ id: workers.id, code: workers.code, nom: workers.nom });

  if (!ferme) return;

  await db.insert(auditLogs).values({
    id: newId(),
    organizationId: session.organizationId,
    userId: session.userId,
    action: "intervenant.fermer",
    entityType: "intervenant",
    entityId: ferme.id,
    after: { code: ferme.code, nom: ferme.nom, actif: false },
  });

  revalidatePath("/rh", "layout");
}

// ----------------------------------------------------------------- pointages

export interface EtatPointage {
  erreur?: string;
  piece?: string;
  message?: string;
}

const schemaPointage = z.object({
  workerId: z.string().regex(UUID, "Choisissez un intervenant."),
  quantite: quantiteSaisie,
  /** La correction pointe en négatif : une erreur s'annule, elle ne se réécrit pas. */
  sens: z.enum(["pointer", "corriger"]),
  taux: montant.optional(),
  affectation: z.string().trim().max(80).optional(),
  motif: z.string().trim().max(200).optional(),
});

export async function enregistrerPointage(
  _precedent: EtatPointage,
  donnees: FormData,
): Promise<EtatPointage> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("personnes.pointage.saisir");
  if (refus) return refus;

  const analyse = schemaPointage.safeParse({
    workerId: texte(donnees, "workerId") ?? "",
    quantite: String(donnees.get("quantite") ?? "0"),
    sens: donnees.get("sens") ?? "pointer",
    taux: texte(donnees, "taux"),
    affectation: texte(donnees, "affectation"),
    motif: texte(donnees, "motif"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  if (valeurs.sens === "corriger" && !valeurs.motif) {
    // Une correction sans motif est une correction que personne ne saura
    // justifier devant l'intervenant, le soir de la paie.
    return { erreur: "Indiquez le motif de la correction." };
  }

  try {
    const { piece, montant: engage } = await db.transaction((tx) =>
      enregistrerPointageDans(
        tx,
        session.organizationId,
        {
          workerId: valeurs.workerId,
          quantite:
            valeurs.sens === "corriger" ? -valeurs.quantite : valeurs.quantite,
          taux: valeurs.taux ?? null,
          affectation: valeurs.affectation ?? null,
          motif: valeurs.motif ?? null,
        },
        session.userId,
      ),
    );

    revalidatePath("/rh", "layout");
    return {
      piece,
      message: `${engage >= 0 ? "+" : "−"}${Math.abs(engage)} F engagés.`,
    };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}

// ----------------------------------------------------------- bons de paiement

export interface EtatBonPaiement {
  erreur?: string;
  numero?: string;
  message?: string;
}

const schemaBonPaiement = z.object({
  workerId: z.string().regex(UUID, "Choisissez un intervenant."),
  montant,
  moyen: z.enum(["especes", "mobile_money", "banque", "carte"]),
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(200).optional(),
});

export async function reglerIntervenant(
  _precedent: EtatBonPaiement,
  donnees: FormData,
): Promise<EtatBonPaiement> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("personnes.paiement.regler");
  if (refus) return refus;

  const analyse = schemaBonPaiement.safeParse({
    workerId: texte(donnees, "workerId") ?? "",
    montant: String(donnees.get("montant") ?? "0"),
    moyen: donnees.get("moyen") ?? "especes",
    reference: texte(donnees, "reference"),
    notes: texte(donnees, "notes"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  if (valeurs.montant <= 0) {
    return { erreur: "Indiquez le montant versé." };
  }

  try {
    const { numero, ecriture } = await db.transaction((tx) =>
      enregistrerBonPaiementDans(
        tx,
        session.organizationId,
        {
          workerId: valeurs.workerId,
          montant: valeurs.montant,
          moyen: valeurs.moyen,
          reference: valeurs.reference ?? null,
          notes: valeurs.notes ?? null,
        },
        session.userId,
      ),
    );

    revalidatePath("/rh", "layout");
    revalidatePath("/comptabilite", "layout");
    return { numero, message: `Écriture ${ecriture}.` };
  } catch (erreur) {
    if (erreur instanceof Error) return { erreur: erreur.message };
    throw erreur;
  }
}
