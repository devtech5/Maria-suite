import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import { present, type Statut } from "./calcul";

const enDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
const peutEtre = (v: string | Date | null) => (v ? enDate(v) : null);

export interface ReunionListee {
  id: string;
  numero: string;
  titre: string;
  debutPrevu: Date;
  dureeMinutes: number;
  statut: Statut;
  organisateurUserId: string;
  organisateur: string;
  invites: number;
  presents: number;
}

const RANG: Record<Statut, number> = { en_cours: 0, planifiee: 1, terminee: 2, annulee: 2 };

/**
 * Réunions où l'on est invité — l'organisateur l'est toujours. En cours
 * d'abord, puis les prochaines dans l'ordre du calendrier, puis les closes
 * des 90 derniers jours, la plus récente en tête. Le filtre sur l'entreprise
 * est posé ici, jamais par l'appelant.
 */
export async function listerReunions(organizationId: string, userId: string, maintenant = new Date()): Promise<ReunionListee[]> {
  const lignes = await db.execute<{
    id: string;
    numero: string;
    titre: string;
    debut_prevu: string | Date;
    duree_minutes: number;
    statut: Statut;
    organisateur_user_id: string;
    organisateur: string | null;
    invites: number | string;
    derniers_signaux: (string | Date | null)[] | string | null;
  }>(sql`
    select r.id, r.numero, r.titre, r.debut_prevu, r.duree_minutes, r.statut, r.organisateur_user_id,
           o.full_name as organisateur,
           (select count(*) from reunion_participants p where p.reunion_id = r.id)::int as invites,
           (select coalesce(json_agg(p.vu_le), '[]'::json) from reunion_participants p where p.reunion_id = r.id and p.vu_le is not null) as derniers_signaux
    from reunions r
    join reunion_participants moi on moi.reunion_id = r.id and moi.user_id = ${userId}
    left join users o on o.id = r.organisateur_user_id
    where r.organization_id = ${organizationId} and r.deleted_at is null
      and (r.statut in ('planifiee', 'en_cours') or r.debut_prevu > now() - interval '90 days')
    limit 300
  `);

  const signaux = (v: (string | Date | null)[] | string | null): (string | Date | null)[] =>
    typeof v === "string" ? (JSON.parse(v) as string[]) : (v ?? []);

  return lignes
    .map((l) => ({
      id: l.id,
      numero: l.numero,
      titre: l.titre,
      debutPrevu: enDate(l.debut_prevu),
      dureeMinutes: Number(l.duree_minutes),
      statut: l.statut,
      organisateurUserId: l.organisateur_user_id,
      organisateur: l.organisateur ?? "Ancien membre",
      invites: Number(l.invites),
      presents: l.statut === "en_cours" ? signaux(l.derniers_signaux).filter((s) => present(peutEtre(s), maintenant)).length : 0,
    }))
    .sort((a, b) => {
      if (RANG[a.statut] !== RANG[b.statut]) return RANG[a.statut] - RANG[b.statut];
      const ecart = a.debutPrevu.getTime() - b.debutPrevu.getTime();
      return RANG[a.statut] === 2 ? -ecart : ecart;
    });
}

export interface ReunionDetaillee {
  id: string;
  numero: string;
  titre: string;
  ordreDuJour: string | null;
  debutPrevu: Date;
  dureeMinutes: number;
  statut: Statut;
  organisateurUserId: string;
  organisateur: string;
  ouverteLe: Date | null;
  termineeLe: Date | null;
  terminateur: string | null;
  compteRendu: string | null;
  annuleeLe: Date | null;
  motifAnnulation: string | null;
}

