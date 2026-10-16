import "server-only";

import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { reunionParticipants, reunions } from "@/modules/meeting/schema";
import { missions } from "@/modules/missions/schema";
import { employees } from "@/modules/personnes/schema";
import { jourLocal } from "@/modules/presences/calcul";
import { conges } from "@/modules/presences/schema";

import type { Creneau, Plage } from "./calcul";
import { fusionner, periodeConge, periodeMission, periodeReunion, type Lecteur } from "./deduites";
import { creneauxPlanning, horairesPlanning } from "./schema";

export async function fuseauEntreprise(organizationId: string): Promise<string> {
  const [org] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  return org?.fuseau || "Africa/Abidjan";
}

export interface MembrePlanning {
  userId: string;
  nom: string;
}

/** Les membres actifs : ceux dont on tient le planning. */
export async function membresPlanning(organizationId: string): Promise<MembrePlanning[]> {
  const lignes = await db.execute<{ user_id: string; nom: string }>(sql`
    select m.user_id, u.full_name as nom
    from memberships m join users u on u.id = m.user_id
    where m.organization_id = ${organizationId} and m.status = 'actif'
    order by u.full_name
  `);
  return lignes.map((l) => ({ userId: l.user_id, nom: l.nom }));
}

/** Créneaux qui touchent la fenêtre, pour ces personnes (toutes si la liste est absente). */
export async function creneauxSur(organizationId: string, du: Date, au: Date, userIds?: string[]): Promise<Creneau[]> {
  if (userIds && userIds.length === 0) return [];
  return db
    .select({
      id: creneauxPlanning.id,
      userId: creneauxPlanning.userId,
      statut: creneauxPlanning.statut,
      debut: creneauxPlanning.debut,
      fin: creneauxPlanning.fin,
      lieu: creneauxPlanning.lieu,
      note: creneauxPlanning.note,
    })
    .from(creneauxPlanning)
    .where(
      and(
        eq(creneauxPlanning.organizationId, organizationId),
        isNull(creneauxPlanning.deletedAt),
        lt(creneauxPlanning.debut, au),
        gt(creneauxPlanning.fin, du),
        userIds ? inArray(creneauxPlanning.userId, userIds) : undefined,
      ),
    )
    .orderBy(asc(creneauxPlanning.debut));
}

/** Semaine type de chacun, rangée par personne. */
export async function horairesDe(organizationId: string, userIds?: string[]): Promise<Map<string, Plage[]>> {
  const parPersonne = new Map<string, Plage[]>();
  if (userIds && userIds.length === 0) return parPersonne;
  const lignes = await db
    .select({ userId: horairesPlanning.userId, jour: horairesPlanning.jour, debutMinutes: horairesPlanning.debutMinutes, finMinutes: horairesPlanning.finMinutes })
    .from(horairesPlanning)
    .where(
      and(
        eq(horairesPlanning.organizationId, organizationId),
        isNull(horairesPlanning.deletedAt),
        userIds ? inArray(horairesPlanning.userId, userIds) : undefined,
      ),
    )
    .orderBy(asc(horairesPlanning.jour), asc(horairesPlanning.debutMinutes));
  for (const l of lignes) {
    const liste = parPersonne.get(l.userId) ?? [];
    liste.push({ jour: l.jour, debutMinutes: l.debutMinutes, finMinutes: l.finMinutes });
    parPersonne.set(l.userId, liste);
  }
  return parPersonne;
}

/**
 * Congés accordés, missions confiées et réunions programmées de ces
 * personnes, devenus périodes du planning, pour celles qui touchent la
 * fenêtre. Chaque source se lit dans son module, filtrée sur l'entreprise ;
 * le titre et le lien de chaque pièce suivent les droits de `lecteur`.
 *
 * Les bornes en base sont larges — une mission sans heure de départ, une
 * réunion qui déborde — et `fusionner` coupe ensuite au plus juste.
 */
