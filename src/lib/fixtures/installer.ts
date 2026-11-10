import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { entityCodes } from "@/db/schema";
import { newId } from "@/lib/ids";
import { rateOf } from "@/lib/money";
import { versQuantite } from "@/lib/quantite";
import { creerArticleDans, creerFamilleDans } from "@/modules/catalogue/creation";
import { articles } from "@/modules/catalogue/schema";
import { actifs } from "@/modules/actifs/schema";
import { aUnActif } from "@/modules/actifs/requetes";
import { aUnDocument } from "@/modules/documents/requetes";
import { aUneMission } from "@/modules/missions/requetes";
import { employees, workers } from "@/modules/personnes/schema";
import { aUnIntervenant, aUnSalarie } from "@/modules/personnes/requetes";
import { aUnDepot, listerDepots } from "@/modules/stock/requetes";
import { depots } from "@/modules/stock/schema";
import { creerTiersDans } from "@/modules/tiers/creation";
import { tiers } from "@/modules/tiers/schema";

import { CATALOGUE, CATEGORIES, SEUIL_STOCK_BAS } from "./catalogue";
import { ALERTES, CLIENTS, FOURNISSEURS } from "./gestion";
import { creerPosteCaisseDans } from "@/modules/ventes/creation";
import { postesCaisse } from "@/modules/ventes/schema";

import { amorcerParc } from "./actifs";
import { amorcerDocuments } from "./documents";
import { amorcerMissions, type RepereMissions } from "./missions";
import { amorcerProjets } from "./projets";
import { aUnProjet } from "@/modules/projets/requetes";
import { amorcerPersonnel } from "./rh";
import { amorcerStock, type ArticleAAmorcer } from "./stock";

/**
 * Installe le jeu de démonstration dans une entreprise réelle.
 *
 * Les fixtures ont longtemps servi d'affichage : les écrans lisaient
 * directement le tableau en mémoire. Elles changent de rôle ici — elles
 * deviennent une SOURCE D'AMORÇAGE. Les écrans lisent la base, et ce module y
 * verse de quoi faire une démonstration.
 *
 * La différence n'est pas cosmétique. Une donnée qui traverse la base traverse
 * aussi les contraintes, la numérotation, les comptes auxiliaires et le journal
 * d'audit. Un jeu de démonstration qui s'installe sans erreur prouve que le
 * modèle tient ; un tableau affiché directement ne prouve rien.
 */

/**
 * Prestations facturées en plus d'un article. Absentes du catalogue de
 * démonstration, elles figurent pourtant sur les factures — « Livraison
 * Bouaké », « Prestation de mise en place ». Il leur fallait un article de
 * type service, avec son compte 706 : c'est ce qui permet à une ligne de
 * montage de se rattacher à la pièce vendue sans se ventiler comme elle.
 */
const SERVICES = [
  { reference: "SRV-LIV", designation: "Livraison", prix: 15_000 },
  { reference: "SRV-MEP", designation: "Mise en place", prix: 25_000 },
  { reference: "SRV-MON", designation: "Montage et installation", prix: 10_000 },
];

/**
 * Marge brute retenue quand le prix d'achat est inconnu.
 *
 * Seuls les articles sous alerte portent un prix d'achat réel dans les
 * fixtures. Les laisser à zéro donnerait un stock valorisé à zéro sur les
 * quatre cinquièmes du catalogue — l'écran de stock afficherait une entreprise
 * qui détient trois cents références sans valeur, ce qui n'apprend rien. Trente
 * pour cent est un chiffre de démonstration, pas une observation de marché.
 *
 * En POINTS DE BASE, et appliqué par `rateOf` : `prix * 0.7` est un produit
 * flottant, et 85 × 0,7 y vaut 59,499… donc 59 après arrondi au lieu de 60.
 * Un franc perdu par article ne se voit pas ; multiplié par un inventaire, si.
 */
const COUT_DEMONSTRATION_BP = 7000;

