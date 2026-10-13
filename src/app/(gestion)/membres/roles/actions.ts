"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs, rolePermissions, roles } from "@/db/schema";
import { slug } from "@/lib/slug";
import { droitsAccordables, presetRole, type Droit } from "@/lib/droits/catalogue";
import { droitsActifs, exigerDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { estDoublon, estReferencee } from "@/lib/erreurs-pg";

export interface EtatRole {
  erreur?: string;
  /** Nom du rôle créé ou modifié — sert à confirmer sans recharger la page. */
  enregistre?: string;
}

const schema = z.object({
  nom: z.string().trim().min(2, "Donnez un nom au rôle."),
  description: z.string().trim().max(200).optional(),
});

/** Les cases cochées du formulaire, dans l'ordre où elles arrivent. */
function droitsCoches(donnees: FormData): string[] {
  return donnees.getAll("droits").filter((v): v is string => typeof v === "string");
}

/**
 * Compose un rôle propre à l'entreprise.
 *
 * Les rôles fournis couvrent la boutique, le maquis et l'atelier. Ils ne
 * couvrent pas tout : une pharmacie veut un préparateur qui voit le stock sans
 * toucher aux prix, une station-service un pompiste qui encaisse sans voir la
 * marge. Plutôt que d'allonger la liste des préréglages jusqu'à ce que
 * personne ne s'y retrouve, l'exploitant compose le sien.
 */
export async function creerRole(
  _precedent: EtatRole,
  donnees: FormData,
): Promise<EtatRole> {
  const session = await exigerDroit("organisation.membre.gerer");

  const analyse = schema.safeParse({
    nom: donnees.get("nom"),
    description: donnees.get("description"),
  });

  if (!analyse.success) return { erreur: analyse.error.issues[0].message };

  const cle = slug(analyse.data.nom);
  if (cle.length === 0) {
    return { erreur: "Ce nom ne donne aucun identifiant lisible." };
  }

  // Un rôle maison qui porterait la clé d'un préréglage se verrait attribuer
  // les droits du code au lieu des siens : la résolution regarde la clé avant
  // de descendre en base.
  if (presetRole(cle)) {
    return { erreur: `Ce nom est celui d'un rôle fourni par Maria Suite.` };
  }

  const accordes = droitsAccordables(await droitsActifs(), droitsCoches(donnees));
  if (accordes.length === 0) {
    return { erreur: "Cochez au moins un droit : un rôle sans droit n'ouvre rien." };
  }

  const roleId = newId();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(roles).values({
        id: roleId,
        organizationId: session.organizationId,
        key: cle,
        name: analyse.data.nom,
        description: analyse.data.description ?? null,
        isSystem: false,
      });

      await tx
        .insert(rolePermissions)
        .values(accordes.map((droit) => ({ roleId, permissionKey: droit })));

      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId: session.organizationId,
        userId: session.userId,
        action: "role.creer",
        entityType: "role",
        entityId: roleId,
        after: { nom: analyse.data.nom, droits: accordes },
      });
    });
  } catch (erreur) {
    if (estDoublon(erreur)) {
      return { erreur: "Un rôle porte déjà ce nom." };
    }
    throw erreur;
  }

  revalidatePath("/membres/roles");
  revalidatePath("/membres");
  return { enregistre: analyse.data.nom };
}

/**
 * Change les droits d'un rôle composé par l'entreprise.
 *
 * Deux règles se croisent ici, et toutes deux découlent du même principe : on
 * ne dispose que de ce que l'on détient.
 *
 *   · on n'ajoute qu'un droit que l'on a soi-même ;
 *   · on ne retire pas un droit que l'on n'a pas.
 *
 * La seconde est moins évidente et tout aussi nécessaire. Un rôle composé par
 * le propriétaire peut porter l'abonnement ; si le gérant modifiait ce rôle,
 * ce droit disparaîtrait sans qu'il l'ait décidé — son formulaire ne le lui
 * montre même pas. Les droits hors de sa portée sont donc conservés tels quels.
 */
export async function modifierDroitsRole(
  _precedent: EtatRole,
  donnees: FormData,
): Promise<EtatRole> {
  const session = await exigerDroit("organisation.membre.gerer");
  const roleId = String(donnees.get("roleId") ?? "");

  const [role] = await db
    .select({ id: roles.id, nom: roles.name, systeme: roles.isSystem })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, session.organizationId)));

  if (!role) return { erreur: "Ce rôle n'existe pas dans cette entreprise." };

  if (role.systeme) {
    return {
      erreur:
        "Les droits d'un rôle fourni par Maria Suite ne se modifient pas. Composez le vôtre.",
    };
  }

  const detenus = await droitsActifs();

  const existants = await db
    .select({ cle: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, role.id));

  const horsPortee = existants
    .map((accord) => accord.cle as Droit)
    .filter((cle) => !detenus.has(cle));

  const choisis = droitsAccordables(detenus, droitsCoches(donnees));
  const final = [...new Set([...horsPortee, ...choisis])];

  if (final.length === 0) {
    return { erreur: "Cochez au moins un droit : un rôle sans droit n'ouvre rien." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await tx
      .insert(rolePermissions)
      .values(final.map((droit) => ({ roleId: role.id, permissionKey: droit })));

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId: session.organizationId,
      userId: session.userId,
      action: "role.droits",
      entityType: "role",
      entityId: role.id,
      after: { nom: role.nom, droits: final },
    });
  });

  revalidatePath("/membres/roles");
  revalidatePath("/membres");
  return { enregistre: role.nom };
}

/**
 * Supprime un rôle composé par l'entreprise.
 *
 * Un rôle porté ne se supprime pas : la contrainte de clé étrangère est en
 * `restrict`, et c'est heureux — le retirer laisserait ses porteurs rattachés
 * sans droits, dehors sans explication. On leur en donne un autre d'abord.
 */
export async function supprimerRole(donnees: FormData): Promise<void> {
  const session = await exigerDroit("organisation.membre.gerer");
  const roleId = String(donnees.get("roleId") ?? "");

  const [role] = await db
    .select({ id: roles.id, nom: roles.name, systeme: roles.isSystem })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, session.organizationId)));

  if (!role) return;

  if (role.systeme) {
    throw new Error("Un rôle fourni par Maria Suite ne se supprime pas.");
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      await tx.delete(roles).where(eq(roles.id, role.id));

      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId: session.organizationId,
        userId: session.userId,
        action: "role.supprimer",
        entityType: "role",
        entityId: role.id,
        before: { nom: role.nom },
      });
    });
  } catch (erreur) {
    // 23503 : violation de clé étrangère. Le rôle est encore porté.
    if (estReferencee(erreur)) {
      throw new Error(
        "Ce rôle est encore attribué. Donnez un autre rôle à ces personnes avant de le supprimer.",
      );
    }
    throw erreur;
  }

  revalidatePath("/membres/roles");
  revalidatePath("/membres");
}
