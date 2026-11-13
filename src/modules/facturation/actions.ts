"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";
import type { Droit } from "@/lib/droits/catalogue";
import { tracer } from "@/lib/audit";
import { NATURES_TIERS } from "@/modules/tiers/natures";

import {
  annulerFactureDans,
  convertirDevisDans,
  deciderDevisDans,
  emettreDans,
  encaisserDans,
  enregistrerBrouillonDans,
  supprimerBrouillonDans,
} from "./creation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type Resultat =
  | { ok: true; id?: string; numero?: string; message?: string }
  | { ok: false; message: string };

function rafraichir() {
  revalidatePath("/commercial", "layout");
  revalidatePath("/stock", "layout");
  revalidatePath("/comptabilite", "layout");
  revalidatePath("/");
}

/**
 * Exécute une opération sur les pièces, droit vérifié et erreurs traduites.
 *
 * Les messages que nos fonctions lèvent sont écrits pour l'utilisateur (« Seul
 * un brouillon se modifie ») et remontent tels quels. Le reste — erreurs de
 * base, de réseau — reste au serveur : un message SQL livre la structure
 * interne et n'apprend rien à celui qui facture.
 */
async function operer(
  droit: Droit,
  travail: (organizationId: string, userId: string) => Promise<Resultat>,
): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };

  try {
    const resultat = await travail(session.organizationId, session.userId);
    if (resultat.ok) rafraichir();
    return resultat;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible =
      message && !message.startsWith("Failed query") && message.length < 200;
    if (!lisible) console.error("Opération sur pièce refusée", erreur);
    return {
      ok: false,
      message: lisible ? message : "L'opération n'a pas abouti. Réessayez.",
    };
  }
}

// ---------------------------------------------------------------- brouillon

const schemaBrouillon = z.object({
  id: z.string().regex(UUID).optional(),
  nature: z.enum(["devis", "facture"]),
  clientId: z.string().regex(UUID).nullable().optional(),
  // Un client qui n'existe pas encore : enregistré avec la pièce, son type précisé.
  nouveauClient: z
    .object({
      nom: z.string().trim().min(2, "Indiquez le nom du nouveau client.").max(160),
      nature: z.enum(NATURES_TIERS, "Précisez le type du nouveau client."),
      telephone: z.string().trim().max(40).nullable().optional(),
      email: z.union([z.email("Adresse e-mail invalide."), z.literal("")]).nullable().optional(),
    })
    .nullable()
    .optional(),
  projetId: z.string().regex(UUID).nullable().optional(),
  datePiece: z.string().regex(DATE_ISO, "Date invalide."),
  echeance: z.string().regex(DATE_ISO).nullable().optional(),
  depotId: z.string().regex(UUID).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  commercialId: z.string().regex(UUID).nullable().optional(),
  contactId: z.string().regex(UUID).nullable().optional(),
  lignes: z
    .array(
      z.object({
        articleId: z.string().regex(UUID).nullable(),
        designation: z.string().trim().min(1, "Chaque ligne a besoin d'une désignation.").max(200),
        quantite: z.number().int().positive("La quantité doit être positive."),
        prixUnitaireHt: z.number().int().min(0),
        remise: z.number().int().min(0).optional(),
      }),
    )
    .min(1, "Ajoutez au moins une ligne.")
    .max(200),
});

export type BrouillonEntrant = z.input<typeof schemaBrouillon>;

/** Une pièce a son client : un client du fichier, ou un nouveau décrit sur place. */
const aSonClient = (b: z.infer<typeof schemaBrouillon>) => Boolean(b.clientId || b.nouveauClient);

/** Crée ou met à jour un brouillon de devis ou de facture. */
export async function enregistrerBrouillon(brouillon: BrouillonEntrant): Promise<Resultat> {
  return operer("commercial.piece.gerer", async (organizationId, userId) => {
    const analyse = schemaBrouillon.safeParse(brouillon);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

    if (!aSonClient(analyse.data)) return { ok: false, message: "Choisissez un client, ou enregistrez-le sur place." };

    // Chaque ligne est un service : un nouveau se range au catalogue de lui-même.
    const { id } = await db.transaction((tx) =>
      enregistrerBrouillonDans(tx, organizationId, { ...analyse.data, creerServices: true }, userId),
    );
    await tracer({
      action: analyse.data.id ? "brouillon.modifier" : "brouillon.creer",
      entite: "piece_commerciale",
      entiteId: id,
      apres: { nature: analyse.data.nature, lignes: analyse.data.lignes.length },
    });
    return { ok: true, id, message: "Brouillon enregistré." };
  });
}

