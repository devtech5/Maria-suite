import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";

import type { LigneCommandeInterne, StatutCommandeInterne } from "./commandes-internes";

export interface CommandeInterneVue {
  id: string;
  numero: string;
  objet: string;
  service: string | null;
  lieuLivraison: string | null;
  /** Nom et prénom de qui reçoit ; nul sur les bons antérieurs à la règle. */
  beneficiaire: string | null;
  notes: string | null;
  lignes: LigneCommandeInterne[];
  total: number;
  statut: StatutCommandeInterne;
  demandeParUserId: string;
  demandeur: string;
  demandeLe: Date;
  approbateur: string | null;
  approuveLe: Date | null;
  motifRejet: string | null;
}

type Ligne = {
  id: string;
  numero: string;
  objet: string;
  service: string | null;
  lieu_livraison: string | null;
  beneficiaire: string | null;
  notes: string | null;
  lignes: LigneCommandeInterne[] | string;
  total: string | number;
  statut: StatutCommandeInterne;
  demande_par_user_id: string;
  demandeur: string | null;
  cree_le: string | Date;
  approbateur: string | null;
  approuve_le: string | Date | null;
  motif_rejet: string | null;
};

const enDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

function selection(organizationId: string, condition: SQL, suite: SQL = sql``): SQL {
  return sql`
    select b.id, b.numero, b.objet, b.service, b.lieu_livraison, coalesce(be.nom, b.beneficiaire) as beneficiaire, b.notes, b.lignes, b.total, b.statut,
           b.demande_par_user_id, d.full_name as demandeur, b.created_at as cree_le,
           a.full_name as approbateur, b.approuve_le, b.motif_rejet
    from bons_commande_interne b
    left join employees be on be.id = b.beneficiaire_employe_id
    left join users d on d.id = b.demande_par_user_id
    left join users a on a.id = b.approuve_par_user_id
    where b.organization_id = ${organizationId} and b.deleted_at is null and ${condition}
    ${suite}
  `;
}

function versVue(l: Ligne): CommandeInterneVue {
  return {
    id: l.id,
    numero: l.numero,
    objet: l.objet,
    service: l.service,
    lieuLivraison: l.lieu_livraison,
    beneficiaire: l.beneficiaire,
    notes: l.notes,
    lignes: typeof l.lignes === "string" ? (JSON.parse(l.lignes) as LigneCommandeInterne[]) : l.lignes,
    total: Number(l.total),
    statut: l.statut,
    demandeParUserId: l.demande_par_user_id,
    demandeur: l.demandeur ?? "Ancien membre",
    demandeLe: enDate(l.cree_le),
    approbateur: l.approbateur,
    approuveLe: l.approuve_le ? enDate(l.approuve_le) : null,
    motifRejet: l.motif_rejet,
  };
}

/**
 * Les bons en cours, puis ceux des 90 derniers jours. Qui ne voit pas tout
 * ne voit que les siens.
 */
export async function listerCommandesInternes(organizationId: string, userId: string, tous: boolean): Promise<CommandeInterneVue[]> {
  const lignes = await db.execute<Ligne>(
    selection(
      organizationId,
      sql`(${tous} or b.demande_par_user_id = ${userId})
      and (b.statut in ('demande', 'approuve') or b.updated_at > now() - interval '90 days')`,
      sql`order by case b.statut when 'demande' then 0 when 'approuve' then 1 else 2 end, b.created_at desc limit 300`,
    ),
  );
  return lignes.map(versVue);
}

/** Un bon, quel que soit son âge. Même règle de lecture que la liste. */
export async function commandeInterne(organizationId: string, userId: string, tous: boolean, id: string): Promise<CommandeInterneVue | null> {
  const [l] = await db.execute<Ligne>(selection(organizationId, sql`b.id = ${id} and (${tous} or b.demande_par_user_id = ${userId})`));
  return l ? versVue(l) : null;
}
