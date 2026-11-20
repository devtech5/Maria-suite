"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { refusDroit } from "@/lib/droits/garde";
import { estDoublon } from "@/lib/erreurs-pg";
import { stockageConfigure, urlSignee } from "@/lib/stockage";

import {
  annulerCommandeDans,
  annulerFactureDans,
  creerCommandeDans,
  enregistrerFacturePour,
  envoyerCommandeDans,
  modifierCommandeDans,
  preparerReassort,
  recevoirDans,
  reglerDans,
} from "./creation";
import { facturesFournisseur } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

async function operer(droit: Droit, travail: (organizationId: string, userId: string) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail(session.organizationId, session.userId);
    if (r.ok) {
      revalidatePath("/achats", "layout");
      revalidatePath("/stock", "layout");
      revalidatePath("/commercial", "layout");
      revalidatePath("/tresorerie", "layout");
      revalidatePath("/comptabilite", "layout");
      revalidatePath("/");
    }
    return r;
  } catch (erreur) {
    if (estDoublon(erreur)) return { ok: false, message: "Cette facture du fournisseur est déjà enregistrée (même numéro)." };
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Achats : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

const ligne = z.object({
  articleId: z.string().regex(UUID).nullable().optional(),
  ligneCommandeId: z.string().regex(UUID).nullable().optional(),
  designation: z.string().trim().min(1, "Chaque ligne porte une désignation.").max(200),
  quantite: z.number().int().positive("Quantité invalide."),
  prixUnitaireHt: z.number().int().min(0, "Prix invalide."),
  tauxTva: z.number().int().min(0).max(10000),
  compteAchat: z.string().regex(/^6\d{1,5}$/, "Compte d'achat de classe 6 attendu."),
});

const schemaCommande = z.object({
  fournisseurId: z.string().regex(UUID, "Choisissez le fournisseur."),
  contactId: z.string().regex(UUID).nullable().optional(),
  depotId: z.string().regex(UUID).nullable().optional(),
  dateCommande: z.string().regex(DATE_ISO),
  livraisonPrevue: z.string().regex(DATE_ISO).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lignes: z.array(ligne).min(1, "Ajoutez au moins une ligne.").max(200),
});

export async function enregistrerCommande(commande: z.input<typeof schemaCommande>, id?: string | null): Promise<Resultat> {
  return operer("achats.commande.gerer", async (organizationId, userId) => {
    const analyse = schemaCommande.safeParse(commande);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    if (id) {
      if (!UUID.test(id)) return { ok: false, message: "Commande introuvable." };
      const { numero } = await db.transaction((tx) => modifierCommandeDans(tx, organizationId, id, analyse.data, userId));
      return { ok: true, message: `${numero} mise à jour.`, id };
    }
    const r = await db.transaction((tx) => creerCommandeDans(tx, organizationId, analyse.data, userId));
    return { ok: true, message: `Commande ${r.numero} préparée en brouillon.`, id: r.id };
  });
}

export async function envoyerCommande(id: string): Promise<Resultat> {
  return operer("achats.commande.gerer", async (organizationId, userId) => {
    if (!UUID.test(id)) return { ok: false, message: "Commande introuvable." };
    const { numero } = await db.transaction((tx) => envoyerCommandeDans(tx, organizationId, id, userId));
    return { ok: true, message: `${numero} envoyée : elle attend la livraison.` };
  });
}

export async function annulerCommande(id: string, motif: string): Promise<Resultat> {
  return operer("achats.commande.gerer", async (organizationId, userId) => {
    if (!UUID.test(id)) return { ok: false, message: "Commande introuvable." };
    if (motif.trim().length < 3) return { ok: false, message: "Indiquez le motif de l'annulation." };
    const { numero } = await db.transaction((tx) => annulerCommandeDans(tx, organizationId, id, motif.trim().slice(0, 300), userId));
    return { ok: true, message: `${numero} annulée.` };
  });
}

export async function preparerCommandesReassort(): Promise<Resultat> {
  return operer("achats.commande.gerer", async (organizationId, userId) => {
    const { commandes, sansFournisseur } = await preparerReassort(organizationId, userId);
    const note = sansFournisseur ? ` ${sansFournisseur} article${sansFournisseur > 1 ? "s" : ""} sous le seuil sans fournisseur attitré : à commander à la main.` : "";
    return commandes.length === 0
      ? { ok: true, message: `Aucune commande à préparer : rien sous le seuil, ou un brouillon existe déjà pour ce fournisseur.${note}` }
      : { ok: true, message: `${commandes.length} commande${commandes.length > 1 ? "s" : ""} préparée${commandes.length > 1 ? "s" : ""} en brouillon (${commandes.join(", ")}). Relisez-les avant de les envoyer.${note}` };
  });
}

const schemaReception = z.object({
  date: z.string().regex(DATE_ISO),
  depotId: z.string().regex(UUID).nullable().optional(),
  bordereau: z.string().max(80).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  quantites: z.record(z.string().regex(UUID), z.number().int().min(0)),
});

export async function recevoir(commandeId: string, reception: z.input<typeof schemaReception>): Promise<Resultat> {
  return operer("achats.reception.saisir", async (organizationId, userId) => {
    if (!UUID.test(commandeId)) return { ok: false, message: "Commande introuvable." };
    const analyse = schemaReception.safeParse(reception);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const { numero, statut } = await db.transaction((tx) => recevoirDans(tx, organizationId, commandeId, analyse.data, userId));
    return { ok: true, message: `Réception ${numero} enregistrée : le stock est entré.${statut === "recue" ? " Commande entièrement reçue." : " Il reste à recevoir."}` };
  });
}

const schemaFacture = z.object({
  fournisseurId: z.string().regex(UUID, "Choisissez le fournisseur."),
  commandeId: z.string().regex(UUID).nullable().optional(),
  referenceFournisseur: z.string().trim().min(1, "Indiquez le numéro de la facture du fournisseur.").max(80),
  dateFacture: z.string().regex(DATE_ISO, "Date de facture invalide."),
  echeance: z.string().regex(DATE_ISO, "Échéance invalide."),
  notes: z.string().max(1000).nullable().optional(),
  lignes: z.array(ligne).min(1, "Ajoutez au moins une ligne.").max(200),
});

const TYPES_JUSTIFICATIF = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

/** Facture fournisseur : les lignes arrivent en JSON, le justificatif en fichier. */
export async function enregistrerFacture(donnees: FormData): Promise<Resultat> {
  return operer("achats.facture.saisir", async (organizationId, userId) => {
    let brut: unknown;
    try {
      brut = JSON.parse(String(donnees.get("facture") ?? "{}"));
    } catch {
      return { ok: false, message: "Facture illisible." };
    }
    const analyse = schemaFacture.safeParse(brut);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

    const fichier = donnees.getAll("fichier").find((v): v is File => v instanceof File && v.size > 0);
    let justificatif = null;
    if (fichier) {
      if (!stockageConfigure()) return { ok: false, message: "Le dépôt de fichiers n'est pas configuré : enregistrez sans justificatif." };
      if (fichier.size > 10 * 1024 * 1024) return { ok: false, message: "Justificatif trop lourd : 10 Mo au plus." };
      if (!TYPES_JUSTIFICATIF.has(fichier.type)) return { ok: false, message: "Justificatif : photo ou PDF." };
      justificatif = { nom: fichier.name, typeMime: fichier.type, contenu: await fichier.arrayBuffer() };
    }
    const { numero, ecriture } = await enregistrerFacturePour(organizationId, analyse.data, justificatif, userId);
    return { ok: true, message: `Facture ${numero} enregistrée — écriture ${ecriture}. La dette est au compte du fournisseur.` };
  });
}

export async function annulerFacture(id: string, motif: string): Promise<Resultat> {
  return operer("achats.facture.saisir", async (organizationId, userId) => {
    if (!UUID.test(id)) return { ok: false, message: "Facture introuvable." };
    if (motif.trim().length < 3) return { ok: false, message: "Indiquez le motif de l'annulation." };
    const { numero } = await db.transaction((tx) => annulerFactureDans(tx, organizationId, id, motif.trim().slice(0, 300), userId));
    return { ok: true, message: `${numero} annulée : l'écriture est contrepassée.` };
  });
}

const schemaReglement = z.object({
  montant: z.number().int().positive("Indiquez le montant."),
  compteTresorerieId: z.string().regex(UUID, "Choisissez le compte qui paie."),
  date: z.string().regex(DATE_ISO),
  reference: z.string().max(80).nullable().optional(),
});

export async function regler(factureId: string, reglement: z.input<typeof schemaReglement>): Promise<Resultat> {
  return operer("achats.reglement.payer", async (organizationId, userId) => {
    if (!UUID.test(factureId)) return { ok: false, message: "Facture introuvable." };
    const analyse = schemaReglement.safeParse(reglement);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const { numero, reste } = await db.transaction((tx) => reglerDans(tx, organizationId, factureId, analyse.data, userId));
    return { ok: true, message: reste === 0 ? `Règlement ${numero} : facture soldée et lettrée.` : `Règlement ${numero} : reste ${reste.toLocaleString("fr-FR")} F à payer.` };
  });
}

export async function ouvrirJustificatifFacture(id: string): Promise<string | null> {
  const session = await exigerEntreprise();
  if (!UUID.test(id) || (await refusDroit("achats.consulter"))) return null;
  const [f] = await db
    .select({ chemin: facturesFournisseur.justificatifChemin })
    .from(facturesFournisseur)
    .where(and(eq(facturesFournisseur.id, id), eq(facturesFournisseur.organizationId, session.organizationId), isNull(facturesFournisseur.deletedAt)));
  return f?.chemin ? urlSignee(f.chemin) : null;
}
