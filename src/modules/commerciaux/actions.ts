"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { refusDroit } from "@/lib/droits/garde";

import { enregistrerCommercialDans, payerCommissionDans, reporterEnPaieDans, validerCommissionDans } from "./creation";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;
const fr = (n: number) => n.toLocaleString("fr-FR");
const aujourdhui = () => new Date().toISOString().slice(0, 10);

async function operer(droit: Droit, travail: (organizationId: string, userId: string) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail(session.organizationId, session.userId);
    if (r.ok) {
      revalidatePath("/commercial", "layout");
      revalidatePath("/rh", "layout");
      revalidatePath("/tresorerie", "layout");
    }
    return r;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    if (/commerciaux_nom_unique/.test(message)) return { ok: false, message: "Un commercial porte déjà ce nom." };
    if (/commerciaux_user_unique/.test(message)) return { ok: false, message: "Cet utilisateur est déjà lié à un autre commercial." };
    if (/commerciaux_employe_unique/.test(message)) return { ok: false, message: "Ce salarié est déjà lié à un autre commercial." };
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Commissions : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

const schemaFiche = z.object({
  nom: z.string().trim().max(80).nullable().optional(),
  telephone: z.string().trim().max(40).nullable().optional(),
  userId: z.string().regex(UUID).nullable().optional(),
  employeeId: z.string().regex(UUID).nullable().optional(),
  base: z.enum(["ca_ht", "marge"]),
  tauxBp: z.number().int().min(0).max(10_000),
  paliers: z.array(z.object({ seuil: z.number().int().min(0), tauxBp: z.number().int().min(0).max(10_000) })).max(10).nullable().optional(),
  fixeMensuel: z.number().int().min(0),
  objectifMensuel: z.number().int().min(0),
  actif: z.boolean().optional(),
});

export async function enregistrerCommercial(id: string | null, fiche: z.input<typeof schemaFiche>): Promise<Resultat> {
  return operer("commercial.commission.gerer", async (organizationId, userId) => {
    if (id && !UUID.test(id)) return { ok: false, message: "Commercial introuvable." };
    const analyse = schemaFiche.safeParse(fiche);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const { employeeId, userId: compte, nom } = analyse.data;
    if (!employeeId && !compte && (nom ?? "").length < 2) return { ok: false, message: "Choisissez le salarié ou le compte, ou saisissez le nom." };
    const enregistre = await db.transaction((tx) => enregistrerCommercialDans(tx, organizationId, id, analyse.data, userId));
    return { ok: true, message: `${enregistre.nom} enregistré.` };
  });
}

export async function validerCommission(commercialId: string, mois: string): Promise<Resultat> {
  return operer("commercial.commission.gerer", async (organizationId, userId) => {
    if (!UUID.test(commercialId) || !MOIS.test(mois)) return { ok: false, message: "Demande invalide." };
    const r = await db.transaction((tx) => validerCommissionDans(tx, organizationId, commercialId, mois, aujourdhui(), userId));
    return { ok: true, message: `Commission de ${mois} validée : ${fr(r.total)} F.` };
  });
}

export async function payerCommission(commissionId: string, paiement: { compteTresorerieId: string; date: string }): Promise<Resultat> {
  return operer("commercial.commission.payer", async (organizationId, userId) => {
    if (!UUID.test(commissionId) || !UUID.test(paiement.compteTresorerieId) || !/^\d{4}-\d{2}-\d{2}$/.test(paiement.date)) return { ok: false, message: "Paiement invalide." };
    const r = await db.transaction((tx) => payerCommissionDans(tx, organizationId, commissionId, paiement, userId));
    return { ok: true, message: `Commission payée : ${fr(r.montant)} F, écriture ${r.ecriture}.` };
  });
}

export async function reporterEnPaie(commissionId: string, moisPaie: string): Promise<Resultat> {
  return operer("commercial.commission.payer", async (organizationId, userId) => {
    if (!UUID.test(commissionId) || !MOIS.test(moisPaie)) return { ok: false, message: "Demande invalide." };
    const r = await db.transaction((tx) => reporterEnPaieDans(tx, organizationId, commissionId, moisPaie, userId));
    return { ok: true, message: `Ajoutée aux primes de ${r.salarie} sur la paie de ${moisPaie} : net à payer ${fr(r.net)} F.` };
  });
}
