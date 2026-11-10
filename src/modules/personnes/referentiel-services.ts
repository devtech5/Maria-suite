import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";

import { cleService, LISTE_POLES, motifRefusLibelleService, normaliserCodeService, normaliserLibelleService, type Pole } from "./services";
import { employees, postes, services } from "./schema";

/**
 * Référentiel des services, côté base. Règles de libellé et liste de départ
 * dans `services.ts`, sans base.
 */

export interface LigneService {
  id: string;
  code: string;
  libelle: string;
  pole: Pole;
  mission: string | null;
  actif: boolean;
  /** Postes rangés dans le service, retirés compris. */
  postes: { id: string; libelle: string; actif: boolean }[];
  /** Salariés en poste dont la fiche porte ce service. */
  effectif: number;
}

/** Les services proposés au choix, dans leur ordre. */
export async function servicesActifs(organizationId: string): Promise<string[]> {
  const lignes = await db
    .select({ libelle: services.libelle })
    .from(services)
    .where(and(eq(services.organizationId, organizationId), eq(services.actif, true), isNull(services.deletedAt)))
    .orderBy(asc(services.ordre), asc(services.libelle));
  return lignes.map((l) => l.libelle);
}

/** Tous les services, retirés compris, avec leurs postes et leur effectif. */
export async function listerServices(organizationId: string): Promise<LigneService[]> {
  const [lignes, rangs, effectifs] = await Promise.all([
    db
      .select({ id: services.id, code: services.code, libelle: services.libelle, pole: services.pole, mission: services.mission, actif: services.actif })
      .from(services)
      .where(and(eq(services.organizationId, organizationId), isNull(services.deletedAt)))
      .orderBy(asc(services.ordre), asc(services.libelle)),
    db
      .select({ id: postes.id, libelle: postes.libelle, actif: postes.actif, serviceId: postes.serviceId })
      .from(postes)
      .where(and(eq(postes.organizationId, organizationId), isNull(postes.deletedAt)))
      .orderBy(asc(postes.ordre), asc(postes.libelle)),
    db
      .select({ cle: sql<string>`lower(btrim(${employees.service}))`, nombre: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt)))
      .groupBy(sql`lower(btrim(${employees.service}))`),
  ]);
  const parCle = new Map(effectifs.map((e) => [e.cle, e.nombre]));
  return lignes.map((s) => ({
    ...s,
    pole: (LISTE_POLES as string[]).includes(s.pole) ? (s.pole as Pole) : "support",
    postes: rangs.filter((p) => p.serviceId === s.id).map(({ id, libelle, actif }) => ({ id, libelle, actif })),
    effectif: parCle.get(cleService(s.libelle)) ?? 0,
  }));
}

async function existants(organizationId: string, saufId?: string): Promise<{ libelle: string; code: string }[]> {
  const lignes = await db
    .select({ id: services.id, libelle: services.libelle, code: services.code })
    .from(services)
    .where(and(eq(services.organizationId, organizationId), isNull(services.deletedAt)));
  return lignes.filter((l) => l.id !== saufId);
}

function verifierPole(pole: string): Pole {
  if (!(LISTE_POLES as string[]).includes(pole)) throw new Error("Pôle inconnu.");
  return pole as Pole;
}

function verifierCode(saisie: string, autres: { code: string }[]): string {
  const code = normaliserCodeService(saisie);
  if (code.length < 2) throw new Error("Indiquez un sigle de deux caractères au moins : DAF, RH, BET.");
  if (autres.some((a) => a.code === code)) throw new Error(`Le sigle ${code} est déjà pris.`);
  return code;
}

/** Ajoute un service en fin de liste. */
export async function ajouterServicePour(
  organizationId: string,
  userId: string,
  saisie: { libelle: string; code: string; pole: string; mission?: string },
): Promise<string> {
  const libelle = normaliserLibelleService(saisie.libelle);
  const autres = await existants(organizationId);
  const refus = motifRefusLibelleService(libelle, autres.map((a) => a.libelle));
  if (refus) throw new Error(refus);
  const code = verifierCode(saisie.code, autres);
  const pole = verifierPole(saisie.pole);
  const mission = normaliserLibelleService(saisie.mission ?? "").slice(0, 300) || null;

  const id = newId();
  await db.insert(services).values({
    id,
    organizationId,
    code,
    libelle,
    pole,
    mission,
    ordre: sql`(select coalesce(max(${services.ordre}), 0) + 1 from ${services} where ${services.organizationId} = ${organizationId})`,
  });
  await tracerPour(organizationId, userId, { action: "service.cree", entite: "service", entiteId: id, apres: { code, libelle, pole } });
  return libelle;
}

