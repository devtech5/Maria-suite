import "server-only";

import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { auditLogs, memberships, organizations } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { heureLocale, jourLocal } from "@/modules/presences/calcul";

import { premierConflit, STATUTS, verifierCreneau, verifierPlages, type Creneau, type Plage, type StatutPlanning } from "./calcul";
import { creneauxPlanning, horairesPlanning } from "./schema";

/** Qui agit, et s'il peut toucher au planning des autres. */
export interface Acteur {
  userId: string;
  gere: boolean;
}

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>, avant?: Record<string, unknown>) {
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action,
    entityType: "planning",
    entityId: entiteId,
    before: avant ?? null,
    after: apres,
  });
}

/**
 * Le planning d'un autre ne se touche qu'avec le droit de gérer, et seulement
 * celui d'un membre actif. La ligne de rattachement est verrouillée : deux
 * saisies simultanées pour la même personne passent l'une après l'autre, et
 * le contrôle de chevauchement voit la première.
 */
async function prendreLaMain(tx: Transaction, organizationId: string, userId: string, acteur: Acteur): Promise<void> {
  if (userId !== acteur.userId && !acteur.gere) throw new Error("Votre rôle ne permet pas de modifier le planning d'un autre membre.");
  const [membre] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId), eq(memberships.status, "actif")))
    .for("update");
  if (!membre) throw new Error("Cette personne n'a pas d'accès actif à l'entreprise.");
}

async function fuseauDe(tx: Transaction, organizationId: string): Promise<string> {
  const [org] = await tx.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  return org?.fuseau || "Africa/Abidjan";
}

/** Créneaux vivants d'une personne qui touchent la fenêtre donnée. */
async function creneauxAutour(tx: Transaction, organizationId: string, userId: string, debut: Date, fin: Date): Promise<Creneau[]> {
  return tx
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
        eq(creneauxPlanning.userId, userId),
        isNull(creneauxPlanning.deletedAt),
        lt(creneauxPlanning.debut, fin),
        gt(creneauxPlanning.fin, debut),
      ),
    );
}

function decrire(c: Creneau, fuseau: string): string {
  const jour = jourLocal(c.debut, fuseau);
  return `« ${STATUTS[c.statut].libelle} » du ${jour.slice(8, 10)}/${jour.slice(5, 7)} de ${heureLocale(c.debut, fuseau)} à ${heureLocale(c.fin, fuseau)}`;
}

export interface DonneesCreneau {
  /** Présent : modification d'un créneau existant. */
  id?: string;
  userId: string;
  statut: StatutPlanning;
  debut: Date;
  fin: Date;
  lieu?: string | null;
  note?: string | null;
}

/** Crée ou modifie un créneau. Un chevauchement est refusé, avec ce qu'il heurte. */
export async function enregistrerCreneauDans(tx: Transaction, organizationId: string, d: DonneesCreneau, acteur: Acteur): Promise<{ id: string }> {
  const refus = verifierCreneau(d.debut, d.fin, d.statut);
  if (refus) throw new Error(refus);

  let avant: typeof creneauxPlanning.$inferSelect | undefined;
  if (d.id) {
    [avant] = await tx
      .select()
      .from(creneauxPlanning)
      .where(and(eq(creneauxPlanning.id, d.id), eq(creneauxPlanning.organizationId, organizationId), isNull(creneauxPlanning.deletedAt)));
    if (!avant) throw new Error("Créneau introuvable.");
    // Le propriétaire du créneau ne change pas : on déplace un statut, pas une personne.
    if (avant.userId !== d.userId) throw new Error("Un créneau ne change pas de titulaire.");
  }
  await prendreLaMain(tx, organizationId, d.userId, acteur);

  const conflit = premierConflit({ id: d.id, debut: d.debut, fin: d.fin }, await creneauxAutour(tx, organizationId, d.userId, d.debut, d.fin));
  if (conflit) throw new Error(`Ce créneau empiète sur ${decrire(conflit, await fuseauDe(tx, organizationId))}. Modifiez ou supprimez celui-ci d'abord.`);

  const valeurs = {
    statut: d.statut,
    debut: d.debut,
    fin: d.fin,
    lieu: d.lieu?.trim() || null,
    note: d.note?.trim() || null,
  };
  const trace = { userId: d.userId, ...valeurs, debut: d.debut.toISOString(), fin: d.fin.toISOString() };

  if (avant) {
    await tx
      .update(creneauxPlanning)
      .set({ ...valeurs, updatedAt: new Date(), version: sql`${creneauxPlanning.version} + 1` })
      .where(eq(creneauxPlanning.id, avant.id));
    await journaliser(tx, organizationId, acteur.userId, "planning.creneau.modifier", avant.id, trace, {
      statut: avant.statut,
      debut: avant.debut.toISOString(),
      fin: avant.fin.toISOString(),
      lieu: avant.lieu,
    });
    return { id: avant.id };
  }

  const id = newId();
  await tx.insert(creneauxPlanning).values({ id, organizationId, userId: d.userId, saisiParUserId: acteur.userId, ...valeurs });
  await journaliser(tx, organizationId, acteur.userId, "planning.creneau.creer", id, trace);
  return { id };
}

