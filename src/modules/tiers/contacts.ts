import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";

import { contactsTiers, tiers } from "./schema";

type Lecteur = Pick<Transaction, "select">;

export interface FicheContact {
  nom: string;
  fonction?: string | null;
  telephone?: string | null;
  email?: string | null;
  principal?: boolean;
  notes?: string | null;
}

/** « Konan Yao, responsable des achats » : ce qui s'imprime sur la pièce. */
export const libelleContact = (c: { nom: string; fonction: string | null }) => (c.fonction ? `${c.nom}, ${c.fonction}` : c.nom);

/**
 * Crée ou modifie un contact. Désigné principal, il retire ce rôle à
 * l'ancien : un seul contact est proposé par défaut sur les nouvelles pièces.
 */
export async function enregistrerContactDans(
  tx: Transaction,
  organizationId: string,
  tiersId: string,
  id: string | null,
  f: FicheContact,
  userId: string,
): Promise<{ id: string }> {
  const [t] = await tx
    .select({ id: tiers.id })
    .from(tiers)
    .where(and(eq(tiers.id, tiersId), eq(tiers.organizationId, organizationId), isNull(tiers.deletedAt)));
  if (!t) throw new Error("Tiers introuvable.");
  if (!f.nom.trim()) throw new Error("Le nom du contact est requis.");
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) throw new Error("Adresse e-mail invalide.");

  if (f.principal) {
    await tx
      .update(contactsTiers)
      .set({ principal: false, updatedAt: new Date() })
      .where(and(eq(contactsTiers.tiersId, tiersId), eq(contactsTiers.organizationId, organizationId), eq(contactsTiers.principal, true)));
  }
  const valeurs = {
    nom: f.nom.trim(),
    fonction: f.fonction?.trim() || null,
    telephone: f.telephone?.trim() || null,
    email: f.email?.trim().toLowerCase() || null,
    principal: Boolean(f.principal),
    notes: f.notes?.trim() || null,
  };
  if (id) {
    const [m] = await tx
      .update(contactsTiers)
      .set({ ...valeurs, updatedAt: new Date(), version: sql`${contactsTiers.version} + 1` })
      .where(and(isNull(contactsTiers.deletedAt), eq(contactsTiers.id, id), eq(contactsTiers.tiersId, tiersId), eq(contactsTiers.organizationId, organizationId)))
      .returning({ id: contactsTiers.id });
    if (!m) throw new Error("Contact introuvable.");
  } else {
    id = newId();
    await tx.insert(contactsTiers).values({ id, organizationId, tiersId, ...valeurs });
  }
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "contact.enregistrer", entityType: "contact", entityId: id, after: { tiersId, ...valeurs } });
  return { id };
}

/** Retire un contact : il quitte les listes ; les pièces passées gardent son nom imprimé. */
export async function retirerContactDans(tx: Transaction, organizationId: string, id: string, userId: string): Promise<{ nom: string }> {
  const [c] = await tx
    .update(contactsTiers)
    .set({ actif: false, principal: false, updatedAt: new Date(), version: sql`${contactsTiers.version} + 1` })
    .where(and(isNull(contactsTiers.deletedAt), eq(contactsTiers.id, id), eq(contactsTiers.organizationId, organizationId)))
    .returning({ nom: contactsTiers.nom });
  if (!c) throw new Error("Contact introuvable.");
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "contact.retirer", entityType: "contact", entityId: id, after: { nom: c.nom } });
  return c;
}

/**
 * Le contact choisi sur une pièce, vérifié : il appartient bien à CE tiers
 * et il est actif. Rend ce qui se recopie sur la pièce.
 */
export async function contactPourPiece(
  lecteur: Lecteur,
  organizationId: string,
  tiersId: string,
  contactId: string | null | undefined,
): Promise<{ contactId: string | null; contactNom: string | null }> {
  if (!contactId) return { contactId: null, contactNom: null };
  const [c] = await lecteur
    .select({ id: contactsTiers.id, nom: contactsTiers.nom, fonction: contactsTiers.fonction })
    .from(contactsTiers)
    .where(
      and(
        eq(contactsTiers.id, contactId),
        eq(contactsTiers.organizationId, organizationId),
        eq(contactsTiers.tiersId, tiersId),
        eq(contactsTiers.actif, true),
        isNull(contactsTiers.deletedAt),
      ),
    );
  if (!c) throw new Error("Ce contact n'appartient pas à ce tiers.");
  return { contactId: c.id, contactNom: libelleContact(c) };
}

export interface ContactVue {
  id: string;
  tiersId: string;
  nom: string;
  fonction: string | null;
  telephone: string | null;
  email: string | null;
  principal: boolean;
  notes: string | null;
}

/** Contacts actifs, par tiers, le principal en tête. Une requête pour tout le fichier. */
export async function contactsParTiers(organizationId: string): Promise<Map<string, ContactVue[]>> {
  const lignes = await db
    .select({
      id: contactsTiers.id,
      tiersId: contactsTiers.tiersId,
      nom: contactsTiers.nom,
      fonction: contactsTiers.fonction,
      telephone: contactsTiers.telephone,
      email: contactsTiers.email,
      principal: contactsTiers.principal,
      notes: contactsTiers.notes,
    })
    .from(contactsTiers)
    .where(and(eq(contactsTiers.organizationId, organizationId), eq(contactsTiers.actif, true), isNull(contactsTiers.deletedAt)))
    .orderBy(desc(contactsTiers.principal), asc(contactsTiers.nom));
  const parTiers = new Map<string, ContactVue[]>();
  for (const l of lignes) parTiers.set(l.tiersId, [...(parTiers.get(l.tiersId) ?? []), l]);
  return parTiers;
}
