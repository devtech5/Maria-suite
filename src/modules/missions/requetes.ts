import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";

import {
  missions,
  type ChampFormulaire,
  type NatureMission,
  type StatutMission,
  type TypePreuve,
} from "./schema";

const enDate = (valeur: unknown): Date | null =>
  valeur === null || valeur === undefined ? null : new Date(valeur as string | Date);

// ------------------------------------------------------------------ missions

export interface MissionSuivie {
  id: string;
  reference: string;
  nature: NatureMission;
  titre: string;
  lieu: string | null;
  statut: StatutMission;
  executant: string | null;
  client: string | null;
  actif: string | null;
  montant: number;
  echeanceLe: Date | null;
  motif: string | null;
  etapes: number;
  etapesFaites: number;
  /** Libellé de l'étape attendue du terrain. Nul quand tout est fait. */
  etapeCourante: string | null;
  preuves: number;
  /** Ouverte et échéance dépassée, jugé par la base à l'instant de la requête. */
  enRetard: boolean;
}

/**
 * Les missions, avec leur avancement.
 *
 * L'avancement n'est pas stocké : il sort du décompte des étapes accomplies.
 * Étapes et preuves se comptent dans deux sous-requêtes séparées — les joindre
 * ensemble multiplierait chaque étape par le nombre de preuves, et une mission
 * à trois étapes et quatre photos afficherait douze étapes.
 */
export async function listerMissions(organizationId: string): Promise<MissionSuivie[]> {
  const lignes = await db.execute<{
    id: string;
    reference: string;
    nature: NatureMission;
    titre: string;
    lieu: string | null;
    statut: StatutMission;
    executant: string | null;
    client: string | null;
    actif: string | null;
    montant: string;
    echeance_le: string | Date | null;
    motif: string | null;
    etapes: string;
    etapes_faites: string;
    etape_courante: string | null;
    preuves: string;
    en_retard: boolean;
  }>(sql`
    select
      m.id, m.reference, m.nature, m.titre, m.lieu, m.statut,
      coalesce(e.nom, w.nom) as executant,
      t.nom as client,
      a.designation as actif,
      m.montant, m.echeance_le, m.motif,
      coalesce(s.total, 0) as etapes,
      coalesce(s.faites, 0) as etapes_faites,
      s.courante as etape_courante,
      coalesce(p.nombre, 0) as preuves,
      (m.statut in ('planifiee', 'en_cours') and m.echeance_le < now()) as en_retard
    from missions m
      left join employees e on e.id = m.employe_id
      left join workers w on w.id = m.intervenant_id
      left join tiers t on t.id = m.client_id
      left join actifs a on a.id = m.actif_id
      left join (
        select
          mission_id,
          count(*) as total,
          count(faite_le) as faites,
          (array_agg(libelle order by ordre) filter (where faite_le is null))[1] as courante
        from etapes_mission
        where organization_id = ${organizationId} and deleted_at is null
        group by mission_id
      ) s on s.mission_id = m.id
      left join (
        select mission_id, count(*) as nombre
        from preuves_mission
        where organization_id = ${organizationId} and deleted_at is null
        group by mission_id
      ) p on p.mission_id = m.id
    where m.organization_id = ${organizationId}
      and m.deleted_at is null
    order by
      case m.statut when 'en_cours' then 0 when 'planifiee' then 1 when 'echouee' then 2 else 3 end,
      m.echeance_le asc nulls last,
      m.reference desc
  `);

  return lignes.map((l) => ({
    id: l.id,
    reference: l.reference,
    nature: l.nature,
    titre: l.titre,
    lieu: l.lieu,
    statut: l.statut,
    executant: l.executant,
    client: l.client,
    actif: l.actif,
    montant: Number(l.montant),
    echeanceLe: enDate(l.echeance_le),
    motif: l.motif,
    etapes: Number(l.etapes),
    etapesFaites: Number(l.etapes_faites),
    etapeCourante: l.etape_courante,
    preuves: Number(l.preuves),
    enRetard: l.en_retard === true,
  }));
}

export interface PreuveVue {
  id: string;
  type: TypePreuve;
  texte: string | null;
  fichierCle: string | null;
  latitudeMicro: number | null;
  longitudeMicro: number | null;
  priseLe: Date;
  recueLe: Date;
}

export interface EtapeVue {
  id: string;
  ordre: number;
  libelle: string;
  preuvesRequises: TypePreuve[];
  faiteLe: Date | null;
  preuves: PreuveVue[];
}

