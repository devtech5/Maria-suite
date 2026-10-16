"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { tracerPartout, tracerPour } from "@/lib/audit";
import { apresEchec, estVerrouille } from "./identifiants";
import { pointerApresReponse } from "@/modules/presences/pointage";
import { verifierMotDePasse } from "./mot-de-passe";
import {
  CONNEXION_EXPIREE,
  deverrouillerSessionId,
  fermerSession,
  lireSession,
  maintenirSessionId,
  signalerPresence,
  verrouillerSessionId,
} from "./session";

/**
 * Signe de vie du navigateur, une fois par minute au plus.
 *
 * Rend `verrouillee: true` quand le serveur juge la session éteinte : l'écran
 * se voile alors même si la minuterie du navigateur n'a rien vu (onglet gelé,
 * ordinateur sorti de veille).
 */
export async function signalerActivite(): Promise<{ verrouillee: boolean }> {
  const active = await lireSession();
  if (!active) return { verrouillee: true };
  if (active.verrouillee) return { verrouillee: true };
  const vivante = await signalerPresence(active.sessionId, active.delaiVerrouillage);
  // Une minute d'activité réelle étend la journée de présence (au plus une
  // écriture toutes les cinq minutes, voir `pointerPresence`).
  if (vivante) pointerApresReponse(active.organizationId, active.userId);
  return { verrouillee: !vivante };
}

/**
 * Signe de vie d'un écran exempté du verrou (caisse, salle Meeting) affiché,
 * envoyé une fois par minute même sans geste : il tient la session ouverte
 * au-delà des trente minutes d'inactivité, sans lever ni retarder le verrou
 * de la gestion. Rend `ouverte: false` si la session a déjà pris fin.
 */
export async function maintenirSession(): Promise<{ ouverte: boolean }> {
  const active = await lireSession();
  if (!active) return { ouverte: false };
  await maintenirSessionId(active.sessionId);
  return { ouverte: true };
}

/**
 * La session vit-elle encore ? Posé par un écran voilé dont l'inactivité
 * atteint le délai de déconnexion : le serveur seul en juge, car une caisse
 * ouverte dans un autre onglet peut l'avoir maintenue.
 */
export async function sessionOuverte(): Promise<boolean> {
  return (await lireSession()) !== null;
}

/**
 * Voile la session : à l'expiration du délai constatée par le navigateur, ou
 * à la demande de son titulaire qui s'éloigne du poste (`manuel`).
 */
export async function verrouiller(manuel = false): Promise<void> {
  const active = await lireSession();
  if (!active) return;
  await verrouillerSessionId(active.sessionId);
  if (active.organizationId && !active.verrouillee) {
    await tracerPour(
      active.organizationId,
      active.userId,
      manuel
        ? { action: "session.verrouillee_manuel", entite: "compte", entiteId: active.userId }
        : {
            action: "session.verrouillee",
            entite: "compte",
            entiteId: active.userId,
            apres: { delaiMinutes: active.delaiVerrouillage },
          },
    );
  }
}

export interface EtatDeverrouillage {
  erreur?: string;
  ok?: boolean;
}

/**
 * Lève le voile sur le mot de passe du compte.
 *
 * Les échecs comptent comme ceux de la connexion — même compteur, même verrou
 * de quinze minutes. Sinon l'écran verrouillé offrirait un second guichet,
 * illimité, pour deviner le mot de passe. Le compte verrouillé ferme la
 * session : celui qui ne connaît pas le mot de passe n'a plus rien à attendre
 * devant cet écran.
 */
export async function deverrouiller(
  _precedent: EtatDeverrouillage,
  donnees: FormData,
): Promise<EtatDeverrouillage> {
  const active = await lireSession();
  if (!active) redirect(CONNEXION_EXPIREE);
  if (!active.verrouillee) return { ok: true };

  const motDePasse = String(donnees.get("motDePasse") ?? "");
  if (motDePasse.length === 0) return { erreur: "Saisissez votre mot de passe." };

  const [compte] = await db
    .select({
      passwordHash: users.passwordHash,
      failedLogins: users.failedLogins,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .where(eq(users.id, active.userId));

  if (!compte || estVerrouille(compte.lockedUntil)) {
    await fermerSession();
    redirect("/connexion");
  }

  if (!(await verifierMotDePasse(compte.passwordHash, motDePasse))) {
    const suite = apresEchec(compte.failedLogins);
    await db.update(users).set({ ...suite, updatedAt: new Date() }).where(eq(users.id, active.userId));
    await tracerPartout(active.userId, {
      action: "session.deverrouillage_refuse",
      entite: "compte",
      entiteId: active.userId,
      apres: { echecs: suite.failedLogins, verrouille: Boolean(suite.lockedUntil) },
    });
    if (suite.lockedUntil) {
      await fermerSession();
      redirect("/connexion");
    }
    return { erreur: "Mot de passe incorrect." };
  }

  await db
    .update(users)
    .set({ failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, active.userId));
  await deverrouillerSessionId(active.sessionId);
  if (active.organizationId) {
    await tracerPour(active.organizationId, active.userId, {
      action: "session.deverrouillee",
      entite: "compte",
      entiteId: active.userId,
    });
  }
  return { ok: true };
}
