import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { newId } from "@/lib/ids";
import { moduleOuvert } from "@/lib/modules/garde";
import { employees } from "@/modules/personnes/schema";

import { jourLocal } from "./calcul";
import { presences, reglagesPresence } from "./schema";

/**
 * Pointage automatique : le compte qui se sert de Maria Suite est présent.
 *
 * Appelé à chaque page de gestion, à l'accueil, à la caisse et au signal de
 * présence du navigateur (une fois par minute d'activité). La première fois
 * du jour pose l'ARRIVÉE ; les suivantes repoussent la DERNIÈRE ACTIVITÉ, qui
 * sert de départ tant qu'aucun départ n'est pointé.
 *
 * On ne pointe pas qu'à la connexion : une session dure trente jours, et la
 * caissière qui retrouve sa caisse ouverte le lendemain ne se reconnecte pas.
 * Pour elle, « se connecter », c'est rouvrir l'écran.
 *
 * Bon marché par construction : une écriture au plus toutes les cinq minutes
 * par compte et par processus. Et jamais bloquant — un pointage qui échoue ne
 * doit pas empêcher d'encaisser.
 */

const PAS_MS = 5 * 60_000;
const DUREE_CONTEXTE_MS = 10 * 60_000;

const derniers = new Map<string, { jour: string; a: number }>();
const contextes = new Map<string, { fuseau: string; actif: boolean; expire: number }>();

async function contexte(organizationId: string): Promise<{ fuseau: string; actif: boolean }> {
  const connu = contextes.get(organizationId);
  if (connu && connu.expire > Date.now()) return connu;
  const [ligne] = await db
    .select({ fuseau: organizations.timezone, actif: reglagesPresence.pointageAuto })
    .from(organizations)
    .leftJoin(reglagesPresence, eq(reglagesPresence.organizationId, organizations.id))
    .where(eq(organizations.id, organizationId));
  const c = { fuseau: ligne?.fuseau ?? "Africa/Abidjan", actif: ligne?.actif ?? true, expire: Date.now() + DUREE_CONTEXTE_MS };
  contextes.set(organizationId, c);
  return c;
}

/** À appeler quand les réglages changent : le prochain pointage les relit. */
export function oublierContextePresence(organizationId: string): void {
  contextes.delete(organizationId);
}

export async function pointerPresence(organizationId: string, userId: string): Promise<void> {
  const cle = `${organizationId}|${userId}`;
  const maintenant = new Date();
  try {
    const { fuseau, actif } = await contexte(organizationId);
    if (!actif) return;
    const jour = jourLocal(maintenant, fuseau);
    const dernier = derniers.get(cle);
    if (dernier && dernier.jour === jour && maintenant.getTime() - dernier.a < PAS_MS) return;
    derniers.set(cle, { jour, a: maintenant.getTime() });

    const [salarie] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.userId, userId), eq(employees.actif, true)))
      .limit(1);

    const ligne = { id: newId(), organizationId, userId, employeeId: salarie?.id ?? null, jour, arrivee: maintenant, derniereActivite: maintenant };
    const suite = { derniereActivite: sql`greatest(${presences.derniereActivite}, ${maintenant.toISOString()}::timestamptz)`, updatedAt: maintenant };

    if (salarie) {
      // Le salarié a pu être pointé à la main ce matin, par sa fiche : on
      // reprend cette ligne plutôt que d'en créer une seconde.
      await db
        .insert(presences)
        .values(ligne)
        .onConflictDoUpdate({
          target: [presences.organizationId, presences.employeeId, presences.jour],
          targetWhere: sql`${presences.employeeId} IS NOT NULL`,
          set: { ...suite, userId },
        });
    } else {
      await db
        .insert(presences)
        .values(ligne)
        .onConflictDoUpdate({
          target: [presences.organizationId, presences.userId, presences.jour],
          targetWhere: sql`${presences.userId} IS NOT NULL`,
          set: suite,
        });
    }
  } catch (erreur) {
    derniers.delete(cle);
    console.error("Pointage non enregistré", erreur);
  }
}

/**
 * Pointe APRÈS la réponse : l'écran s'affiche sans attendre l'écriture.
 * Sans effet si le module n'est pas ouvert sur l'instance, ou sans entreprise.
 */
export function pointerApresReponse(organizationId: string | null, userId: string): void {
  if (!organizationId || !moduleOuvert("presences")) return;
  after(() => pointerPresence(organizationId, userId));
}
