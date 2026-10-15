import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";

import { refusCloture, type ObligationTva } from "./calcul";
import { calendrierTva } from "./creation";
import { declarationsTva, exercicesClotures, impotsBenefices } from "./schema";

export { calendrierTva };

export async function declarationsDeposees(organizationId: string) {
  return db.select().from(declarationsTva).where(eq(declarationsTva.organizationId, organizationId));
}

export interface EtatExercice {
  exercice: string;
  clos: boolean;
  /** Figé à la clôture ; sinon le résultat provisoire des écritures. */
  resultat: number;
  ecriture: string | null;
  /** L'impôt sur les bénéfices de l'exercice est constaté. */
  impotConstate: boolean;
  clotureLe: Date | null;
  /** Pourquoi la clôture n'est pas possible aujourd'hui ; nul si elle l'est. */
  refus: string | null;
}

/** Les exercices écrits, du plus récent au plus ancien, avec leur résultat et leur état. */
export async function exercicesFiscaux(organizationId: string, aujourdhui: string, calendrier: readonly ObligationTva[]): Promise<EtatExercice[]> {
  const [resultats, clotures, impots] = await Promise.all([
    db.execute<{ exercice: string; resultat: string }>(sql`
      select e.exercice,
             coalesce(sum(case when l.compte ~ '^[678]' then l.credit - l.debit else 0 end), 0) as resultat
      from ecritures e
      left join lignes_ecriture l on l.ecriture_id = e.id
      where e.organization_id = ${organizationId} and e.origine <> 'cloture'
      group by e.exercice
      order by e.exercice
    `),
    db.select().from(exercicesClotures).where(eq(exercicesClotures.organizationId, organizationId)),
    db.select({ exercice: impotsBenefices.exercice }).from(impotsBenefices).where(eq(impotsBenefices.organizationId, organizationId)),
  ]);
  const impotConstate = new Set(impots.map((i) => i.exercice));
  const closParExercice = new Map(clotures.map((c) => [c.exercice, c]));
  const liste: EtatExercice[] = [];
  let precedent: string | null = null;
  for (const r of resultats) {
    const c = closParExercice.get(r.exercice);
    const refus = refusCloture(r.exercice, aujourdhui, Boolean(c), {
      exercicePrecedentOuvert: precedent && !closParExercice.has(precedent) ? precedent : null,
      moisTvaEnAttente: calendrier.filter((o) => !o.declaree && o.mois.startsWith(`${r.exercice}-`)).map((o) => o.mois),
      impotNonConstate: !impotConstate.has(r.exercice),
    });
    liste.push({
      exercice: r.exercice,
      clos: Boolean(c),
      resultat: c ? c.resultat : Number(r.resultat),
      ecriture: c?.ecriture ?? null,
      clotureLe: c?.clotureLe ?? null,
      impotConstate: impotConstate.has(r.exercice),
      refus: c ? null : refus,
    });
    precedent = r.exercice;
  }
  return liste.reverse();
}

export interface EtatFiscalite {
  /** Mois terminés dont la TVA n'est pas déclarée. */
  aDeclarer: number;
  declarationsEnRetard: number;
  /** TVA déclarée, pas encore payée. */
  aPayer: number;
  montantAPayer: number;
  paiementsEnRetard: number;
}

/** Pour le tableau de bord. */
export async function etatFiscalite(organizationId: string, aujourdhui: string): Promise<EtatFiscalite> {
  const calendrier = await calendrierTva(db, organizationId, aujourdhui);
  const nonDeclares = calendrier.filter((o) => o.statut === "a_declarer" || o.statut === "en_retard");
  const dus = calendrier.filter((o) => o.statut === "a_payer");
  return {
    aDeclarer: nonDeclares.length,
    declarationsEnRetard: nonDeclares.filter((o) => o.enRetard).length,
    aPayer: dus.length,
    montantAPayer: dus.reduce((s, o) => s + o.liquidation.aPayer, 0),
    paiementsEnRetard: dus.filter((o) => o.enRetard).length,
  };
}

/**
 * TVA à décaisser, pour le plan de trésorerie : ce qui est déclaré et dû, puis
 * l'estimation des mois non déclarés, mois en cours compris, à leur échéance.
 * Une échéance passée tombe en première semaine : le plan s'en charge.
 */
export async function sortiesTva(organizationId: string, aujourdhui: string): Promise<{ date: string; montant: number; libelle: string }[]> {
  const calendrier = await calendrierTva(db, organizationId, aujourdhui);
  return calendrier
    .filter((o) => o.statut !== "payee" && o.liquidation.aPayer > 0)
    .map((o) => ({
      date: o.echeance,
      montant: o.liquidation.aPayer,
      libelle: o.declaree ? `TVA de ${o.mois}` : `TVA de ${o.mois} (estimée, non déclarée)`,
    }));
}
