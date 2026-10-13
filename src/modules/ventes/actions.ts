"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { exigerDroit, messageRefus, peut, refusDroit } from "@/lib/droits/garde";
import { annulerVenteDans } from "./annulation";
import { creerPosteCaisseDans, enregistrerVenteDans } from "./creation";
import { postesCaisse } from "./schema";
import { estDoublon, violeContrainte } from "@/lib/erreurs-pg";
import { tracer } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ticket transmis par la caisse.
 *
 * Validé strictement, y compris quand il vient d'un appareil de confiance : une
 * file hors connexion peut avoir été rejouée, tronquée, ou trafiquée par
 * quiconque ouvre les outils de développement du navigateur.
 */
const schemaVente = z.object({
  id: z.string().regex(UUID),
  caisseId: z.string().regex(UUID),
  numeroSeq: z.number().int().positive(),
  clientId: z.string().regex(UUID).nullable().optional(),
  encaisseeLe: z.string().datetime().optional(),
  remisePied: z.number().int().min(0).optional(),
  especesRecues: z.number().int().min(0).optional(),
  deviceId: z.string().max(120).nullable().optional(),
  lignes: z
    .array(
      z.object({
        id: z.string().regex(UUID),
        articleId: z.string().regex(UUID).nullable(),
        parentLineId: z.string().regex(UUID).nullable().optional(),
        lineKind: z.enum(["article", "prestation", "frais"]).optional(),
        designation: z.string().trim().min(1).max(200),
        quantite: z.number().int().positive(),
        prixUnitaire: z.number().int().min(0),
        remise: z.number().int().min(0).optional(),
        workerId: z.string().regex(UUID).nullable().optional(),
        coutMainOeuvre: z.number().int().min(0).optional(),
      }),
    )
    .min(1, "Une vente sans ligne ne s'encaisse pas."),
  reglements: z
    .array(
      z.object({
        moyen: z.enum(["especes", "mobile_money", "carte", "banque", "credit"]),
        montant: z.number().int().positive(),
        reference: z.string().trim().max(80).nullable().optional(),
      }),
    )
    .min(1, "Un ticket sans règlement n'est pas encaissé."),
});

export type TicketEntrant = z.input<typeof schemaVente>;

export type ResultatEncaissement =
  | { ok: true; numero: string; totalTtc: number; deja: boolean }
  | { ok: false; message: string };

/**
 * Encaisse un ticket.
 *
 * Le même point d'entrée sert à la caisse en ligne et au rattrapage d'une file
 * hors connexion : c'est voulu. Deux chemins d'écriture différents divergeraient
 * — l'un finirait par oublier la sortie de stock ou l'écriture comptable, et
 * l'écart ne se verrait qu'à l'inventaire.
 */
export async function encaisserTicket(
  ticket: TicketEntrant,
): Promise<ResultatEncaissement> {
  // La caisse est exemptée du verrou d'inactivité, et la file hors connexion
  // rejoue ses tickets sans personne devant l'écran.
  const session = await exigerEntreprise({ malgreVerrou: true });

  if (!(await peut("pos.vente.encaisser"))) {
    return { ok: false, message: (await refusDroit("pos.vente.encaisser"))?.erreur ?? messageRefus("pos.vente.encaisser") };
  }

  const analyse = schemaVente.safeParse(ticket);
  if (!analyse.success) {
    return { ok: false, message: analyse.error.issues[0].message };
  }

  const valide = analyse.data;

  try {
    const resultat = await db.transaction((tx) =>
      enregistrerVenteDans(
        tx,
        session.organizationId,
        {
          ...valide,
          clientId: valide.clientId ?? null,
          encaisseeLe: valide.encaisseeLe ? new Date(valide.encaisseeLe) : undefined,
          lignes: valide.lignes,
          reglements: valide.reglements,
        },
        session.userId,
      ),
    );

    revalidatePath("/caisse");
    revalidatePath("/commercial/ventes");
    revalidatePath("/stock", "layout");
    revalidatePath("/comptabilite");
    revalidatePath("/");

    return {
      ok: true,
      numero: resultat.numero,
      totalTtc: resultat.totalTtc,
      deja: resultat.deja,
    };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);

    // Le rang est déjà pris sur ce poste : deux appareils se partagent une
    // caisse, ce que le modèle interdit. Le dire clairement plutôt que de
    // laisser une erreur de contrainte remonter telle quelle.
    if (violeContrainte(erreur, "ventes_numero_unique")) {
      return {
        ok: false,
        message:
          "Ce numéro de ticket existe déjà sur ce poste. Un poste de caisse " +
          "appartient à un seul appareil : recalez le compteur avant de reprendre.",
      };
    }

    if (
      message.includes("règlements totalisent") ||
      message.includes("part à crédit") ||
      message.includes("ne se stocke pas") ||
      message.includes("Écriture déséquilibrée")
    ) {
      return { ok: false, message };
    }

    // Le reste ne sort pas du serveur : un message de base de données livre la
    // structure interne à qui le lit, et n'apprend rien au caissier.
    console.error("Encaissement refusé", erreur);
    return {
      ok: false,
      message: "L'encaissement a échoué. Le ticket reste en attente d'envoi.",
    };
  }
}

