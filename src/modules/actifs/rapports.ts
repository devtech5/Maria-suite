import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { jourIso, type DefinitionRapport } from "@/lib/rapports/types";

import { SEUIL_JOURS_PROCHE } from "./echeance";
import type { NatureEcheance, TypeActif } from "./schema";

const TYPES: Record<TypeActif, string> = {
  vehicule: "Véhicule",
  informatique: "Informatique",
  engin: "Engin",
  mobilier: "Mobilier",
  local: "Local",
};

const NATURES_ECHEANCE: Record<NatureEcheance, string> = {
  assurance: "Assurance",
  visite: "Visite technique",
  garantie: "Garantie",
  entretien: "Entretien",
  vignette: "Vignette",
  patente: "Patente",
};

export const RAPPORTS_ACTIFS: DefinitionRapport[] = [
  {
    cle: "entretien-par-actif",
    module: "actifs",
    rubrique: "Actifs / Biens",
    titre: "Coût d'entretien par actif",
    description: "Interventions de la période, actif par actif : préventif, correctif, contrôles, et ce qui est à refacturer au client.",
    droit: "actifs.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{
        code: string;
        designation: string;
        type: TypeActif;
        interventions: string;
        preventif: string;
        correctif: string;
        controle: string;
        facturable: string;
        valeur: string;
      }>(sql`
        select a.code, a.designation, a.type, count(*) as interventions,
               coalesce(sum(i.cout) filter (where i.nature = 'preventif'), 0) as preventif,
               coalesce(sum(i.cout) filter (where i.nature = 'correctif'), 0) as correctif,
               coalesce(sum(i.cout) filter (where i.nature = 'controle'), 0) as controle,
               coalesce(sum(i.cout) filter (where i.facturable), 0) as facturable,
               a.valeur_acquisition as valeur
        from interventions i join actifs a on a.id = i.actif_id
        where i.organization_id = ${organizationId} and i.deleted_at is null
          and (i.effectuee_le at time zone 'Africa/Abidjan')::date between ${du}::date and ${au}::date
        group by a.id, a.code, a.designation, a.type, a.valeur_acquisition
        order by sum(i.cout) desc, a.code
      `);
      return {
        colonnes: [
          { cle: "code", libelle: "Code", type: "texte" },
          { cle: "designation", libelle: "Actif", type: "texte" },
          { cle: "type", libelle: "Type", type: "texte" },
          { cle: "interventions", libelle: "Interventions", type: "entier", total: true },
          { cle: "preventif", libelle: "Préventif", type: "montant" },
          { cle: "correctif", libelle: "Correctif", type: "montant" },
          { cle: "controle", libelle: "Contrôles", type: "montant" },
          { cle: "total", libelle: "Total", type: "montant" },
          { cle: "facturable", libelle: "Dont à refacturer", type: "montant" },
          { cle: "valeur", libelle: "Valeur d'acquisition", type: "montant", total: false },
        ],
        lignes: lignes.map((l) => ({
          code: l.code,
          designation: l.designation,
          type: TYPES[l.type] ?? l.type,
          interventions: Number(l.interventions),
          preventif: Number(l.preventif),
          correctif: Number(l.correctif),
          controle: Number(l.controle),
          total: Number(l.preventif) + Number(l.correctif) + Number(l.controle),
          facturable: Number(l.facturable),
          valeur: Number(l.valeur),
        })),
        note: "« À refacturer » : interventions sur un actif appartenant à un client, qui sont un produit et non une charge.",
      };
    },
  },
  {
    cle: "echeances-actifs",
    module: "actifs",
    rubrique: "Actifs / Biens",
    titre: "Échéances à honorer",
    description: `Assurances, visites techniques, vignettes, garanties : ce qui est dépassé à la date choisie ou tombe dans les ${SEUIL_JOURS_PROCHE} jours.`,
    droit: "actifs.consulter",
    periode: "situation",
    async executer(organizationId, { au }) {
      const lignes = await db.execute<{
        code: string;
        designation: string;
        nature: NatureEcheance;
        libelle: string | null;
        echeance: string | Date;
        ecart: number;
      }>(sql`
        select a.code, a.designation, e.nature, e.libelle, e.echeance_le as echeance,
               (${au}::date - e.echeance_le) as ecart
        from echeances e join actifs a on a.id = e.actif_id
        where e.organization_id = ${organizationId} and e.deleted_at is null and a.deleted_at is null
          and a.statut <> 'cede' and e.echeance_le is not null
          and (e.honoree_le is null or (e.honoree_le at time zone 'Africa/Abidjan')::date > ${au}::date)
          and e.echeance_le <= ${au}::date + ${SEUIL_JOURS_PROCHE}::int
        order by e.echeance_le, a.code
      `);
      return {
        colonnes: [
          { cle: "echeance", libelle: "Échéance", type: "date" },
          { cle: "code", libelle: "Code", type: "texte" },
          { cle: "designation", libelle: "Actif", type: "texte" },
          { cle: "nature", libelle: "Nature", type: "texte" },
          { cle: "libelle", libelle: "Précision", type: "texte" },
          { cle: "etat", libelle: "État", type: "texte" },
          { cle: "retard", libelle: "Jours de retard", type: "entier", total: false },
        ],
        lignes: lignes.map((l) => {
          const ecart = Number(l.ecart);
          return {
            echeance: jourIso(l.echeance),
            code: l.code,
            designation: l.designation,
            nature: NATURES_ECHEANCE[l.nature] ?? l.nature,
            libelle: l.libelle,
            etat: ecart > 0 ? "Dépassée" : ecart === 0 ? "Aujourd'hui" : `Dans ${-ecart} j`,
            retard: ecart > 0 ? ecart : null,
          };
        }),
        note: "Seules les échéances datées figurent ici ; celles qui se déclenchent au compteur se suivent sur la fiche de l'actif.",
      };
    },
  },
];
