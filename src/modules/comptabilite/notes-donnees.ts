import "server-only";

import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { estCategorie } from "@/lib/comptabilite/categories-socioprofessionnelles";
import { effectifMoyen, noteCapital, noteCinqExercices, noteEffectifs, type Collaborateur } from "@/lib/comptabilite/notes-personnel";
import type { NoteAnnexe } from "@/lib/comptabilite/notes";
import { affectationsResultat } from "@/modules/fiscalite/schema";
import { bulletinsPaie, periodesPaie } from "@/modules/paie/schema";
import { employees, postes } from "@/modules/personnes/schema";

import { soldesAuJour, soldesParCompte } from "./requetes";

/**
 * Collaborateurs déclarés, avec la catégorie du poste qu'ils occupent. Le
 * poste se lit par son libellé, comme sur la fiche : renommer un poste
 * renomme aussi les fiches.
 *
 * `employees.fin` est le terme du contrat, pas un départ : un collaborateur
 * qui part passe inactif (`sortirSalarie`), et la date se lit dans le journal
 * (`salarie.sortir`), au jour de l'entreprise. Sans trace, le jour de la
 * dernière modification de la fiche.
 */
async function collaborateursDe(organizationId: string, fuseau: string): Promise<Collaborateur[]> {
  const sortie = sql<string | null>`case when ${employees.actif} then null else coalesce(
      (select (max(a.created_at) at time zone ${fuseau})::date::text from audit_logs a
        where a.organization_id = ${organizationId} and a.action = 'salarie.sortir' and a.entity_id = ${employees.id}),
      (${employees.updatedAt} at time zone ${fuseau})::date::text) end`;
  const lignes = await db
    .select({ id: employees.id, debut: employees.debut, fin: employees.fin, sortie, sexe: employees.sexe, nationalite: employees.nationalite, categorie: postes.categorie })
    .from(employees)
    .leftJoin(postes, and(eq(postes.organizationId, employees.organizationId), eq(postes.libelle, employees.poste), isNull(postes.deletedAt)))
    .where(and(eq(employees.organizationId, organizationId), isNull(employees.deletedAt)));
  return lignes.map((l) => {
    const terme = l.fin ? String(l.fin).slice(0, 10) : null;
    const depart = l.sortie ? String(l.sortie).slice(0, 10) : null;
    const fin = terme && depart ? (terme < depart ? terme : depart) : (terme ?? depart);
    return {
      id: l.id,
      debut: String(l.debut).slice(0, 10),
      fin,
      sexe: l.sexe === "F" || l.sexe === "M" ? l.sexe : null,
      nationalite: l.nationalite,
      categorie: estCategorie(l.categorie) ? l.categorie : null,
    };
  });
}

/** Brut des bulletins des périodes validées de l'exercice, par collaborateur. */
async function massesDe(organizationId: string, exercice: string): Promise<Map<string, number>> {
  const lignes = await db
    .select({ employe: bulletinsPaie.employeId, brut: sql<string>`coalesce(sum(${bulletinsPaie.brut}), 0)` })
    .from(bulletinsPaie)
    .innerJoin(periodesPaie, eq(periodesPaie.id, bulletinsPaie.periodeId))
    .where(
      and(
        eq(bulletinsPaie.organizationId, organizationId),
        eq(periodesPaie.organizationId, organizationId),
        eq(periodesPaie.statut, "validee"),
        like(periodesPaie.mois, `${exercice}-%`),
        isNull(bulletinsPaie.deletedAt),
        isNull(periodesPaie.deletedAt),
      ),
    )
    .groupBy(bulletinsPaie.employeId);
  return new Map(lignes.map((l) => [l.employe, Number(l.brut)]));
}

/** Le fuseau de l'entreprise d'abord : le jour d'un départ se compte chez elle. */
async function collaborateursDuFuseau(organizationId: string): Promise<Collaborateur[]> {
  const [org] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  return collaborateursDe(organizationId, org?.fuseau ?? "Africa/Abidjan");
}

/**
 * Notes du lot 2 : 13 capital, 27B effectifs et masse salariale, 31 cinq
 * derniers exercices. Elles lisent la fiche Entreprise, les fiches du
 * personnel et la paie, en plus des comptes.
 */
export async function notesComplementaires(organizationId: string, exercice: string): Promise<NoteAnnexe[]> {
  const annees = [0, 1, 2, 3, 4].map((i) => String(Number(exercice) - i));
  const [[org], collaborateurs, masses, affectations, historique] = await Promise.all([
    db
      .select({ capital: organizations.capitalSocial, nominale: organizations.valeurNominalePart, pays: organizations.countryCode })
      .from(organizations)
      .where(eq(organizations.id, organizationId)),
    collaborateursDuFuseau(organizationId),
    massesDe(organizationId, exercice),
    db
      .select({ exercice: affectationsResultat.exercice, dividendes: affectationsResultat.dividendes })
      .from(affectationsResultat)
      .where(and(eq(affectationsResultat.organizationId, organizationId), inArray(affectationsResultat.exercice, annees), isNull(affectationsResultat.deletedAt))),
    Promise.all(annees.map(async (a) => ({ exercice: a, mouvements: await soldesParCompte(organizationId, a), bilan: await soldesAuJour(organizationId, `${a}-12-31`) }))),
  ]);
  const dividendes = new Map(affectations.map((a) => [a.exercice, a.dividendes]));
  const [n, n1] = historique;

  return [
    noteCapital({ exercice, capitalDeclare: org?.capital ?? null, valeurNominale: org?.nominale ?? null, bilanN: n.bilan, bilanN1: n1.bilan }),
    noteEffectifs({ exercice, paysEntreprise: org?.pays ?? "CI", collaborateurs, masses, mouvements: n.mouvements }),
    noteCinqExercices(historique.map((h) => ({ ...h, dividendes: dividendes.get(h.exercice) ?? 0, effectifMoyen: effectifMoyen(collaborateurs, h.exercice) }))),
  ];
}
