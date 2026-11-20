import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DefinitionRapport } from "@/lib/rapports/types";
import { ancienneteEnLigne, COLONNES_ANCIENNETE, type LigneAnciennete } from "@/modules/facturation/rapports";

export const RAPPORTS_ACHATS: DefinitionRapport[] = [
  {
    cle: "achats-par-fournisseur",
    module: "achats",
    rubrique: "Achats",
    titre: "Achats par fournisseur",
    description: "Factures fournisseurs de la période : montants HT, TVA, TTC, déjà réglé et reste à payer.",
    droit: "achats.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{ fournisseur: string; factures: string; ht: string; tva: string; ttc: string; regle: string }>(sql`
        select f.fournisseur_nom as fournisseur, count(*) as factures, sum(f.total_ht) as ht, sum(f.total_tva) as tva, sum(f.total_ttc) as ttc,
               coalesce(sum((select sum(r.montant) from reglements_fournisseur r where r.facture_id = f.id and r.deleted_at is null and r.date_reglement <= ${au}::date)), 0) as regle
        from factures_fournisseur f
        where f.organization_id = ${organizationId} and f.statut = 'comptabilisee' and f.deleted_at is null
          and f.date_facture between ${du}::date and ${au}::date
        group by f.fournisseur_nom order by sum(f.total_ttc) desc
      `);
      return {
        colonnes: [
          { cle: "fournisseur", libelle: "Fournisseur", type: "texte" },
          { cle: "factures", libelle: "Factures", type: "entier", total: true },
          { cle: "ht", libelle: "Total HT", type: "montant" },
          { cle: "tva", libelle: "TVA", type: "montant" },
          { cle: "ttc", libelle: "Total TTC", type: "montant" },
          { cle: "regle", libelle: "Réglé", type: "montant" },
          { cle: "reste", libelle: "Reste à payer", type: "montant" },
        ],
        lignes: lignes.map((l) => ({
          fournisseur: l.fournisseur,
          factures: Number(l.factures),
          ht: Number(l.ht),
          tva: Number(l.tva),
          ttc: Number(l.ttc),
          regle: Number(l.regle),
          reste: Number(l.ttc) - Number(l.regle),
        })),
        note: "Factures annulées exclues.",
      };
    },
  },
  {
    cle: "dettes-anciennete",
    module: "achats",
    rubrique: "Achats",
    titre: "Dettes fournisseurs par ancienneté",
    description: "Ce que l'entreprise doit à chaque fournisseur à la date choisie, selon le retard sur l'échéance.",
    droit: "achats.consulter",
    periode: "situation",
    async executer(organizationId, { au }) {
      const lignes = await db.execute<LigneAnciennete>(sql`
        select tiers,
          sum(reste) filter (where retard <= 0) as non_echu,
          sum(reste) filter (where retard between 1 and 30) as a30,
          sum(reste) filter (where retard between 31 and 60) as a60,
          sum(reste) filter (where retard between 61 and 90) as a90,
          sum(reste) filter (where retard > 90) as plus90,
          sum(reste) as total
        from (
          select f.fournisseur_nom as tiers, ${au}::date - f.echeance as retard,
                 f.total_ttc - coalesce((select sum(r.montant) from reglements_fournisseur r where r.facture_id = f.id and r.deleted_at is null and r.date_reglement <= ${au}::date), 0) as reste
          from factures_fournisseur f
          where f.organization_id = ${organizationId} and f.statut = 'comptabilisee' and f.deleted_at is null and f.date_facture <= ${au}::date
        ) d
        where reste > 0
        group by tiers order by sum(reste) desc
      `);
      return {
        colonnes: [{ cle: "tiers", libelle: "Fournisseur", type: "texte" }, ...COLONNES_ANCIENNETE],
        lignes: lignes.map(ancienneteEnLigne),
      };
    },
  },
];
