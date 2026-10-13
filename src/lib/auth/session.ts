import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { memberships, organizations, roles, sessions, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { DELAI_VERROUILLAGE_DEFAUT, MARGE_SERVEUR_MINUTES, sessionVerrouillee } from "./verrou";

export const COOKIE_SESSION = "maria_session";

/**
 * Où renvoyer quand le cookie est là mais ne désigne plus aucune session
 * (révoquée, expirée). Le paramètre demande au proxy d'effacer le cookie :
 * sans quoi le proxy, qui ne voit que sa présence, renverrait vers
 * l'application, et l'application vers la connexion, sans fin.
 */
export const CONNEXION_EXPIREE = "/connexion?expiree=1";

/** Trente jours : une caisse ne redemande pas ses identifiants chaque matin. */
const DUREE_SESSION_JOURS = 30;

/**
 * Empreinte du jeton de session.
 *
 * SHA-256 et non argon2, délibérément. Argon2 est lent par construction, ce qui
 * protège un secret devinable — un mot de passe, un code à six chiffres. Un
 * jeton de 32 octets tirés au hasard n'est pas devinable : le ralentissement
 * n'apporterait rien et coûterait sur chaque requête authentifiée.
 *
 * Ce qui compte ici, c'est que la base ne contienne jamais le jeton en clair.
 * Une fuite de la table `sessions` ne doit permettre d'usurper personne.
 */
function empreinte(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

export interface SessionActive {
  sessionId: string;
  userId: string;
  nom: string;
  /** Identifiant de connexion. Nul pour un compte antérieur au passage à l'e-mail. */
  email: string | null;
  /**
   * Mot de passe provisoire à remplacer. Tant qu'il l'est, `exigerSession`
   * ne laisse ouvrir que l'écran de changement.
   */
  doitChangerMotDePasse: boolean;
  organizationId: string | null;
  organizationNom: string | null;
  roleId: string | null;
  /**
   * Clé du rôle dans l'entreprise active — `proprietaire`, `caissier`… C'est
   * elle, et non l'identifiant, qui décide des droits quand le rôle est l'un
   * de ceux que Maria Suite fournit. Voir `src/lib/droits/catalogue.ts`.
   */
  roleCle: string | null;
  /** Créateur de l'entreprise : tous les droits, sans condition. */
  estProprietaire: boolean;
  /**
   * Appareil de cette session, tel qu'il s'est annoncé à l'ouverture.
   *
   * Exposé parce que la caisse en a besoin : c'est lui qui rattache un poste
   * d'encaissement à un terminal, donc qui rend son compteur de tickets sûr
   * quand le réseau manque.
   */
  deviceId: string | null;
  /**
   * Écran voilé après inactivité. La session vit toujours, mais `exigerSession`
   * ne sert plus aucune page avant le mot de passe. Voir `./verrou.ts`.
   */
  verrouillee: boolean;
  /** Minutes sans activité avant le verrou, selon l'entreprise active. */
  delaiVerrouillage: number;
}

/**
 * Ouvre une session et dépose le cookie.
 *
 * Le jeton n'existe en clair qu'ici et dans le cookie du client ; la base n'en
 * garde que l'empreinte.
 */
export async function ouvrirSession(
  userId: string,
  contexte: { deviceId?: string; userAgent?: string; ipAddress?: string } = {},
): Promise<void> {
  const jeton = randomBytes(32).toString("base64url");
  const expiration = new Date(
    Date.now() + DUREE_SESSION_JOURS * 24 * 60 * 60 * 1000,
  );

  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: empreinte(jeton),
    deviceId: contexte.deviceId ?? null,
    userAgent: contexte.userAgent ?? null,
    ipAddress: contexte.ipAddress ?? null,
    expiresAt: expiration,
  });

  const magasin = await cookies();
  magasin.set(COOKIE_SESSION, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiration,
  });
}

/**
 * Lit la session courante depuis le cookie.
 *
 * Renvoie null sans distinguer les causes — cookie absent, session expirée,
 * révoquée ou inconnue aboutissent au même résultat : pas de session.
 */