export interface ResultatInstallation {
  deja: boolean;
  tiers: number;
  familles: number;
  articles: number;
  codes: number;
  depots: number;
  mouvements: number;
  postes: number;
  salaries: number;
  intervenants: number;
  pointages: number;
  actifs: number;
  interventions: number;
  echeances: number;
  documents: number;
  signatures: number;
  missions: number;
  formulaires: number;
  projets: number;
  depenses: number;
}

/** Code de famille sur trois lettres, désambiguïsé si deux catégories collent. */
function codeFamille(nom: string, pris: Set<string>): string {
  const base =
    nom
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3) || "FAM";

  let code = base;
  let suffixe = 1;
  while (pris.has(code)) code = `${base.slice(0, 2)}${suffixe++}`;
  pris.add(code);
  return code;
}

export async function installerJeuDemonstration(
  organizationId: string,
  userId?: string,
): Promise<ResultatInstallation> {
  // Idempotent : relancer pendant une démonstration ne doit rien dupliquer.
  if (!(await catalogueVide(organizationId))) {
    // Le catalogue est déjà là, mais il a pu être installé AVANT que le module
    // Stock existe : ces entreprises-là n'ont ni dépôt ni mouvement, et aucun
    // écran ne leur proposerait plus rien. On complète ce qui manque plutôt que
    // de renvoyer « déjà installé » devant un stock vide.
    const stock = await completerStock(organizationId, userId);
    const personnel = await completerPersonnel(organizationId, userId);
    const parc = await completerParc(organizationId, userId);
    const pieces = await completerDocuments(organizationId, userId);
    const terrain = await completerMissions(organizationId, userId);
    const chantiers = await completerProjets(organizationId, userId);

    return {
      deja: true,
      tiers: 0,
      familles: 0,
      articles: 0,
      codes: 0,
      ...stock,
      ...personnel,
      ...parc,
      ...pieces,
      ...terrain,
      ...chantiers,
    };
  }

  return db.transaction(async (tx) => {
    // ------------------------------------------------------------ familles
    const pris = new Set<string>();
    const familles = new Map<string, string>();

    for (const [index, categorie] of CATEGORIES.entries()) {
      const id = await creerFamilleDans(tx, organizationId, {
        code: codeFamille(categorie, pris),
        nom: categorie,
        ordre: index,
      });
      familles.set(categorie, id);
    }

    const familleServices = await creerFamilleDans(tx, organizationId, {
      code: "SRV",
      nom: "Prestations",
      // Un service se ventile en 706, pas en 701. Confondre les deux rend la
      // ventilation du chiffre d'affaires par nature inexploitable.
      compteVente: "706",
      compteAchat: "604",
      ordre: CATEGORIES.length,
    });

    // ----------------------------------------------------------- les tiers
    const fournisseurs = new Map<string, string>();

    for (const fournisseur of FOURNISSEURS) {
      const { id } = await creerTiersDans(
        tx,
        organizationId,
        {
          nom: fournisseur.nom,
          code: fournisseur.code,
          estClient: false,
          estFournisseur: true,
          telephone: fournisseur.telephone,
          identifiantFiscal: fournisseur.ncc ?? null,
          secteur: fournisseur.categorie,
          delaiLivraisonJours: fournisseur.delaiJours,
        },
        userId,
      );
      fournisseurs.set(fournisseur.nom, id);
    }

    for (const client of CLIENTS) {
      await creerTiersDans(
        tx,
        organizationId,
        {
          nom: client.nom,
          nature: client.type === "Particulier" ? "particulier" : "entreprise",
          estClient: true,
          estFournisseur: false,
          telephone: client.telephone,
          email: client.email ?? null,
          ville: client.ville,
          identifiantFiscal: client.ncc ?? null,
          // L'encours autorisé n'est pas l'encours constaté : on ouvre du
          // crédit à ceux qui en ont déjà, sans inventer de politique.
          plafondEncours: client.encours > 0 ? client.encours * 2 : 0,
          delaiReglementJours: client.encours > 0 ? 30 : 0,
        },
        userId,
      );
    }

    // -------------------------------------------------------- les articles
    // Le fournisseur habituel et le prix d'achat ne vivaient que dans les
    // alertes de réapprovisionnement : ils reviennent sur l'article, où ils
    // auraient toujours dû être.
    const approvisionnement = new Map(
      ALERTES.map((alerte) => [
        alerte.article,
        {
          fournisseur: alerte.fournisseur,
          prixAchat: alerte.prixAchat,
          ventes30j: alerte.ventes30j,
        },
      ]),
    );

    let codes = 0;
    const aAmorcer: ArticleAAmorcer[] = [];

    for (const article of CATALOGUE) {
      const appro = approvisionnement.get(article.designation);
      const prixAchat =
        appro?.prixAchat ?? rateOf(article.prix, COUT_DEMONSTRATION_BP);

      const { id } = await creerArticleDans(
        tx,
        organizationId,
        {
          reference: article.sku,
          designation: article.designation,
          unite: article.unite,
          conditionnement: article.conditionnement,
          prixVente: article.prix,
          prixAchat,
          familleId: familles.get(article.categorie) ?? null,
          seuilAlerte: SEUIL_STOCK_BAS,
          fournisseurId: appro ? (fournisseurs.get(appro.fournisseur) ?? null) : null,
        },
        userId,
      );

      // Le stock ne se pose pas sur l'article : il naîtra de mouvements
      // datés, versés une fois tout le catalogue créé.
      aAmorcer.push({
        id,
        designation: article.designation,
        unite: article.unite,
        stockCible: article.stock,
        prixAchat,
        ventes30j: appro ? versQuantite(appro.ventes30j) : 0,
      });

      // Le code-barres du fabricant devient un code scannable, et non une
      // colonne de l'article : la référence interne et l'EAN doivent tous deux
      // répondre au scan, et un article peut en porter plusieurs.
      if (article.codeBarre) {
        await tx.insert(entityCodes).values({
          id: newId(),
          organizationId,
          entityType: "article",
          entityId: id,
          kind: "ean13",
          value: article.codeBarre,
          isPrimary: true,
        });
        codes++;
      }
    }

    for (const service of SERVICES) {
      await creerArticleDans(
        tx,
        organizationId,
        {
          reference: service.reference,
          designation: service.designation,
          type: "service",
          prixVente: service.prix,
          familleId: familleServices,
        },
        userId,
      );
    }

    // Dépôts et mouvements en dernier : ils ont besoin des articles créés, et
    // le stock n'est rien d'autre que la somme de ces mouvements.
    const stock = await amorcerStock(tx, organizationId, aAmorcer, userId);

    // Le personnel ne dépend ni du catalogue ni du stock : il vient en dernier
    // parce qu'il coûte le moins, et qu'un échec ici ne doit pas se payer d'un
    // catalogue de trois cents articles reconstruit.
    const personnel = await amorcerPersonnel(tx, organizationId, userId);

    // Le parc vient après le personnel : un fourgon se confie à un chauffeur
    // salarié, une bétonnière à un maçon, et les deux doivent exister.
    const parc = await amorcerParc(tx, organizationId, personnel.reperes, userId);

    // Les documents viennent en dernier : ils se rattachent aux salariés, aux
    // intervenants et aux actifs, qui doivent tous exister.
    const pieces = await amorcerDocuments(
      tx,
      organizationId,
      reperesDocuments(personnel.reperes, parc.parCode),
      userId,
    );

    // Les missions viennent après tout le reste : elles se confient à des
    // salariés et des intervenants, et se facturent à des clients.
    const terrain = await amorcerMissions(
      tx,
      organizationId,
      await reperesMissions(tx, organizationId),
      userId,
    );

    const chantiers = userId ? await amorcerProjets(tx, organizationId, userId) : { projets: 0, depenses: 0 };

    return {
      deja: false,
      tiers: FOURNISSEURS.length + CLIENTS.length,
      familles: CATEGORIES.length + 1,
      articles: CATALOGUE.length + SERVICES.length,
      codes,
      depots: stock.depots,
      mouvements: stock.mouvements,
      postes: stock.postes,
      salaries: personnel.salaries,
      intervenants: personnel.intervenants,
      pointages: personnel.pointages,
      actifs: parc.actifs,
      interventions: parc.interventions,
      echeances: parc.echeances,
      documents: pieces.documents,
      signatures: pieces.signatures,
      missions: terrain.missions,
      formulaires: terrain.formulaires,
      projets: chantiers.projets,
      depenses: chantiers.depenses,
    };
  });
}

