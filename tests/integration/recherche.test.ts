import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { lireFiltresListe, motsRecherche } from "@/lib/recherche";
import { creerCommandeDans, enregistrerFacturePour } from "@/modules/achats/creation";
import { listerCommandes, listerFactures } from "@/modules/achats/requetes";
import { creerActifPour, enregistrerInterventionPour } from "@/modules/actifs/creation";
import { listerInterventions } from "@/modules/actifs/requetes";
import { journalEcritures } from "@/modules/comptabilite/requetes";
import { creerFourniturePour, derniersMouvements, enregistrerMouvementPour } from "@/modules/moyens-generaux/creation";
import { creerReunionDans } from "@/modules/meeting/creation";
import { listerReunions } from "@/modules/meeting/requetes";
import { reunions } from "@/modules/meeting/schema";
import { creerSalariePour } from "@/modules/personnes/creation";
import { demanderCongePour } from "@/modules/presences/creation";
import { listerConges } from "@/modules/presences/requetes";
import { rechercherPartout } from "@/modules/recherche/globale";
import { creerTiersPour } from "@/modules/tiers/creation";
import { creerCompteDans, demanderBonDans, envoyerVirementDans } from "@/modules/tresorerie/creation";
import { enregistrerMouvementDans } from "@/modules/tresorerie/creation-mouvements";
import { listerBons, listerVirements } from "@/modules/tresorerie/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let fermer: () => Promise<void>;
let db: typeof Db;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

const tout = () => true;
const chercher = (o: string, q: string, visible: (r: string) => boolean = tout) => rechercherPartout(o, q, motsRecherche(q), visible);

describe("recherche globale en base", () => {
  it("trouve sans accents ni majuscules, tous les mots requis", async () => {
    await creerTiersPour(org, { nom: "Société Ivoirienne de Béton", estClient: true, ville: "Abidjan" }, user);
    await creerSalariePour(org, { nom: "Fatou Bamba", poste: "Comptable", debut: "2025-01-02", salaireBase: 0 }, user);

    const groupes = await chercher(org, "SOCIETE beton");
    expect(groupes.map((g) => g.cle)).toEqual(["clients"]);
    expect(groupes[0].trouvailles[0]).toMatchObject({ titre: "Société Ivoirienne de Béton", detail: expect.stringContaining("Abidjan") });

    const salaries = await chercher(org, "bamba comptable");
    expect(salaries.find((g) => g.cle === "salaries")?.trouvailles[0].titre).toBe("Fatou Bamba");
    expect(await chercher(org, "bamba plombier")).toEqual([]);
  });

  it("un % tapé ne joue pas le joker", async () => {
    expect(await chercher(org, "%")).toEqual([]);
  });

  it("n'interroge pas une source dont l'écran est fermé à la session", async () => {
    const sansClients = await chercher(org, "beton", (r) => r !== "/commercial");
    expect(sansClients).toEqual([]);
  });

  it("ne voit rien d'une autre entreprise", async () => {
    const autre = await semerEntreprise(db, "Voisine");
    expect(await chercher(autre.organizationId, "beton")).toEqual([]);
  });

  it("annonce qu'il y en a d'autres au-delà de cinq", async () => {
    for (let i = 1; i <= 6; i++) await creerTiersPour(org, { nom: `Quincaillerie ${i}`, estClient: true }, user);
    const [clients] = await chercher(org, "quincaillerie");
    expect(clients.trouvailles).toHaveLength(5);
    expect(clients.plus).toBe(true);
    expect(clients.hrefTout).toBe("/commercial?q=quincaillerie");
  });

  it("une liste se filtre en base : mots, accents et période bornes incluses", async () => {
    const { id: papier } = await creerFourniturePour(org, user, { designation: "Ramette papier A4", unite: "ramette" });
    const { id: encre } = await creerFourniturePour(org, user, { designation: "Cartouche d'encre", unite: "cartouche" });
    await enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "entree", quantite: 10, date: "2026-09-30" });
    await enregistrerMouvementPour(org, user, { fournitureId: papier, sens: "sortie", quantite: 2, date: "2026-10-01", service: "Comptabilité" });
    await enregistrerMouvementPour(org, user, { fournitureId: encre, sens: "entree", quantite: 3, date: "2026-10-31" });
    await enregistrerMouvementPour(org, user, { fournitureId: encre, sens: "entree", quantite: 1, date: "2026-11-01" });

    const octobre = await derniersMouvements(org, 50, lireFiltresListe({ du: "2026-10-01", au: "2026-10-31" }));
    expect(octobre.map((m) => m.date).sort()).toEqual(["2026-10-01", "2026-10-31"]);

    const compta = await derniersMouvements(org, 50, lireFiltresListe({ q: "COMPTABILITE ramette" }));
    expect(compta.map((m) => [m.fourniture, m.quantite])).toEqual([["Ramette papier A4", 2]]);
  });

  it("les interventions se filtrent en base : actif, prestataire et date d'intervention", async () => {
    const { id: groupe } = await creerActifPour(org, { designation: "Groupe électrogène", type: "engin" }, user);
    const { id: clim } = await creerActifPour(org, { designation: "Climatiseur salle de réunion", type: "mobilier" }, user);
    const le = (jour: string) => new Date(`${jour}T23:30:00Z`);
    await enregistrerInterventionPour(org, { actifId: groupe, libelle: "Vidange", cout: 45000, prestataire: "Énergie Services", effectueeLe: le("2026-09-30") }, user);
    await enregistrerInterventionPour(org, { actifId: groupe, libelle: "Filtre à air", cout: 12000, effectueeLe: le("2026-10-31") }, user);
    await enregistrerInterventionPour(org, { actifId: clim, libelle: "Recharge de gaz", cout: 30000, effectueeLe: le("2026-11-01") }, user);

    const octobre = await listerInterventions(org, 50, lireFiltresListe({ du: "2026-10-01", au: "2026-10-31" }));
    expect(octobre.map((i) => i.libelle)).toEqual(["Filtre à air"]);

    const prestataire = await listerInterventions(org, 50, lireFiltresListe({ q: "electrogene ENERGIE" }));
    expect(prestataire.map((i) => i.libelle)).toEqual(["Vidange"]);
  });
});

