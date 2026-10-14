"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  accesModules,
  auditLogs,
  memberships,
  organizationModules,
  roles,
  sessions,
  users,
} from "@/db/schema";
import { exigerEntreprise } from "@/lib/auth/dal";
import { MOTIF_ADRESSE_REFUSEE, adresseAutorisee, normaliserEmail } from "@/lib/auth/identifiants";
import { compteExclusifA, rattachementDe } from "@/lib/auth/membres";
import { genererMotDePasseProvisoire, hacherMotDePasse } from "@/lib/auth/mot-de-passe";
import { exigerDroit, refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { getModule } from "@/modules/registry";
import { estDoublon } from "@/lib/erreurs-pg";

export interface EtatMembre {
  erreur?: string;
  /** Nom du membre ajouté — sert à confirmer sans recharger la liste. */
  ajoute?: string;
  /**
   * Mot de passe provisoire, montré UNE fois au responsable pour qu'il le
   * remette à la personne. Il n'est stocké nulle part en clair.
   */
  motDePasse?: string;
  email?: string;
}

const schemaAjout = z.object({
  nom: z.string().trim().min(2, "Indiquez le nom de la personne."),
  email: z.string().trim().min(1, "Indiquez une adresse e-mail."),
  roleId: z.uuid("Choisissez un rôle."),
});

/**
 * Donne accès au logiciel à quelqu'un.
 *
 * L'accès est ouvert tout de suite : le gérant crée le compte de son caissier
 * devant lui. Un compte neuf reçoit un mot de passe PROVISOIRE, affiché une
 * fois au gérant, que la personne doit remplacer à sa première connexion.
 *
 * Une adresse déjà connue est simplement rattachée : son mot de passe ne
 * change pas, et rien n'est affiché. Sans cette règle, donner un accès à
 * quelqu'un qui a déjà un compte reviendrait à en prendre le contrôle.
 */
export async function ajouterMembre(
  _precedent: EtatMembre,
  donnees: FormData,
): Promise<EtatMembre> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("organisation.membre.gerer");
  if (refus) return refus;

  const analyse = schemaAjout.safeParse({
    nom: donnees.get("nom"),
    email: donnees.get("email"),
    roleId: donnees.get("roleId"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const email = normaliserEmail(analyse.data.email);
  if (!email) return { erreur: "Adresse e-mail invalide." };
  if (!adresseAutorisee(email)) return { erreur: MOTIF_ADRESSE_REFUSEE };

  // Le rôle vient du navigateur : il doit appartenir à cette entreprise, sinon
  // un identifiant deviné donnerait les droits d'un rôle d'ailleurs.
  const [role] = await db
    .select({ id: roles.id, cle: roles.key, nom: roles.name })
    .from(roles)
    .where(
      and(eq(roles.id, analyse.data.roleId), eq(roles.organizationId, session.organizationId)),
    );

  if (!role) return { erreur: "Ce rôle n'existe pas dans cette entreprise." };

  // L'écran ne le propose pas ; l'action le refuse quand même. Une action
  // serveur est une route HTTP, et l'identifiant du rôle vient du navigateur.
  if (role.cle === "proprietaire") {
    return { erreur: "Le rôle de propriétaire ne s'attribue pas." };
  }

  let provisoire: string | undefined;

  try {
    const [existant] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    // Le hachage se fait hors transaction : Argon2 prend ses cinquante
    // millisecondes, une connexion du pooler n'a pas à les attendre.
    let empreinte: string | undefined;
    if (!existant) {
      provisoire = genererMotDePasseProvisoire();
      empreinte = await hacherMotDePasse(provisoire);
    }

    await db.transaction(async (tx) => {
      let userId = existant?.id;

      if (!userId) {
        userId = newId();
        await tx.insert(users).values({
          id: userId,
          email,
          fullName: analyse.data.nom,
          passwordHash: empreinte,
          mustChangePassword: true,
        });
      }

      await tx.insert(memberships).values({
        id: newId(),
        organizationId: session.organizationId,
        userId,
        roleId: role.id,
        status: "actif",
        isOwner: false,
        joinedAt: new Date(),
      });

      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId: session.organizationId,
        userId: session.userId,
        action: "membre.ajouter",
        entityType: "membership",
        entityId: userId,
        after: { email, nom: analyse.data.nom, role: role.nom, compteCree: !existant },
      });
    });
  } catch (erreur) {
    // 23505 : violation d'unicité. Ici, un rattachement déjà existant entre
    // cette personne et cette entreprise.
    if (estDoublon(erreur)) {
      return { erreur: "Cette personne a déjà un accès à cette entreprise." };
    }
    throw erreur;
  }

  revalidatePath("/membres");
  return { ajoute: analyse.data.nom, email, motDePasse: provisoire };
}

export type ResultatReinitialisation =
  | { ok: true; email: string; motDePasse: string }
  | { ok: false; message: string };

/**
 * Redonne un mot de passe provisoire à un membre qui a oublié le sien.
 *
 * Refusé pour le propriétaire, pour soi-même (l'écran « Mot de passe » sert à
 * cela) et pour un compte qui a un accès dans une AUTRE entreprise : le
 * responsable d'ici n'a pas à pouvoir entrer chez le voisin.
 *
 * Les sessions ouvertes du membre sont fermées : un mot de passe réinitialisé
 * l'est souvent parce qu'un appareil a changé de mains.
 */
export async function reinitialiserMotDePasse(
  membershipId: string,
): Promise<ResultatReinitialisation> {
  const session = await exigerEntreprise();

  const refus = await refusDroit("organisation.membre.gerer");
  if (refus) return { ok: false, message: refus.erreur };

  const rattachement = await rattachementDe(session.organizationId, membershipId);
  if (!rattachement) return { ok: false, message: "Membre introuvable." };

  if (rattachement.proprietaire) {
    return { ok: false, message: "Le mot de passe du propriétaire ne se réinitialise pas ici." };
  }
  if (rattachement.userId === session.userId) {
    return { ok: false, message: "Changez votre propre mot de passe depuis l'écran « Mot de passe »." };
  }
  if (!(await compteExclusifA(session.organizationId, rattachement.userId))) {
    return {
      ok: false,
      message:
        "Ce compte a aussi un accès dans une autre entreprise : seule la personne peut changer son mot de passe.",
    };
  }

  const [compte] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, rattachement.userId));

  if (!compte?.email) {
    return { ok: false, message: "Ce compte n'a pas d'adresse e-mail : il ne peut pas se connecter." };
  }

  const provisoire = genererMotDePasseProvisoire();
  const empreinte = await hacherMotDePasse(provisoire);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: empreinte,
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, rattachement.userId));

    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, rattachement.userId), isNull(sessions.revokedAt)));

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: session.organizationId,
      userId: session.userId,
      action: "membre.mot_de_passe",
      entityType: "membership",
      entityId: rattachement.userId,
      after: { email: compte.email },
    });
  });

  return { ok: true, email: compte.email, motDePasse: provisoire };
}

