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
import { DUREE_CONTRAT_MAX_MOIS, lienUrgenceConnu, nomComplet, termeApresDuree } from "./calcul";
import { postesRetenus } from "./postes";
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


const facultatif = (max: number) => z.string().trim().max(max).optional();

const schemaSalarie = z.object({
  civilite: z.enum(["M", "Mme", "Mlle"]).optional(),
  sexe: z.enum(["F", "M"]).optional(),
  nom: z.string().trim().min(2, "Indiquez le nom du salarié.").max(80),
  prenoms: facultatif(120),
  dateNaissance: z.string().regex(DATE_ISO, "Date de naissance invalide.").optional(),
  lieuNaissance: facultatif(120),
  nationalite: facultatif(80),
  situationFamiliale: z.enum(["celibataire", "marie", "divorce", "veuf", "union_libre"]).optional(),
  enfantsACharge: z.coerce.number().int().min(0, "Nombre d'enfants invalide.").max(30, "Nombre d'enfants invalide.").optional(),
  pieceNature: z.enum(["cni", "passeport"]).optional(),
  pieceNumero: facultatif(40),

  telephone: facultatif(30),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Adresse e-mail invalide.")
    .optional(),
  adresse: facultatif(200),
  contactUrgence: facultatif(200),
  contactUrgenceLien: z.string().refine(lienUrgenceConnu, "Lien avec le salarié inconnu.").optional(),
  contactUrgenceTelephone: facultatif(30),

  poste: z.string().trim().min(2, "Choisissez le poste occupé."),
  service: facultatif(120),
  contrat: z.enum(["cdi", "cdd", "stage", "essai"]),
  debut: z.string().regex(DATE_ISO, "Indiquez la date d'embauche."),
  dureeMois: z.coerce
    .number()
    .int("Une durée de contrat se compte en mois entiers.")
    .min(1, "Une durée de contrat compte au moins un mois.")
    .max(DUREE_CONTRAT_MAX_MOIS, `Une durée de contrat va jusqu'à ${DUREE_CONTRAT_MAX_MOIS} mois.`)
    .optional(),
  fin: z.string().regex(DATE_ISO, "Terme du contrat invalide.").optional(),
  numeroCnps: facultatif(30),

  salaireBase: montant,
  paiementSalaire: z.enum(["virement", "mobile_money", "especes", "cheque"]).optional(),
  coordonneesPaiement: facultatif(60),
  notes: facultatif(2000),
});