export async function periodesDeduites(organizationId: string, du: Date, au: Date, userIds: string[], lecteur: Lecteur, fuseau: string, maintenant = new Date()): Promise<Creneau[]> {
  if (userIds.length === 0) return [];
  const [duIso, auIso] = [du.toISOString(), au.toISOString()];
  const salarie = and(eq(employees.organizationId, organizationId), inArray(employees.userId, userIds));

  const [lignesConges, lignesMissions, lignesReunions] = await Promise.all([
    db
      .select({
        id: conges.id,
        numero: conges.numero,
        nature: conges.nature,
        debut: conges.debut,
        fin: conges.fin,
        debutDemi: conges.debutDemi,
        finDemi: conges.finDemi,
        userId: employees.userId,
      })
      .from(conges)
      .innerJoin(employees, and(eq(employees.id, conges.employeeId), salarie))
      .where(
        and(
          eq(conges.organizationId, organizationId),
          isNull(conges.deletedAt),
          eq(conges.statut, "approuve"),
          lte(conges.debut, jourLocal(au, fuseau)),
          gte(conges.fin, jourLocal(du, fuseau)),
        ),
      ),
    db
      .select({
        id: missions.id,
        reference: missions.reference,
        titre: missions.titre,
        lieu: missions.lieu,
        statut: missions.statut,
        echeanceLe: missions.echeanceLe,
        debuteLe: missions.debuteLe,
        clotureLe: missions.clotureLe,
        userId: employees.userId,
      })
      .from(missions)
      .innerJoin(employees, and(eq(employees.id, missions.employeId), salarie))
      .where(
        and(
          eq(missions.organizationId, organizationId),
          isNull(missions.deletedAt),
          ne(missions.statut, "annulee"),
          sql`coalesce(${missions.debuteLe}, ${missions.echeanceLe} - interval '1 day') < ${auIso}::timestamptz`,
          or(eq(missions.statut, "en_cours"), sql`coalesce(${missions.clotureLe}, ${missions.echeanceLe}) > ${duIso}::timestamptz`),
        ),
      ),
    db
      .select({
        id: reunions.id,
        numero: reunions.numero,
        titre: reunions.titre,
        statut: reunions.statut,
        debutPrevu: reunions.debutPrevu,
        dureeMinutes: reunions.dureeMinutes,
        ouverteLe: reunions.ouverteLe,
        termineeLe: reunions.termineeLe,
        organisateurUserId: reunions.organisateurUserId,
        userId: reunionParticipants.userId,
        rejointLe: reunionParticipants.rejointLe,
        lecteurInvite: sql<boolean>`exists (
          select 1 from reunion_participants q
          where q.organization_id = ${organizationId} and q.reunion_id = ${reunions.id}
            and q.user_id = ${lecteur.userId} and q.deleted_at is null
        )`,
      })
      .from(reunionParticipants)
      .innerJoin(reunions, and(eq(reunions.id, reunionParticipants.reunionId), eq(reunions.organizationId, organizationId)))
      .where(
        and(
          eq(reunionParticipants.organizationId, organizationId),
          isNull(reunionParticipants.deletedAt),
          isNull(reunions.deletedAt),
          inArray(reunionParticipants.userId, userIds),
          ne(reunions.statut, "annulee"),
          // Une réunion s'ouvre parfois avant l'heure prévue.
          sql`least(${reunions.ouverteLe}, ${reunions.debutPrevu}) < ${auIso}::timestamptz`,
          or(eq(reunions.statut, "en_cours"), sql`coalesce(${reunions.termineeLe}, ${reunions.debutPrevu} + make_interval(mins => ${reunions.dureeMinutes})) > ${duIso}::timestamptz`),
        ),
      ),
  ]);

  return fusionner(
    [],
    [
      ...lignesConges.flatMap((c) => (c.userId ? [periodeConge({ ...c, userId: c.userId }, lecteur, fuseau)] : [])),
      ...lignesMissions.flatMap((m) => (m.userId ? [periodeMission({ ...m, userId: m.userId }, lecteur, maintenant, fuseau)] : [])),
      ...lignesReunions.map(({ rejointLe, lecteurInvite, ...r }) => periodeReunion({ ...r, rejoint: rejointLe !== null, lecteurInvite: lecteurInvite === true }, lecteur, maintenant)),
    ],
    { du, au },
  );
}

/**
 * Le planning complet de ces personnes sur la fenêtre : créneaux saisis et
 * périodes déduites, fusionnés.
 */
export async function planningSur(organizationId: string, du: Date, au: Date, userIds: string[], lecteur: Lecteur, fuseau: string, maintenant = new Date()): Promise<Creneau[]> {
  const [saisis, deduites] = await Promise.all([creneauxSur(organizationId, du, au, userIds), periodesDeduites(organizationId, du, au, userIds, lecteur, fuseau, maintenant)]);
  return fusionner(saisis, deduites);
}
