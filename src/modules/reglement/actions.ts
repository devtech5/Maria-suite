"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";

import { TAILLE_MAX, formatDe, lireTexte } from "@/lib/texte-fichier";

import { decouperReglement } from "./import";
import { dateLongue, type Article } from "./regles";
import { accepterPour, creerBrouillonPour, enregistrerBrouillonPour, publierPour, relancerPour, supprimerBrouillonPour } from "./requetes";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Règlement intérieur", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function rafraichir() {
  revalidatePath("/reglement", "layout");
}

/** Rédiger, publier, relancer : le droit de publier le règlement, les RH. */
async function gestionnaire() {
  const session = await exigerEntreprise();
  const refus = await refusDroit("reglement.gerer");
  return { session, refus: refus?.erreur ?? null };
}

export type ResultatImport =
  | { ok: true; message: string; titre: string | null; preambule: string; articles: Article[]; avertissements: string[] }
  | { ok: false; message: string };

/**
 * Importe un règlement déposé en fichier (Word ou texte) : la plateforme en
 * RÉCUPÈRE le titre, le préambule et les articles, et les rend à l'éditeur.
 * Rien n'est écrit en base : le fichier n'est pas conservé, et l'on relit
 * avant d'enregistrer ou de publier. Même droit que la rédaction.
 */
export async function importerReglement(versionId: string, donnees: FormData): Promise<ResultatImport> {
  const { refus } = await gestionnaire();
  if (refus) return { ok: false, message: refus };
  if (!UUID.test(versionId)) return { ok: false, message: "Version introuvable." };
  const fichier = donnees.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, message: "Choisissez un fichier Word (.docx) ou texte (.txt)." };
  if (fichier.size > TAILLE_MAX) return { ok: false, message: "Ce fichier dépasse 5 Mo." };
  const format = formatDe(fichier.name, fichier.type);
  if (format === "pdf") return { ok: false, message: "Le PDF ne peut pas être lu de façon fiable : enregistrez le règlement en Word (.docx) ou en texte (.txt), puis importez-le." };
  if (format === null) return { ok: false, message: "Format non accepté : Word (.docx) ou texte (.txt)." };
  try {
    const lu = decouperReglement(await lireTexte(await fichier.arrayBuffer(), format));
    if (lu.articles.length === 0) return { ok: false, message: lu.avertissements[0] ?? "Aucun article repéré." };
    return { ok: true, message: `${lu.articles.length} article${lu.articles.length > 1 ? "s" : ""} repéré${lu.articles.length > 1 ? "s" : ""} : relisez, puis enregistrez.`, ...lu };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/**
 * « J'ai lu et j'accepte ». Appelée depuis l'écran de lecture, que le
 * règlement en attente bloque : d'où `malgreReglement`.
 */
export async function accepterReglement(versionId: string): Promise<Resultat> {
  const session = await exigerEntreprise({ malgreReglement: true });
  if (!UUID.test(versionId)) return { ok: false, message: "Version introuvable." };
  try {
    const entetes = await headers();
    const { numero } = await accepterPour(session.organizationId, session.userId, versionId, {
      adresseIp: entetes.get("x-forwarded-for")?.split(",")[0]?.trim() || entetes.get("x-real-ip"),
      appareil: entetes.get("user-agent"),
    });
    rafraichir();
    return { ok: true, message: `Version ${numero} acceptée. Merci.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function nouvelleVersion(): Promise<Resultat> {
  const { session, refus } = await gestionnaire();
  if (refus) return { ok: false, message: refus };
  try {
    const id = await creerBrouillonPour(session.organizationId, session.userId);
    rafraichir();
    return { ok: true, message: "Brouillon ouvert.", id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

function saisie(donnees: FormData) {
  let articles: unknown = [];
  try {
    articles = JSON.parse(String(donnees.get("articles") ?? "[]"));
  } catch {
    articles = null;
  }
  return {
    titre: String(donnees.get("titre") ?? ""),
    preambule: String(donnees.get("preambule") ?? ""),
    resume: String(donnees.get("resume") ?? ""),
    dateEffet: String(donnees.get("dateEffet") ?? ""),
    articles,
  };
}

export async function enregistrerBrouillon(versionId: string, donnees: FormData): Promise<Resultat> {
  const { session, refus } = await gestionnaire();
  if (refus) return { ok: false, message: refus };
  if (!UUID.test(versionId)) return { ok: false, message: "Version introuvable." };
  try {
    const { articles } = await enregistrerBrouillonPour(session.organizationId, session.userId, versionId, saisie(donnees));
    rafraichir();
    return { ok: true, message: `Brouillon enregistré · ${articles} article${articles > 1 ? "s" : ""}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Enregistre la saisie en cours, puis publie : ce qui se publie est ce qu'on voit. */
export async function publierVersion(versionId: string, donnees: FormData): Promise<Resultat> {
  const { session, refus } = await gestionnaire();
  if (refus) return { ok: false, message: refus };
  if (!UUID.test(versionId)) return { ok: false, message: "Version introuvable." };
  try {
    await enregistrerBrouillonPour(session.organizationId, session.userId, versionId, saisie(donnees));
    const { numero, dateEffet } = await publierPour(session.organizationId, session.userId, versionId);
    rafraichir();
    return { ok: true, message: `Version ${numero} publiée, en vigueur le ${dateLongue(dateEffet)}. Tout le monde en est prévenu.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function supprimerBrouillon(versionId: string): Promise<Resultat> {
  const { session, refus } = await gestionnaire();
  if (refus) return { ok: false, message: refus };
  if (!UUID.test(versionId)) return { ok: false, message: "Version introuvable." };
  try {
    await supprimerBrouillonPour(session.organizationId, session.userId, versionId);
    rafraichir();
    return { ok: true, message: "Brouillon supprimé." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function relancerLecteurs(versionId: string): Promise<Resultat> {
  const { session, refus } = await gestionnaire();
  if (refus) return { ok: false, message: refus };
  if (!UUID.test(versionId)) return { ok: false, message: "Version introuvable." };
  try {
    const relances = await relancerPour(session.organizationId, session.userId, versionId);
    rafraichir();
    return {
      ok: true,
      message: relances === 0 ? "Tout le monde a déjà accepté cette version." : `${relances} personne${relances > 1 ? "s" : ""} relancée${relances > 1 ? "s" : ""} dans la cloche.`,
    };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