describe("achats : recherche en base, avant la limite", () => {
  it("commandes sur la date de commande, factures sur la date de facture ou l'échéance", async () => {
    const { id: fournisseur } = await creerTiersPour(org, { nom: "Société Ivoirienne de Ciment", estFournisseur: true }, user);
    const ciment = { designation: "Ciment CPJ 45", quantite: 20_000, prixUnitaireHt: 4_500, tauxTva: 1800, compteAchat: "601" };
    await db.transaction((tx) => creerCommandeDans(tx, org, { fournisseurId: fournisseur, dateCommande: "2026-09-30", notes: "Chantier Bingerville", lignes: [ciment] }, user));
    await db.transaction((tx) => creerCommandeDans(tx, org, { fournisseurId: fournisseur, dateCommande: "2026-10-15", lignes: [ciment] }, user));

    expect((await listerCommandes(org, lireFiltresListe({ q: "BINGERVILLE ciment" }))).map((c) => c.dateCommande)).toEqual(["2026-09-30"]);
    expect((await listerCommandes(org, lireFiltresListe({ du: "2026-10-01", au: "2026-10-15" }))).map((c) => c.dateCommande)).toEqual(["2026-10-15"]);

    await enregistrerFacturePour(org, { fournisseurId: fournisseur, referenceFournisseur: "SIC-778", dateFacture: "2026-10-02", echeance: "2026-11-30", lignes: [ciment] }, null, user);
    await enregistrerFacturePour(org, { fournisseurId: fournisseur, referenceFournisseur: "SIC-801", dateFacture: "2026-10-20", echeance: "2026-10-31", lignes: [ciment] }, null, user);

    const parDate = await listerFactures(org, { recherche: lireFiltresListe({ du: "2026-10-01", au: "2026-10-02" }) });
    expect(parDate.map((f) => f.reference)).toEqual(["SIC-778"]);
    const parEcheance = await listerFactures(org, { recherche: lireFiltresListe({ au: "2026-10-31" }), periodeSur: "echeance" });
    expect(parEcheance.map((f) => f.reference)).toEqual(["SIC-801"]);
    expect((await listerFactures(org, { recherche: lireFiltresListe({ q: "sic-778" }) })).map((f) => f.reference)).toEqual(["SIC-778"]);
  });
});