/**
 * Annule un ticket.
 *
 * Le ticket reste, son statut change : une vente encaissée puis annulée est un
 * fait, et l'effacer priverait la caisse de son explication au comptage du soir.
 *
 * L'avoir est posé dans la même transaction : le stock revient au dépôt et
 * l'écriture est contrepassée. Annuler sans reprendre l'un ni l'autre laisserait
 * la marchandise sortie et le chiffre d'affaires compté.
 */
export async function annulerTicket(donnees: FormData): Promise<void> {
  const session = await exigerDroit("pos.vente.annuler");
  const id = String(donnees.get("id") ?? "");
  const motif = String(donnees.get("motif") ?? "").trim();

  if (!UUID.test(id) || motif.length < 3) return;

  const annulee = await db.transaction((tx) =>
    annulerVenteDans(tx, session.organizationId, id, motif, session.userId),
  );

  if (!annulee) return;

  revalidatePath("/caisse");
  revalidatePath("/commercial/ventes");
  revalidatePath("/stock", "layout");
  revalidatePath("/comptabilite");
  revalidatePath("/");
}

// ------------------------------------------------------------------ postes

export interface EtatPoste {
  erreur?: string;
  cree?: string;
}

const schemaPoste = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Indiquez un code de poste.")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "Le code ne prend que des lettres, chiffres et tirets."),
  nom: z.string().trim().min(2, "Indiquez le nom du poste."),
  depotId: z.string().regex(UUID, "Choisissez le dépôt qui fournit ce poste."),
});

export async function creerPosteCaisse(
  _precedent: EtatPoste,
  donnees: FormData,
): Promise<EtatPoste> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("pos.poste.gerer");
  if (refus) return refus;

  const analyse = schemaPoste.safeParse({
    code: donnees.get("code"),
    nom: donnees.get("nom"),
    depotId: donnees.get("depotId"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  try {
    const { code } = await db.transaction((tx) =>
      creerPosteCaisseDans(
        tx,
        session.organizationId,
        { ...analyse.data, prefixe: `${analyse.data.code.toUpperCase()}-` },
        session.userId,
      ),
    );

    await tracer({ action: "poste.creer", entite: "poste_caisse", apres: { code, nom: analyse.data.nom } });
    revalidatePath("/caisse");
    return { cree: code };
  } catch (erreur) {
    if (estDoublon(erreur)) {
      return { erreur: "Ce code de poste est déjà utilisé." };
    }
    throw erreur;
  }
}

/**
 * Rattache le poste à l'appareil qui l'utilise.
 *
 * Sans ce rattachement, un appareil réinstallé pourrait reprendre le compteur
 * d'un poste déjà tenu ailleurs et produire des doublons. L'écriture est
 * volontairement permissive — elle ne vole pas un poste déjà attribué.
 */
export async function rattacherPoste(
  posteId: string,
  deviceId: string,
): Promise<void> {
  const session = await exigerDroit("pos.poste.gerer");
  if (!UUID.test(posteId) || deviceId.length === 0) return;

  await db
    .update(postesCaisse)
    .set({ deviceId, updatedAt: new Date(), version: sql`${postesCaisse.version} + 1` })
    .where(
      and(
        eq(postesCaisse.id, posteId),
        eq(postesCaisse.organizationId, session.organizationId),
        eq(postesCaisse.numerotation, "appareil"),
        sql`${postesCaisse.deviceId} is null or ${postesCaisse.deviceId} = ${deviceId}`,
      ),
    );
  await tracer({ action: "poste.rattacher", entite: "poste_caisse", entiteId: posteId, apres: { appareil: deviceId.slice(0, 12) } });
}
