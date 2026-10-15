"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { refusDroit } from "@/lib/droits/garde";

import { libelleMois, moisValide } from "./calcul";
import {
  baremeDe,
  contexteAbsences,
  enregistrerBaremeDans,
  modifierElementsDans,
  payerSalairesDans,
  preparerPeriodeDans,
  proposerRappel,
  retirerBulletinDans,
  validerPeriodeDans,
  verserDans,
} from "./creation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

async function operer(droit: Droit, travail: (organizationId: string, userId: string) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail(session.organizationId, session.userId);
    if (r.ok) {
      revalidatePath("/rh", "layout");
      revalidatePath("/tresorerie", "layout");
      revalidatePath("/comptabilite", "layout");
      revalidatePath("/");
    }
    return r;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Paie : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

const fr = (n: number) => n.toLocaleString("fr-FR");

const schemaBareme = z.object({
  cnpsRetraiteSalarieBp: z.number().int(),
  cnpsRetraitePatronalBp: z.number().int(),
  cnpsPlafondMensuel: z.number().int(),
  prestationsFamilialesBp: z.number().int(),
  accidentTravailBp: z.number().int(),
  tranchesImpot: z.array(z.object({ seuil: z.number().int(), tauxBp: z.number().int() })).max(12),
});

export async function enregistrerBareme(bareme: z.input<typeof schemaBareme>, atteste: boolean): Promise<Resultat> {
  return operer("personnes.paie.valider", async (organizationId, userId) => {
    const analyse = schemaBareme.safeParse(bareme);
    if (!analyse.success) return { ok: false, message: "Barème illisible." };
    await db.transaction((tx) => enregistrerBaremeDans(tx, organizationId, analyse.data, atteste, userId));
    return {
      ok: true,
      message: atteste
        ? "Barème enregistré et attesté vérifié : la paie peut être validée."
        : "Barème enregistré, non attesté : aucune paie ne peut être validée tant qu'il n'est pas vérifié.",
    };
  });
}

export async function preparerPaie(mois: string): Promise<Resultat> {
  return operer("personnes.paie.preparer", async (organizationId, userId) => {
    if (!moisValide(mois)) return { ok: false, message: "Mois invalide." };
    const [{ bareme }, absences] = await Promise.all([baremeDe(organizationId), contexteAbsences(organizationId, mois)]);
    const r = await db.transaction((tx) => preparerPeriodeDans(tx, organizationId, mois, bareme, absences, userId));
    return { ok: true, message: `Paie de ${libelleMois(mois)} préparée : ${r.bulletins} bulletin${r.bulletins > 1 ? "s" : ""} calculé${r.bulletins > 1 ? "s" : ""}.` };
  });
}

const montant = z.number().int().min(0);
const schemaElements = z.object({
  primesImposables: montant,
  indemnitesNonImposables: montant,
  retenuesDiverses: montant,
  /** Centièmes de jour, par demi-journée. */
  joursAbsenceSaisis: z.number().int().min(0).max(3_100).multipleOf(50),
  rappel: z.number().int().min(-100_000_000).max(100_000_000),
  rappelLibelle: z.string().trim().max(160).nullable(),
});

export async function modifierElements(bulletinId: string, elements: z.input<typeof schemaElements>): Promise<Resultat> {
  return operer("personnes.paie.preparer", async (organizationId, userId) => {
    if (!UUID.test(bulletinId)) return { ok: false, message: "Bulletin introuvable." };
    const analyse = schemaElements.safeParse(elements);
    if (!analyse.success) return { ok: false, message: "Montants en francs entiers, positifs ; absences en jours ou demi-journées." };
    const { bareme } = await baremeDe(organizationId);
    const r = await db.transaction((tx) => modifierElementsDans(tx, organizationId, bulletinId, analyse.data, bareme, userId));
    return { ok: true, message: `${r.nom} : net à payer ${fr(r.net)} F.` };
  });
}

export type PropositionRappel = { ok: true; montant: number; mois: string[]; libelle: string; message: string } | { ok: false; message: string };

/** Chiffre un rappel après augmentation rétroactive, sans rien enregistrer. */
export async function calculerRappel(bulletinId: string, depuis: string, nouveauSalaire: number): Promise<PropositionRappel> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("personnes.paie.preparer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(bulletinId) || !moisValide(depuis)) return { ok: false, message: "Choisissez le mois d'effet de l'augmentation." };
  if (!Number.isInteger(nouveauSalaire) || nouveauSalaire < 0) return { ok: false, message: "Nouveau salaire en francs entiers." };
  try {
    const r = await proposerRappel(session.organizationId, bulletinId, depuis, nouveauSalaire);
    if (r.mois.length === 0) return { ok: false, message: "Aucun mois validé à rattraper depuis cette date : rien à rappeler." };
    return { ok: true, ...r, message: `${r.mois.length} mois rattrapé${r.mois.length > 1 ? "s" : ""} : ${r.montant >= 0 ? "" : "trop-perçu de "}${fr(Math.abs(r.montant))} F.` };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error && erreur.message.length < 240 ? erreur.message : "Le calcul n'a pas abouti." };
  }
}