/**
 * Modifie un service. Un nouveau libellé se propage aux fiches des salariés
 * qui portent l'ancien, dans la même transaction.
 */
export async function modifierServicePour(
  organizationId: string,
  userId: string,
  serviceId: string,
  saisie: { libelle: string; code: string; pole: string; mission?: string },
): Promise<{ libelle: string; fiches: number }> {
  const libelle = normaliserLibelleService(saisie.libelle);
  const autres = await existants(organizationId, serviceId);
  const refus = motifRefusLibelleService(libelle, autres.map((a) => a.libelle));
  if (refus) throw new Error(refus);
  const code = verifierCode(saisie.code, autres);
  const pole = verifierPole(saisie.pole);
  const mission = normaliserLibelleService(saisie.mission ?? "").slice(0, 300) || null;

  const resultat = await db.transaction(async (tx) => {
    const [service] = await tx
      .select({ libelle: services.libelle })
      .from(services)
      .where(and(eq(services.organizationId, organizationId), eq(services.id, serviceId), isNull(services.deletedAt)));
    if (!service) throw new Error("Service introuvable.");
    await tx
      .update(services)
      .set({ libelle, code, pole, mission, updatedAt: new Date(), version: sql`${services.version} + 1` })
      .where(and(eq(services.organizationId, organizationId), eq(services.id, serviceId)));
    if (service.libelle === libelle) return { ancien: service.libelle, fiches: 0 };
    const fiches = await tx
      .update(employees)
      .set({ service: libelle, updatedAt: new Date(), version: sql`${employees.version} + 1` })
      .where(and(eq(employees.organizationId, organizationId), isNull(employees.deletedAt), sql`lower(btrim(${employees.service})) = ${cleService(service.libelle)}`))
      .returning({ id: employees.id });
    return { ancien: service.libelle, fiches: fiches.length };
  });

  await tracerPour(organizationId, userId, {
    action: "service.modifie",
    entite: "service",
    entiteId: serviceId,
    avant: { libelle: resultat.ancien },
    apres: { libelle, code, pole, fiches: resultat.fiches },
  });
  return { libelle, fiches: resultat.fiches };
}

/** Retire un service de la liste de choix, ou l'y remet. Les fiches qui le portent le gardent. */
export async function basculerServicePour(organizationId: string, userId: string, serviceId: string, actif: boolean): Promise<void> {
  const [modifie] = await db
    .update(services)
    .set({ actif, updatedAt: new Date(), version: sql`${services.version} + 1` })
    .where(and(eq(services.organizationId, organizationId), eq(services.id, serviceId), isNull(services.deletedAt)))
    .returning({ libelle: services.libelle });
  if (!modifie) throw new Error("Service introuvable.");
  await tracerPour(organizationId, userId, {
    action: actif ? "service.retabli" : "service.retire",
    entite: "service",
    entiteId: serviceId,
    apres: { libelle: modifie.libelle },
  });
}

/** Range un poste dans un service, ou le sort de tout service (`null`). */
export async function rangerPostePour(organizationId: string, userId: string, posteId: string, serviceId: string | null): Promise<void> {
  if (serviceId) {
    const [service] = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.organizationId, organizationId), eq(services.id, serviceId), isNull(services.deletedAt)));
    if (!service) throw new Error("Service introuvable.");
  }
  const [modifie] = await db
    .update(postes)
    .set({ serviceId, updatedAt: new Date(), version: sql`${postes.version} + 1` })
    .where(and(eq(postes.organizationId, organizationId), eq(postes.id, posteId), isNull(postes.deletedAt)))
    .returning({ libelle: postes.libelle });
  if (!modifie) throw new Error("Poste introuvable.");
  await tracerPour(organizationId, userId, { action: "poste.range", entite: "poste", entiteId: posteId, apres: { libelle: modifie.libelle, serviceId } });
}
