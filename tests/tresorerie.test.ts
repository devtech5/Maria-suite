import { describe, expect, it } from "vitest";

import { ecritureReglement, estEquilibree, totalDebit } from "@/lib/comptabilite/ecritures";
import type { SoldeCompte } from "@/lib/comptabilite/etats";
import { presetRole, resoudreDroits } from "@/lib/droits/catalogue";
import { categorieAction, libelleAction, moduleAction } from "@/lib/journal";
import { alertes, tresorerie } from "@/lib/tableau-de-bord";
import { CATEGORIES_DEPENSE, ecritureDepense, type CategorieDepense } from "@/modules/projets/calcul";
import {
  compteSuggere,
  compteTresorerieValide,
  ecritureArrete,
  ecritureAvance,
  ecritureBon,
  ecritureEnvoi,
  ecritureJustification,
  ecritureLigneReleve,
  ecritureReception,
  ecritureRemboursement,
  lireDate,
  lireMontant,
  lireReleve,
  planTresorerie,
  rapprocherAuto,
  refusRegularisation,
  resteAvance,
  type CompteRef,
} from "@/modules/tresorerie/calcul";

const banque: CompteRef = { numero: "5211", libelle: "SGBCI", nature: "banque" };
const caisse: CompteRef = { numero: "572", libelle: "Caisse Bouaké", nature: "caisse" };
const ligne = (e: { lignes: { compte: string; debit: number; credit: number }[] }, compte: string) => e.lignes.find((l) => l.compte === compte);

describe("comptes de trésorerie", () => {
  it("propose le premier compte libre de la nature, jamais un compte réservé", () => {
    expect(compteSuggere("banque", [])).toBe("5211");
    expect(compteSuggere("banque", ["5211", "5212"])).toBe("5213");
    expect(compteSuggere("caisse", ["571"])).toBe("572");
    expect(compteSuggere("mobile_money", [])).toBe("5521");
  });

  it("n'accepte que la classe 5 de trésorerie, jamais le compte de passage 585", () => {
    expect(compteTresorerieValide("5211")).toBe(true);
    expect(compteTresorerieValide("571")).toBe(true);
    expect(compteTresorerieValide("5521")).toBe(true);
    expect(compteTresorerieValide("585")).toBe(false);
    expect(compteTresorerieValide("411")).toBe(false);
    expect(compteTresorerieValide("52a")).toBe(false);
  });
});

describe("virement interne", () => {
  it("fait transiter l'argent par le 585, frais en 631", () => {
    const envoi = ecritureEnvoi({ numero: "VIR-2026-00001", date: "2026-10-04", source: banque, destination: "Caisse Bouaké", montant: 200_000, frais: 1_500 });
    expect(estEquilibree(envoi)).toBe(true);
    expect(envoi.journal).toBe("BQ");
    expect(envoi.piece).toBe("VIR-2026-00001-E");
    expect(ligne(envoi, "585")?.debit).toBe(200_000);
    expect(ligne(envoi, "631")?.debit).toBe(1_500);
    expect(ligne(envoi, "5211")?.credit).toBe(201_500);

    const reception = ecritureReception({ numero: "VIR-2026-00001", date: "2026-10-05", destination: caisse, source: "SGBCI", montant: 200_000 });
    expect(estEquilibree(reception)).toBe(true);
    expect(reception.journal).toBe("CA");
    expect(ligne(reception, "572")?.debit).toBe(200_000);
    expect(ligne(reception, "585")?.credit).toBe(200_000);
  });

  it("n'écrit pas de ligne de frais quand il n'y en a pas", () => {
    const envoi = ecritureEnvoi({ numero: "V", date: "2026-10-04", source: caisse, destination: "SGBCI", montant: 50_000, frais: 0 });
    expect(envoi.lignes).toHaveLength(2);
  });

  it("refuse un montant nul ou à virgule", () => {
    expect(() => ecritureEnvoi({ numero: "V", date: "2026-10-04", source: caisse, destination: "x", montant: 0, frais: 0 })).toThrow();
    expect(() => ecritureReception({ numero: "V", date: "2026-10-04", destination: caisse, source: "x", montant: 10.5 })).toThrow();
  });
});

