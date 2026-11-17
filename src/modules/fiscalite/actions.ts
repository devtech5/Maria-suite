"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { refusDroit } from "@/lib/droits/garde";

import { moisValide } from "./calcul";
import { cloturerExerciceDans, declarerTvaDans, payerTvaDans } from "./creation";
import { affecterResultatDans, annulerImpotDans, constaterImpotDans, enregistrerRegleImpotDans, payerFractionDans, regleImpotDe, rouvrirExerciceDans } from "./exercice";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const fr = (n: number) => n.toLocaleString("fr-FR");

async function operer(droit: Droit, travail: (organizationId: string, userId: string) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail(session.organizationId, session.userId);
    if (r.ok) {
      revalidatePath("/comptabilite", "layout");
      revalidatePath("/tresorerie", "layout");
      revalidatePath("/");
    }
    return r;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Fiscalité : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

export async function declarerTva(mois: string): Promise<Resultat> {
  return operer("comptabilite.fiscalite.declarer", async (organizationId, userId) => {
    if (!moisValide(mois)) return { ok: false, message: "Mois invalide." };
    const r = await db.transaction((tx) => declarerTvaDans(tx, organizationId, mois, aujourdhui(), userId));
    const suite = r.aPayer > 0 ? `${fr(r.aPayer)} F à reverser` : r.creditReporte > 0 ? `crédit de ${fr(r.creditReporte)} F reporté` : "déclaration néant";
    return { ok: true, message: `TVA de ${mois} déclarée : ${suite}${r.ecriture ? `, écriture ${r.ecriture}` : ""}.` };
  });
}

export async function payerTva(mois: string, paiement: { compteTresorerieId: string; date: string }): Promise<Resultat> {
  return operer("comptabilite.fiscalite.declarer", async (organizationId, userId) => {
    if (!moisValide(mois)) return { ok: false, message: "Mois invalide." };
    if (!UUID.test(paiement.compteTresorerieId)) return { ok: false, message: "Choisissez le compte qui paie." };
    if (!DATE_ISO.test(paiement.date)) return { ok: false, message: "Date invalide." };
    const r = await db.transaction((tx) => payerTvaDans(tx, organizationId, mois, paiement, userId));
    return { ok: true, message: `TVA de ${mois} payée : ${fr(r.montant)} F, écriture ${r.ecriture}.` };
  });
}

export async function cloturerExercice(exercice: string): Promise<Resultat> {
  return operer("comptabilite.exercice.cloturer", async (organizationId, userId) => {
    if (!/^\d{4}$/.test(exercice)) return { ok: false, message: "Exercice invalide." };
    const r = await db.transaction((tx) => cloturerExerciceDans(tx, organizationId, exercice, aujourdhui(), userId));
    const sens = r.resultat >= 0 ? `bénéfice de ${fr(r.resultat)} F` : `perte de ${fr(-r.resultat)} F`;
    return { ok: true, message: `Exercice ${exercice} clôturé : ${sens}, écriture ${r.ecriture}.` };
  });
}

// ------------------------------------------------- impôt sur les bénéfices

const montant = z.number().int().min(0).max(1_000_000_000_000);
const EXERCICE = /^\d{4}$/;

const schemaRegle = z.object({
  tauxBp: z.number().int(),
  imfTauxBp: z.number().int(),
  imfMinimum: montant,
  imfMaximum: montant,
  echeances: z.array(z.string()).max(12),
  source: z.string().max(600),
});

export async function enregistrerRegleImpot(regle: z.input<typeof schemaRegle>, atteste: boolean): Promise<Resultat> {
  return operer("comptabilite.exercice.cloturer", async (organizationId, userId) => {
    const analyse = schemaRegle.safeParse(regle);
    if (!analyse.success) return { ok: false, message: "Règle illisible." };
    await db.transaction((tx) => enregistrerRegleImpotDans(tx, organizationId, analyse.data, atteste, userId));
    return {
      ok: true,
      message: atteste ? "Règle enregistrée et attestée : l'impôt peut être constaté." : "Règle enregistrée, non attestée : aucun impôt ne se constate tant qu'elle n'est pas vérifiée.",
    };
  });
}

const schemaImpot = z.object({ reintegrations: montant, deductions: montant, chiffreAffaires: montant });

export async function constaterImpot(exercice: string, saisie: z.input<typeof schemaImpot>): Promise<Resultat> {
  return operer("comptabilite.exercice.cloturer", async (organizationId, userId) => {
    if (!EXERCICE.test(exercice)) return { ok: false, message: "Exercice invalide." };
    const analyse = schemaImpot.safeParse(saisie);
    if (!analyse.success) return { ok: false, message: "Montants en francs entiers, positifs." };
    const { regle, verifie } = await regleImpotDe(organizationId);
    if (!verifie) return { ok: false, message: "La règle d'impôt sur les bénéfices n'est pas attestée vérifiée : contrôlez le taux, le minimum et les échéances, puis attestez-les." };
    const r = await db.transaction((tx) => constaterImpotDans(tx, organizationId, exercice, analyse.data, regle, aujourdhui(), userId));
    return {
      ok: true,
      message: r.impotDu > 0 ? `Impôt de ${exercice} constaté : ${fr(r.impotDu)} F${r.imf > r.impotTheorique ? " (minimum forfaitaire)" : ""}, écriture ${r.ecriture}.` : `Impôt de ${exercice} constaté : rien à payer.`,
    };
  });
}

export async function annulerImpot(exercice: string, motif: string): Promise<Resultat> {
  return operer("comptabilite.exercice.cloturer", async (organizationId, userId) => {
    if (!EXERCICE.test(exercice)) return { ok: false, message: "Exercice invalide." };
    await db.transaction((tx) => annulerImpotDans(tx, organizationId, exercice, String(motif ?? "").slice(0, 300), userId));
    return { ok: true, message: `Impôt de ${exercice} annulé et contrepassé : il peut être constaté de nouveau.` };
  });
}

export async function payerFractionImpot(fractionId: string, paiement: { compteTresorerieId: string; date: string }): Promise<Resultat> {
  return operer("comptabilite.fiscalite.declarer", async (organizationId, userId) => {
    if (!UUID.test(fractionId)) return { ok: false, message: "Fraction introuvable." };
    if (!UUID.test(paiement.compteTresorerieId)) return { ok: false, message: "Choisissez le compte qui paie." };
    if (!DATE_ISO.test(paiement.date)) return { ok: false, message: "Date invalide." };
    const r = await db.transaction((tx) => payerFractionDans(tx, organizationId, fractionId, paiement, userId));
    return { ok: true, message: `Fraction d'impôt payée : ${fr(r.montant)} F, écriture ${r.ecriture}.` };
  });
}

// ------------------------------------------------ affectation, réouverture

const schemaAffectation = z.object({ reserveLegale: montant, autresReserves: montant, dividendes: montant, reportANouveau: montant });

export async function affecterResultat(exercice: string, affectation: z.input<typeof schemaAffectation>, dateDecision: string): Promise<Resultat> {
  return operer("comptabilite.exercice.cloturer", async (organizationId, userId) => {
    if (!EXERCICE.test(exercice)) return { ok: false, message: "Exercice invalide." };
    if (!DATE_ISO.test(dateDecision)) return { ok: false, message: "Date de la décision invalide." };
    const analyse = schemaAffectation.safeParse(affectation);
    if (!analyse.success) return { ok: false, message: "Montants en francs entiers, positifs." };
    const r = await db.transaction((tx) => affecterResultatDans(tx, organizationId, exercice, analyse.data, dateDecision, userId));
    return { ok: true, message: `Résultat de ${exercice} affecté, écriture ${r.ecriture}.` };
  });
}

export async function rouvrirExercice(exercice: string, motif: string): Promise<Resultat> {
  return operer("comptabilite.exercice.cloturer", async (organizationId, userId) => {
    if (!EXERCICE.test(exercice)) return { ok: false, message: "Exercice invalide." };
    const r = await db.transaction((tx) => rouvrirExerciceDans(tx, organizationId, exercice, String(motif ?? "").slice(0, 300), userId));
    return { ok: true, message: `Exercice ${exercice} rouvert : ${r.ecritures.length} écriture${r.ecritures.length > 1 ? "s" : ""} contrepassée${r.ecritures.length > 1 ? "s" : ""} (${r.ecritures.join(", ")}).` };
  });
}