/** Étapes d'une mission, chacune avec les preuves qui l'attestent. */
export async function etapesDeMission(
  organizationId: string,
  missionId: string,
): Promise<EtapeVue[]> {
  const etapes = await db.execute<{
    id: string;
    ordre: number;
    libelle: string;
    preuves_requises: string;
    faite_le: string | Date | null;
  }>(sql`
    select id, ordre, libelle, preuves_requises::text as preuves_requises, faite_le
    from etapes_mission
    where organization_id = ${organizationId}
      and mission_id = ${missionId}
      and deleted_at is null
    order by ordre asc
  `);

  const preuves = await db.execute<{
    id: string;
    etape_id: string | null;
    type: TypePreuve;
    texte: string | null;
    fichier_cle: string | null;
    latitude_micro: number | null;
    longitude_micro: number | null;
    prise_le: string | Date;
    recue_le: string | Date;
  }>(sql`
    select id, etape_id, type, texte, fichier_cle, latitude_micro, longitude_micro,
           prise_le, recue_le
    from preuves_mission
    where organization_id = ${organizationId}
      and mission_id = ${missionId}
      and deleted_at is null
    order by prise_le asc
  `);

  return etapes.map((etape) => ({
    id: etape.id,
    ordre: Number(etape.ordre),
    libelle: etape.libelle,
    // Un tableau d'énumérations arrive en texte « {photo,position} ».
    preuvesRequises: etape.preuves_requises
      .replace(/[{}]/g, "")
      .split(",")
      .filter(Boolean) as TypePreuve[],
    faiteLe: enDate(etape.faite_le),
    preuves: preuves
      .filter((p) => p.etape_id === etape.id)
      .map((p) => ({
        id: p.id,
        type: p.type,
        texte: p.texte,
        fichierCle: p.fichier_cle,
        latitudeMicro: p.latitude_micro === null ? null : Number(p.latitude_micro),
        longitudeMicro: p.longitude_micro === null ? null : Number(p.longitude_micro),
        priseLe: new Date(p.prise_le),
        recueLe: new Date(p.recue_le),
      })),
  }));
}

/** L'entreprise suit-elle au moins une mission ? Sert aux écrans vides. */
export async function aUneMission(organizationId: string): Promise<boolean> {
  const [mission] = await db
    .select({ id: missions.id })
    .from(missions)
    .where(and(eq(missions.organizationId, organizationId), isNull(missions.deletedAt)))
    .limit(1);

  return Boolean(mission);
}

/** Missions en retard ou échouées : ce que le tableau de bord doit signaler. */
export async function etatMissions(organizationId: string): Promise<{
  enRetard: number;
  echouees: number;
}> {
  const [ligne] = await db.execute<{ en_retard: string; echouees: string }>(sql`
    select
      count(*) filter (
        where statut in ('planifiee', 'en_cours') and echeance_le < now()
      ) as en_retard,
      count(*) filter (where statut = 'echouee') as echouees
    from missions
    where organization_id = ${organizationId} and deleted_at is null
  `);

  return {
    enRetard: Number(ligne?.en_retard ?? 0),
    echouees: Number(ligne?.echouees ?? 0),
  };
}

// ---------------------------------------------------------------- formulaires

export interface FormulaireSuivi {
  id: string;
  nom: string;
  usage: string | null;
  champs: ChampFormulaire[];
  reponses: number;
}

export async function listerFormulaires(
  organizationId: string,
): Promise<FormulaireSuivi[]> {
  const lignes = await db.execute<{
    id: string;
    nom: string;
    usage: string | null;
    champs: ChampFormulaire[];
    reponses: string;
  }>(sql`
    select f.id, f.nom, f.usage, f.champs, coalesce(r.nombre, 0) as reponses
    from formulaires f
      left join (
        select formulaire_id, count(*) as nombre
        from reponses_formulaire
        where organization_id = ${organizationId} and deleted_at is null
        group by formulaire_id
      ) r on r.formulaire_id = f.id
    where f.organization_id = ${organizationId} and f.deleted_at is null
    order by f.nom asc
  `);

  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    usage: l.usage,
    champs: l.champs,
    reponses: Number(l.reponses),
  }));
}

// -------------------------------------------------------------------- choix

export interface OptionsMission {
  employes: { id: string; nom: string }[];
  intervenants: { id: string; nom: string }[];
  clients: { id: string; nom: string }[];
  actifs: { id: string; libelle: string }[];
}

/** Listes de choix du formulaire de création, en une passe. */
export async function optionsMission(organizationId: string): Promise<OptionsMission> {
  const [employes, intervenants, clients, actifs] = await Promise.all([
    db.execute<{ id: string; nom: string }>(sql`
      select id, nom from employees
      where organization_id = ${organizationId} and deleted_at is null
      order by nom`),
    db.execute<{ id: string; nom: string }>(sql`
      select id, nom from workers
      where organization_id = ${organizationId} and deleted_at is null
      order by nom`),
    db.execute<{ id: string; nom: string }>(sql`
      select id, nom from tiers
      where organization_id = ${organizationId} and deleted_at is null
        and est_client
      order by nom`),
    db.execute<{ id: string; libelle: string }>(sql`
      select id, code || ' · ' || designation as libelle from actifs
      where organization_id = ${organizationId} and deleted_at is null
        and statut in ('actif', 'entretien')
      order by code`),
  ]);

  return {
    employes: [...employes],
    intervenants: [...intervenants],
    clients: [...clients],
    actifs: [...actifs],
  };
}