/**
 * Change le rôle d'un membre.
 *
 * Le propriétaire est intouchable : son rôle est la seule garantie qu'il
 * restera quelqu'un pour administrer l'entreprise. Sans cette règle, un gérant
 * pourrait rétrograder celui à qui le commerce appartient.
 */
export async function changerRoleMembre(donnees: FormData): Promise<void> {
  const session = await exigerDroit("organisation.membre.gerer");

  const membershipId = String(donnees.get("membershipId") ?? "");
  const roleId = String(donnees.get("roleId") ?? "");

  const rattachement = await rattachementDe(session.organizationId, membershipId);
  if (!rattachement || rattachement.roleId === roleId) return;

  if (rattachement.proprietaire) {
    throw new Error("Le rôle du propriétaire ne se change pas.");
  }

  // Se rétrograder soi-même reviendrait à se fermer la porte, sans personne
  // pour la rouvrir si l'on était le seul à tenir ce droit.
  if (rattachement.userId === session.userId) {
    throw new Error("On ne change pas son propre rôle.");
  }

  const [role] = await db
    .select({ id: roles.id, cle: roles.key, nom: roles.name })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, session.organizationId)));

  if (!role) return;

  if (role.cle === "proprietaire") {
    throw new Error("Le rôle de propriétaire ne s'attribue pas.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ roleId: role.id, updatedAt: new Date() })
      .where(eq(memberships.id, membershipId));

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: session.organizationId,
      userId: session.userId,
      action: "membre.role",
      entityType: "membership",
      entityId: rattachement.userId,
      after: { role: role.nom },
    });
  });

  revalidatePath("/membres");
}

/**
 * Suspend un accès, ou le rétablit.
 *
 * Pas de suppression : le rattachement porte l'historique de qui a encaissé,
 * saisi, corrigé. L'effacer laisserait des pièces sans auteur, et une caisse
 * dont on ne sait plus qui la tenait ne se contrôle plus.
 */