export async function reunionDe(organizationId: string, reunionId: string): Promise<ReunionDetaillee | null> {
  const [l] = await db.execute<{
    id: string;
    numero: string;
    titre: string;
    ordre_du_jour: string | null;
    debut_prevu: string | Date;
    duree_minutes: number;
    statut: Statut;
    organisateur_user_id: string;
    organisateur: string | null;
    ouverte_le: string | Date | null;
    terminee_le: string | Date | null;
    terminateur: string | null;
    compte_rendu: string | null;
    annulee_le: string | Date | null;
    motif_annulation: string | null;
  }>(sql`
    select r.id, r.numero, r.titre, r.ordre_du_jour, r.debut_prevu, r.duree_minutes, r.statut,
           r.organisateur_user_id, o.full_name as organisateur, r.ouverte_le, r.terminee_le,
           t.full_name as terminateur, r.compte_rendu, r.annulee_le, r.motif_annulation
    from reunions r
    left join users o on o.id = r.organisateur_user_id
    left join users t on t.id = r.terminee_par_user_id
    where r.organization_id = ${organizationId} and r.id = ${reunionId} and r.deleted_at is null
  `);
  if (!l) return null;
  return {
    id: l.id,
    numero: l.numero,
    titre: l.titre,
    ordreDuJour: l.ordre_du_jour,
    debutPrevu: enDate(l.debut_prevu),
    dureeMinutes: Number(l.duree_minutes),
    statut: l.statut,
    organisateurUserId: l.organisateur_user_id,
    organisateur: l.organisateur ?? "Ancien membre",
    ouverteLe: peutEtre(l.ouverte_le),
    termineeLe: peutEtre(l.terminee_le),
    terminateur: l.terminateur,
    compteRendu: l.compte_rendu,
    annuleeLe: peutEtre(l.annulee_le),
    motifAnnulation: l.motif_annulation,
  };
}

export interface ParticipantVue {
  userId: string;
  nom: string;
  rejointLe: Date | null;
  secondesPresence: number;
  /** Dans la salle en ce moment. */
  present: boolean;
  micro: boolean;
  camera: boolean;
  ecran: boolean;
}

/** Invités d'une réunion et leur présence : la feuille de présence comme la salle la lisent. */
export async function participantsDe(organizationId: string, reunionId: string, maintenant = new Date()): Promise<ParticipantVue[]> {
  const lignes = await db.execute<{
    user_id: string;
    nom: string | null;
    rejoint_le: string | Date | null;
    vu_le: string | Date | null;
    secondes_presence: number;
    micro: boolean;
    camera: boolean;
    ecran: boolean;
  }>(sql`
    select p.user_id, u.full_name as nom, p.rejoint_le, p.vu_le, p.secondes_presence, p.micro, p.camera, p.ecran
    from reunion_participants p
    left join users u on u.id = p.user_id
    where p.organization_id = ${organizationId} and p.reunion_id = ${reunionId} and p.deleted_at is null
    order by u.full_name
  `);
  return lignes.map((l) => {
    const ici = present(peutEtre(l.vu_le), maintenant);
    return {
      userId: l.user_id,
      nom: l.nom ?? "Ancien membre",
      rejointLe: peutEtre(l.rejoint_le),
      secondesPresence: Number(l.secondes_presence),
      present: ici,
      micro: ici && l.micro,
      camera: ici && l.camera,
      ecran: ici && l.ecran,
    };
  });
}

/** Membres actifs, pour choisir les invités. */
export async function membresInvitables(organizationId: string): Promise<{ userId: string; nom: string }[]> {
  const lignes = await db.execute<{ user_id: string; nom: string }>(sql`
    select m.user_id, u.full_name as nom
    from memberships m join users u on u.id = m.user_id
    where m.organization_id = ${organizationId} and m.status = 'actif'
    order by u.full_name
  `);
  return lignes.map((l) => ({ userId: l.user_id, nom: l.nom }));
}

/** Réunion et participation, pour décider d'un flux sans session : c'est le serveur vidéo qui demande. */
export async function placeDansReunion(
  reunionId: string,
  userId: string,
): Promise<{ organizationId: string; statut: Statut; invite: boolean } | null> {
  const [l] = await db.execute<{ organization_id: string; statut: Statut; invite: boolean }>(sql`
    select r.organization_id, r.statut,
           exists (select 1 from reunion_participants p where p.reunion_id = r.id and p.user_id = ${userId} and p.deleted_at is null) as invite
    from reunions r
    where r.id = ${reunionId} and r.deleted_at is null
  `);
  return l ? { organizationId: l.organization_id, statut: l.statut, invite: Boolean(l.invite) } : null;
}

/** Fuseau de l'entreprise : les heures de réunion s'affichent et se saisissent dans celui-ci. */
export async function fuseauDe(organizationId: string): Promise<string> {
  const [l] = await db.execute<{ timezone: string | null }>(sql`select timezone from organizations where id = ${organizationId}`);
  return l?.timezone || "Africa/Abidjan";
}
