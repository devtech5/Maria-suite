"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { tracer } from "@/lib/audit";
import { exigerEntreprise } from "@/lib/auth/dal";
import { chiffrer, dechiffrer } from "@/lib/chiffrement";
import { refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";

import * as imap from "./imap";
import { comptesCourriel } from "./schema";

const USAGE = "boite-mail";

type Echec = { ok: false; message: string };
export type Resultat = { ok: true; message: string } | Echec;

/** La boîte de la personne connectée, mot de passe déchiffré — jamais celle d'un autre. */
async function maConnexion(): Promise<{ organizationId: string; userId: string; connexion: imap.Connexion } | Echec> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("boite_mail.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  const [c] = await db
    .select()
    .from(comptesCourriel)
    .where(and(eq(comptesCourriel.organizationId, session.organizationId), eq(comptesCourriel.userId, session.userId)));
  if (!c) return { ok: false, message: "Aucune boîte mail connectée." };
  let motDePasse: string;
  try {
    motDePasse = dechiffrer(c.motDePasseChiffre, USAGE);
  } catch {
    return { ok: false, message: "Le mot de passe enregistré n'est plus lisible (clé du serveur changée) : reconnectez la boîte." };
  }
  return {
    organizationId: session.organizationId,
    userId: session.userId,
    connexion: { ...c, motDePasse },
  };
}

function echoue(r: unknown): r is Echec {
  return typeof r === "object" && r !== null && "ok" in r && (r as Echec).ok === false;
}

const schemaConnexion = z.object({
  adresse: z.string().trim().toLowerCase().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Adresse e-mail invalide."),
  nomAffiche: z.string().trim().max(80).nullable(),
  identifiant: z.string().trim().min(3).max(200),
  motDePasse: z.string().min(1, "Saisissez le mot de passe de la boîte.").max(500),
  imapHote: z.string().trim().min(3, "Serveur IMAP manquant.").max(200),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurise: z.boolean(),
  smtpHote: z.string().trim().min(3, "Serveur SMTP manquant.").max(200),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurise: z.boolean(),
  signature: z.string().max(1000).nullable(),
});

/**
 * Connecte la boîte : les deux sens sont ESSAYÉS avant tout enregistrement —
 * un mot de passe refusé ne se garde pas, même chiffré.
 */
export async function connecterBoite(d: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("boite_mail.utiliser");
  if (refus) return { ok: false, message: refus.erreur };
  const texte = (k: string) => {
    const v = d.get(k);
    return typeof v === "string" && v.trim() !== "" ? v : null;
  };
  const analyse = schemaConnexion.safeParse({
    adresse: texte("adresse") ?? "",
    nomAffiche: texte("nomAffiche"),
    identifiant: texte("identifiant") ?? texte("adresse") ?? "",
    // Gmail affiche son mot de passe d'application en quatre blocs séparés
    // d'espaces, qu'il refuse ensuite : on les retire pour lui seul.
    motDePasse: (texte("imapHote") ?? "").trim().toLowerCase() === "imap.gmail.com" ? (texte("motDePasse") ?? "").replace(/\s+/g, "") : (texte("motDePasse") ?? ""),
    imapHote: texte("imapHote") ?? "",
    imapPort: Number(texte("imapPort") ?? 993),
    imapSecurise: d.get("imapSecurise") !== "non",
    smtpHote: texte("smtpHote") ?? "",
    smtpPort: Number(texte("smtpPort") ?? 465),
    smtpSecurise: d.get("smtpSecurise") !== "non",
    signature: texte("signature"),
  });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  const v = analyse.data;

  try {
    await imap.verifier({ ...v, nomAffiche: v.nomAffiche });
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }

  const ligne = {
    adresse: v.adresse,
    nomAffiche: v.nomAffiche,
    identifiant: v.identifiant,
    motDePasseChiffre: chiffrer(v.motDePasse, USAGE),
    imapHote: v.imapHote,
    imapPort: v.imapPort,
    imapSecurise: v.imapSecurise,
    smtpHote: v.smtpHote,
    smtpPort: v.smtpPort,
    smtpSecurise: v.smtpSecurise,
    signature: v.signature,
    verifieLe: new Date(),
  };
  await db
    .insert(comptesCourriel)
    .values({ id: newId(), organizationId: session.organizationId, userId: session.userId, ...ligne })
    .onConflictDoUpdate({ target: [comptesCourriel.organizationId, comptesCourriel.userId], set: { ...ligne, updatedAt: new Date() } });
  await tracer({ action: "boite_mail.connecter", entite: "compte", entiteId: session.userId, apres: { adresse: v.adresse, serveur: v.imapHote } });
  revalidatePath("/boite-mail");
  return { ok: true, message: `${v.adresse} connectée.` };
}

export async function deconnecterBoite(): Promise<Resultat> {
  const session = await exigerEntreprise();
  await db.delete(comptesCourriel).where(and(eq(comptesCourriel.organizationId, session.organizationId), eq(comptesCourriel.userId, session.userId)));
  await tracer({ action: "boite_mail.deconnecter", entite: "compte", entiteId: session.userId });
  revalidatePath("/boite-mail");
  return { ok: true, message: "Boîte déconnectée : le mot de passe enregistré est effacé." };
}

export async function listerDossiers(): Promise<{ ok: true; dossiers: imap.Dossier[] } | Echec> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  try {
    return { ok: true, dossiers: await imap.dossiers(m.connexion) };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

export async function listerMessages(dossier: string, page = 0): Promise<{ ok: true; total: number; messages: imap.ApercuMessage[] } | Echec> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  try {
    const r = await imap.messages(m.connexion, dossier.slice(0, 300), Math.max(0, Math.floor(page)));
    return { ok: true, ...r };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

export async function ouvrirMessage(dossier: string, uid: number): Promise<{ ok: true; message: imap.MessageLu } | Echec> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  if (!Number.isInteger(uid) || uid <= 0) return { ok: false, message: "Message inconnu." };
  try {
    const lu = await imap.lire(m.connexion, dossier.slice(0, 300), uid);
    return lu ? { ok: true, message: lu } : { ok: false, message: "Message introuvable : il a peut-être été déplacé." };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

export async function telechargerPiece(dossier: string, uid: number, index: number): Promise<{ ok: true; nom: string; type: string; base64: string } | Echec> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  try {
    const p = await imap.pieceJointe(m.connexion, dossier.slice(0, 300), uid, index);
    if (!p) return { ok: false, message: "Pièce jointe introuvable." };
    if (p.contenu.byteLength > 15 * 1024 * 1024) return { ok: false, message: "Pièce trop lourde pour être ouverte ici : consultez-la chez votre fournisseur." };
    return { ok: true, nom: p.nom, type: p.type, base64: p.contenu.toString("base64") };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

export async function mettreCorbeille(dossier: string, uid: number): Promise<Resultat> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  try {
    await imap.corbeille(m.connexion, dossier.slice(0, 300), uid);
    return { ok: true, message: "Message mis à la corbeille." };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

export async function archiverMessage(dossier: string, uid: number): Promise<Resultat> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  try {
    const range = await imap.archiver(m.connexion, dossier.slice(0, 300), uid);
    return range
      ? { ok: true, message: "Message archivé." }
      : { ok: false, message: "Cette boîte n'a pas de dossier Archives, ou le message y est déjà." };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

export async function marquerSuivi(dossier: string, uid: number, suivi: boolean): Promise<Resultat> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  try {
    await imap.marquerSuivi(m.connexion, dossier.slice(0, 300), uid, suivi === true);
    return { ok: true, message: suivi ? "Message marqué pour suivi." : "Suivi retiré." };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

export async function marquerNonLu(dossier: string, uid: number): Promise<Resultat> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  try {
    await imap.marquerNonLu(m.connexion, dossier.slice(0, 300), uid);
    return { ok: true, message: "Marqué non lu." };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}

function listeAdresses(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Envoie un e-mail depuis la boîte connectée, pièces jointes comprises (10 Mo en tout). */
export async function envoyerCourriel(d: FormData): Promise<Resultat> {
  const m = await maConnexion();
  if (echoue(m)) return m;
  const a = listeAdresses(d.get("a"));
  const cc = listeAdresses(d.get("cc"));
  const valide = (x: string) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(x);
  if (a.length === 0) return { ok: false, message: "Indiquez au moins un destinataire." };
  const invalide = [...a, ...cc].find((x) => !valide(x));
  if (invalide) return { ok: false, message: `Adresse invalide : ${invalide}` };
  const objet = String(d.get("objet") ?? "").trim().slice(0, 300);
  const texte = String(d.get("texte") ?? "");
  if (!objet && !texte.trim()) return { ok: false, message: "Message vide." };
  const pieces = await Promise.all(
    d
      .getAll("pieces")
      .filter((f): f is File => f instanceof File && f.size > 0)
      .map(async (f) => ({ nom: f.name, type: f.type || "application/octet-stream", contenu: Buffer.from(await f.arrayBuffer()) })),
  );
  if (pieces.reduce((s, p) => s + p.contenu.byteLength, 0) > 10 * 1024 * 1024) return { ok: false, message: "Pièces jointes trop lourdes : 10 Mo en tout." };
  const references = String(d.get("references") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  try {
    await imap.envoyer(m.connexion, { a, cc, objet: objet || "(sans objet)", texte, pieces, enReponseA: (d.get("enReponseA") as string) || null, references });
    await tracer({ action: "boite_mail.envoyer", entite: "compte", entiteId: m.userId, apres: { destinataires: a.length + cc.length, pieces: pieces.length } });
    return { ok: true, message: `Envoyé à ${a.join(", ")}.` };
  } catch (erreur) {
    return { ok: false, message: imap.messageErreur(erreur) };
  }
}