/**
 * Ouvre un poste de caisse sur chaque magasin qui n'en a pas.
 *
 * Sert aux entreprises amorcées avant l'arrivée du module Ventes : elles ont
 * leurs dépôts et leur stock, mais la caisse n'a nulle part où numéroter ses
 * tickets. Le poste manquant est le seul obstacle entre elles et un
 * encaissement réel.
 */
async function completerPostes(
  organizationId: string,
  userId?: string,
): Promise<number> {
  const [dejaLa] = await db
    .select({ id: postesCaisse.id })
    .from(postesCaisse)
    .where(eq(postesCaisse.organizationId, organizationId))
    .limit(1);

  if (dejaLa) return 0;

  const lieux = await listerDepots(organizationId);
  // Un magasin encaisse, un entrepôt non. Sans magasin, le dépôt par défaut
  // fait l'affaire : mieux vaut une caisse ouverte qu'un écran qui refuse.
  const encaissants = lieux.filter((lieu) => lieu.type === "magasin");
  const cibles = encaissants.length > 0 ? encaissants : lieux.slice(0, 1);

  if (cibles.length === 0) return 0;

  return db.transaction(async (tx) => {
    for (const [index, lieu] of cibles.entries()) {
      await creerPosteCaisseDans(
        tx,
        organizationId,
        {
          code: `C${String(index + 1).padStart(2, "0")}`,
          nom: `Caisse ${lieu.nom}`,
          depotId: lieu.id,
        },
        userId,
      );
    }
    return cibles.length;
  });
}