export async function lireSession(): Promise<SessionActive | null> {
  const magasin = await cookies();
  const jeton = magasin.get(COOKIE_SESSION)?.value;
  if (!jeton) return null;

  const lignes = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      nom: users.fullName,
      email: users.email,
      doitChangerMotDePasse: users.mustChangePassword,
      statut: users.status,
      organizationId: sessions.organizationId,
      deviceId: sessions.deviceId,
      derniereActivite: sessions.lastSeenAt,
      verrouilleeLe: sessions.verrouilleeLe,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, empreinte(jeton)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const ligne = lignes[0];
  if (!ligne || ligne.statut !== "actif") return null;

  // Rattachements actifs de l'utilisateur, tous confondus.
  const rattachements = await db
    .select({
      organizationId: memberships.organizationId,
      nom: organizations.name,
      roleId: memberships.roleId,
      roleCle: roles.key,
      estProprietaire: memberships.isOwner,
      delaiVerrouillage: organizations.delaiVerrouillageMinutes,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(
      and(eq(memberships.userId, ligne.userId), eq(memberships.status, "actif")),
    );

  /**
   * L'entreprise active se déduit plutôt qu'elle ne se demande.
   *
   * Un exploitant qui n'a qu'une entreprise ne doit jamais avoir à la choisir :
   * lui présenter un sélecteur à une seule ligne est une étape inutile juste
   * après l'inscription. Le choix explicite n'a de sens qu'à partir de deux.
   *
   * Un rattachement révoqué depuis la dernière visite invalide l'entreprise
   * active sans invalider la session : on retombe sur les autres, ou sur aucune.
   */
  let actif = ligne.organizationId
    ? (rattachements.find((r) => r.organizationId === ligne.organizationId) ?? null)
    : null;

  if (!actif && rattachements.length === 1) {
    actif = rattachements[0];
    // Persisté pour ne pas refaire cette déduction à chaque requête.
    await db
      .update(sessions)
      .set({ organizationId: actif.organizationId, updatedAt: new Date() })
      .where(eq(sessions.id, ligne.sessionId));
  }

  const delaiVerrouillage = actif?.delaiVerrouillage ?? DELAI_VERROUILLAGE_DEFAUT;

  return {
    sessionId: ligne.sessionId,
    userId: ligne.userId,
    nom: ligne.nom,
    email: ligne.email,
    doitChangerMotDePasse: ligne.doitChangerMotDePasse,
    organizationId: actif?.organizationId ?? null,
    organizationNom: actif?.nom ?? null,
    roleId: actif?.roleId ?? null,
    roleCle: actif?.roleCle ?? null,
    estProprietaire: actif?.estProprietaire ?? false,
    deviceId: ligne.deviceId,
    verrouillee: sessionVerrouillee({
      verrouilleeLe: ligne.verrouilleeLe,
      derniereActivite: ligne.derniereActivite,
      delaiMinutes: delaiVerrouillage,
      maintenant: new Date(),
    }),
    delaiVerrouillage,
  };
}

/**
 * Enregistre un signe de vie du navigateur.
 *
 * Un signe de vie ne DÉVERROUILLE jamais : la mise à jour ne prend que si la
 * session n'est ni voilée ni éteinte depuis plus que le délai. Sans cette
 * condition, bouger la souris devant un écran verrouillé — ou depuis la caisse
 * restée ouverte à côté — rouvrirait la gestion sans mot de passe.
 *
 * Une session trouvée éteinte est verrouillée explicitement au passage : le
 * verrou devient un fait inscrit, plus seulement une déduction de l'heure.
 *
 * Rend vrai si la session est toujours ouverte.
 */
export async function signalerPresence(sessionId: string, delaiMinutes: number): Promise<boolean> {
  const limite = new Date(Date.now() - (delaiMinutes + MARGE_SERVEUR_MINUTES) * 60_000);
  const vivantes = await db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.verrouilleeLe),
        gt(sessions.lastSeenAt, limite),
      ),
    )
    .returning({ id: sessions.id });
  if (vivantes.length > 0) return true;
  await verrouillerSessionId(sessionId);
  return false;
}

/** Voile la session. Sans effet si elle l'est déjà : la première heure reste. */
export async function verrouillerSessionId(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ verrouilleeLe: sql`coalesce(${sessions.verrouilleeLe}, now())` })
    .where(eq(sessions.id, sessionId));
}

/** Lève le voile et repart d'une activité fraîche. Le mot de passe est vérifié par l'appelant. */
export async function deverrouillerSessionId(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ verrouilleeLe: null, lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

/**
 * Ferme la session courante.
 *
 * La ligne est révoquée plutôt que supprimée : savoir qu'une session a existé,
 * depuis quel appareil et jusqu'à quand, fait partie de la piste d'audit.
 */
export async function fermerSession(): Promise<void> {
  const magasin = await cookies();
  const jeton = magasin.get(COOKIE_SESSION)?.value;

  if (jeton) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, empreinte(jeton)));
  }

  magasin.delete(COOKIE_SESSION);
}

/** Révoque toutes les sessions d'un utilisateur — départ, appareil perdu. */
export async function revoquerToutesLesSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
