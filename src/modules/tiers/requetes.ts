import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { contactsParTiers, type ContactVue } from "./contacts";
import { ecritures, lignesEcriture } from "@/modules/comptabilite/schema";
import { tiers, type Tiers } from "./schema";

export type RoleTiers = "client" | "fournisseur" | "tous";

/**
 * Liste les tiers d'une entreprise.
 *
 * `organizationId` est un paramètre obligatoire et non un réglage déduit
 * ailleurs : c'est la frontière d'isolation entre clients, et une signature qui
 * l'exige rend impossible la requête qui l'oublie.
 */
export async function listerTiers(
  organizationId: string,
  role: RoleTiers = "tous",
  inclureInactifs = false,
): Promise<Tiers[]> {
  const filtres = [
    eq(tiers.organizationId, organizationId),
    isNull(tiers.deletedAt),
  ];

  if (role === "client") filtres.push(eq(tiers.estClient, true));
  if (role === "fournisseur") filtres.push(eq(tiers.estFournisseur, true));
  if (!inclureInactifs) filtres.push(eq(tiers.actif, true));

  return db
    .select()
    .from(tiers)
    .where(and(...filtres))
    .orderBy(asc(tiers.nom));
}

export interface SoldeAuxiliaire {
  /** Total débité au client : ce qui lui a été facturé, taxes comprises. */
  factureClient: number;
  /** Créance ouverte : lignes 41 non lettrées. C'est ce qu'il doit encore. */
  encoursClient: number;
  /** Total crédité au fournisseur : ce qu'il a facturé. */
  achatsFournisseur: number;
  /** Dette ouverte : lignes 40 non lettrées. */
  duFournisseur: number;
}

const SOLDE_NUL: SoldeAuxiliaire = {
  factureClient: 0,
  encoursClient: 0,
  achatsFournisseur: 0,
  duFournisseur: 0,
};

/**
 * Soldes de tous les tiers, par compte auxiliaire.
 *
 * Ces chiffres ne sont PAS stockés sur la fiche du tiers. Un encours conservé
 * à côté des écritures qui le composent finit toujours par diverger : il suffit
 * d'un règlement passé sans mise à jour, d'un avoir saisi en comptabilité, d'une
 * synchronisation hors connexion arrivée dans le désordre. Ici, le chiffre est
 * la conséquence des lignes, donc il est vrai par construction.
 *
 * Une seule requête pour tous les tiers, pas une par fiche : un fichier de
 * quatre cents clients ferait quatre cents allers-retours.
 *
 * Le lettrage porte la distinction entre facturé et dû. Une ligne lettrée est
 * rapprochée de son règlement, donc soldée ; une ligne sans lettrage reste
 * ouverte.
 */
export async function soldesParAuxiliaire(
  organizationId: string,
): Promise<Map<string, SoldeAuxiliaire>> {
  const lignes = await db.execute<{
    auxiliaire: string;
    facture_client: string;
    encours_client: string;
    achats_fournisseur: string;
    du_fournisseur: string;
  }>(sql`
    select
      auxiliaire,
      coalesce(sum(debit) filter (where compte like '41%'), 0)
        as facture_client,
      coalesce(sum(debit - credit) filter (where compte like '41%' and lettrage is null), 0)
        as encours_client,
      coalesce(sum(credit) filter (where compte like '40%'), 0)
        as achats_fournisseur,
      coalesce(sum(credit - debit) filter (where compte like '40%' and lettrage is null), 0)
        as du_fournisseur
    from lignes_ecriture
    where organization_id = ${organizationId}
      and auxiliaire is not null
    group by auxiliaire
  `);

  const soldes = new Map<string, SoldeAuxiliaire>();

  for (const ligne of lignes) {
    // `sum` sur un bigint revient en numeric, que le pilote rend en chaîne
    // pour ne pas perdre de précision. Les montants restent des entiers de
    // francs, très en deçà de 2^53 : la conversion est sûre.
    soldes.set(ligne.auxiliaire, {
      factureClient: Number(ligne.facture_client),
      encoursClient: Number(ligne.encours_client),
      achatsFournisseur: Number(ligne.achats_fournisseur),
      duFournisseur: Number(ligne.du_fournisseur),
    });
  }

  return soldes;
}

/** Solde d'un tiers, quel que soit celui de ses deux comptes qui le porte. */
export function soldeDe(
  tiersLigne: Pick<Tiers, "compteClient" | "compteFournisseur">,
  soldes: Map<string, SoldeAuxiliaire>,
): SoldeAuxiliaire {
  const client = tiersLigne.compteClient
    ? soldes.get(tiersLigne.compteClient)
    : undefined;
  const fournisseur = tiersLigne.compteFournisseur
    ? soldes.get(tiersLigne.compteFournisseur)
    : undefined;

  if (!client && !fournisseur) return SOLDE_NUL;

  return {
    factureClient: client?.factureClient ?? 0,
    encoursClient: client?.encoursClient ?? 0,
    achatsFournisseur: fournisseur?.achatsFournisseur ?? 0,
    duFournisseur: fournisseur?.duFournisseur ?? 0,
  };
}

