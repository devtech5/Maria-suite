import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { depots } from "@/modules/stock/schema";
import {
  postesCaisse,
  ventes,
  type MoyenReglementVente,
  type PosteCaisse,
} from "./schema";

export interface PosteAvecDepot extends PosteCaisse {
  depotNom: string;
}

export async function listerPostes(
  organizationId: string,
  inclureFermes = false,
): Promise<PosteAvecDepot[]> {
  const filtres = [
    eq(postesCaisse.organizationId, organizationId),
    isNull(postesCaisse.deletedAt),
  ];
  if (!inclureFermes) filtres.push(eq(postesCaisse.actif, true));

  const lignes = await db
    .select({ poste: postesCaisse, depotNom: depots.nom })
    .from(postesCaisse)
    .innerJoin(depots, eq(postesCaisse.depotId, depots.id))
    .where(and(...filtres))
    .orderBy(asc(postesCaisse.code));

  return lignes.map((ligne) => ({ ...ligne.poste, depotNom: ligne.depotNom }));
}

/**
 * Poste d'encaissement de cet appareil.
 *
 * Un poste appartient à un appareil : c'est ce qui permet à son compteur de
 * tickets de vivre en local et de fonctionner sans réseau. Un appareil inconnu
 * se voit proposer le premier poste libre plutôt que refusé — on n'immobilise
 * pas une caisse un samedi après-midi pour un rattachement manquant.
 */
export async function posteDeLAppareil(
  organizationId: string,
  deviceId: string | null,
): Promise<PosteAvecDepot | null> {
  // Un poste numéroté par le serveur encaisse les tables : un terminal qui le
  // prendrait ferait courir deux compteurs sur la même suite.
  const postes = (await listerPostes(organizationId)).filter((poste) => poste.numerotation === "appareil");
  if (postes.length === 0) return null;

  if (deviceId) {
    const sien = postes.find((poste) => poste.deviceId === deviceId);
    if (sien) return sien;

    const libre = postes.find((poste) => poste.deviceId === null);
    if (libre) return libre;
  }

  return postes[0];
}

export interface TicketResume {
  id: string;
  numero: string;
  encaisseeLe: Date;
  totalTtc: number;
  totalRemise: number;
  statut: "encaissee" | "annulee";
  clientNom: string | null;
  caisseCode: string;
  lignes: number;
  /** Moyens employés, dans l'ordre de saisie : « especes », « mobile_money ». */
  moyens: MoyenReglementVente[];
}

/**
 * Derniers tickets, du plus récent au plus ancien.
 *
 * Une seule requête, jointures comprises : un écran de caisse qui interroge la
 * base une fois par ligne est un écran qui se fige au moment où la file
 * s'allonge.
 */
export async function derniersTickets(
  organizationId: string,
  limite = 40,
): Promise<TicketResume[]> {
  const lignes = await db.execute<{
    id: string;
    numero: string;
    encaissee_le: Date;
    total_ttc: string;
    total_remise: string;
    statut: "encaissee" | "annulee";
    client_nom: string | null;
    caisse_code: string;
    lignes: string;
    moyens: MoyenReglementVente[] | null;
  }>(sql`
    select
      v.id,
      v.numero,
      v.encaissee_le,
      v.total_ttc,
      v.total_remise,
      v.statut,
      t.nom as client_nom,
      c.code as caisse_code,
      (select count(*) from lignes_vente l where l.vente_id = v.id) as lignes,
      (
        select array_agg(r.moyen order by r.ordre)
        from reglements_vente r
        where r.vente_id = v.id
      ) as moyens
    from ventes v
      join postes_caisse c on c.id = v.caisse_id
      left join tiers t on t.id = v.client_id
    where v.organization_id = ${organizationId}
      and v.deleted_at is null
    order by v.encaissee_le desc
    limit ${limite}
  `);

  return lignes.map((ligne) => ({
    id: ligne.id,
    numero: ligne.numero,
    encaisseeLe: new Date(ligne.encaissee_le),
    totalTtc: Number(ligne.total_ttc),
    totalRemise: Number(ligne.total_remise),
    statut: ligne.statut,
    clientNom: ligne.client_nom,
    caisseCode: ligne.caisse_code,
    lignes: Number(ligne.lignes),
    moyens: ligne.moyens ?? [],
  }));
}

export interface JourneeCaisse {
  tickets: number;
  chiffreAffaires: number;
  /** Ce que le ticket moyen rapporte. Zéro quand rien n'a été vendu. */
  panierMoyen: number;
  remises: number;
  /** Encaissé par moyen de règlement, pour le comptage du soir. */
  parMoyen: { moyen: MoyenReglementVente; montant: number }[];
  /** Marge brute : prix de vente hors taxes moins coût de revient figé. */
  margeBrute: number;
}