describe("caisse de dépenses", () => {
  it("passe un bon de caisse en charge selon sa nature", () => {
    const e = ecritureBon({ numero: "BC-2026-00001", date: "2026-10-04", caisse, nature: "carburant", montant: 25_000, beneficiaire: "Station Total" });
    expect(estEquilibree(e)).toBe(true);
    expect(ligne(e, "6042")?.debit).toBe(25_000);
    expect(ligne(e, "572")?.credit).toBe(25_000);
  });

  it("suit une avance de la remise au solde", () => {
    const remise = ecritureAvance({ numero: "AV-2026-00001", date: "2026-10-01", caisse, montant: 100_000, beneficiaire: "Konan" });
    expect(ligne(remise, "4251")?.debit).toBe(100_000);

    const justif = ecritureJustification({ piece: "AV-2026-00001-J1", date: "2026-10-03", nature: "mission", montant: 70_000, beneficiaire: "Konan" });
    expect(justif.journal).toBe("OD");
    expect(ligne(justif, "6181")?.debit).toBe(70_000);
    expect(ligne(justif, "4251")?.credit).toBe(70_000);

    const rendu = ecritureRemboursement({ piece: "AV-2026-00001-R2", date: "2026-10-03", caisse, montant: 30_000, beneficiaire: "Konan" });
    expect(ligne(rendu, "572")?.debit).toBe(30_000);
    expect(ligne(rendu, "4251")?.credit).toBe(30_000);

    expect(resteAvance(100_000, [{ montant: 70_000 }, { montant: 30_000 }])).toBe(0);
  });

  it("refuse une régularisation qui dépasse le reste dû", () => {
    expect(refusRegularisation(30_000, 30_001)).toMatch(/Il ne reste que/);
    expect(refusRegularisation(30_000, 30_000)).toBeNull();
    expect(refusRegularisation(30_000, 0)).toBe("Montant invalide.");
  });

  it("passe l'écart d'un arrêté en charge ou en produit, rien si la caisse est juste", () => {
    expect(ecritureArrete({ numero: "ARR", date: "2026-10-04", caisse, ecart: 0 })).toBeNull();
    const manquant = ecritureArrete({ numero: "ARR", date: "2026-10-04", caisse, ecart: -2_500 })!;
    expect(ligne(manquant, "658")?.debit).toBe(2_500);
    expect(ligne(manquant, "572")?.credit).toBe(2_500);
    const excedent = ecritureArrete({ numero: "ARR", date: "2026-10-04", caisse, ecart: 1_000 })!;
    expect(ligne(excedent, "572")?.debit).toBe(1_000);
    expect(ligne(excedent, "758")?.credit).toBe(1_000);
  });
});

describe("lecture d'un relevé", () => {
  it("lit les montants à la française, sans flottant", () => {
    expect(lireMontant("1 250 000")).toBe(1_250_000);
    expect(lireMontant("1.250.000")).toBe(1_250_000);
    expect(lireMontant("1250000,00")).toBe(1_250_000);
    expect(lireMontant("-42 000")).toBe(-42_000);
    expect(lireMontant("(42 000)")).toBe(-42_000);
    expect(lireMontant("12 500,50")).toBe(12_501);
    expect(lireMontant("15000 FCFA")).toBe(15_000);
    expect(lireMontant("abc")).toBeNull();
    expect(lireMontant("")).toBeNull();
  });

  it("lit les dates courantes et refuse les impossibles", () => {
    expect(lireDate("05/10/2026")).toBe("2026-10-05");
    expect(lireDate("5-10-26")).toBe("2026-10-05");
    expect(lireDate("2026-10-05")).toBe("2026-10-05");
    expect(lireDate("31/02/2026")).toBeNull();
  });

  it("reconnaît un relevé débit/crédit après un préambule, sans les lignes de solde", () => {
    const csv = [
      "Compte courant SGBCI;;;;",
      "Période du 01/10/2026 au 31/10/2026;;;;",
      "Date opération;Date valeur;Libellé;Débit;Crédit",
      "01/10/2026;01/10/2026;VERSEMENT ESPECES;;200 000",
      "03/10/2026;03/10/2026;FRAIS TENUE DE COMPTE;3 500;",
      "Solde au 31/10/2026;;;;196 500",
    ].join("\n");
    const { lignes, erreurs } = lireReleve(csv);
    expect(erreurs).toEqual([]);
    expect(lignes).toEqual([
      { date: "2026-10-01", libelle: "VERSEMENT ESPECES", montant: 200_000 },
      { date: "2026-10-03", libelle: "FRAIS TENUE DE COMPTE", montant: -3_500 },
    ]);
  });

  it("reconnaît un relevé à montant signé séparé par des virgules, champs entre guillemets", () => {
    const csv = 'Date,Description,Montant\n2026-10-02,"Virement client, facture 12",150000\n2026-10-04,Retrait DAB,-20000\n';
    expect(lireReleve(csv).lignes).toEqual([
      { date: "2026-10-02", libelle: "Virement client, facture 12", montant: 150_000 },
      { date: "2026-10-04", libelle: "Retrait DAB", montant: -20_000 },
    ]);
  });

  it("dit ce qui manque plutôt que d'inventer", () => {
    expect(lireReleve("").erreurs[0]).toMatch(/vide/);
    expect(lireReleve("Libellé;Montant\nx;1").erreurs[0]).toMatch(/Date/);
    expect(lireReleve("Date;Libellé\n01/10/2026;x").erreurs[0]).toMatch(/Montant/);
  });
});