describe("trésorerie et journal : recherche en base, avant la limite", () => {
  it("virements sur la date d'envoi, bons sur la date de demande, écritures sur leur date et leurs comptes", async () => {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const { id: caisse } = await db.transaction((tx) => creerCompteDans(tx, org, { nom: "Caisse Treichville", nature: "caisse", compte: "5712", seuilAlerte: 0 }, user));
    const { id: banque } = await db.transaction((tx) => creerCompteDans(tx, org, { nom: "Banque Atlantique", nature: "banque", compte: "5212", seuilAlerte: 0 }, user));
    await db.transaction((tx) => enregistrerMouvementDans(tx, org, { compteId: caisse, nature: "apport", montant: 900_000, date: "2026-01-02" }, user));
    const virement = (date: string, motif: string) =>
      db.transaction((tx) => envoyerVirementDans(tx, org, { sourceId: caisse, destinationId: banque, montant: 100_000, frais: 0, date, motif, recuImmediat: true }, user));
    await virement("2026-03-10", "Versement de la recette de Yopougon");
    await virement("2026-03-11", "Versement de la recette d'Adjamé");

    const mars10 = await listerVirements(org, 50, lireFiltresListe({ du: "2026-03-10", au: "2026-03-10" }));
    expect(mars10.map((v) => v.motif)).toEqual(["Versement de la recette de Yopougon"]);
    expect((await listerVirements(org, 50, lireFiltresListe({ q: "ADJAME atlantique" }))).map((v) => v.dateEnvoi)).toEqual(["2026-03-11"]);

    await db.transaction((tx) => demanderBonDans(tx, org, { caisseId: caisse, nature: "transport", montant: 3_000, beneficiaire: "Taxi compteur", motif: "Dépôt à la CNPS" }, user));
    expect((await listerBons(org, user, true, lireFiltresListe({ q: "cnps taxi" }))).map((b) => b.motif)).toEqual(["Dépôt à la CNPS"]);
    expect(await listerBons(org, user, true, lireFiltresListe({ q: "cnps", au: "2026-01-01" }))).toEqual([]);
    expect(await listerBons(org, user, true, lireFiltresListe({ q: "cnps", du: aujourdhui, au: aujourdhui }))).toHaveLength(1);

    // « 5712 » ne figure que dans les lignes : la recherche descend dans l'écriture.
    const janvier = await journalEcritures(org, { limite: 50, filtres: lireFiltresListe({ q: "5712", au: "2026-01-31" }) });
    expect(janvier.map((e) => e.date)).toEqual(["2026-01-02"]);
    const versements = await journalEcritures(org, { limite: 50, filtres: lireFiltresListe({ q: "5212", du: "2026-03-11", au: "2026-03-11" }) });
    expect(versements.map((e) => e.date)).toEqual(["2026-03-11"]);
  });
});

describe("personnel : recherche en base, avant la limite", () => {
  it("congés : nature cherchée par son libellé, période par chevauchement", async () => {
    const { id } = await creerSalariePour(org, { nom: "Mariam Ouattara", poste: "Secrétaire", debut: "2026-01-05", salaireBase: 150_000 }, user);
    const conge = (nature: "maladie" | "maternite", debut: string, fin: string) =>
      demanderCongePour(org, user, { employeeId: id, nature, debut, fin, debutDemi: false, finDemi: false, motif: null }, { accorder: true });
    await conge("maladie", "2026-03-30", "2026-04-02");
    await conge("maternite", "2026-06-01", "2026-06-30");

    // « Maternité » n'est en base que la clé `maternite` : le libellé répond quand même.
    expect((await listerConges(org, { filtres: lireFiltresListe({ q: "MATERNITÉ ouattara" }) })).map((c) => c.debut)).toEqual(["2026-06-01"]);
    // Un congé à cheval sur la borne compte des deux côtés.
    expect((await listerConges(org, { filtres: lireFiltresListe({ du: "2026-04-01", au: "2026-04-30" }) })).map((c) => c.debut)).toEqual(["2026-03-30"]);
    expect((await listerConges(org, { filtres: lireFiltresListe({ du: "2026-03-01", au: "2026-03-30" }) })).map((c) => c.debut)).toEqual(["2026-03-30"]);
    expect(await listerConges(org, { filtres: lireFiltresListe({ du: "2026-04-03", au: "2026-05-31" }) })).toEqual([]);
  });

  it("réunions : la recherche dépasse la fenêtre des 90 jours, jamais l'invitation", async () => {
    const organisateur = { userId: user, organise: true };
    const { id } = await db.transaction((tx) =>
      creerReunionDans(tx, org, { titre: "Bilan du chantier de Bingerville", debutPrevu: new Date("2025-11-03T09:00:00Z"), dureeMinutes: 60, participants: [] }, organisateur),
    );
    // Close depuis près d'un an : hors de la liste ordinaire.
    await db
      .update(reunions)
      .set({ statut: "terminee", ouverteLe: new Date("2025-11-03T09:00:00Z"), termineeLe: new Date("2025-11-03T10:00:00Z") })
      .where(eq(reunions.id, id));

    expect(await listerReunions(org, user)).toEqual([]);
    expect((await listerReunions(org, user, new Date(), lireFiltresListe({ q: "bingerville" }))).map((r) => r.titre)).toEqual(["Bilan du chantier de Bingerville"]);
    expect(await listerReunions(org, user, new Date(), lireFiltresListe({ du: "2025-11-04" }))).toEqual([]);
    // Qui n'est pas invité ne la trouve pas, recherche ou non.
    expect(await listerReunions(org, crypto.randomUUID(), new Date(), lireFiltresListe({ q: "bingerville" }))).toEqual([]);
  });
});