/**
 * Chiffres de la journée, pour la clôture.
 *
 * Le détail par moyen de règlement est ce qui rend le comptage possible : le
 * caissier compare le tiroir aux espèces attendues, et le relevé mobile money
 * au reste. Un total unique ne se vérifie contre rien.
 */
export async function journeeCaisse(
  organizationId: string,
  depuis: Date,
): Promise<JourneeCaisse> {
  // Le pilote ne sait pas sérialiser un `Date` passé en paramètre d'une requête
  // écrite à la main : il attend une chaîne. Le convertir ici plutôt que de le
  // découvrir à l'exécution, sur l'écran de clôture, un soir de fermeture.
  const seuil = depuis.toISOString();
  // Les totaux du ticket et ceux des lignes se calculent SÉPARÉMENT. Joindre
  // les lignes aux ventes multiplierait le chiffre d'affaires par le nombre de
  // lignes de chaque ticket — un panier de six articles compterait six fois.
  const [totaux] = await db.execute<{
    tickets: string;
    chiffre: string;
    remises: string;
    marge: string;
  }>(sql`
    select
      (
        select count(*) from ventes v
        where v.organization_id = ${organizationId}
          and v.statut = 'encaissee' and v.deleted_at is null
          and v.encaissee_le >= ${seuil}
      ) as tickets,
      (
        select coalesce(sum(v.total_ttc), 0) from ventes v
        where v.organization_id = ${organizationId}
          and v.statut = 'encaissee' and v.deleted_at is null
          and v.encaissee_le >= ${seuil}
      ) as chiffre,
      (
        select coalesce(sum(v.total_remise), 0) from ventes v
        where v.organization_id = ${organizationId}
          and v.statut = 'encaissee' and v.deleted_at is null
          and v.encaissee_le >= ${seuil}
      ) as remises,
      (
        -- Marge brute : produit hors taxes moins coût de revient figé sur la
        -- ligne. La quantité est en millièmes, d'où la division — en numeric,
        -- jamais en flottant.
        select coalesce(
          sum(l.montant_ht) - sum(round(l.cout_unitaire * l.quantite / 1000::numeric)),
          0
        )
        from lignes_vente l join ventes v on v.id = l.vente_id
        where v.organization_id = ${organizationId}
          and v.statut = 'encaissee' and v.deleted_at is null
          and v.encaissee_le >= ${seuil}
      ) as marge
  `);

  const parMoyen = await db.execute<{ moyen: MoyenReglementVente; montant: string }>(sql`
    select r.moyen, coalesce(sum(r.montant), 0) as montant
    from reglements_vente r
      join ventes v on v.id = r.vente_id
    where v.organization_id = ${organizationId}
      and v.statut = 'encaissee'
      and v.deleted_at is null
      and v.encaissee_le >= ${seuil}
    group by r.moyen
    order by 2 desc
  `);

  const tickets = Number(totaux?.tickets ?? 0);
  const chiffreAffaires = Number(totaux?.chiffre ?? 0);

  return {
    tickets,
    chiffreAffaires,
    panierMoyen: tickets === 0 ? 0 : Math.round(chiffreAffaires / tickets),
    remises: Number(totaux?.remises ?? 0),
    margeBrute: Number(totaux?.marge ?? 0),
    parMoyen: parMoyen.map((ligne) => ({
      moyen: ligne.moyen,
      montant: Number(ligne.montant),
    })),
  };
}

export interface LigneTicket {
  designation: string;
  quantite: number;
  unite: string;
  prixUnitaire: number;
  remise: number;
  montantHt: number;
  montantTva: number;
  parentLineId: string | null;
  lineKind: "article" | "prestation" | "frais";
}

/**
 * Dernier rang atteint sur un poste, tel que le serveur le connaît.
 *
 * C'est ce qui permet à un appareil réinstallé de recaler son compteur au lieu
 * de repartir à un, ce qui produirait des doublons refusés en base — après que
 * le client soit reparti avec son ticket.
 */
export async function dernierRang(
  organizationId: string,
  caisseId: string,
): Promise<number> {
  const [ligne] = await db
    .select({ rang: ventes.numeroSeq })
    .from(ventes)
    .where(
      and(eq(ventes.organizationId, organizationId), eq(ventes.caisseId, caisseId)),
    )
    .orderBy(desc(ventes.numeroSeq))
    .limit(1);

  return ligne?.rang ?? 0;
}
