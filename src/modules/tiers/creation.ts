import "server-only";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import type { NatureTiers } from "./natures";
import { tiers } from "./schema";

export interface NouveauTiers {
  nom: string;
  nature?: NatureTiers;
  estClient?: boolean;
  estFournisseur?: boolean;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  ville?: string | null;
  identifiantFiscal?: string | null;
  secteur?: string | null;
  plafondEncours?: number;
  delaiReglementJours?: number;
  delaiLivraisonJours?: number;
  notes?: string | null;
  /** Référence imposée. Nulle : attribuée par le compteur. */
  code?: string | null;
}

/**
 * Crée un tiers, sa référence et ses comptes auxiliaires, dans une transaction.
 *
 * Les trois vont ensemble. Un tiers sans compte auxiliaire ne peut pas recevoir
 * d'écriture : sa première facture bloquerait la comptabilisation, ou pire,
 * partirait sur le compte collectif où plus personne ne saurait à qui elle
 * appartient.
 *
 * Les comptes sont attribués par rôle : 411 pour le client, 401 pour le
 * fournisseur. Un tiers qui tient les deux rôles reçoit les deux comptes — sa
 * créance et sa dette ne se compensent pas toutes seules, elles se lettrent.
 */
export async function creerTiersDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouveauTiers,
  userId?: string,
): Promise<{ id: string; code: string }> {
  const estClient = donnees.estClient ?? true;
  const estFournisseur = donnees.estFournisseur ?? false;

  if (!estClient && !estFournisseur) {
    throw new Error("Un tiers est client, fournisseur, ou les deux.");
  }

  const code =
    donnees.code?.trim() ||
    (await prochainNumero(tx, organizationId, {
      // La suite des clients et celle des fournisseurs avancent séparément :
      // une numérotation commune donnerait C0001 puis C0003 sur le fichier
      // clients, avec le 0002 parti chez un fournisseur.
      cle: estClient ? "tiers:client" : "tiers:fournisseur",
      prefix: estClient ? "C" : "F",
      padding: 4,
    }));

  const compteClient = estClient
    ? await prochainNumero(tx, organizationId, {
        cle: "auxiliaire:411",
        prefix: "411",
        padding: 3,
      })
    : null;

  const compteFournisseur = estFournisseur
    ? await prochainNumero(tx, organizationId, {
        cle: "auxiliaire:401",
        prefix: "401",
        padding: 3,
      })
    : null;

  const id = newId();

  await tx.insert(tiers).values({
    id,
    organizationId,
    code,
    nature: donnees.nature ?? "entreprise",
    nom: donnees.nom.trim(),
    estClient,
    estFournisseur,
    telephone: donnees.telephone ?? null,
    email: donnees.email ?? null,
    adresse: donnees.adresse ?? null,
    ville: donnees.ville ?? null,
    identifiantFiscal: donnees.identifiantFiscal ?? null,
    secteur: donnees.secteur ?? null,
    compteClient,
    compteFournisseur,
    plafondEncours: donnees.plafondEncours ?? 0,
    delaiReglementJours: donnees.delaiReglementJours ?? 0,
    delaiLivraisonJours: donnees.delaiLivraisonJours ?? 0,
    notes: donnees.notes ?? null,
  });

  if (userId) {
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "tiers.creer",
      entityType: "tiers",
      entityId: id,
      after: { code, nom: donnees.nom, compteClient, compteFournisseur },
    });
  }

  return { id, code };
}

/** Même chose, hors d'une transaction existante. */
export async function creerTiersPour(
  organizationId: string,
  donnees: NouveauTiers,
  userId?: string,
): Promise<{ id: string; code: string }> {
  return db.transaction((tx) => creerTiersDans(tx, organizationId, donnees, userId));
}
