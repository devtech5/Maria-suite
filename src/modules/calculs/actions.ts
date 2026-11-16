"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";

import {
  annulerNotePour,
  creerCommandeDepuisNotePour,
  creerDevisDepuisNotePour,
  enregistrerCorrespondancePour,
  enregistrerNotePour,
  enregistrerReglagesCalculsPour,
  type LigneVersPiece,
} from "./donnees";
import { CLES_TYPES_NOTE, type TypeNote } from "./notes";
import { verifierReglages } from "./regles";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

/**
 * Enregistre les ratios de l'entreprise. Le formulaire envoie un JSON
 * d'entiers, relu en entier par `verifierReglages` : une valeur hors bornes
 * est refusée, jamais remplacée en silence.
 */
export async function enregistrerReglagesCalculs(json: string, atteste: boolean): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("calculs.regler");
  if (refus) return { ok: false, message: refus.erreur };
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    return { ok: false, message: "Saisie illisible. Rechargez la page." };
  }
  const v = verifierReglages(brut);
  if (!v.ok) return v;
  try {
    await enregistrerReglagesCalculsPour(s.organizationId, s.userId, v.valeurs, atteste);
  } catch (e) {
    console.error("Calculs", e);
    return { ok: false, message: "L'enregistrement n'a pas abouti. Réessayez." };
  }
  revalidatePath("/calculs", "layout");
  return { ok: true, message: atteste ? "Ratios enregistrés et attestés." : "Ratios enregistrés, à vérifier." };
}

// ------------------------------------------------------------ notes de calcul

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lisible(e: unknown): string {
  const message = e instanceof Error ? e.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Calculs", e);
  return "L'opération n'a pas abouti. Réessayez.";
}

function revaliderNotes() {
  revalidatePath("/calculs", "layout");
  revalidatePath("/projets", "layout");
}

/** Enregistre un calcul sur un projet. Le serveur refait le calcul depuis la saisie. */
export async function enregistrerNote(type: string, saisie: unknown, projetId: string, libelle: string): Promise<Resultat & { id?: string }> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("calculs.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!(CLES_TYPES_NOTE as string[]).includes(type)) return { ok: false, message: "Type de calcul inconnu." };
  if (!UUID.test(projetId)) return { ok: false, message: "Choisissez le projet." };
  try {
    const r = await enregistrerNotePour(s.organizationId, s.userId, { type: type as TypeNote, saisie, projetId, libelle });
    revaliderNotes();
    return { ok: true, message: `Note ${r.numero} enregistrée.`, id: r.id };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function annulerNote(id: string, motif: string): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("calculs.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id)) return { ok: false, message: "Note introuvable." };
  try {
    const r = await annulerNotePour(s.organizationId, s.userId, id, motif, await peut("calculs.regler"));
    revaliderNotes();
    return { ok: true, message: `Note ${r.numero} annulée.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

function lignesValides(lignes: unknown): LigneVersPiece[] | null {
  if (!Array.isArray(lignes) || lignes.length > 50) return null;
  const sortie: LigneVersPiece[] = [];
  for (const l of lignes) {
    const x = l as Record<string, unknown>;
    if (typeof x?.cle !== "string" || typeof x?.articleId !== "string" || !UUID.test(x.articleId)) return null;
    sortie.push({ cle: x.cle, articleId: x.articleId });
  }
  return sortie;
}

/** Devis brouillon au client du projet, au prix de vente des articles. */
export async function devisDepuisNote(noteId: string, lignes: unknown): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = (await refusDroit("calculs.utiliser")) ?? (await refusDroit("commercial.piece.gerer"));
  if (refus) return { ok: false, message: refus.erreur };
  const l = lignesValides(lignes);
  if (!UUID.test(noteId) || !l) return { ok: false, message: "Saisie illisible. Rechargez la page." };
  try {
    const r = await creerDevisDepuisNotePour(s.organizationId, s.userId, noteId, l);
    revaliderNotes();
    revalidatePath("/commercial/factures");
    return { ok: true, message: `Devis brouillon préparé pour ${r.client} : relisez-le et émettez-le dans « Devis et factures ».` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

/** Commande fournisseur brouillon, au prix d'achat des articles. */
export async function commandeDepuisNote(noteId: string, fournisseurId: string, lignes: unknown): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = (await refusDroit("calculs.utiliser")) ?? (await refusDroit("achats.commande.gerer"));
  if (refus) return { ok: false, message: refus.erreur };
  const l = lignesValides(lignes);
  if (!UUID.test(noteId) || !l) return { ok: false, message: "Saisie illisible. Rechargez la page." };
  if (!UUID.test(fournisseurId)) return { ok: false, message: "Choisissez le fournisseur." };
  try {
    const r = await creerCommandeDepuisNotePour(s.organizationId, s.userId, noteId, fournisseurId, l);
    revaliderNotes();
    revalidatePath("/achats");
    return { ok: true, message: `Commande ${r.numero} préparée en brouillon.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

/** Associe un matériau à un article du catalogue, ou retire l'association. */
export async function associerArticle(cle: string, articleId: string | null): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("calculs.regler");
  if (refus) return { ok: false, message: refus.erreur };
  if (articleId !== null && !UUID.test(articleId)) return { ok: false, message: "Article introuvable." };
  try {
    await enregistrerCorrespondancePour(s.organizationId, s.userId, cle, articleId);
    revalidatePath("/calculs", "layout");
    return { ok: true, message: articleId ? "Article associé." : "Association retirée." };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}