describe("rapprochement automatique", () => {
  it("relie un pour un, même montant, la date la plus proche dans la tolérance", () => {
    const paires = rapprocherAuto(
      [
        { id: "r1", date: "2026-10-02", montant: 200_000 },
        { id: "r2", date: "2026-10-03", montant: -3_500 },
        { id: "r3", date: "2026-10-20", montant: 200_000 },
      ],
      [
        { id: "e1", date: "2026-09-30", montant: 200_000 },
        { id: "e2", date: "2026-10-01", montant: 200_000 },
        { id: "e3", date: "2026-10-03", montant: -3_000 },
      ],
    );
    expect(paires).toEqual([{ releveId: "r1", ecritureId: "e2" }]);
  });

  it("ne relie jamais deux lignes de relevé à la même écriture", () => {
    const paires = rapprocherAuto(
      [
        { id: "r1", date: "2026-10-01", montant: 5_000 },
        { id: "r2", date: "2026-10-01", montant: 5_000 },
      ],
      [{ id: "e1", date: "2026-10-01", montant: 5_000 }],
    );
    expect(paires).toHaveLength(1);
  });

  it("comptabilise un frais en 631, un intérêt en 771", () => {
    const frais = ecritureLigneReleve({ piece: "RB-1", date: "2026-10-03", banque, montant: -3_500, libelle: "Frais" });
    expect(ligne(frais, "631")?.debit).toBe(3_500);
    expect(ligne(frais, "5211")?.credit).toBe(3_500);
    const interet = ecritureLigneReleve({ piece: "RB-2", date: "2026-10-03", banque, montant: 800, libelle: "Intérêts" });
    expect(ligne(interet, "5211")?.debit).toBe(800);
    expect(ligne(interet, "771")?.credit).toBe(800);
  });
});

describe("plan de trésorerie", () => {
  it("met les retards dans la première semaine et trouve le premier découvert", () => {
    const plan = planTresorerie(
      100_000,
      [
        { date: "2026-09-20", montant: 50_000, libelle: "Facture échue", origine: "facture" },
        { date: "2026-10-04", montant: -120_000, libelle: "Dépense", origine: "depense" },
        { date: "2026-10-15", montant: -80_000, libelle: "Intervenants", origine: "intervenant" },
        { date: "2027-06-01", montant: 1_000_000, libelle: "Lointaine", origine: "facture" },
      ],
      "2026-10-04",
    );
    expect(plan.semaines).toHaveLength(13);
    expect(plan.semaines[0].entrees).toBe(50_000);
    expect(plan.semaines[0].sorties).toBe(120_000);
    expect(plan.semaines[0].soldeFin).toBe(30_000);
    expect(plan.semaines[1].soldeFin).toBe(-50_000);
    expect(plan.premierDecouvert).toBe("2026-10-15");
    expect(plan.horsHorizon).toBe(1);
    expect(plan.semaines[12].soldeFin).toBe(-50_000);
  });

  it("ne signale rien quand le solde tient", () => {
    expect(planTresorerie(10_000, [{ date: "2026-10-10", montant: -10_000, libelle: "x", origine: "bon" }], "2026-10-04").premierDecouvert).toBeNull();
  });
});

