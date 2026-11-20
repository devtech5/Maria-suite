import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

import { releveAvecSolde, type LigneReleveInterne, type NatureMouvement } from "./mouvements";

const jour = (v: string | Date) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export interface LigneReleveVue extends LigneReleveInterne {
  solde: number;
  /** Mouvement libre à l'origine de la ligne : on peut l'annuler ou imprimer son ordre. */
  mouvement: { id: string; numero: string; nature: NatureMouvement; statut: "valide" | "annule" } | null;
}

export interface ReleveCompte {
  ouverture: number;
  lignes: LigneReleveVue[];
  entrees: number;
  sorties: number;
  cloture: number;
}

/**
 * Relevé d'un compte de trésorerie sur une période : toutes les écritures qui
 * le touchent, quel que soit le module qui les a passées — encaissement de
 * facture, bon de caisse, virement, paie, mouvement libre. C'est ce qu'on
 * pose à côté du relevé de la banque.
 */
export async function releveCompte(organizationId: string, compteId: string, du: string, au: string): Promise<ReleveCompte | null> {
  const [compte] = await db.execute<{ numero: string }>(sql`
    select compte as numero from comptes_tresorerie where id = ${compteId} and organization_id = ${organizationId} and deleted_at is null
  `);
  if (!compte) return null;

  const [[ouverture], lignes] = await Promise.all([
    db.execute<{ solde: string }>(sql`
      select coalesce(sum(l.debit) - sum(l.credit), 0) as solde
      from lignes_ecriture l join ecritures e on e.id = l.ecriture_id
      where l.organization_id = ${organizationId} and l.compte = ${compte.numero} and e.date_ecriture < ${du}::date
    `),
    db.execute<{
      date: string | Date;
      piece: string;
      libelle: string;
      origine: string;
      debit: string;
      credit: string;
      mvt_id: string | null;
      mvt_numero: string | null;
      mvt_nature: NatureMouvement | null;
      mvt_statut: "valide" | "annule" | null;
    }>(sql`
      select e.date_ecriture as date, e.piece_numero as piece, e.libelle, e.origine, l.debit, l.credit,
             mv.id as mvt_id, mv.numero as mvt_numero, mv.nature as mvt_nature, mv.statut as mvt_statut
      from lignes_ecriture l
      join ecritures e on e.id = l.ecriture_id
      left join mouvements_tresorerie mv
        on e.origine = 'mouvement' and mv.id = e.piece_id and mv.numero = e.piece_numero
      where l.organization_id = ${organizationId} and l.compte = ${compte.numero}
        and e.date_ecriture between ${du}::date and ${au}::date
      order by e.date_ecriture, e.created_at, e.numero
    `),
  ]);

  const avecSolde = releveAvecSolde(
    Number(ouverture.solde),
    lignes.map((l) => ({
      date: jour(l.date),
      piece: l.piece,
      libelle: l.libelle,
      origine: l.origine,
      entree: Number(l.debit),
      sortie: Number(l.credit),
    })),
  );
  const resultat = avecSolde.map((l, i) => {
    const m = lignes[i];
    return {
      ...l,
      mouvement: m.mvt_id ? { id: m.mvt_id, numero: m.mvt_numero!, nature: m.mvt_nature!, statut: m.mvt_statut! } : null,
    };
  });
  const entrees = resultat.reduce((s, l) => s + l.entree, 0);
  const sorties = resultat.reduce((s, l) => s + l.sortie, 0);
  return { ouverture: Number(ouverture.solde), lignes: resultat, entrees, sorties, cloture: Number(ouverture.solde) + entrees - sorties };
}

export interface OrdreVirement {
  numero: string;
  date: string;
  montant: number;
  libelle: string;
  reference: string | null;
  ribBeneficiaire: string | null;
  statut: "valide" | "annule";
  beneficiaire: { nom: string; adresse: string | null; ville: string | null; telephone: string | null } | null;
  compte: { nom: string; etablissement: string | null; reference: string | null; nature: string };
}

/** Ce qu'il faut pour imprimer l'ordre de virement d'un mouvement de sortie. */
export async function ordreVirement(organizationId: string, mouvementId: string): Promise<OrdreVirement | null> {
  const [m] = await db.execute<{
    numero: string;
    date_operation: string | Date;
    montant: string;
    libelle: string;
    reference: string | null;
    rib_beneficiaire: string | null;
    statut: "valide" | "annule";
    tiers_nom: string | null;
    adresse: string | null;
    ville: string | null;
    telephone: string | null;
    compte_nom: string;
    etablissement: string | null;
    compte_reference: string | null;
    nature_compte: string;
  }>(sql`
    select mv.numero, mv.date_operation, mv.montant, mv.libelle, mv.reference, mv.rib_beneficiaire, mv.statut, mv.tiers_nom,
           t.adresse, t.ville, t.telephone,
           c.nom as compte_nom, c.etablissement, c.reference as compte_reference, c.nature as nature_compte
    from mouvements_tresorerie mv
    join comptes_tresorerie c on c.id = mv.compte_id
    left join tiers t on t.id = mv.tiers_id
    where mv.id = ${mouvementId} and mv.organization_id = ${organizationId} and mv.deleted_at is null
  `);
  if (!m) return null;
  return {
    numero: m.numero,
    date: jour(m.date_operation),
    montant: Number(m.montant),
    libelle: m.libelle,
    reference: m.reference,
    ribBeneficiaire: m.rib_beneficiaire,
    statut: m.statut,
    beneficiaire: m.tiers_nom ? { nom: m.tiers_nom, adresse: m.adresse, ville: m.ville, telephone: m.telephone } : null,
    compte: { nom: m.compte_nom, etablissement: m.etablissement, reference: m.compte_reference, nature: m.nature_compte },
  };
}