export async function embaucherSalarie(
  _precedent: EtatSalarie,
  donnees: FormData,
): Promise<EtatSalarie> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("personnes.salarie.gerer");
  if (refus) return refus;

  const champs = Object.keys(schemaSalarie.shape) as (keyof typeof schemaSalarie.shape)[];
  const analyse = schemaSalarie.safeParse({
    ...Object.fromEntries(champs.map((c) => [c, texte(donnees, c)])),
    contrat: texte(donnees, "contrat") ?? "cdi",
    salaireBase: String(donnees.get("salaireBase") ?? "0"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const valeurs = analyse.data;

  // Le terme d'un CDD se déduit de sa durée quand il n'a pas été saisi : la
  // durée sert au suivi, le terme à l'alerte d'échéance.
  const fin =
    valeurs.contrat === "cdi"
      ? undefined
      : (valeurs.fin ?? (valeurs.contrat === "cdd" && valeurs.dureeMois ? termeApresDuree(valeurs.debut, valeurs.dureeMois) : undefined));
  if (valeurs.contrat !== "cdi" && !fin) {
    return { erreur: "Un contrat à durée déterminée porte une durée ou un terme." };
  }

  // Les postes se choisissent dans le référentiel : un texte libre qui n'y
  // est pas ferait reparaître la dispersion que la liste supprime. Une
  // personne peut en occuper plusieurs ; le premier est le principal.
  const autres = donnees.getAll("postesAutres").filter((v): v is string => typeof v === "string");
  const choix = postesRetenus(valeurs.poste, autres, await postesActifs(session.organizationId));
  if (!choix.ok) return { erreur: "Choisissez les postes dans la liste. Un poste manquant s'ajoute dans l'onglet Postes." };
  const [poste, ...postesAutres] = choix.postes;

  let cree: { id: string; matricule: string };
  try {
    cree = await db.transaction((tx) =>
      creerSalarieDans(
        tx,
        session.organizationId,
        {
          nom: nomComplet(valeurs.nom, valeurs.prenoms),
          poste,
          postesAutres,
          contrat: valeurs.contrat,
          debut: valeurs.debut,
          fin: fin ?? null,
          salaireBase: valeurs.salaireBase,
          numeroCnps: valeurs.numeroCnps ?? null,
          telephone: valeurs.telephone ?? null,
          email: valeurs.email ?? null,
          adresse: valeurs.adresse ?? null,
          notes: valeurs.notes ?? null,
          civilite: valeurs.civilite ?? null,
          sexe: valeurs.sexe ?? null,
          dateNaissance: valeurs.dateNaissance ?? null,
          lieuNaissance: valeurs.lieuNaissance ?? null,
          nationalite: valeurs.nationalite ?? null,
          situationFamiliale: valeurs.situationFamiliale ?? null,
          enfantsACharge: valeurs.enfantsACharge ?? null,
          contactUrgence: valeurs.contactUrgence ?? null,
          contactUrgenceLien: valeurs.contactUrgenceLien ?? null,
          contactUrgenceTelephone: valeurs.contactUrgenceTelephone ?? null,
          service: valeurs.service ?? null,
          paiementSalaire: valeurs.paiementSalaire ?? null,
          coordonneesPaiement: valeurs.coordonneesPaiement ?? null,
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
  const avertissement = await joindreAEmbauche(session.organizationId, session.userId, cree.id, donnees, {
    contrat: valeurs.contrat,
    fin: fin ?? null,
  });
  revalidatePath("/rh", "layout");
  return { matricule: cree.matricule, avertissement };
}

const LIBELLE_CONTRAT_PIECE = {
  cdi: "Contrat à durée indéterminée",
  cdd: "Contrat à durée déterminée",
  stage: "Convention de stage",
  essai: "Contrat avec période d'essai",
} as const;

async function joindreAEmbauche(
  organizationId: string,
  userId: string,
  employeeId: string,
  donnees: FormData,
  contratSigne: { contrat: "cdi" | "cdd" | "stage" | "essai"; fin: string | null },
): Promise<string | undefined> {
  const photo = texte(donnees, "photo");
  const cv = await fichierDe(donnees, "cv");
  const lettre = await fichierDe(donnees, "lettre");
  const contrat = await fichierDe(donnees, "contrat");
  const pieceNumero = texte(donnees, "pieceNumero");
  const pieceNature = texte(donnees, "pieceNature") === "passeport" ? "passeport" : "cni";
  if (!photo && !cv && !lettre && !contrat && !pieceNumero) return undefined;
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
  // La pièce d'identité saisie à l'embauche entre au dossier par son numéro ;
  // le scan s'y joint ensuite depuis la fiche.
  if (pieceNumero) {
    try {
      await ajouterPiecePour(organizationId, userId, employeeId, { nature: pieceNature, numero: pieceNumero }, null);
    } catch (erreur) {
      refus.push(erreur instanceof Error ? erreur.message : "pièce d'identité refusée");
    }
  }
  // Le contrat signé, numérisé : son terme est celui du contrat saisi.
  if (contrat) {
    try {
      await ajouterPiecePour(
        organizationId,
        userId,
        employeeId,
        { nature: "contrat_travail", precision: LIBELLE_CONTRAT_PIECE[contratSigne.contrat], expireLe: contratSigne.fin },
        contrat,
      );
    } catch (erreur) {
      refus.push(erreur instanceof Error ? erreur.message : "contrat refusé");
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
