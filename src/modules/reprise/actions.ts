"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { lireArticles, lireDate, lireStock, lireTiers, REPRISE_OUVERTE, type Anomalie } from "./calcul";
import { importerArticlesDans, importerStockDans, importerTiersDans, reprendreTresorerieDans } from "./creation";

export type ResultatImport = { ok: true; message: string } | { ok: false; message: string; anomalies?: Anomalie[] };

const TAILLE_MAX = 2_000_000;
const fr = (n: number) => n.toLocaleString("fr-FR");

async function operer(travail: (organizationId: string, userId: string) => Promise<ResultatImport>): Promise<ResultatImport> {
  const session = await exigerEntreprise();
  if (!REPRISE_OUVERTE) return { ok: false, message: "La reprise de l'existant est fermée." };
  const refus = await refusDroit("organisation.reprise.importer");
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail(session.organizationId, session.userId);
    if (r.ok) revalidatePath("/", "layout");
    return r;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 300;
    if (!lisible) console.error("Reprise : import refusé", erreur);
    return { ok: false, message: lisible ? `Rien n'a été importé : ${message}` : "Rien n'a été importé. Réessayez." };
  }
}

function controler(texte: string, date?: string): string | null {
  if (texte.length > TAILLE_MAX) return "Fichier trop lourd (2 Mo au plus) : découpez-le.";
  if (date !== undefined && !lireDate(date)) return "Date de reprise invalide.";
  if (date !== undefined && date > new Date().toISOString().slice(0, 10)) return "La date de reprise ne peut pas être dans le futur.";
  return null;
}

/** Une anomalie, même une seule, refuse le fichier entier : rien n'est écrit. */
const refusAnomalies = (anomalies: Anomalie[]): ResultatImport => ({
  ok: false,
  message: `${anomalies.length} ligne${anomalies.length > 1 ? "s" : ""} à corriger : rien n'a été importé.`,
  anomalies: anomalies.slice(0, 50),
});

export async function importerArticles(texte: string): Promise<ResultatImport> {
  return operer(async (organizationId, userId) => {
    const refus = controler(texte);
    if (refus) return { ok: false, message: refus };
    const { articles, anomalies } = lireArticles(texte);
    if (anomalies.length) return refusAnomalies(anomalies);
    if (articles.length === 0) return { ok: false, message: "Aucun article dans le fichier." };
    const r = await db.transaction((tx) => importerArticlesDans(tx, organizationId, articles, userId));
    return { ok: true, message: `${r.crees} article${r.crees > 1 ? "s" : ""} créé${r.crees > 1 ? "s" : ""}${r.ignores.length ? `, ${r.ignores.length} déjà présent${r.ignores.length > 1 ? "s" : ""} laissé${r.ignores.length > 1 ? "s" : ""} tel${r.ignores.length > 1 ? "s" : ""} quel${r.ignores.length > 1 ? "s" : ""}` : ""}.` };
  });
}

export async function importerTiers(texte: string, dateReprise: string): Promise<ResultatImport> {
  return operer(async (organizationId, userId) => {
    const refus = controler(texte, dateReprise);
    if (refus) return { ok: false, message: refus };
    const { tiers, anomalies } = lireTiers(texte);
    if (anomalies.length) return refusAnomalies(anomalies);
    if (tiers.length === 0) return { ok: false, message: "Aucun client ni fournisseur dans le fichier." };
    const r = await db.transaction((tx) => importerTiersDans(tx, organizationId, tiers, lireDate(dateReprise)!, userId));
    const parts = [`${r.crees} fiche${r.crees > 1 ? "s" : ""} créée${r.crees > 1 ? "s" : ""}`];
    if (r.creances) parts.push(`${r.creances} créance${r.creances > 1 ? "s" : ""} reprise${r.creances > 1 ? "s" : ""} (${fr(r.montantCreances)} F)`);
    if (r.dettes) parts.push(`${r.dettes} dette${r.dettes > 1 ? "s" : ""} reprise${r.dettes > 1 ? "s" : ""} (${fr(r.montantDettes)} F)`);
    return { ok: true, message: `${parts.join(", ")}.` };
  });
}

export async function importerStock(texte: string, dateReprise: string): Promise<ResultatImport> {
  return operer(async (organizationId, userId) => {
    const refus = controler(texte, dateReprise);
    if (refus) return { ok: false, message: refus };
    const { stock, anomalies } = lireStock(texte);
    if (anomalies.length) return refusAnomalies(anomalies);
    if (stock.length === 0) return { ok: false, message: "Aucune ligne de stock dans le fichier." };
    const r = await db.transaction((tx) => importerStockDans(tx, organizationId, stock, lireDate(dateReprise)!, userId));
    return { ok: true, message: `Stock initial repris : ${r.lignes} ligne${r.lignes > 1 ? "s" : ""}, valeur ${fr(r.valeur)} F${r.ecriture ? `, écriture ${r.ecriture}` : ""}.` };
  });
}

export async function reprendreTresorerie(compteTresorerieId: string, solde: number, dateReprise: string): Promise<ResultatImport> {
  return operer(async (organizationId, userId) => {
    if (!Number.isInteger(solde)) return { ok: false, message: "Solde en francs entiers." };
    const refus = controler("", dateReprise);
    if (refus) return { ok: false, message: refus };
    const r = await db.transaction((tx) => reprendreTresorerieDans(tx, organizationId, { compteTresorerieId, solde, date: lireDate(dateReprise)! }, userId));
    return { ok: true, message: `${r.compte} : solde d'ouverture de ${fr(solde)} F repris, écriture ${r.ecriture}.` };
  });
}
