"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { refusDroit } from "@/lib/droits/garde";
import { stockageConfigure, urlSignee } from "@/lib/stockage";

import {
  approuverDepenseDans,
  cloreDepenseDans,
  creerProjetDans,
  demanderDepenseDans,
  joindrePiece,
  modifierProjetDans,
  payerDepenseDans,
  retirerPiece,
  type FichierJoint,
} from "./creation";
import { piecesProjet } from "./schema";
import { notifierDetenteurs } from "@/modules/communication/notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

type Contexte = { organizationId: string; userId: string; estProprietaire: boolean };

async function operer(droit: Droit, travail: (ctx: Contexte) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };

  try {
    const resultat = await travail({
      organizationId: session.organizationId,
      userId: session.userId,
      estProprietaire: session.estProprietaire,
    });
    if (resultat.ok) {
      revalidatePath("/projets", "layout");
      revalidatePath("/comptabilite", "layout");
      revalidatePath("/");
    }
    return resultat;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Projets : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

const texte = (donnees: FormData, champ: string) => {
  const v = donnees.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
const montant = (v: string | undefined) => (v === undefined ? null : Number(v.replace(/[\s  ]/g, "")));
const id = (donnees: FormData, champ: string) => {
  const v = texte(donnees, champ);
  return v && UUID.test(v) ? v : null;
};

/** Plafond d'une pièce jointe : une photo de téléphone, un reçu scanné. */
const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES_ACCEPTES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

/** Au plus dix pièces par envoi : le recto, le verso, les captures d'un transfert en plusieurs fois. */
const NOMBRE_MAX = 10;

/**
 * Lit les fichiers joints au formulaire. Tous sont contrôlés AVANT le premier
 * dépôt : un lot refusé à mi-chemin laisserait des pièces orphelines de leur
 * explication.
 */
async function lireFichiers(donnees: FormData): Promise<FichierJoint[] | string> {
  const bruts = donnees.getAll("fichier").filter((v): v is File => v instanceof File && v.size > 0);
  if (bruts.length === 0) return [];
  if (!stockageConfigure()) return "Le dépôt de fichiers n'est pas configuré : la pièce ne peut pas être enregistrée.";
  if (bruts.length > NOMBRE_MAX) return `${NOMBRE_MAX} fichiers au plus par envoi.`;
  const total = bruts.reduce((s, f) => s + f.size, 0);
  // Une action serveur accepte 11 Mo en tout : au-delà, la requête n'arrive pas.
  if (total > TAILLE_MAX) return `Envoi trop lourd : ${Math.ceil(total / 1024 / 1024)} Mo pour 10 Mo au plus. Envoyez en plusieurs fois.`;
  for (const brut of bruts) {
    if (!TYPES_ACCEPTES.has(brut.type)) return `« ${brut.name} » : format non accepté (${brut.type || "inconnu"}), photo ou PDF.`;
  }
  return Promise.all(bruts.map(async (b) => ({ nom: b.name, typeMime: b.type, contenu: await b.arrayBuffer() })));
}

async function joindreTout(
  organizationId: string,
  cible: { projetId?: string | null; depenseId?: string | null },
  nature: "photo" | "preuve_paiement" | "facture" | "autre",
  fichiers: FichierJoint[],
  userId: string,
  legende?: string,
) {
  for (const fichier of fichiers) await joindrePiece(organizationId, cible, { nature, legende, fichier }, userId);
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// ------------------------------------------------------------------ projets

const schemaProjet = z.object({
  nom: z.string().trim().min(2, "Indiquez le nom du projet."),
  description: z.string().max(1000).optional(),
  budget: z.number().int().min(0).nullable(),
  prixVente: z.number().int().min(0).nullable(),
  debut: z.string().regex(DATE_ISO).optional(),
  fin: z.string().regex(DATE_ISO).optional(),
});

export async function creerProjet(donnees: FormData): Promise<Resultat> {
  return operer("projet.gerer", async ({ organizationId, userId }) => {
    const analyse = schemaProjet.safeParse({
      nom: donnees.get("nom"),
      description: texte(donnees, "description"),
      budget: montant(texte(donnees, "budget")),
      prixVente: montant(texte(donnees, "prixVente")),
      debut: texte(donnees, "debut"),
      fin: texte(donnees, "fin"),
    });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const { code } = await db.transaction((tx) =>
      creerProjetDans(
        tx,
        organizationId,
        { ...analyse.data, responsableUserId: id(donnees, "responsableUserId"), clientId: id(donnees, "clientId") },
        userId,
      ),
    );
    return { ok: true, message: `Projet ${code} créé.` };
  });
}

const schemaModification = z.object({
  responsableUserId: z.string().regex(UUID).nullable().optional(),
  statut: z.enum(["preparation", "en_cours", "suspendu", "termine", "annule"]).optional(),
  budget: z.number().int().min(0).nullable().optional(),
  prixVente: z.number().int().min(0).nullable().optional(),
  fin: z.string().regex(DATE_ISO).nullable().optional(),
});

export async function modifierProjet(projetId: string, modification: unknown): Promise<Resultat> {
  return operer("projet.gerer", async ({ organizationId, userId }) => {
    const analyse = schemaModification.safeParse(modification);
    if (!UUID.test(projetId) || !analyse.success) return { ok: false, message: "Modification invalide." };
    const { code } = await db.transaction((tx) => modifierProjetDans(tx, organizationId, projetId, analyse.data, userId));
    return { ok: true, message: `${code} mis à jour.` };
  });
}

// ----------------------------------------------------------------- dépenses

const schemaDepense = z.object({
  objet: z.string().trim().min(3, "Décrivez l'achat : quoi, pour quoi."),
  categorie: z.string().min(1),
  montant: z.number({ error: "Indiquez le montant." }).int().positive("Le montant doit être positif."),
  tauxTva: z.number().int().min(0).max(5000),
  fournisseurLibelle: z.string().max(120).optional(),
});

/**
 * Demande de dépense, avec en option la facture ou le devis du fournisseur.
 */
export async function demanderDepense(donnees: FormData): Promise<Resultat> {
  return operer("depense.demander", async ({ organizationId, userId }) => {
    const analyse = schemaDepense.safeParse({
      objet: donnees.get("objet"),
      categorie: donnees.get("categorie"),
      montant: montant(texte(donnees, "montant")) ?? undefined,
      tauxTva: donnees.get("avecTva") === "on" ? 1800 : 0,
      fournisseurLibelle: texte(donnees, "fournisseurLibelle"),
    });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const fichiers = await lireFichiers(donnees);
    if (typeof fichiers === "string") return { ok: false, message: fichiers };

    const { id: depenseId, numero } = await db.transaction((tx) =>
      demanderDepenseDans(
        tx,
        organizationId,
        { ...analyse.data, projetId: id(donnees, "projetId"), fournisseurId: id(donnees, "fournisseurId") },
        userId,
      ),
    );
    await joindreTout(organizationId, { depenseId }, "facture", fichiers, userId);
    await notifierDetenteurs(
      organizationId,
      "depense.approuver",
      { categorie: "depense", titre: `Dépense ${numero} à approuver`, corps: `${analyse.data.objet} — ${analyse.data.montant.toLocaleString("fr-FR")} FCFA`, lien: "/projets/depenses" },
      userId,
    );
    return {
      ok: true,
      message: `Demande ${numero} enregistrée${fichiers.length ? `, ${pluriel(fichiers.length, "pièce")} jointe${fichiers.length > 1 ? "s" : ""}` : ""} — en attente d'approbation.`,
    };
  });
}

export async function approuverDepense(depenseId: string, accepterDepassement = false): Promise<Resultat> {
  return operer("depense.approuver", async ({ organizationId, userId, estProprietaire }) => {
    if (!UUID.test(depenseId)) return { ok: false, message: "Dépense introuvable." };
    const { numero } = await db.transaction((tx) =>
      approuverDepenseDans(tx, organizationId, depenseId, { userId, estProprietaire }, accepterDepassement),
    );
    return { ok: true, message: `${numero} approuvée.` };
  });
}

export async function refuserDepense(depenseId: string, vers: string, motif: string): Promise<Resultat> {
  const cible = vers === "rejetee" ? "rejetee" : "annulee";
  return operer(cible === "rejetee" ? "depense.approuver" : "depense.demander", async ({ organizationId, userId }) => {
    if (!UUID.test(depenseId) || motif.trim().length < 3) return { ok: false, message: "Indiquez le motif." };
    const { numero } = await db.transaction((tx) => cloreDepenseDans(tx, organizationId, depenseId, cible, motif.trim(), userId));
    return { ok: true, message: `${numero} ${cible === "rejetee" ? "rejetée" : "annulée"}.` };
  });
}

/** Paiement, avec la preuve (reçu, capture du transfert) jointe dans le même geste. */
export async function payerDepense(donnees: FormData): Promise<Resultat> {
  return operer("depense.payer", async ({ organizationId, userId }) => {
    const depenseId = id(donnees, "depenseId");
    const moyen = z.enum(["especes", "mobile_money", "banque"]).safeParse(donnees.get("moyen"));
    if (!depenseId || !moyen.success) return { ok: false, message: "Choisissez le moyen de paiement." };
    const fichiers = await lireFichiers(donnees);
    if (typeof fichiers === "string") return { ok: false, message: fichiers };

    const { numero, ecriture } = await db.transaction((tx) =>
      payerDepenseDans(
        tx,
        organizationId,
        depenseId,
        { moyen: moyen.data, reference: texte(donnees, "reference"), compteTresorerieId: id(donnees, "compteTresorerieId") },
        userId,
      ),
    );
    await joindreTout(organizationId, { depenseId }, "preuve_paiement", fichiers, userId);
    return {
      ok: true,
      message: `${numero} payée (écriture ${ecriture})${
        fichiers.length ? `, ${pluriel(fichiers.length, "preuve")} jointe${fichiers.length > 1 ? "s" : ""}` : " — pensez à joindre la preuve de paiement"
      }.`,
    };
  });
}

// ------------------------------------------------------------------ pièces

/**
 * Ajoute une photo ou une preuve à un projet ou à une dépense. Joindre la
 * preuve d'une dépense est ouvert à tout le circuit ; enrichir un projet
 * revient à qui le gère.
 */
export async function ajouterPiece(donnees: FormData): Promise<Resultat> {
  return operer(id(donnees, "depenseId") ? "depense.demander" : "projet.gerer", async ({ organizationId, userId }) => {
    const nature = z.enum(["photo", "preuve_paiement", "facture", "autre"]).safeParse(donnees.get("nature"));
    if (!nature.success) return { ok: false, message: "Choisissez la nature de la pièce." };
    const fichiers = await lireFichiers(donnees);
    if (typeof fichiers === "string") return { ok: false, message: fichiers };
    if (fichiers.length === 0) return { ok: false, message: "Choisissez au moins un fichier." };

    await joindreTout(
      organizationId,
      { projetId: id(donnees, "projetId"), depenseId: id(donnees, "depenseId") },
      nature.data,
      fichiers,
      userId,
      texte(donnees, "legende"),
    );
    const mot = nature.data === "photo" ? "photo" : nature.data === "preuve_paiement" ? "preuve" : "pièce";
    return { ok: true, message: `${pluriel(fichiers.length, mot)} ajoutée${fichiers.length > 1 ? "s" : ""}.` };
  });
}

/**
 * URL signées des pièces que l'écran affiche, demandées par le navigateur
 * une fois la page montée. Jamais au rendu : posée dans le HTML, une adresse
 * signée resterait valable pour qui retrouve la page en cache.
 */
export async function signerPiecesProjet(ids: string[]): Promise<Record<string, string>> {
  const session = await exigerEntreprise();
  if (await refusDroit("projet.consulter")) return {};
  const valides = ids.filter((id) => UUID.test(id)).slice(0, 200);
  if (valides.length === 0) return {};
  const lignes = await db
    .select({ id: piecesProjet.id, chemin: piecesProjet.chemin })
    .from(piecesProjet)
    .where(and(eq(piecesProjet.organizationId, session.organizationId), inArray(piecesProjet.id, valides)));
  const signees = await Promise.all(lignes.map(async (l) => [l.id, await urlSignee(l.chemin)] as const));
  return Object.fromEntries(signees.filter((s): s is readonly [string, string] => s[1] !== null));
}

/** URL signée d'une seule pièce, demandée au clic par l'aperçu. */
export async function ouvrirPieceProjet(id: string): Promise<string | null> {
  return (await signerPiecesProjet([id]))[id] ?? null;
}

export async function supprimerPiece(pieceId: string): Promise<Resultat> {
  return operer("projet.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce introuvable." };
    await retirerPiece(organizationId, pieceId, userId);
    return { ok: true, message: "Pièce retirée." };
  });
}
