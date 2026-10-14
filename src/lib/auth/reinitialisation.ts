"use server";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { sessions, users, verificationCodes } from "@/db/schema";
import { env } from "@/env";
import { tracerPartout } from "@/lib/audit";
import { envoyerCourriel } from "@/lib/courriel";
import { newId } from "@/lib/ids";

import {
  DEMANDES_REINIT_PAR_HEURE,
  DUREE_JETON_REINIT_MINUTES,
  adresseAutorisee,
  formerJetonReinit,
  lireJetonReinit,
  motifRefusMotDePasse,
  normaliserEmail,
} from "./identifiants";
import { hacherMotDePasse } from "./mot-de-passe";

/**
 * Mot de passe oublié, en libre-service.
 *
 * Le lien envoyé à l'adresse du compte prouve qu'on détient la boîte : c'est
 * ce qui autorise ici ce que l'écran des membres refuse à un responsable — il
 * ne réinitialise pas un compte qui a accès à une autre entreprise.
 */

const empreinte = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** Toujours la même réponse : elle ne doit pas révéler quelles adresses ont un compte. */
const REPONSE_NEUTRE =
  "Si un compte existe pour cette adresse, un e-mail vient de partir avec un lien valable une heure. Pensez à regarder dans les indésirables.";

export interface EtatDemande {
  message?: string;
  erreur?: string;
}

async function urlPublique(): Promise<string> {
  if (env.URL_PUBLIQUE) return env.URL_PUBLIQUE.replace(/\/$/, "");
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocole = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${protocole}://${hote}`;
}

export async function demanderReinitialisation(_precedent: EtatDemande, donnees: FormData): Promise<EtatDemande> {
  const email = normaliserEmail(String(donnees.get("email") ?? ""));
  if (!email) return { erreur: "Adresse e-mail invalide." };
  // Adresse hors de la règle d'accès : aucun lien ne part, la réponse reste neutre.
  if (!adresseAutorisee(email)) return { message: REPONSE_NEUTRE };

  const [compte] = await db
    .select({ id: users.id, nom: users.fullName, statut: users.status, empreinte: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));
  if (!compte || compte.statut !== "actif") return { message: REPONSE_NEUTRE };

  const [{ recentes }] = await db
    .select({ recentes: sql<number>`count(*)::int` })
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.destination, email),
        eq(verificationCodes.purpose, "reinitialisation"),
        gt(verificationCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );
  if (recentes >= DEMANDES_REINIT_PAR_HEURE) return { message: REPONSE_NEUTRE };

  const id = newId();
  const secret = randomBytes(32).toString("base64url");
  await db.insert(verificationCodes).values({
    id,
    destination: email,
    channel: "email",
    purpose: "reinitialisation",
    codeHash: empreinte(secret),
    maxAttempts: 1,
    expiresAt: new Date(Date.now() + DUREE_JETON_REINIT_MINUTES * 60 * 1000),
  });

  const lien = `${await urlPublique()}/reinitialiser?jeton=${encodeURIComponent(formerJetonReinit(id, secret))}`;
  await envoyerCourriel({
    a: email,
    sujet: "Maria Suite — choisir un nouveau mot de passe",
    texte:
      `Bonjour ${compte.nom},\n\n` +
      `Une demande de nouveau mot de passe a été faite pour votre compte Maria Suite.\n` +
      `Ouvrez ce lien dans l'heure pour en choisir un :\n\n${lien}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.`,
    html:
      `<p>Bonjour ${échapper(compte.nom)},</p>` +
      `<p>Une demande de nouveau mot de passe a été faite pour votre compte Maria Suite.</p>` +
      `<p><a href="${lien}">Choisir un nouveau mot de passe</a> — lien valable une heure.</p>` +
      `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.</p>`,
  });
  await tracerPartout(compte.id, { action: "compte.reinitialisation_demandee", entite: "compte", entiteId: compte.id });
  return { message: REPONSE_NEUTRE };
}

function échapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Le lien est-il encore utilisable ? Sert à la page, avant la saisie. */
export async function jetonValable(jeton: string): Promise<boolean> {
  return (await demandeDe(jeton)) !== null;
}

async function demandeDe(jeton: string) {
  const lu = lireJetonReinit(jeton);
  if (!lu) return null;
  const [demande] = await db
    .select()
    .from(verificationCodes)
    .where(and(eq(verificationCodes.id, lu.id), eq(verificationCodes.purpose, "reinitialisation"), isNull(verificationCodes.consumedAt)));
  if (!demande || demande.expiresAt.getTime() < Date.now()) return null;
  const attendu = Buffer.from(demande.codeHash, "hex");
  const recu = Buffer.from(empreinte(lu.secret), "hex");
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  return demande;
}

export interface EtatReinitialisation {
  erreur?: string;
}

export async function reinitialiserMotDePasse(_precedent: EtatReinitialisation, donnees: FormData): Promise<EtatReinitialisation> {
  const jeton = String(donnees.get("jeton") ?? "");
  const nouveau = String(donnees.get("nouveau") ?? "");
  const confirmation = String(donnees.get("confirmation") ?? "");

  const demande = await demandeDe(jeton);
  if (!demande) return { erreur: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau." };

  const refus = motifRefusMotDePasse(nouveau, { email: demande.destination });
  if (refus) return { erreur: refus };
  if (nouveau !== confirmation) return { erreur: "Les deux mots de passe ne correspondent pas." };

  const hache = await hacherMotDePasse(nouveau);
  const userId = await db.transaction(async (tx) => {
    // Consommation atomique : deux clics sur le même lien, un seul passe.
    const [consomme] = await tx
      .update(verificationCodes)
      .set({ consumedAt: new Date(), attempts: 1, updatedAt: new Date() })
      .where(and(eq(verificationCodes.id, demande.id), isNull(verificationCodes.consumedAt)))
      .returning({ id: verificationCodes.id });
    if (!consomme) return null;
    const [compte] = await tx
      .update(users)
      .set({ passwordHash: hache, mustChangePassword: false, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
      .where(and(eq(users.email, demande.destination), eq(users.status, "actif")))
      .returning({ id: users.id });
    if (!compte) return null;
    // Toutes les sessions tombent : si le mot de passe avait fuité, l'intrus sort aussi.
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, compte.id), isNull(sessions.revokedAt)));
    return compte.id;
  });
  if (!userId) return { erreur: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau." };

  await tracerPartout(userId, { action: "compte.mot_de_passe_reinitialise", entite: "compte", entiteId: userId, apres: { sessionsFermees: true } });
  redirect("/connexion?reinitialise=1");
}