describe("branchements avec le reste de l'application", () => {
  it("encaisse une facture sur le compte de trésorerie choisi", () => {
    const e = ecritureReglement({
      numero: "REG-1",
      date: "2026-10-04",
      client: "Kouassi",
      compteAuxiliaire: "411KOU",
      montant: 50_000,
      moyen: "banque",
      tresorerie: { numero: "5212", libelle: "Ecobank", journal: "BQ" },
    });
    expect(ligne(e, "5212")?.debit).toBe(50_000);
    expect(ligne(e, "521")).toBeUndefined();
  });

  it("paie une dépense depuis le compte de trésorerie choisi", () => {
    const e = ecritureDepense({
      numero: "DPS-1",
      date: "2026-10-04",
      objet: "Ciment",
      categorie: Object.keys(CATEGORIES_DEPENSE)[0] as CategorieDepense,
      montant: 30_000,
      tauxTvaBp: 0,
      moyen: "especes",
      tresorerie: { numero: "572", libelle: "Caisse Bouaké", journal: "CA" },
    });
    expect(ligne(e, "572")?.credit).toBe(30_000);
    expect(totalDebit(e)).toBe(30_000);
  });

  it("compte la monnaie électronique (55) et l'argent en route (585) dans « Où est l'argent »", () => {
    const soldes = tresorerie([
      { compte: "5211", libelle: "SGBCI", debit: 500_000, credit: 0 },
      { compte: "5521", libelle: "Wave", debit: 80_000, credit: 0 },
      { compte: "572", libelle: "Caisse", debit: 40_000, credit: 0 },
      { compte: "585", libelle: "Virements", debit: 200_000, credit: 0 },
    ] satisfies SoldeCompte[]);
    expect(soldes.find((s) => s.libelle === "Banque")?.montant).toBe(500_000);
    expect(soldes.find((s) => s.libelle === "Mobile money")?.montant).toBe(80_000);
    expect(soldes.find((s) => s.libelle === "Caisse")?.montant).toBe(40_000);
    expect(soldes.find((s) => s.libelle === "En route")?.montant).toBe(200_000);
  });

  it("lève les alertes de trésorerie au tableau de bord", () => {
    const liste = alertes(
      { enRetard: 0, montantEnRetard: 0 },
      { ruptures: 0, aCommanderVite: 0, valeur: 0 },
      { echeancesDepassees: 0, indisponibles: 0 },
      { enRetard: 0, echouees: 0 },
      undefined,
      undefined,
      {
        caissesSousSeuil: ["Caisse Bouaké"],
        bonsAApprouver: 2,
        bonsADecaisser: 0,
        avancesEchues: 1,
        montantAvancesEchues: 30_000,
        virementsEnTransit: 0,
        premierDecouvert: "2026-10-15",
      },
    );
    const ids = liste.map((a) => a.id);
    expect(ids).toContain("tresorerie-decouvert");
    expect(ids).toContain("caisse-basse");
    expect(ids).toContain("bons-attente");
    expect(ids).toContain("avances");
    expect(ids).not.toContain("virements-transit");
    expect(liste.find((a) => a.id === "tresorerie-decouvert")?.gravite).toBe("critique");
  });

  it("trace et range les gestes de trésorerie au journal", () => {
    expect(moduleAction("virement.envoyer")).toBe("Trésorerie");
    expect(libelleAction("bon_caisse.decaisser")).toBe("a décaissé un bon de caisse");
    expect(categorieAction("bon_caisse.rejeter")).toBe("suppression");
    expect(categorieAction("virement.envoyer")).toBe("affectation");
  });

  it("donne la caisse au comptable, l'approbation au gérant, la demande à tous", () => {
    const comptable = resoudreDroits({ cleRole: "comptable", estProprietaire: false });
    expect(comptable.has("tresorerie.caisse.tenir")).toBe(true);
    expect(comptable.has("tresorerie.rapprocher")).toBe(true);
    expect(comptable.has("tresorerie.bon.approuver")).toBe(false);
    expect(resoudreDroits({ cleRole: "magasinier", estProprietaire: false }).has("tresorerie.bon.demander")).toBe(true);
    expect(resoudreDroits({ cleRole: "magasinier", estProprietaire: false }).has("tresorerie.consulter")).toBe(false);
    expect(presetRole("gerant")?.droits).toContain("tresorerie.bon.approuver");
  });
});