/**
 * Amorce dépôts et mouvements sur un catalogue déjà en base.
 *
 * Le stock cible vient du jeu de démonstration, retrouvé par la référence de
 * l'article. Un article créé à la main n'y figure pas : il reste à zéro, ce qui
 * est exact — personne n'a jamais dit combien il en restait.
 */
async function completerStock(
  organizationId: string,
  userId?: string,
): Promise<{ depots: number; mouvements: number; postes: number }> {
  if (await aUnDepot(organizationId)) {
    // Les dépôts sont là mais le module Ventes est arrivé après : sans poste,
    // l'écran de caisse n'a nulle part où numéroter ses tickets et refuse de
    // s'ouvrir. On complète ce seul manque.
    return { depots: 0, mouvements: 0, postes: await completerPostes(organizationId, userId) };
  }

  const stocksDemo = new Map(
    CATALOGUE.map((article) => [article.sku, article.stock]),
  );
  const ventesDemo = new Map(
    ALERTES.map((alerte) => [alerte.article, alerte.ventes30j]),
  );

  const enBase = await db
    .select({
      id: articles.id,
      reference: articles.reference,
      designation: articles.designation,
      unite: articles.unite,
      prixAchat: articles.prixAchat,
      prixVente: articles.prixVente,
    })
    .from(articles)
    .where(
      and(
        eq(articles.organizationId, organizationId),
        eq(articles.suiviStock, true),
        eq(articles.actif, true),
      ),
    );

  if (enBase.length === 0) return { depots: 0, mouvements: 0, postes: 0 };

  const aAmorcer: ArticleAAmorcer[] = enBase.map((article) => ({
    id: article.id,
    designation: article.designation,
    unite: article.unite,
    stockCible: stocksDemo.get(article.reference) ?? 0,
    // Les catalogues installés avant le module Stock n'ont de prix d'achat que
    // sur les articles sous alerte. Valoriser le reste à zéro donnerait un
    // inventaire sans valeur : le stock existerait, mais l'entreprise ne
    // posséderait rien.
    prixAchat:
      article.prixAchat > 0
        ? article.prixAchat
        : rateOf(article.prixVente, COUT_DEMONSTRATION_BP),
    ventes30j: versQuantite(ventesDemo.get(article.designation) ?? 0),
  }));

  return db.transaction(async (tx) => {
    // Le prix comblé retourne sur l'article : sans cela, le catalogue afficherait
    // une marge de 100 % pendant que le stock est valorisé à 70 % du prix de
    // vente, et les deux écrans se contrediraient.
    for (const [index, article] of enBase.entries()) {
      if (article.prixAchat > 0) continue;

      await tx
        .update(articles)
        .set({
          prixAchat: aAmorcer[index].prixAchat,
          updatedAt: new Date(),
          version: sql`${articles.version} + 1`,
        })
        .where(eq(articles.id, article.id));
    }

    return amorcerStock(tx, organizationId, aAmorcer, userId);
  });
}