/** Suppression logique : elle se réplique comme le reste. */
export async function supprimerCreneauDans(tx: Transaction, organizationId: string, creneauId: string, acteur: Acteur): Promise<void> {
  const [c] = await tx
    .select()
    .from(creneauxPlanning)
    .where(and(eq(creneauxPlanning.id, creneauId), eq(creneauxPlanning.organizationId, organizationId), isNull(creneauxPlanning.deletedAt)));
  if (!c) throw new Error("Créneau introuvable.");
  await prendreLaMain(tx, organizationId, c.userId, acteur);
  await tx
    .update(creneauxPlanning)
    .set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${creneauxPlanning.version} + 1` })
    .where(eq(creneauxPlanning.id, c.id));
  await journaliser(tx, organizationId, acteur.userId, "planning.creneau.supprimer", c.id, { supprime: true }, {
    userId: c.userId,
    statut: c.statut,
    debut: c.debut.toISOString(),
    fin: c.fin.toISOString(),
  });
}

/**
 * Arrête ce qui est en cours à cet instant : le créneau en cours s'achève
 * maintenant, ou disparaît s'il commençait à peine.
 */
async function interrompre(tx: Transaction, organizationId: string, userId: string, maintenant: Date, acteur: Acteur): Promise<void> {
  const enCours = await creneauxAutour(tx, organizationId, userId, maintenant, new Date(maintenant.getTime() + 1));
  for (const c of enCours) {
    const juste = maintenant.getTime() - c.debut.getTime() < 60_000;
    await tx
      .update(creneauxPlanning)
      .set(juste ? { deletedAt: maintenant, updatedAt: maintenant, version: sql`${creneauxPlanning.version} + 1` } : { fin: maintenant, updatedAt: maintenant, version: sql`${creneauxPlanning.version} + 1` })
      .where(eq(creneauxPlanning.id, c.id));
    await journaliser(tx, organizationId, acteur.userId, "planning.creneau.interrompre", c.id, { fin: maintenant.toISOString() }, { fin: c.fin.toISOString() });
  }
}

/**
 * « En courses pour une heure » : pose un statut qui commence maintenant. Ce
 * qui était en cours s'arrête ; un créneau déjà prévu plus tard n'est pas
 * écrasé, le nouveau statut s'arrête juste avant.
 */
export async function poserStatutDans(
  tx: Transaction,
  organizationId: string,
  d: { userId: string; statut: StatutPlanning; fin: Date; lieu?: string | null },
  acteur: Acteur,
  maintenant = new Date(),
): Promise<{ id: string; fin: Date }> {
  await prendreLaMain(tx, organizationId, d.userId, acteur);
  await interrompre(tx, organizationId, d.userId, maintenant, acteur);

  const suivants = await creneauxAutour(tx, organizationId, d.userId, maintenant, d.fin);
  const prochain = suivants.sort((a, b) => a.debut.getTime() - b.debut.getTime())[0];
  const fin = prochain && prochain.debut < d.fin ? prochain.debut : d.fin;
  if (fin.getTime() - maintenant.getTime() < 60_000) throw new Error("Un autre créneau commence tout de suite : modifiez-le plutôt.");
  const refus = verifierCreneau(maintenant, fin, d.statut);
  if (refus) throw new Error(refus);

  const id = newId();
  await tx.insert(creneauxPlanning).values({
    id,
    organizationId,
    userId: d.userId,
    statut: d.statut,
    debut: maintenant,
    fin,
    lieu: d.lieu?.trim() || null,
    saisiParUserId: acteur.userId,
  });
  await journaliser(tx, organizationId, acteur.userId, "planning.statut.poser", id, {
    userId: d.userId,
    statut: d.statut,
    debut: maintenant.toISOString(),
    fin: fin.toISOString(),
  });
  return { id, fin };
}

/** « Je suis de retour » : ce qui était en cours s'arrête, les horaires reprennent la main. */
export async function terminerStatutDans(tx: Transaction, organizationId: string, userId: string, acteur: Acteur, maintenant = new Date()): Promise<void> {
  await prendreLaMain(tx, organizationId, userId, acteur);
  await interrompre(tx, organizationId, userId, maintenant, acteur);
}

/** Remplace la semaine type d'une personne : les anciennes plages sont retirées, les nouvelles posées. */
export async function enregistrerHorairesDans(tx: Transaction, organizationId: string, userId: string, plages: readonly Plage[], acteur: Acteur): Promise<void> {
  const refus = verifierPlages(plages);
  if (refus) throw new Error(refus);
  await prendreLaMain(tx, organizationId, userId, acteur);

  const maintenant = new Date();
  await tx
    .update(horairesPlanning)
    .set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${horairesPlanning.version} + 1` })
    .where(and(eq(horairesPlanning.organizationId, organizationId), eq(horairesPlanning.userId, userId), isNull(horairesPlanning.deletedAt)));
  if (plages.length > 0) {
    await tx.insert(horairesPlanning).values(plages.map((p) => ({ id: newId(), organizationId, userId, jour: p.jour, debutMinutes: p.debutMinutes, finMinutes: p.finMinutes })));
  }
  await journaliser(tx, organizationId, acteur.userId, "planning.horaires.definir", userId, { plages: plages.map((p) => ({ ...p })) });
}
