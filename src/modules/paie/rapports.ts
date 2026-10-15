import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { jourIso, type DefinitionRapport } from "@/lib/rapports/types";

/** Libellé lisible d'un mois de paie « 2026-10 ». */
const NOMS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const libelleMois = (m: string) => `${NOMS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export const RAPPORTS_PAIE: DefinitionRapport[] = [
  {
    cle: "masse-salariale",
    module: "personnes",
    rubrique: "Personnel",
    titre: "Masse salariale par mois",
    description: "Effectif payé, salaires bruts, retenues, nets et charges patronales de chaque mois de paie validé.",
    droit: "personnes.paie.preparer",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{ mois: string; effectif: string; brut: string; cnps: string; impot: string; net: string; patronal: string }>(sql`
        select p.mois, count(b.id) as effectif, p.total_brut as brut, p.total_cnps as cnps, p.total_impot as impot, p.total_net as net, p.total_patronal as patronal
        from periodes_paie p left join bulletins_paie b on b.periode_id = p.id
        where p.organization_id = ${organizationId} and p.statut = 'validee'
          and p.mois between ${du.slice(0, 7)} and ${au.slice(0, 7)}
        group by p.id order by p.mois
      `);
      return {
        colonnes: [
          { cle: "mois", libelle: "Mois", type: "texte" },
          { cle: "effectif", libelle: "Salariés", type: "entier", total: false },
          { cle: "brut", libelle: "Salaires bruts", type: "montant" },
          { cle: "cnps", libelle: "CNPS salarié", type: "montant" },
          { cle: "impot", libelle: "Impôt sur salaire", type: "montant" },
          { cle: "net", libelle: "Net à payer", type: "montant" },
          { cle: "patronal", libelle: "Charges patronales", type: "montant" },
          { cle: "cout", libelle: "Coût employeur", type: "montant" },
        ],
        lignes: lignes.map((l) => ({
          mois: libelleMois(l.mois),
          effectif: Number(l.effectif),
          brut: Number(l.brut),
          cnps: Number(l.cnps),
          impot: Number(l.impot),
          net: Number(l.net),
          patronal: Number(l.patronal),
          cout: Number(l.brut) + Number(l.patronal),
        })),
        note: "Mois de paie validés seulement. Les intervenants payés à la tâche n'y figurent pas : ils ne sont pas salariés.",
      };
    },
  },
  {
    cle: "salaires-par-salarie",
    module: "personnes",
    rubrique: "Personnel",
    titre: "Cumul des salaires par salarié",
    description: "Ce que chaque salarié a perçu et coûté sur la période : brut, retenues, net, charges patronales.",
    droit: "personnes.paie.preparer",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{ matricule: string; nom: string; poste: string; mois: string; brut: string; cnps: string; impot: string; net: string; patronal: string }>(sql`
        select b.matricule, b.nom, min(b.poste) as poste, count(*) as mois, sum(b.brut) as brut, sum(b.cnps_salarie) as cnps, sum(b.impot) as impot, sum(b.net) as net,
               sum(b.cnps_patronal + b.prestations_familiales + b.accident_travail) as patronal
        from bulletins_paie b join periodes_paie p on p.id = b.periode_id
        where p.organization_id = ${organizationId} and p.statut = 'validee'
          and p.mois between ${du.slice(0, 7)} and ${au.slice(0, 7)}
        group by b.matricule, b.nom order by b.nom
      `);
      return {
        colonnes: [
          { cle: "matricule", libelle: "Matricule", type: "texte" },
          { cle: "nom", libelle: "Salarié", type: "texte" },
          { cle: "poste", libelle: "Poste", type: "texte" },
          { cle: "mois", libelle: "Bulletins", type: "entier", total: true },
          { cle: "brut", libelle: "Brut", type: "montant" },
          { cle: "cnps", libelle: "CNPS salarié", type: "montant" },
          { cle: "impot", libelle: "Impôt", type: "montant" },
          { cle: "net", libelle: "Net", type: "montant" },
          { cle: "patronal", libelle: "Charges patronales", type: "montant" },
        ],
        lignes: lignes.map((l) => ({
          matricule: l.matricule,
          nom: l.nom,
          poste: l.poste,
          mois: Number(l.mois),
          brut: Number(l.brut),
          cnps: Number(l.cnps),
          impot: Number(l.impot),
          net: Number(l.net),
          patronal: Number(l.patronal),
        })),
      };
    },
  },
  {
    cle: "disa",
    module: "personnes",
    rubrique: "Personnel",
    titre: "Déclaration annuelle des salaires (DISA)",
    description:
      "Par salarié, sur l'année : période d'emploi, salaire brut, assiette retraite plafonnée, cotisations CNPS et impôt retenu. La base de la DISA à déposer à la CNPS.",
    droit: "personnes.paie.preparer",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      // L'assiette retraite se plafonne mois par mois, avec le plafond du
      // barème appliqué ce mois-là : le cumul annuel du brut ne suffit pas.
      const lignes = await db.execute<{
        matricule: string;
        nom: string;
        cnps: string | null;
        naissance: string | Date | null;
        entree: string | Date;
        sortie: string | Date | null;
        mois: string;
        brut: string;
        assiette: string;
        retraite_sal: string;
        retraite_pat: string;
        pf: string;
        at: string;
        impot: string;
        net: string;
      }>(sql`
        select e.matricule, e.nom, e.numero_cnps as cnps, e.date_naissance as naissance, e.debut as entree, e.fin as sortie,
               count(*) as mois, sum(b.brut) as brut,
               sum(least(b.brut, coalesce((p.bareme_applique->>'cnpsPlafondMensuel')::bigint, b.brut))) as assiette,
               sum(b.cnps_salarie) as retraite_sal, sum(b.cnps_patronal) as retraite_pat,
               sum(b.prestations_familiales) as pf, sum(b.accident_travail) as at,
               sum(b.impot) as impot, sum(b.net) as net
        from bulletins_paie b
        join periodes_paie p on p.id = b.periode_id
        join employees e on e.id = b.employe_id
        where b.organization_id = ${organizationId} and p.statut = 'validee'
          and p.mois between ${du.slice(0, 7)} and ${au.slice(0, 7)}
        group by e.id order by e.nom
      `);
      const sansNumero = lignes.filter((l) => !l.cnps).length;
      const date = (v: string | Date | null) => (v ? jourIso(v) : null);
      return {
        colonnes: [
          { cle: "matricule", libelle: "Matricule", type: "texte" },
          { cle: "nom", libelle: "Salarié", type: "texte" },
          { cle: "cnps", libelle: "N° CNPS", type: "texte" },
          { cle: "naissance", libelle: "Naissance", type: "date" },
          { cle: "entree", libelle: "Entrée", type: "date" },
          { cle: "sortie", libelle: "Sortie", type: "date" },
          { cle: "mois", libelle: "Mois payés", type: "entier", total: false },
          { cle: "brut", libelle: "Salaire brut", type: "montant" },
          { cle: "assiette", libelle: "Assiette retraite", type: "montant" },
          { cle: "retraiteSal", libelle: "Retraite salarié", type: "montant" },
          { cle: "retraitePat", libelle: "Retraite employeur", type: "montant" },
          { cle: "pf", libelle: "Prestations familiales", type: "montant" },
          { cle: "at", libelle: "Accident du travail", type: "montant" },
          { cle: "impot", libelle: "Impôt retenu", type: "montant" },
          { cle: "net", libelle: "Net payé", type: "montant" },
        ],
        lignes: lignes.map((l) => ({
          matricule: l.matricule,
          nom: l.nom,
          cnps: l.cnps,
          naissance: date(l.naissance),
          entree: date(l.entree),
          sortie: date(l.sortie),
          mois: Number(l.mois),
          brut: Number(l.brut),
          assiette: Number(l.assiette),
          retraiteSal: Number(l.retraite_sal),
          retraitePat: Number(l.retraite_pat),
          pf: Number(l.pf),
          at: Number(l.at),
          impot: Number(l.impot),
          net: Number(l.net),
        })),
        note:
          "Bulletins des mois de paie validés, rappels compris dans le mois où ils sont versés. Choisissez l'année civile (1er janvier au 31 décembre). " +
          "Le dépôt se fait auprès de la CNPS, au format qu'elle impose : confrontez ce relevé à son gabarit en vigueur avant de le reporter." +
          (sansNumero ? ` ${sansNumero} salarié${sansNumero > 1 ? "s n'ont" : " n'a"} pas de numéro CNPS : à renseigner sur sa fiche avant le dépôt.` : ""),
      };
    },
  },
];