export async function retirerBulletin(bulletinId: string): Promise<Resultat> {
  return operer("personnes.paie.preparer", async (organizationId, userId) => {
    if (!UUID.test(bulletinId)) return { ok: false, message: "Bulletin introuvable." };
    const r = await db.transaction((tx) => retirerBulletinDans(tx, organizationId, bulletinId, userId));
    return { ok: true, message: `${r.nom} retiré de la paie du mois.` };
  });
}

export async function validerPaie(periodeId: string): Promise<Resultat> {
  return operer("personnes.paie.valider", async (organizationId, userId) => {
    if (!UUID.test(periodeId)) return { ok: false, message: "Période introuvable." };
    const { bareme, verifie } = await baremeDe(organizationId);
    if (!verifie) {
      return { ok: false, message: "Le barème de paie n'est pas attesté vérifié. Contrôlez les taux CNPS et l'impôt sur salaire, puis attestez-les dans « Barème »." };
    }
    const r = await db.transaction((tx) => validerPeriodeDans(tx, organizationId, periodeId, bareme, userId));
    return { ok: true, message: `Paie de ${libelleMois(r.mois)} validée : ${r.bulletins} bulletin${r.bulletins > 1 ? "s" : ""} émis, écriture ${r.ecriture}.` };
  });
}

const schemaPaiement = z.object({
  compteTresorerieId: z.string().regex(UUID, "Choisissez le compte qui paie."),
  date: z.string().regex(DATE_ISO),
  bulletinIds: z.array(z.string().regex(UUID)).nullable().optional(),
});

export async function payerSalaires(periodeId: string, paiement: z.input<typeof schemaPaiement>): Promise<Resultat> {
  return operer("personnes.paie.payer", async (organizationId, userId) => {
    if (!UUID.test(periodeId)) return { ok: false, message: "Période introuvable." };
    const analyse = schemaPaiement.safeParse(paiement);
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const r = await db.transaction((tx) => payerSalairesDans(tx, organizationId, periodeId, analyse.data, userId));
    return { ok: true, message: `${r.payes} salaire${r.payes > 1 ? "s" : ""} payé${r.payes > 1 ? "s" : ""} : ${fr(r.montant)} F.` };
  });
}

export async function verser(periodeId: string, organisme: "cnps" | "impot", versement: { compteTresorerieId: string; date: string }): Promise<Resultat> {
  return operer("personnes.paie.payer", async (organizationId, userId) => {
    if (!UUID.test(periodeId) || !UUID.test(versement.compteTresorerieId) || !DATE_ISO.test(versement.date)) return { ok: false, message: "Versement invalide." };
    if (organisme !== "cnps" && organisme !== "impot") return { ok: false, message: "Organisme inconnu." };
    const r = await db.transaction((tx) => verserDans(tx, organizationId, periodeId, organisme, versement, userId));
    return { ok: true, message: `${organisme === "cnps" ? "Cotisations CNPS versées" : "Impôt sur salaires versé"} : ${fr(r.montant)} F, écriture ${r.ecriture}.` };
  });
}