/**
 * Verse le personnel dans une entreprise amorcée avant le module Personnes.
 *
 * Même raison que pour les dépôts et les postes de caisse : ces entreprises-là
 * ont leur catalogue et leur stock, mais leurs écrans RH s'ouvriraient sur une
 * page vide, ce qui ferait croire que le module ne fonctionne pas.
 */
async function completerPersonnel(
  organizationId: string,
  userId?: string,
): Promise<{ salaries: number; intervenants: number; pointages: number }> {
  if ((await aUnSalarie(organizationId)) || (await aUnIntervenant(organizationId))) {
    return { salaries: 0, intervenants: 0, pointages: 0 };
  }

  const { salaries, intervenants, pointages } = await db.transaction((tx) =>
    amorcerPersonnel(tx, organizationId, userId),
  );

  return { salaries, intervenants, pointages };
}

/**
 * Verse le parc dans une entreprise amorcée avant le module Actifs.
 *
 * Les repères d'affectation se relisent en base plutôt que de venir de
 * l'amorçage : le personnel est déjà là, et le nom est la seule clé commune
 * entre le jeu de démonstration et ce qui a été enregistré.
 */
async function completerParc(
  organizationId: string,
  userId?: string,
): Promise<{ actifs: number; interventions: number; echeances: number }> {
  if (await aUnActif(organizationId)) {
    return { actifs: 0, interventions: 0, echeances: 0 };
  }

  const [salaries, intervenants] = await Promise.all([
    db
      .select({ id: employees.id, nom: employees.nom })
      .from(employees)
      .where(eq(employees.organizationId, organizationId)),
    db
      .select({ id: workers.id, nom: workers.nom })
      .from(workers)
      .where(eq(workers.organizationId, organizationId)),
  ]);

  const reperes = {
    employes: new Map(salaries.map((s) => [s.nom, s.id])),
    intervenants: new Map(intervenants.map((i) => [i.nom, i.id])),
  };

  const { actifs: poses, interventions, echeances } = await db.transaction((tx) =>
    amorcerParc(tx, organizationId, reperes, userId),
  );

  return { actifs: poses, interventions, echeances };
}

/**
 * Rassemble en une seule table de correspondance ce à quoi un document peut se
 * rattacher : salariés et intervenants par leur nom, actifs par leur code.
 */
function reperesDocuments(
  personnel: { employes: Map<string, string>; intervenants: Map<string, string> },
  parc: Map<string, string>,
): Map<string, { id: string; libelle: string }> {
  const reperes = new Map<string, { id: string; libelle: string }>();

  for (const [nom, id] of personnel.employes) reperes.set(nom, { id, libelle: nom });
  for (const [nom, id] of personnel.intervenants) reperes.set(nom, { id, libelle: nom });
  for (const [code, id] of parc) reperes.set(code, { id, libelle: code });

  return reperes;
}

/**
 * Verse les documents dans une entreprise amorcée avant le module Documents.
 *
 * Les repères se relisent en base : le personnel et le parc sont déjà là, et
 * le nom — le code pour un actif — est la seule clé commune entre le jeu de
 * démonstration et ce qui a été enregistré.
 */
