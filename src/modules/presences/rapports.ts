import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { jourIso, type DefinitionRapport } from "@/lib/rapports/types";

import { formatJours, heureLocale, joursEntre, jourLocal, NATURES_CONGE } from "./calcul";
import { reglagesDe } from "./creation";
import {
  formatDuree,
  MOTIFS_PERMISSION,
  TRAITEMENTS_PERMISSION,
  type GenrePermission,
  type MotifPermission,
  type TraitementPermission,
} from "./permissions";
import { registre } from "./requetes";


/** Au-delà, le registre se calcule jour par jour pour chaque salarié : trois mois suffisent à un bilan. */
const JOURS_MAX = 93;

export const RAPPORTS_PRESENCES: DefinitionRapport[] = [
  {
    cle: "assiduite",
    module: "presences",
    rubrique: "Présences et congés",
    titre: "Assiduité par salarié",
    description: "Jours de présence, retards, absences et congés de chaque salarié sur la période.",
    droit: "presences.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      if (joursEntre(du, au).length > JOURS_MAX) throw new Error("Choisissez une période de trois mois au plus.");
      const r = await reglagesDe(organizationId);
      const maintenant = new Date();
      const { lignes } = await registre(organizationId, du, au, r, jourLocal(maintenant, r.fuseau), heureLocale(maintenant, r.fuseau));
      return {
        colonnes: [
          { cle: "matricule", libelle: "Matricule", type: "texte" },
          { cle: "nom", libelle: "Salarié", type: "texte" },
          { cle: "poste", libelle: "Poste", type: "texte" },
          { cle: "presents", libelle: "Jours présents", type: "entier", total: true },
          { cle: "retards", libelle: "Retards", type: "entier", total: true },
          { cle: "absences", libelle: "Absences", type: "entier", total: true },
          { cle: "conges", libelle: "Jours de congé", type: "entier", total: true },
          { cle: "permissions", libelle: "Absences autorisées", type: "entier", total: true },
        ],
        lignes: lignes.map((l) => ({
          matricule: l.salarie.matricule,
          nom: l.salarie.nom,
          poste: l.salarie.poste,
          presents: l.presents,
          retards: l.retards,
          absences: l.absences,
          conges: l.conges,
          permissions: l.permissions,
        })),
        note: "Jours travaillés selon les réglages de l'entreprise, jours fériés exclus. Un jour à venir n'est compté ni présent ni absent.",
      };
    },
  },
  {
    cle: "conges-accordes",
    module: "presences",
    rubrique: "Présences et congés",
    titre: "Congés et absences accordés",
    description: "Chaque congé accordé qui touche la période : salarié, nature, dates et jours décomptés.",
    droit: "presences.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{ numero: string; matricule: string; nom: string; nature: keyof typeof NATURES_CONGE; debut: string | Date; fin: string | Date; jours: number }>(sql`
        select c.numero, e.matricule, e.nom, c.nature, c.debut, c.fin, c.jours_centiemes as jours
        from conges c join employees e on e.id = c.employee_id
        where c.organization_id = ${organizationId} and c.statut = 'approuve' and c.deleted_at is null
          and c.debut <= ${au}::date and c.fin >= ${du}::date
        order by c.debut, e.nom
      `);
      return {
        colonnes: [
          { cle: "numero", libelle: "N°", type: "texte" },
          { cle: "matricule", libelle: "Matricule", type: "texte" },
          { cle: "nom", libelle: "Salarié", type: "texte" },
          { cle: "nature", libelle: "Nature", type: "texte" },
          { cle: "debut", libelle: "Du", type: "date" },
          { cle: "fin", libelle: "Au", type: "date" },
          // Centièmes de jour en base ; la colonne « quantite » lit des millièmes.
          { cle: "jours", libelle: "Jours", type: "quantite", total: true },
        ],
        lignes: lignes.map((l) => ({
          numero: l.numero,
          matricule: l.matricule,
          nom: l.nom,
          nature: NATURES_CONGE[l.nature]?.libelle ?? l.nature,
          debut: jourIso(l.debut),
          fin: jourIso(l.fin),
          jours: Number(l.jours) * 10,
        })),
        note: "Un congé à cheval sur la période est listé en entier, avec tous ses jours.",
      };
    },
  },
  {
    cle: "permissions-accordees",
    module: "presences",
    rubrique: "Présences et congés",
    titre: "Permissions et absences accordées",
    description: "Chaque permission ou absence accordée sur la période, avec son traitement : payée, à récupérer, déduite des congés, non payée.",
    droit: "presences.consulter",
    periode: "intervalle",
    async executer(organizationId, { du, au }) {
      const lignes = await db.execute<{
        numero: string;
        matricule: string;
        nom: string;
        genre: GenrePermission;
        debut: string | Date;
        fin: string | Date;
        heure_debut: string | null;
        heure_fin: string | null;
        minutes: number;
        jours: number;
        motif: MotifPermission;
        traitement: TraitementPermission | null;
      }>(sql`
        select p.numero, e.matricule, e.nom, p.genre, p.debut, p.fin, p.heure_debut, p.heure_fin, p.minutes, p.jours_centiemes as jours, p.motif, p.traitement
        from demandes_permission p join employees e on e.id = p.employee_id
        where p.organization_id = ${organizationId} and p.statut = 'approuve' and p.deleted_at is null
          and p.debut <= ${au}::date and p.fin >= ${du}::date
        order by p.debut, p.heure_debut, e.nom
      `);
      return {
        colonnes: [
          { cle: "numero", libelle: "N°", type: "texte" },
          { cle: "matricule", libelle: "Matricule", type: "texte" },
          { cle: "nom", libelle: "Salarié", type: "texte" },
          { cle: "motif", libelle: "Motif", type: "texte" },
          { cle: "debut", libelle: "Du", type: "date" },
          { cle: "fin", libelle: "Au", type: "date" },
          { cle: "duree", libelle: "Durée", type: "texte" },
          { cle: "traitement", libelle: "Traitement", type: "texte" },
        ],
        lignes: lignes.map((l) => ({
          numero: l.numero,
          matricule: l.matricule,
          nom: l.nom,
          motif: MOTIFS_PERMISSION[l.motif] ?? l.motif,
          debut: jourIso(l.debut),
          fin: jourIso(l.fin),
          duree:
            l.genre === "heures"
              ? `${l.heure_debut ?? ""}–${l.heure_fin ?? ""} (${formatDuree(Number(l.minutes))})`
              : formatJours(Number(l.jours)),
          traitement: l.traitement ? TRAITEMENTS_PERMISSION[l.traitement] : "",
        })),
        note: "Une absence déduite des congés est retirée du solde comme un congé payé pris.",
      };
    },
  },
];
