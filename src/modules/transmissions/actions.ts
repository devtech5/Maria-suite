"use server";

import { revalidatePath } from "next/cache";

import { stockageConfigure } from "@/lib/stockage";

import { accesTransmissions } from "./acces";
import type { Sens } from "./regles";
import {
  accuserPour,
  annulerPour,
  creerTransmissionPour,
  deposerPreuvePour,
  recevoirPour,
  traiterPour,
  transmettrePour,
  transmissionDe,
  urlPreuvePour,
} from "./requetes";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Transmissions", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

const texte = (d: FormData, c: string) => {
  const v = d.get(c);
  return typeof v === "string" ? v : "";
};
const uuid = (d: FormData, c: string) => (UUID.test(texte(d, c)) ? texte(d, c) : null);

function rafraichir() {
  revalidatePath("/transmissions", "layout");
}

function preuveDe(d: FormData): File | string | null {
  for (const champ of ["preuve_photo", "preuve"]) {
    const f = d.get(champ);
    if (!(f instanceof File) || f.size === 0) continue;
    if (!TYPES.has(f.type)) return `« ${f.name} » : format non accepté, PDF ou photo.`;
    if (f.size > 10 * 1024 * 1024) return `« ${f.name} » : 10 Mo au plus.`;
    if (!stockageConfigure()) return "Le dépôt de fichiers n'est pas configuré : la preuve ne peut pas être enregistrée.";
    return f;
  }
  return null;
}

async function joindre(organizationId: string, userId: string, id: string, f: File | null): Promise<string | null> {
  if (!f) return null;
  return deposerPreuvePour(organizationId, userId, id, { contenu: await f.arrayBuffer(), typeMime: f.type }).then(
    () => null,
    (e: unknown) => lisible(e),
  );
}

export async function creerTransmission(sens: Sens, d: FormData): Promise<Resultat> {
  const a = await accesTransmissions();
  if (!a.emettre) return { ok: false, message: "Vous n'établissez pas de bordereaux de transmission." };
  if (sens !== "interne" && sens !== "sortante" && sens !== "entrante") return { ok: false, message: "Sens inconnu." };
  const preuve = preuveDe(d);
  if (typeof preuve === "string") return { ok: false, message: preuve };
  let pieces: unknown = null;
  try {
    pieces = JSON.parse(texte(d, "pieces") || "[]");
  } catch {
    pieces = null;
  }
  try {
    const { id, numero } = await creerTransmissionPour(a.session.organizationId, a.session.userId, {
      sens,
      objet: texte(d, "objet"),
      mention: texte(d, "mention"),
      pieces,
      emetteurServiceId: uuid(d, "emetteurServiceId"),
      destinataireUserId: uuid(d, "destinataireUserId"),
      destinataireServiceId: uuid(d, "destinataireServiceId"),
      tiersId: uuid(d, "tiersId"),
      entreprise: texte(d, "entreprise"),
      contact: texte(d, "contact"),
      responsableUserId: uuid(d, "responsableUserId"),
      dateLimite: texte(d, "dateLimite"),
      dejaFait: d.get("dejaFait") === "on",
      moyen: texte(d, "moyen"),
    });
    rafraichir();
    const refus = await joindre(a.session.organizationId, a.session.userId, id, preuve);
    return { ok: true, message: refus ? `${numero} établi, mais la preuve n'a pas été jointe (${refus}).` : `${numero} établi.`, id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

async function charger(id: string) {
  const a = await accesTransmissions();
  if (!UUID.test(id)) return { a, t: null };
  const t = await transmissionDe(a.session.organizationId, id);
  return { a, t: t && a.voit(t) ? t : null };
}

export async function transmettre(id: string, d: FormData): Promise<Resultat> {
  const { a, t } = await charger(id);
  if (!t || !a.gere(t)) return { ok: false, message: "Bordereau introuvable." };
  const preuve = preuveDe(d);
  if (typeof preuve === "string") return { ok: false, message: preuve };
  try {
    await transmettrePour(a.session.organizationId, a.session.userId, id, texte(d, "moyen"));
    await joindre(a.session.organizationId, a.session.userId, id, preuve);
    rafraichir();
    return { ok: true, message: "Transmission enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Accusé : le destinataire interne, ou l'émetteur pour la décharge d'une entreprise. */
export async function accuser(id: string, d: FormData): Promise<Resultat> {
  const { a, t } = await charger(id);
  if (!t) return { ok: false, message: "Bordereau introuvable." };
  if (t.sens === "sortante" && !a.gere(t)) return { ok: false, message: "Bordereau introuvable." };
  const preuve = preuveDe(d);
  if (typeof preuve === "string") return { ok: false, message: preuve };
  try {
    await accuserPour(a.session.organizationId, a.session.userId, id, texte(d, "signataire"));
    await joindre(a.session.organizationId, a.session.userId, id, preuve);
    rafraichir();
    return { ok: true, message: "Réception accusée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function recevoir(id: string, d: FormData): Promise<Resultat> {
  const { a, t } = await charger(id);
  if (!t || !a.gere(t)) return { ok: false, message: "Bordereau introuvable." };
  const preuve = preuveDe(d);
  if (typeof preuve === "string") return { ok: false, message: preuve };
  try {
    await recevoirPour(a.session.organizationId, a.session.userId, id, texte(d, "moyen"));
    await joindre(a.session.organizationId, a.session.userId, id, preuve);
    rafraichir();
    return { ok: true, message: "Réception enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Le retour : un avis par pièce (`avis_<rang>`, `observation_<rang>`) et une note. */
export async function traiter(id: string, d: FormData): Promise<Resultat> {
  const { a, t } = await charger(id);
  if (!t) return { ok: false, message: "Bordereau introuvable." };
  if (t.sens !== "interne" && !a.gere(t)) return { ok: false, message: "Bordereau introuvable." };
  const avis: Record<number, string> = {};
  const observations: Record<number, string> = {};
  for (const [cle, valeur] of d.entries()) {
    const m = /^(avis|observation)_(\d{1,3})$/.exec(cle);
    if (!m || typeof valeur !== "string") continue;
    (m[1] === "avis" ? avis : observations)[Number(m[2])] = valeur;
  }
  try {
    await traiterPour(a.session.organizationId, a.session.userId, id, { avis, observations, note: texte(d, "note") });
    rafraichir();
    return { ok: true, message: "Retour enregistré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function annuler(id: string): Promise<Resultat> {
  const { a, t } = await charger(id);
  if (!t || !a.gere(t)) return { ok: false, message: "Bordereau introuvable." };
  try {
    await annulerPour(a.session.organizationId, a.session.userId, id);
    rafraichir();
    return { ok: true, message: "Bordereau annulé." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function joindrePreuve(id: string, d: FormData): Promise<Resultat> {
  const { a, t } = await charger(id);
  if (!t || !(a.gere(t) || t.destinataireUserId === a.moi)) return { ok: false, message: "Bordereau introuvable." };
  const preuve = preuveDe(d);
  if (typeof preuve === "string") return { ok: false, message: preuve };
  if (!preuve) return { ok: false, message: "Aucun fichier reçu." };
  const refus = await joindre(a.session.organizationId, a.session.userId, id, preuve);
  rafraichir();
  return refus ? { ok: false, message: refus } : { ok: true, message: "Preuve jointe." };
}

export async function ouvrirPreuve(id: string): Promise<string | null> {
  const { a, t } = await charger(id);
  if (!t) return null;
  return urlPreuvePour(a.session.organizationId, a.session.userId, id);
}