async function completerDocuments(
  organizationId: string,
  userId?: string,
): Promise<{ documents: number; signatures: number }> {
  if (await aUnDocument(organizationId)) {
    return { documents: 0, signatures: 0 };
  }

  const [salaries, intervenants, parc] = await Promise.all([
    db
      .select({ id: employees.id, nom: employees.nom })
      .from(employees)
      .where(eq(employees.organizationId, organizationId)),
    db
      .select({ id: workers.id, nom: workers.nom })
      .from(workers)
      .where(eq(workers.organizationId, organizationId)),
    db
      .select({ id: actifs.id, code: actifs.code })
      .from(actifs)
      .where(eq(actifs.organizationId, organizationId)),
  ]);

  const reperes = reperesDocuments(
    {
      employes: new Map(salaries.map((s) => [s.nom, s.id])),
      intervenants: new Map(intervenants.map((i) => [i.nom, i.id])),
    },
    new Map(parc.map((a) => [a.code, a.id])),
  );

  return db.transaction((tx) =>
    amorcerDocuments(tx, organizationId, reperes, userId),
  );
}

/** Personnel et clients à relire en base, par leur nom. */
async function reperesMissions(
  lecteur: Pick<typeof db, "select">,
  organizationId: string,
): Promise<RepereMissions> {
  const [salaries, intervenants, clients] = await Promise.all([
    lecteur
      .select({ id: employees.id, nom: employees.nom })
      .from(employees)
      .where(eq(employees.organizationId, organizationId)),
    lecteur
      .select({ id: workers.id, nom: workers.nom })
      .from(workers)
      .where(eq(workers.organizationId, organizationId)),
    lecteur
      .select({ id: tiers.id, nom: tiers.nom })
      .from(tiers)
      .where(and(eq(tiers.organizationId, organizationId), eq(tiers.estClient, true))),
  ]);

  return {
    employes: new Map(salaries.map((s) => [s.nom, s.id])),
    intervenants: new Map(intervenants.map((i) => [i.nom, i.id])),
    clients: new Map(clients.map((c) => [c.nom, c.id])),
  };
}

/**
 * Verse les missions dans une entreprise amorcée avant le module Missions.
 *
 * Les repères se relisent en base : personnel et clients sont déjà là, et le
 * nom est la seule clé commune avec le jeu de démonstration.
 */
async function completerMissions(
  organizationId: string,
  userId?: string,
): Promise<{ missions: number; preuves: number; formulaires: number }> {
  if (await aUneMission(organizationId)) {
    return { missions: 0, preuves: 0, formulaires: 0 };
  }

  const reperes = await reperesMissions(db, organizationId);
  return db.transaction((tx) => amorcerMissions(tx, organizationId, reperes, userId));
}

/** Verse deux projets et leurs dépenses dans une entreprise amorcée avant le module. */
async function completerProjets(
  organizationId: string,
  userId?: string,
): Promise<{ projets: number; depenses: number }> {
  if (!userId || (await aUnProjet(organizationId))) return { projets: 0, depenses: 0 };
  return db.transaction((tx) => amorcerProjets(tx, organizationId, userId));
}

/**
 * L'entreprise n'a-t-elle ni article ni tiers ?
 *
 * Sert à ne proposer l'installation qu'à une base vide. Deux requêtes bornées
 * à une ligne, pas un `count` : on cherche l'existence, pas le nombre.
 */
export async function catalogueVide(organizationId: string): Promise<boolean> {
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.organizationId, organizationId))
    .limit(1);

  if (article) return false;

  const [partenaire] = await db
    .select({ id: tiers.id })
    .from(tiers)
    .where(eq(tiers.organizationId, organizationId))
    .limit(1);

  if (partenaire) return false;

  // Les dépôts comptent aussi : le jeu crée DEP-YOP et ses voisins, et un
  // dépôt déjà nommé ainsi ferait échouer toute l'installation sur une
  // collision de code, après avoir créé trois cents articles pour rien.
  const [depot] = await db
    .select({ id: depots.id })
    .from(depots)
    .where(eq(depots.organizationId, organizationId))
    .limit(1);

  return !depot;
}
