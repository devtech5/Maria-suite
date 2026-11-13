import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";

export interface ArchiveVue {
  id: string;
  numero: string;
  titre: string;
  dossier: string | null;
  /** Dossier partagé où l'archive a été déposée. */
  dossierPartage: { id: string; nom: string } | null;
  description: string | null;
  nomFichier: string;
  typeMime: string;
  tailleOctets: number;
  empreinte: string;
  deposeLe: Date;
  retireeLe: Date | null;
  motifRetrait: string | null;
  auteurId: string;
  auteur: string;
  /** Ouvertures par quelqu'un d'autre que l'auteur : administrateur, membres d'un dossier partagé. */
  consultationsParAutres: number;
  derniereVerification: { le: Date; etat: string } | null;
}

type Ligne = {
  id: string;
  numero: string;
  titre: string;
  dossier: string | null;
  dossier_id: string | null;
  dossier_nom: string | null;
  description: string | null;
  nom_fichier: string;
  type_mime: string;
  taille_octets: string | number;
  empreinte: string;
  cree_le: string | Date;
  retiree_le: string | Date | null;
  motif_retrait: string | null;
  user_id: string;
  auteur: string | null;
  consultations: string | number;
  verifiee_le: string | Date | null;
  verification: string | null;
};

const enDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

function vue(l: Ligne): ArchiveVue {
  return {
    id: l.id,
    numero: l.numero,
    titre: l.titre,
    dossier: l.dossier,
    dossierPartage: l.dossier_id && l.dossier_nom ? { id: l.dossier_id, nom: l.dossier_nom } : null,
    description: l.description,
    nomFichier: l.nom_fichier,
    typeMime: l.type_mime,
    tailleOctets: Number(l.taille_octets),
    empreinte: l.empreinte,
    deposeLe: enDate(l.cree_le),
    retireeLe: l.retiree_le ? enDate(l.retiree_le) : null,
    motifRetrait: l.motif_retrait,
    auteurId: l.user_id,
    auteur: l.auteur ?? "Ancien membre",
    consultationsParAutres: Number(l.consultations),
    derniereVerification: l.verifiee_le && l.verification ? { le: enDate(l.verifiee_le), etat: l.verification } : null,
  };
}

/**
 * Lecture commune. Le filtre arrive déjà composé : il porte TOUJOURS
 * l'entreprise, ajoutée ici et non par l'appelant.
 */
async function lire(organizationId: string, filtre: SQL): Promise<ArchiveVue[]> {
  const lignes = await db.execute<Ligne>(sql`
    select a.id, a.numero, a.titre, a.dossier, a.dossier_id, d.nom as dossier_nom, a.description, a.nom_fichier, a.type_mime,
           a.taille_octets, a.empreinte, a.created_at as cree_le, a.retiree_le, a.motif_retrait,
           a.user_id, u.full_name as auteur,
           (select count(*) from audit_logs j
             where j.organization_id = a.organization_id and j.entity_type = 'archive'
               and j.entity_id = a.id and j.action = 'archive.ouvrir' and j.user_id is distinct from a.user_id
           ) as consultations,
           v.created_at as verifiee_le, v.after->>'etat' as verification
    from archives a
    left join users u on u.id = a.user_id
    left join dossiers_archives d on d.id = a.dossier_id
    left join lateral (
      select j.created_at, j.after from audit_logs j
      where j.organization_id = a.organization_id and j.entity_type = 'archive'
        and j.entity_id = a.id and j.action = 'archive.verifier'
      order by j.created_at desc limit 1
    ) v on true
    where a.organization_id = ${organizationId} and a.deleted_at is null and ${filtre}
    order by a.created_at desc
    limit 500
  `);
  return lignes.map(vue);
}

/** L'espace d'une personne : ce qu'elle a déposé et n'a pas retiré. */
export function mesArchives(organizationId: string, userId: string): Promise<ArchiveVue[]> {
  return lire(organizationId, sql`a.user_id = ${userId} and a.retiree_le is null`);
}

/** Toutes les archives de l'entreprise, retirées comprises : la vue de l'administrateur légal. */
export function toutesArchives(organizationId: string, membre?: string | null): Promise<ArchiveVue[]> {
  return lire(organizationId, membre ? sql`a.user_id = ${membre}` : sql`true`);
}

/** Le contenu d'un dossier partagé. L'accès au dossier se vérifie AVANT l'appel. */
export function archivesDuDossier(organizationId: string, dossierId: string): Promise<ArchiveVue[]> {
  return lire(organizationId, sql`a.dossier_id = ${dossierId} and a.retiree_le is null`);
}

export interface DossierVue {
  id: string;
  nom: string;
  description: string | null;
  visibilite: "tous" | "selection";
  depotOuvert: boolean;
  designes: { userId: string; nom: string }[];
  /** Membres à qui le dépôt est accordé nommément. */
  deposants: { userId: string; nom: string }[];
  archives: number;
  octets: number;
  derniereArchiveLe: Date | null;
}

/**
 * Les dossiers partagés que la personne voit. Celui qui gère les dossiers les
 * voit tous, masqués compris : il ne peut pas administrer ce qu'il ne voit pas.
 */
