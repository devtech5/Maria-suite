"use server";

import { revalidatePath } from "next/cache";

import { stockageConfigure } from "@/lib/stockage";

import { accesCourrier } from "./acces";
import type { SaisiePli, Sens } from "./regles";
import {
  accuserPour,
  deposerPiecePour,
  enregistrerPliPour,
  expedierPour,
  imputerPour,
  pliDe,
  remettrePour,
  traiterPour,
  urlPiecePour,
  type PieceDePli,
} from "./requetes";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const TAILLE_MAX = 10 * 1024 * 1024;

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Courrier", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

const texte = (d: FormData, c: string) => {
  const v = d.get(c);
  return typeof v === "string" ? v : "";
};

function rafraichir() {
  revalidatePath("/courrier", "layout");
}

/** Le premier fichier non vide parmi les champs donnés (la caméra, puis le choix de fichier). */
function fichierDe(d: FormData, ...champs: string[]): File | string | null {
  for (const champ of champs) {
    const f = d.get(champ);
    if (!(f instanceof File) || f.size === 0) continue;
    if (!TYPES.has(f.type)) return `« ${f.name} » : format non accepté, PDF ou photo.`;
    if (f.size > TAILLE_MAX) return `« ${f.name} » : ${Math.ceil(f.size / 1024 / 1024)} Mo pour 10 Mo au plus.`;
    if (!stockageConfigure()) return "Le dépôt de fichiers n'est pas configuré : la pièce ne peut pas être enregistrée.";
    return f;
  }
  return null;
}

/** Enregistre un pli arrivé ou parti, son scan avec. */
export async function enregistrerPli(sens: Sens, d: FormData): Promise<Resultat> {
  const a = await accesCourrier();
  if (!a.enregistrer) return { ok: false, message: "L'enregistrement du courrier revient au secrétariat." };
  if (sens !== "arrivee" && sens !== "depart") return { ok: false, message: "Sens inconnu." };
  const scan = fichierDe(d, "scan_photo", "scan");
  if (typeof scan === "string") return { ok: false, message: scan };
  const saisie: SaisiePli = {
    objet: texte(d, "objet"),
    correspondant: texte(d, "correspondant"),
    reference: texte(d, "reference"),
    nature: texte(d, "nature"),
    canal: texte(d, "canal"),
    dateDocument: texte(d, "dateDocument"),
  };
  try {
    const { id, numero } = await enregistrerPliPour(a.session.organizationId, a.session.userId, sens, saisie, { confidentiel: d.get("confidentiel") === "on" });
    rafraichir();
    if (scan) {
      const refus = await deposerPiecePour(a.session.organizationId, a.session.userId, id, "scan", { contenu: await scan.arrayBuffer(), typeMime: scan.type }).then(
        () => null,
        (e: unknown) => lisible(e),
      );
      if (refus) return { ok: true, message: `${numero} enregistré, mais le scan ne l'a pas été (${refus}). Joignez-le depuis sa fiche.`, id };
    }
    return { ok: true, message: `${numero} enregistré.`, id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function imputerPli(id: string, d: FormData): Promise<Resultat> {
  const a = await accesCourrier();
  if (!a.imputer) return { ok: false, message: "L'imputation revient à la direction." };
  if (!UUID.test(id)) return { ok: false, message: "Courrier introuvable." };
  const userId = texte(d, "userId");
  const serviceId = texte(d, "serviceId");
  try {
    const p = await imputerPour(a.session.organizationId, a.session.userId, id, {
      userId: UUID.test(userId) ? userId : null,
      serviceId: UUID.test(serviceId) ? serviceId : null,
      instructions: texte(d, "instructions"),
      delaiReponse: texte(d, "delaiReponse"),
    });
    rafraichir();
    return { ok: true, message: `${p.numero} imputé à ${p.imputeNom}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function accuserReception(id: string): Promise<Resultat> {
  const a = await accesCourrier();
  if (!UUID.test(id)) return { ok: false, message: "Courrier introuvable." };
  try {
    await accuserPour(a.session.organizationId, a.session.userId, id);
    rafraichir();
    return { ok: true, message: "Réception accusée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Traiter : l'imputé, ou la direction. */
export async function traiterPli(id: string, d: FormData): Promise<Resultat> {
  const a = await accesCourrier();
  if (!UUID.test(id)) return { ok: false, message: "Courrier introuvable." };
  const p = await pliDe(a.session.organizationId, id);
  if (!p || !(a.sien(p) || a.imputer)) return { ok: false, message: "Ce courrier ne vous est pas imputé." };
  const reponse = texte(d, "reponsePliId");
  try {
    await traiterPour(a.session.organizationId, a.session.userId, id, { note: texte(d, "note"), reponsePliId: UUID.test(reponse) ? reponse : null });
    rafraichir();
    return { ok: true, message: `${p.numero} traité.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function expedierPli(id: string, d: FormData): Promise<Resultat> {
  const a = await accesCourrier();
  if (!a.enregistrer) return { ok: false, message: "L'expédition revient au secrétariat." };
  if (!UUID.test(id)) return { ok: false, message: "Courrier introuvable." };
  try {
    await expedierPour(a.session.organizationId, a.session.userId, id, { transporteur: texte(d, "transporteur"), numeroSuivi: texte(d, "numeroSuivi") });
    rafraichir();
    return { ok: true, message: "Expédition enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function remettrePli(id: string, d: FormData): Promise<Resultat> {
  const a = await accesCourrier();
  if (!a.enregistrer) return { ok: false, message: "La remise revient au secrétariat." };
  if (!UUID.test(id)) return { ok: false, message: "Courrier introuvable." };
  const decharge = fichierDe(d, "decharge_photo", "decharge");
  if (typeof decharge === "string") return { ok: false, message: decharge };
  try {
    await remettrePour(a.session.organizationId, a.session.userId, id, { dechargeNom: texte(d, "dechargeNom") });
    if (decharge) await deposerPiecePour(a.session.organizationId, a.session.userId, id, "decharge", { contenu: await decharge.arrayBuffer(), typeMime: decharge.type });
    rafraichir();
    return { ok: true, message: "Remise enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Joint le scan ou la décharge après coup. */
export async function joindrePiece(id: string, piece: PieceDePli, d: FormData): Promise<Resultat> {
  const a = await accesCourrier();
  if (!a.enregistrer) return { ok: false, message: "Les pièces se joignent par le secrétariat." };
  if (!UUID.test(id) || (piece !== "scan" && piece !== "decharge")) return { ok: false, message: "Courrier introuvable." };
  const f = fichierDe(d, `${piece}_photo`, piece);
  if (typeof f === "string") return { ok: false, message: f };
  if (!f) return { ok: false, message: "Aucun fichier reçu." };
  try {
    await deposerPiecePour(a.session.organizationId, a.session.userId, id, piece, { contenu: await f.arrayBuffer(), typeMime: f.type });
    rafraichir();
    return { ok: true, message: piece === "scan" ? "Scan joint." : "Décharge jointe." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** URL signée du scan ou de la décharge, demandée au clic. */
export async function ouvrirPiece(id: string, piece: string): Promise<string | null> {
  const a = await accesCourrier();
  if (!UUID.test(id) || (piece !== "scan" && piece !== "decharge")) return null;
  const p = await pliDe(a.session.organizationId, id);
  if (!p || !a.voitContenu(p)) return null;
  return urlPiecePour(a.session.organizationId, a.session.userId, id, piece);
}
