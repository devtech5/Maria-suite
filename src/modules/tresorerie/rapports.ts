import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { divideMoney } from "@/lib/money";
import { jourIso, type DefinitionRapport } from "@/lib/rapports/types";

import { LIBELLE_NATURE_COMPTE, type NatureCompte } from "./calcul";
import { FAMILLES_CHARGE, familleDuCompte, ORDRE_FAMILLES, type FamilleCharge } from "./charges";
import { NATURES_MOUVEMENT, type NatureMouvement } from "./mouvements";


export const RAPPORTS_TRESORERIE: DefinitionRapport[] = [
  {
    cle: "tresorerie-par-compte",
    module: "tresorerie",
    rubrique: "Trésorerie",
    titre: "Entrées et sorties par compte",
    description: "Solde de départ, entrées, sorties et solde final de chaque caisse, banque et portefeuille.",
    droit: "tresorerie.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{ nom: string; nature: NatureCompte; compte: string; ouverture: string; entrees: string; sorties: string }>(sql`
        select c.nom, c.nature, c.compte,
               coalesce(sum(l.debit - l.credit) filter (where e.date_ecriture < ${du}::date), 0) as ouverture,
               coalesce(sum(l.debit) filter (where e.date_ecriture >= ${du}::date), 0) as entrees,
               coalesce(sum(l.credit) filter (where e.date_ecriture >= ${du}::date), 0) as sorties
        from comptes_tresorerie c
        left join lignes_ecriture l on l.organization_id = c.organization_id and l.compte = c.compte
        left join ecritures e on e.id = l.ecriture_id and e.date_ecriture <= ${au}::date
        where c.organization_id = ${organizationId} and c.deleted_at is null
        group by c.id, c.nom, c.nature, c.compte
        order by c.nature, c.nom
      `);
      return {
        colonnes: [
          { cle: "compte", libelle: "Compte", type: "texte" },
          { cle: "nature", libelle: "Nature", type: "texte" },
          { cle: "numero", libelle: "N° comptable", type: "texte" },
          { cle: "ouverture", libelle: "Solde de départ", type: "montant" },
          { cle: "entrees", libelle: "Entrées", type: "montant" },
          { cle: "sorties", libelle: "Sorties", type: "montant" },
          { cle: "cloture", libelle: "Solde final", type: "montant" },
        ],
        lignes: lignes.map((l) => {
          const [o, e, s] = [Number(l.ouverture), Number(l.entrees), Number(l.sorties)];
          return { compte: l.nom, nature: LIBELLE_NATURE_COMPTE[l.nature], numero: l.compte, ouverture: o, entrees: e, sorties: s, cloture: o + e - s };
        }),
        note: "Toutes les opérations qui touchent le compte, quel que soit le module qui les a passées. Les virements internes figurent en sortie d'un compte et en entrée d'un autre.",
      };
    },
  },
  {
    cle: "charges-par-nature",
    module: "tresorerie",
    rubrique: "Trésorerie",
    titre: "Charges par nature",
    description: "Ce que l'entreprise a dépensé sur la période, regroupé par grande nature, et la part de chacune.",
    droit: "tresorerie.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{ compte: string; montant: string }>(sql`
        select l.compte, coalesce(sum(l.debit) - sum(l.credit), 0) as montant
        from lignes_ecriture l join ecritures e on e.id = l.ecriture_id
        where l.organization_id = ${organizationId} and l.compte like '6%' and e.origine <> 'cloture'
          and e.date_ecriture between ${du}::date and ${au}::date
        group by l.compte
      `);
      const parFamille = new Map<FamilleCharge, number>();
      for (const l of lignes) {
        const f = familleDuCompte(l.compte);
        if (f) parFamille.set(f, (parFamille.get(f) ?? 0) + Number(l.montant));
      }
      const total = [...parFamille.values()].reduce((s, v) => s + v, 0);
      return {
        colonnes: [
          { cle: "nature", libelle: "Nature", type: "texte" },
          { cle: "comptes", libelle: "Comptes", type: "texte" },
          { cle: "montant", libelle: "Montant", type: "montant" },
          { cle: "part", libelle: "Part", type: "taux_bp", total: false },
        ],
        lignes: ORDRE_FAMILLES.filter((f) => parFamille.has(f)).map((f) => ({
          nature: FAMILLES_CHARGE[f].libelle,
          comptes: FAMILLES_CHARGE[f].prefixes.join(", "),
          montant: parFamille.get(f)!,
          part: total > 0 ? divideMoney(parFamille.get(f)! * 10_000, total) : 0,
        })),
        note: "Tiré de la comptabilité, classe 6 : bons de caisse, dépenses payées, factures fournisseurs, paie, frais bancaires.",
      };
    },
  },
  {
    cle: "mouvements-de-tresorerie",
    module: "tresorerie",
    rubrique: "Trésorerie",
    titre: "Mouvements saisis",
    description: "Versements de clients, paiements de fournisseurs, apports, prêts et frais saisis sur les comptes.",
    droit: "tresorerie.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{
        date_operation: string | Date;
        numero: string;
        compte: string;
        nature: NatureMouvement;
        tiers_nom: string | null;
        libelle: string;
        reference: string | null;
        montant: string;
        statut: string;
      }>(sql`
        select mv.date_operation, mv.numero, c.nom as compte, mv.nature, mv.tiers_nom, mv.libelle, mv.reference, mv.montant, mv.statut
        from mouvements_tresorerie mv join comptes_tresorerie c on c.id = mv.compte_id
        where mv.organization_id = ${organizationId} and mv.deleted_at is null and mv.date_operation between ${du}::date and ${au}::date
        order by mv.date_operation, mv.numero
      `);
      return {
        colonnes: [
          { cle: "date", libelle: "Date", type: "date" },
          { cle: "numero", libelle: "N°", type: "texte" },
          { cle: "compte", libelle: "Compte", type: "texte" },
          { cle: "nature", libelle: "Nature", type: "texte" },
          { cle: "tiers", libelle: "Tiers", type: "texte" },
          { cle: "libelle", libelle: "Libellé", type: "texte" },
          { cle: "reference", libelle: "Référence", type: "texte" },
          { cle: "entree", libelle: "Entrée", type: "montant" },
          { cle: "sortie", libelle: "Sortie", type: "montant" },
          { cle: "statut", libelle: "État", type: "texte" },
        ],
        // Un mouvement annulé reste listé, mais ne compte plus dans les totaux.
        lignes: lignes.map((l) => {
          const valide = l.statut === "valide";
          const entree = NATURES_MOUVEMENT[l.nature].sens === "entree";
          return {
            date: jourIso(l.date_operation),
            numero: l.numero,
            compte: l.compte,
            nature: NATURES_MOUVEMENT[l.nature].libelle,
            tiers: l.tiers_nom,
            libelle: l.libelle,
            reference: l.reference,
            entree: valide && entree ? Number(l.montant) : null,
            sortie: valide && !entree ? Number(l.montant) : null,
            statut: valide ? "Valide" : "Annulé",
          };
        }),
      };
    },
  },
];