export interface MouvementTiers {
  numero: string;
  date: string;
  libelle: string;
  debit: number;
  credit: number;
  /** Lettrée : rapprochée de son règlement, donc soldée. */
  lettree: boolean;
}

/**
 * Derniers mouvements comptables par compte auxiliaire.
 *
 * Une seule requête bornée, découpée ensuite par tiers. La borne est sur le
 * total et non par tiers : PostgreSQL sait faire un `limit` par groupe avec une
 * fonction de fenêtrage, mais l'écran n'affiche que quelques lignes par fiche —
 * les deux cents dernières écritures de l'entreprise les couvrent largement, et
 * la requête reste lisible.
 */
export async function mouvementsParAuxiliaire(
  organizationId: string,
  parTiers = 5,
): Promise<Map<string, MouvementTiers[]>> {
  const lignes = await db
    .select({
      auxiliaire: lignesEcriture.auxiliaire,
      numero: ecritures.pieceNumero,
      date: ecritures.dateEcriture,
      libelle: ecritures.libelle,
      debit: lignesEcriture.debit,
      credit: lignesEcriture.credit,
      lettrage: lignesEcriture.lettrage,
    })
    .from(lignesEcriture)
    .innerJoin(ecritures, eq(lignesEcriture.ecritureId, ecritures.id))
    .where(
      and(
        eq(lignesEcriture.organizationId, organizationId),
        isNotNull(lignesEcriture.auxiliaire),
      ),
    )
    .orderBy(desc(ecritures.dateEcriture), desc(ecritures.createdAt))
    .limit(200);

  const mouvements = new Map<string, MouvementTiers[]>();

  for (const ligne of lignes) {
    const cle = ligne.auxiliaire;
    if (!cle) continue;

    const liste = mouvements.get(cle) ?? [];
    if (liste.length >= parTiers) continue;

    liste.push({
      numero: ligne.numero,
      date: ligne.date,
      libelle: ligne.libelle,
      debit: ligne.debit,
      credit: ligne.credit,
      lettree: ligne.lettrage !== null,
    });
    mouvements.set(cle, liste);
  }

  return mouvements;
}

/**
 * Fiche complète d'un tiers : son identité, ses soldes déduits des écritures,
 * ses derniers mouvements. Sérialisable telle quelle vers un composant client.
 */
export interface FicheTiers extends SoldeAuxiliaire {
  id: string;
  code: string;
  nom: string;
  /** En off : plus proposé à la saisie, historique intact. */
  actif: boolean;
  nature: "entreprise" | "particulier";
  telephone: string | null;
  email: string | null;
  ville: string | null;
  secteur: string | null;
  identifiantFiscal: string | null;
  compteClient: string | null;
  compteFournisseur: string | null;
  plafondEncours: number;
  delaiReglementJours: number;
  delaiLivraisonJours: number;
  mouvements: MouvementTiers[];
  contacts: ContactVue[];
}

/**
 * Le fichier tiers prêt à afficher.
 *
 * Trois requêtes pour tout l'écran, quel que soit le nombre de tiers. Une
 * requête par fiche transformerait un fichier de quatre cents clients en
 * quatre cents allers-retours vers Abidjan.
 */
export async function fichesTiers(
  organizationId: string,
  role: RoleTiers = "tous",
  /** Les fiches en off aussi : pour qui peut les réactiver. */
  inclureInactifs = false,
): Promise<FicheTiers[]> {
  const [lignes, soldes, mouvements, contacts] = await Promise.all([
    listerTiers(organizationId, role, inclureInactifs),
    soldesParAuxiliaire(organizationId),
    mouvementsParAuxiliaire(organizationId),
    contactsParTiers(organizationId),
  ]);

  return lignes.map((ligne) => {
    const solde = soldeDe(ligne, soldes);
    const comptes = [ligne.compteClient, ligne.compteFournisseur].filter(
      (compte): compte is string => compte !== null,
    );

    return {
      id: ligne.id,
      code: ligne.code,
      nom: ligne.nom,
      actif: ligne.actif,
      nature: ligne.nature,
      telephone: ligne.telephone,
      email: ligne.email,
      ville: ligne.ville,
      secteur: ligne.secteur,
      identifiantFiscal: ligne.identifiantFiscal,
      compteClient: ligne.compteClient,
      compteFournisseur: ligne.compteFournisseur,
      plafondEncours: ligne.plafondEncours,
      delaiReglementJours: ligne.delaiReglementJours,
      delaiLivraisonJours: ligne.delaiLivraisonJours,
      ...solde,
      mouvements: comptes.flatMap((compte) => mouvements.get(compte) ?? []),
      contacts: contacts.get(ligne.id) ?? [],
    };
  });
}