export async function changerStatutMembre(donnees: FormData): Promise<void> {
  const session = await exigerDroit("organisation.membre.gerer");

  const membershipId = String(donnees.get("membershipId") ?? "");
  const suspendre = donnees.get("suspendre") === "1";

  const rattachement = await rattachementDe(session.organizationId, membershipId);
  if (!rattachement) return;

  if (rattachement.proprietaire) {
    throw new Error("L'accès du propriétaire ne se coupe pas.");
  }

  if (rattachement.userId === session.userId) {
    throw new Error("On ne coupe pas son propre accès.");
  }

  const statut = suspendre ? "suspendu" : "actif";

  await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ status: statut, updatedAt: new Date() })
      .where(eq(memberships.id, membershipId));

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: session.organizationId,
      userId: session.userId,
      action: "membre.statut",
      entityType: "membership",
      entityId: rattachement.userId,
      after: { statut },
    });
  });

  revalidatePath("/membres");
}

// ---------------------------------------------------------- accès par module

export type ResultatAcces = { ok: true; message: string } | { ok: false; message: string };

const NIVEAUX = ["aucun", "consultation", "complet"] as const;

/**
 * Fixe le niveau d'accès d'un membre à un module.
 *
 * Le niveau RESSERRE ce que le rôle accorde, il n'ajoute rien. Ni le
 * propriétaire ni soi-même ne se règlent ici : le premier n'est jamais
 * restreint, et se fermer un module à soi-même ne laisserait personne pour le
 * rouvrir si l'on était seul à le tenir.
 */
export async function definirAcces(
  membershipId: string,
  moduleKey: string,
  niveau: string,
): Promise<ResultatAcces> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("organisation.membre.gerer");
  if (refus) return { ok: false, message: refus.erreur };

  if (!getModule(moduleKey)) return { ok: false, message: "Module inconnu." };
  if (!NIVEAUX.includes(niveau as (typeof NIVEAUX)[number])) {
    return { ok: false, message: "Niveau inconnu." };
  }

  const rattachement = await rattachementDe(session.organizationId, membershipId);
  if (!rattachement) return { ok: false, message: "Membre introuvable." };
  if (rattachement.proprietaire) {
    return { ok: false, message: "Le propriétaire a toujours accès à tout." };
  }
  if (rattachement.userId === session.userId) {
    return { ok: false, message: "On ne règle pas ses propres accès." };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(accesModules)
      .values({
        id: newId(),
        organizationId: session.organizationId,
        membershipId,
        moduleKey,
        niveau: niveau as (typeof NIVEAUX)[number],
      })
      .onConflictDoUpdate({
        target: [accesModules.membershipId, accesModules.moduleKey],
        set: { niveau: niveau as (typeof NIVEAUX)[number], updatedAt: new Date() },
      });

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: session.organizationId,
      userId: session.userId,
      action: "membre.acces",
      entityType: "membership",
      entityId: rattachement.userId,
      after: { module: moduleKey, niveau },
    });
  });

  revalidatePath("/membres", "layout");
  return { ok: true, message: "Accès mis à jour." };
}

/**
 * Active ou coupe un module pour toute l'entreprise.
 *
 * Réservé à qui gère les paramètres de l'entreprise : couper un module le
 * retire à tout le monde, propriétaire compris, d'un seul geste.
 */
export async function basculerModule(moduleKey: string, actif: boolean): Promise<ResultatAcces> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("organisation.parametres.gerer");
  if (refus) return { ok: false, message: refus.erreur };

  const definition = getModule(moduleKey);
  if (!definition) return { ok: false, message: "Module inconnu." };

  await db.transaction(async (tx) => {
    await tx
      .insert(organizationModules)
      .values({
        id: newId(),
        organizationId: session.organizationId,
        moduleKey,
        enabled: actif,
      })
      .onConflictDoUpdate({
        target: [organizationModules.organizationId, organizationModules.moduleKey],
        set: { enabled: actif, updatedAt: new Date() },
      });

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: session.organizationId,
      userId: session.userId,
      action: actif ? "module.activer" : "module.couper",
      entityType: "module",
      entityId: session.organizationId,
      after: { module: moduleKey },
    });
  });

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: actif ? `${definition.name} activé.` : `${definition.name} coupé pour toute l'entreprise.`,
  };
}