export async function dossiersVisibles(
  organizationId: string,
  userId: string,
  gestionnaire: boolean,
): Promise<DossierVue[]> {
  const lignes = await db.execute<{
    id: string;
    nom: string;
    description: string | null;
    visibilite: "tous" | "selection";
    depot_ouvert: boolean;
    designes: { userId: string; nom: string }[] | null;
    deposants: { userId: string; nom: string }[] | null;
    archives: string | number;
    octets: string | number;
    derniere: string | Date | null;
  }>(sql`
    select d.id, d.nom, d.description, d.visibilite, d.depot_ouvert,
           (select coalesce(json_agg(json_build_object('userId', x.user_id, 'nom', coalesce(u.full_name, 'Ancien membre')) order by u.full_name), '[]'::json)
              from acces_dossiers_archives x left join users u on u.id = x.user_id
             where x.dossier_id = d.id and x.organization_id = d.organization_id) as designes,
           (select coalesce(json_agg(json_build_object('userId', x.user_id, 'nom', coalesce(u.full_name, 'Ancien membre')) order by u.full_name), '[]'::json)
              from acces_dossiers_archives x left join users u on u.id = x.user_id
             where x.dossier_id = d.id and x.organization_id = d.organization_id and x.peut_deposer) as deposants,
           (select count(*) from archives a where a.dossier_id = d.id and a.retiree_le is null) as archives,
           (select coalesce(sum(a.taille_octets), 0) from archives a where a.dossier_id = d.id and a.retiree_le is null) as octets,
           (select max(a.created_at) from archives a where a.dossier_id = d.id and a.retiree_le is null) as derniere
    from dossiers_archives d
    where d.organization_id = ${organizationId} and d.deleted_at is null
      and (${gestionnaire} or d.visibilite = 'tous' or exists (
        select 1 from acces_dossiers_archives x
        where x.dossier_id = d.id and x.organization_id = d.organization_id and x.user_id = ${userId}
      ))
    order by d.nom
  `);
  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    description: l.description,
    visibilite: l.visibilite,
    depotOuvert: Boolean(l.depot_ouvert),
    designes: typeof l.designes === "string" ? JSON.parse(l.designes) : (l.designes ?? []),
    deposants: typeof l.deposants === "string" ? JSON.parse(l.deposants) : (l.deposants ?? []),
    archives: Number(l.archives),
    octets: Number(l.octets),
    derniereArchiveLe: l.derniere ? enDate(l.derniere) : null,
  }));
}

/** Membres actifs, pour désigner qui voit un dossier. */
export async function membresEntreprise(organizationId: string): Promise<{ userId: string; nom: string; role: string | null }[]> {
  const lignes = await db.execute<{ user_id: string; nom: string; role: string | null }>(sql`
    select m.user_id, u.full_name as nom, r.name as role
    from memberships m
    join users u on u.id = m.user_id
    left join roles r on r.id = m.role_id
    where m.organization_id = ${organizationId} and m.status = 'actif'
    order by u.full_name
  `);
  return lignes.map((l) => ({ userId: l.user_id, nom: l.nom, role: l.role }));
}

export interface TitulaireArchives {
  userId: string;
  nom: string;
  fichiers: number;
  octets: number;
}

/** Les personnes qui ont archivé, avec leur volume : le filtre de l'écran de supervision. */
export async function titulaires(organizationId: string): Promise<TitulaireArchives[]> {
  const lignes = await db.execute<{ user_id: string; nom: string | null; fichiers: string; octets: string }>(sql`
    select a.user_id, u.full_name as nom, count(*) as fichiers,
           coalesce(sum(a.taille_octets) filter (where a.retiree_le is null), 0) as octets
    from archives a left join users u on u.id = a.user_id
    where a.organization_id = ${organizationId} and a.deleted_at is null
    group by a.user_id, u.full_name
    order by u.full_name
  `);
  return lignes.map((l) => ({
    userId: l.user_id,
    nom: l.nom ?? "Ancien membre",
    fichiers: Number(l.fichiers),
    octets: Number(l.octets),
  }));
}

export interface EntreeJournal {
  id: string;
  le: Date;
  action: string;
  acteur: string;
  numero: string | null;
  titre: string | null;
  titulaire: string | null;
  detail: Record<string, unknown> | null;
  /** État antérieur, pour une modification de dossier. */
  avant: Record<string, unknown> | null;
}

/** Les derniers gestes sur les archives : dépôts, ouvertures, retraits, vérifications. */
export async function journalArchives(organizationId: string, limite = 40): Promise<EntreeJournal[]> {
  const lignes = await db.execute<{
    id: string;
    le: string | Date;
    action: string;
    acteur: string | null;
    numero: string | null;
    titre: string | null;
    titulaire: string | null;
    detail: Record<string, unknown> | null;
    avant: Record<string, unknown> | null;
  }>(sql`
    select j.id, j.created_at as le, j.action, u.full_name as acteur,
           coalesce(a.numero, 'Dossier') as numero, coalesce(a.titre, d.nom, j.after->>'nom', j.before->>'nom') as titre,
           t.full_name as titulaire, j.after as detail, j.before as avant
    from audit_logs j
    left join users u on u.id = j.user_id
    left join archives a on a.id = j.entity_id and a.organization_id = j.organization_id
    left join users t on t.id = a.user_id
    left join dossiers_archives d on d.id = j.entity_id and d.organization_id = j.organization_id
    where j.organization_id = ${organizationId} and j.entity_type in ('archive', 'archive_dossier')
    order by j.created_at desc
    limit ${limite}
  `);
  return lignes.map((l) => ({
    id: l.id,
    le: enDate(l.le),
    action: l.action,
    acteur: l.acteur ?? "Système",
    numero: l.numero,
    titre: l.titre,
    titulaire: l.titulaire,
    detail: l.detail,
    avant: l.avant,
  }));
}
