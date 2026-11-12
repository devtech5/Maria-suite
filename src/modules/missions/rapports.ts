import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { divideMoney } from "@/lib/money";
import type { DefinitionRapport } from "@/lib/rapports/types";

import type { NatureMission } from "./schema";
import { LIBELLE_NATURE } from "./suivi";

/**
 * Une mission compte le jour où elle se clôt ; pas encore close, le jour de
 * son échéance ; sans échéance, le jour de sa création.
 */
const JOUR_MISSION = sql`(coalesce(m.cloture_le, m.echeance_le, m.created_at) at time zone 'Africa/Abidjan')::date`;

/** Réussite : terminées sur missions arrivées à leur issue, en points de base. */
const reussite = (terminees: number, echouees: number) =>
  terminees + echouees > 0 ? divideMoney(terminees * 10_000, terminees + echouees) : null;

export const RAPPORTS_MISSIONS: DefinitionRapport[] = [
  {
    cle: "missions-par-executant",
    module: "missions",
    rubrique: "Missions",
    titre: "Missions par exécutant",
    description: "Pour chaque collaborateur ou intervenant : missions confiées, terminées, échouées, en retard, et taux de réussite.",
    droit: "missions.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{
        executant: string;
        statut: string;
        missions: string;
        terminees: string;
        echouees: string;
        annulees: string;
        en_retard: string;
        montant: string;
      }>(sql`
        select coalesce(e.nom, w.nom, 'Sans exécutant') as executant,
               case when e.id is not null then 'Collaborateur' when w.id is not null then 'Intervenant' else '' end as statut,
               count(*) as missions,
               count(*) filter (where m.statut = 'terminee') as terminees,
               count(*) filter (where m.statut = 'echouee') as echouees,
               count(*) filter (where m.statut = 'annulee') as annulees,
               count(*) filter (where m.echeance_le is not null and m.statut not in ('annulee', 'echouee')
                                  and coalesce(m.cloture_le, now()) > m.echeance_le) as en_retard,
               coalesce(sum(m.montant) filter (where m.statut = 'terminee'), 0) as montant
        from missions m
        left join employees e on e.id = m.employe_id
        left join workers w on w.id = m.intervenant_id
        where m.organization_id = ${organizationId} and m.deleted_at is null
          and ${JOUR_MISSION} between ${du}::date and ${au}::date
        group by e.id, e.nom, w.id, w.nom
        order by count(*) desc, 1
      `);
      return {
        colonnes: [
          { cle: "executant", libelle: "Exécutant", type: "texte" },
          { cle: "statut", libelle: "Statut", type: "texte" },
          { cle: "missions", libelle: "Missions", type: "entier", total: true },
          { cle: "terminees", libelle: "Terminées", type: "entier", total: true },
          { cle: "echouees", libelle: "Échouées", type: "entier", total: true },
          { cle: "annulees", libelle: "Annulées", type: "entier", total: true },
          { cle: "en_retard", libelle: "En retard", type: "entier", total: true },
          { cle: "reussite", libelle: "Réussite", type: "taux_bp", total: false },
          { cle: "montant", libelle: "Montant des missions terminées", type: "montant" },
        ],
        lignes: lignes.map((l) => ({
          executant: l.executant,
          statut: l.statut,
          missions: Number(l.missions),
          terminees: Number(l.terminees),
          echouees: Number(l.echouees),
          annulees: Number(l.annulees),
          en_retard: Number(l.en_retard),
          reussite: reussite(Number(l.terminees), Number(l.echouees)),
          montant: Number(l.montant),
        })),
        note: "Une mission compte le jour de sa clôture, à défaut celui de son échéance. La réussite rapporte les terminées aux missions terminées ou échouées ; une annulation n'est pas un échec de l'exécutant.",
      };
    },
  },
  {
    cle: "missions-par-nature",
    module: "missions",
    rubrique: "Missions",
    titre: "Missions par nature",
    description: "Livraisons, chantiers, collectes, interventions : volume, issue et montant, nature par nature.",
    droit: "missions.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{
        nature: NatureMission;
        missions: string;
        en_cours: string;
        terminees: string;
        echouees: string;
        montant: string;
      }>(sql`
        select m.nature, count(*) as missions,
               count(*) filter (where m.statut in ('planifiee', 'en_cours')) as en_cours,
               count(*) filter (where m.statut = 'terminee') as terminees,
               count(*) filter (where m.statut = 'echouee') as echouees,
               coalesce(sum(m.montant) filter (where m.statut = 'terminee'), 0) as montant
        from missions m
        where m.organization_id = ${organizationId} and m.deleted_at is null
          and ${JOUR_MISSION} between ${du}::date and ${au}::date
        group by m.nature
        order by count(*) desc
      `);
      return {
        colonnes: [
          { cle: "nature", libelle: "Nature", type: "texte" },
          { cle: "missions", libelle: "Missions", type: "entier", total: true },
          { cle: "en_cours", libelle: "Planifiées ou en cours", type: "entier", total: true },
          { cle: "terminees", libelle: "Terminées", type: "entier", total: true },
          { cle: "echouees", libelle: "Échouées", type: "entier", total: true },
          { cle: "reussite", libelle: "Réussite", type: "taux_bp", total: false },
          { cle: "montant", libelle: "Montant des missions terminées", type: "montant" },
        ],
        lignes: lignes.map((l) => ({
          nature: LIBELLE_NATURE[l.nature] ?? l.nature,
          missions: Number(l.missions),
          en_cours: Number(l.en_cours),
          terminees: Number(l.terminees),
          echouees: Number(l.echouees),
          reussite: reussite(Number(l.terminees), Number(l.echouees)),
          montant: Number(l.montant),
        })),
      };
    },
  },
];
