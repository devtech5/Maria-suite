import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { estDoublon } from "@/lib/erreurs-pg";
import { newId } from "@/lib/ids";

import type { Marque, NatureSite } from "./calcul";
import { nouvelleCleRelais } from "./jetons";
import { cameras, sitesSecurite } from "./schema";

/** Adresse IPv4 ou nom d'hôte local, sans schéma ni chemin. */
const ADRESSE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/i;

export interface NouveauSite {
  nom: string;
  nature: NatureSite;
  adresse?: string | null;
  marque: Marque;
  enregistreurAdresse: string;
  enregistreurPort?: number;
}

export async function creerSitePour(organizationId: string, saisie: NouveauSite, userId: string): Promise<string> {
  const nom = saisie.nom.trim();
  if (nom.length < 2) throw new Error("Donnez un nom au site.");
  const ip = saisie.enregistreurAdresse.trim();
  if (!ADRESSE.test(ip)) throw new Error("Adresse de l'enregistreur invalide : par exemple 192.168.1.64.");

  const id = newId();
  try {
    await db.insert(sitesSecurite).values({
      id,
      organizationId,
      nom,
      nature: saisie.nature,
      adresse: saisie.adresse?.trim() || null,
      marque: saisie.marque,
      enregistreurAdresse: ip,
      enregistreurPort: saisie.enregistreurPort ?? 554,
    });
  } catch (erreur) {
    if (estDoublon(erreur)) throw new Error(`Le site « ${nom} » existe déjà.`);
    throw erreur;
  }
  await db.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "site_securite.creer", entityType: "site_securite", entityId: id, after: { nom } });
  return id;
}

export interface NouvelleCamera {
  siteId: string;
  nom: string;
  emplacement?: string | null;
  canal: number;
  hd?: boolean;
}

export async function creerCameraPour(organizationId: string, saisie: NouvelleCamera, userId: string): Promise<string> {
  const nom = saisie.nom.trim();
  if (nom.length < 2) throw new Error("Donnez un nom à la caméra.");
  if (!Number.isInteger(saisie.canal) || saisie.canal < 1 || saisie.canal > 256) throw new Error("Canal : un numéro de 1 à 256.");

  const [site] = await db
    .select({ id: sitesSecurite.id })
    .from(sitesSecurite)
    .where(and(eq(sitesSecurite.id, saisie.siteId), eq(sitesSecurite.organizationId, organizationId), isNull(sitesSecurite.deletedAt)));
  if (!site) throw new Error("Site introuvable.");

  const id = newId();
  try {
    await db.insert(cameras).values({
      id,
      organizationId,
      siteId: saisie.siteId,
      nom,
      emplacement: saisie.emplacement?.trim() || null,
      canal: saisie.canal,
      hd: saisie.hd ?? false,
      ordre: saisie.canal,
    });
  } catch (erreur) {
    if (estDoublon(erreur)) throw new Error(`Le canal ${saisie.canal} a déjà sa caméra sur ce site.`);
    throw erreur;
  }
  await db.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "camera.creer", entityType: "camera", entityId: id, after: { nom, canal: saisie.canal } });
  return id;
}

/** Active ou retire une caméra du mur, ou change sa haute définition. */
export async function reglerCameraPour(
  organizationId: string,
  userId: string,
  cameraId: string,
  reglage: { actif?: boolean; hd?: boolean },
): Promise<void> {
  const [maj] = await db
    .update(cameras)
    .set({ ...reglage, updatedAt: new Date(), version: sql`${cameras.version} + 1` })
    .where(and(isNull(cameras.deletedAt), eq(cameras.id, cameraId), eq(cameras.organizationId, organizationId)))
    .returning({ nom: cameras.nom });
  if (!maj) throw new Error("Caméra introuvable.");
  await db.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "camera.regler", entityType: "camera", entityId: cameraId, after: { nom: maj.nom, ...reglage } });
}

/**
 * Émet une nouvelle clé de relais pour un site, et invalide la précédente.
 * Elle est rendue UNE fois : la base n'en garde que l'empreinte.
 */
export async function emettreCleRelaisPour(organizationId: string, userId: string, siteId: string): Promise<string> {
  const { cle, empreinte } = nouvelleCleRelais();
  const [maj] = await db
    .update(sitesSecurite)
    .set({ relaisEmpreinte: empreinte, relaisVuLe: null, updatedAt: new Date(), version: sql`${sitesSecurite.version} + 1` })
    .where(and(isNull(sitesSecurite.deletedAt), eq(sitesSecurite.id, siteId), eq(sitesSecurite.organizationId, organizationId)))
    .returning({ nom: sitesSecurite.nom });
  if (!maj) throw new Error("Site introuvable.");
  await db.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "site_securite.cle_relais", entityType: "site_securite", entityId: siteId, after: { nom: maj.nom } });
  return cle;
}

/** Note qu'un relais vient de publier. Au plus une écriture par minute et par site. */
export async function noterRelaisVu(siteId: string, maintenant = new Date()): Promise<void> {
  await db
    .update(sitesSecurite)
    .set({ relaisVuLe: maintenant })
    .where(
      and(
        isNull(sitesSecurite.deletedAt),
        eq(sitesSecurite.id, siteId),
        sql`(${sitesSecurite.relaisVuLe} IS NULL OR ${sitesSecurite.relaisVuLe} < ${new Date(maintenant.getTime() - 60_000).toISOString()})`,
      ),
    );
}

/** Trace l'ouverture d'une caméra : qui a regardé quoi, et quand. */
export async function tracerVisionnage(organizationId: string, userId: string, cameraId: string, nom: string, qualite: string): Promise<void> {
  await db.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "camera.visionner", entityType: "camera", entityId: cameraId, after: { nom, qualite } });
}
