"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  DUREE_VERROU_MINUTES,
  apresEchec,
  estVerrouille,
  motifRefusMotDePasse,
  normaliserEmail,
} from "./identifiants";
import { hacherMotDePasse, verifierMotDePasse } from "./mot-de-passe";
import {
  CONNEXION_EXPIREE,
  fermerSession,
  lireSession,
  ouvrirSession,
} from "./session";
import { tracerPartout } from "@/lib/audit";
import { destinationApresConnexion } from "@/lib/navigation";

export interface EtatConnexion {
  erreur?: string;
  /** Adresse saisie, rendue au formulaire après un refus. */
  email?: string;
}

/** Même message pour une adresse inconnue et un mot de passe faux. */
const REFUS_CONNEXION = "Adresse e-mail ou mot de passe incorrect.";

/**
 * Connexion par adresse e-mail et mot de passe.
 *
 * La réponse ne dit jamais si l'adresse est connue : un formulaire qui répond
 * « ce compte n'existe pas » offre à qui le veut la liste de vos clients. Une
 * adresse inconnue fait même travailler Argon2 sur un leurre, pour répondre
 * dans le même temps qu'une adresse connue.
 *
 * Cinq échecs consécutifs verrouillent le compte quinze minutes. Le verrou se
 * dit, lui : il ne révèle rien qu'un essai de plus n'aurait appris.
 */
export async function seConnecter(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const saisie = String(donnees.get("email") ?? "");
  const motDePasse = String(donnees.get("motDePasse") ?? "");
  const email = normaliserEmail(saisie);

  if (!email || motDePasse.length === 0) {
    return { email: saisie, erreur: "Indiquez votre adresse e-mail et votre mot de passe." };
  }

  const [compte] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      status: users.status,
      failedLogins: users.failedLogins,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (compte && estVerrouille(compte.lockedUntil)) {
    await tracerPartout(compte.id, { action: "connexion.refusee", entite: "compte", entiteId: compte.id, apres: { motif: "verrouillé" } });
    return {
      email,
      erreur: `Trop d'essais infructueux. Réessayez dans ${DUREE_VERROU_MINUTES} minutes.`,
    };
  }

  const valide = await verifierMotDePasse(compte?.passwordHash ?? null, motDePasse);

  if (!compte || !valide) {
    if (compte) {
      const suite = apresEchec(compte.failedLogins);
      await db
        .update(users)
        .set({ ...suite, updatedAt: new Date() })
        .where(eq(users.id, compte.id));
      // Un mot de passe faux sur un compte connu se trace : une série d'échecs
      // depuis une même adresse est la signature d'une tentative d'intrusion.
      await tracerPartout(compte.id, {
        action: "connexion.refusee",
        entite: "compte",
        entiteId: compte.id,
        apres: { motif: "mot de passe incorrect", echecs: suite.failedLogins, verrouille: Boolean(suite.lockedUntil) },
      });
    }
    return { email, erreur: REFUS_CONNEXION };
  }

  if (compte.status !== "actif") {
    return {
      email,
      erreur: "Ce compte est suspendu. Adressez-vous au responsable de votre entreprise.",
    };
  }

  await db
    .update(users)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, compte.id));

  await ouvrirSessionAvecContexte(compte.id);
  await tracerPartout(compte.id, { action: "connexion.reussie", entite: "compte", entiteId: compte.id });
  redirect(destinationApresConnexion(donnees.get("suite")));
}

export interface EtatMotDePasse {
  erreur?: string;
  change?: boolean;
}

/**
 * Change le mot de passe de la personne connectée.
 *
 * L'actuel est exigé, même provisoire : une session laissée ouverte sur la
 * caisse ne doit pas suffire à s'approprier le compte. Les autres sessions
 * sont fermées — un changement de mot de passe sert souvent à couper un
 * appareil perdu.
 */
export async function changerMotDePasse(
  _precedent: EtatMotDePasse,
  donnees: FormData,
): Promise<EtatMotDePasse> {
  const active = await lireSession();
  if (!active) redirect(CONNEXION_EXPIREE);
  // Écran verrouillé : seul le déverrouillage répond. Sans cela, cette action
  // resterait appelable sous le voile, mot de passe actuel à l'appui.
  if (active.verrouillee) redirect("/verrouille");

  const actuel = String(donnees.get("actuel") ?? "");
  const nouveau = String(donnees.get("nouveau") ?? "");
  const confirmation = String(donnees.get("confirmation") ?? "");

  const [compte] = await db
    .select({
      passwordHash: users.passwordHash,
      email: users.email,
      failedLogins: users.failedLogins,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .where(eq(users.id, active.userId));

  if (!compte) redirect(CONNEXION_EXPIREE);

  // Vérifier le mot de passe actuel, c'est le deviner autant de fois qu'on
  // veut si les échecs ne comptent pas : même compteur que la connexion et le
  // déverrouillage.
  if (estVerrouille(compte.lockedUntil)) {
    return { erreur: `Trop d'essais infructueux. Réessayez dans ${DUREE_VERROU_MINUTES} minutes.` };
  }
  if (!(await verifierMotDePasse(compte.passwordHash, actuel))) {
    const suite = apresEchec(compte.failedLogins);
    await db.update(users).set({ ...suite, updatedAt: new Date() }).where(eq(users.id, active.userId));
    return {
      erreur: suite.lockedUntil
        ? `Trop d'essais infructueux. Réessayez dans ${DUREE_VERROU_MINUTES} minutes.`
        : "Le mot de passe actuel est incorrect.",
    };
  }

  const refus = motifRefusMotDePasse(nouveau, { email: compte.email });
  if (refus) return { erreur: refus };
  if (nouveau === actuel) {
    return { erreur: "Le nouveau mot de passe doit différer de l'actuel." };
  }
  if (nouveau !== confirmation) {
    return { erreur: "Les deux mots de passe ne correspondent pas." };
  }

  const empreinte = await hacherMotDePasse(nouveau);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: empreinte,
        mustChangePassword: false,
        failedLogins: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, active.userId));

    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, active.userId),
          ne(sessions.id, active.sessionId),
          isNull(sessions.revokedAt),
        ),
      );
  });

  await tracerPartout(active.userId, {
    action: "compte.mot_de_passe",
    entite: "compte",
    entiteId: active.userId,
    apres: { provisoireRemplace: active.doitChangerMotDePasse, autresSessionsFermees: true },
  });

  if (active.doitChangerMotDePasse) redirect("/accueil");
  return { change: true };
}

export async function seDeconnecter(): Promise<void> {
  // Lue AVANT la fermeture : après, il n'y a plus personne à qui l'attribuer.
  const active = await lireSession();
  if (active) {
    await tracerPartout(active.userId, { action: "deconnexion", entite: "compte", entiteId: active.userId });
  }
  await fermerSession();
  redirect("/connexion");
}

/** Entreprise active de la session, pour l'affichage. */
export async function sessionCourante() {
  return lireSession();
}

// ------------------------------------------------------------------ outils

async function ouvrirSessionAvecContexte(userId: string): Promise<void> {
  const entetes = await headers();

  await ouvrirSession(userId, {
    userAgent: entetes.get("user-agent") ?? undefined,
    // Derrière un proxy, l'adresse réelle est en tête ; la première valeur de
    // x-forwarded-for est celle du client.
    ipAddress:
      entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      entetes.get("x-real-ip") ??
      undefined,
  });
}