export async function supprimerBrouillon(pieceId: string): Promise<Resultat> {
  return operer("commercial.piece.gerer", async (organizationId) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce introuvable." };
    const fait = await db.transaction((tx) => supprimerBrouillonDans(tx, organizationId, pieceId));
    if (fait) await tracer({ action: "brouillon.supprimer", entite: "piece_commerciale", entiteId: pieceId });
    return fait
      ? { ok: true, message: "Brouillon supprimé." }
      : { ok: false, message: "Seul un brouillon se supprime." };
  });
}

// ------------------------------------------------------------------ émission

export async function emettrePiece(pieceId: string): Promise<Resultat> {
  return operer("commercial.piece.gerer", async (organizationId, userId) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce introuvable." };
    const { numero, ecriture } = await db.transaction((tx) =>
      emettreDans(tx, organizationId, pieceId, userId),
    );
    return {
      ok: true,
      numero,
      message: ecriture ? `${numero} émise, écriture ${ecriture} passée.` : `${numero} émis.`,
    };
  });
}

export async function deciderDevis(
  pieceId: string,
  decision: "acceptee" | "refusee",
): Promise<Resultat> {
  return operer("commercial.piece.gerer", async (organizationId, userId) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce introuvable." };
    const fait = await db.transaction((tx) =>
      deciderDevisDans(tx, organizationId, pieceId, decision, userId),
    );
    return fait
      ? { ok: true, message: decision === "acceptee" ? "Devis accepté." : "Devis refusé." }
      : { ok: false, message: "Seul un devis émis s'accepte ou se refuse." };
  });
}

export async function convertirDevis(pieceId: string): Promise<Resultat> {
  return operer("commercial.piece.gerer", async (organizationId, userId) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce introuvable." };
    const { id } = await db.transaction((tx) =>
      convertirDevisDans(tx, organizationId, pieceId, userId),
    );
    await tracer({ action: "devis.convertir", entite: "piece_commerciale", entiteId: pieceId, apres: { facture: id } });
    return { ok: true, id, message: "Facture préparée en brouillon : relisez-la puis émettez-la." };
  });
}

// ----------------------------------------------------------- annulation

export async function annulerFacture(pieceId: string, motif: string): Promise<Resultat> {
  return operer("commercial.piece.annuler", async (organizationId, userId) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce introuvable." };
    if (motif.trim().length < 3) return { ok: false, message: "Indiquez le motif de l'annulation." };
    const { avoir } = await db.transaction((tx) =>
      annulerFactureDans(tx, organizationId, pieceId, motif.trim(), userId),
    );
    await tracer({ action: "facture.annuler", entite: "piece_commerciale", entiteId: pieceId, apres: { avoir, motif: motif.trim() } });
    return { ok: true, numero: avoir, message: `Facture annulée par l'avoir ${avoir}.` };
  });
}

// ------------------------------------------------------------------ règlement

const schemaReglement = z.object({
  pieceId: z.string().regex(UUID),
  montant: z.number().int().positive("Le montant doit être positif."),
  moyen: z.enum(["especes", "mobile_money", "banque"]),
  date: z.string().regex(DATE_ISO, "Date invalide."),
  reference: z.string().trim().max(80).nullable().optional(),
  compteTresorerieId: z.string().regex(UUID).nullable().optional(),
});

export async function encaisserFacture(
  reglement: z.input<typeof schemaReglement>,
): Promise<Resultat> {
  return operer("commercial.reglement.encaisser", async (organizationId, userId) => {
    const analyse = schemaReglement.safeParse(reglement);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

    const { numero, reste } = await db.transaction((tx) =>
      encaisserDans(tx, organizationId, analyse.data, userId),
    );
    return {
      ok: true,
      numero,
      message: reste === 0 ? `Règlement ${numero} : facture soldée.` : `Règlement ${numero} enregistré.`,
    };
  });
}
