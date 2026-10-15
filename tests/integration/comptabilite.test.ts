import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import type { Ecriture } from "@/lib/comptabilite/ecritures";
import { prochainNumero } from "@/lib/sequences";
import { enregistrerEcritureDans, PeriodeVerrouillee } from "@/modules/comptabilite/enregistrement";
import { soldesParCompte } from "@/modules/comptabilite/requetes";
import { cloturerExerciceDans, declarerTvaDans, payerTvaDans } from "@/modules/fiscalite/creation";
import { constaterImpotDans } from "@/modules/fiscalite/exercice";
import { comptesTresorerie } from "@/modules/tresorerie/schema";
import { newId } from "@/lib/ids";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

const vente = (date: string, piece: string, ht: number): Ecriture => ({
  journal: "VE",
  date,
  piece,
  libelle: `Vente ${piece}`,
  lignes: [
    { compte: "571", libelleCompte: "Caisse", debit: ht + (ht * 18) / 100, credit: 0 },
    { compte: "701", libelleCompte: "Ventes de marchandises", debit: 0, credit: ht },
    { compte: "4431", libelleCompte: "TVA facturée", debit: 0, credit: (ht * 18) / 100 },
  ],
});

const achatSansTva = (date: string, piece: string, montant: number): Ecriture => ({
  journal: "AC",
  date,
  piece,
  libelle: `Achat ${piece}`,
  lignes: [
    { compte: "601", libelleCompte: "Achats de marchandises", debit: montant, credit: 0 },
    { compte: "571", libelleCompte: "Caisse", debit: 0, credit: montant },
  ],
});

const poser = (e: Ecriture, origine: "vente_pos" | "saisie" = "saisie") =>
  db.transaction((tx) => enregistrerEcritureDans(tx, e, { organizationId: org, userId: user, origine, pieceId: null, exercice: e.date.slice(0, 4), dateIso: e.date }));

describe("numérotation", () => {
  it("sans trou ni doublon, et une transaction annulée ne consomme rien", async () => {
    const numeros: string[] = [];
    for (let i = 0; i < 20; i++) numeros.push(await db.transaction((tx) => prochainNumero(tx, org, { cle: "essai", prefix: "T-", padding: 4 })));
    await db
      .transaction(async (tx) => {
        await prochainNumero(tx, org, { cle: "essai", prefix: "T-", padding: 4 });
        throw new Error("annulation");
      })
      .catch(() => {});
    numeros.push(await db.transaction((tx) => prochainNumero(tx, org, { cle: "essai", prefix: "T-", padding: 4 })));
    expect(numeros).toEqual(Array.from({ length: 21 }, (_, i) => `T-${String(i + 1).padStart(4, "0")}`));
  });

  it("un compteur par période", async () => {
    const a = await db.transaction((tx) => prochainNumero(tx, org, { cle: "periodique", prefix: "P-", padding: 2, periode: "2026" }));
    const b = await db.transaction((tx) => prochainNumero(tx, org, { cle: "periodique", prefix: "P-", padding: 2, periode: "2027" }));
    expect([a, b]).toEqual(["P-01", "P-01"]);
  });
});

describe("TVA : déclaration, verrou du mois, paiement", () => {
  it("déclare août, verrouille le mois pour la TVA seulement, puis paie", async () => {
    await poser(vente("2026-08-10", "T-AOUT-1", 100_000), "vente_pos");
    await poser(vente("2026-08-20", "T-AOUT-2", 50_000), "vente_pos");

    const d = await db.transaction((tx) => declarerTvaDans(tx, org, "2026-08", "2026-10-05", user));
    expect(d.aPayer).toBe(27_000);
    expect(d.ecriture).toMatch(/^OD-2026-/);

    // Une vente datée d'août n'entre plus ; un achat sans TVA, si.
    await expect(poser(vente("2026-08-25", "T-AOUT-3", 10_000), "vente_pos")).rejects.toBeInstanceOf(PeriodeVerrouillee);
    await expect(poser(achatSansTva("2026-08-25", "A-AOUT-1", 5_000))).resolves.toMatch(/^AC-2026-/);

    // Septembre se déclare ensuite ; octobre (mois en cours) est refusé.
    await expect(db.transaction((tx) => declarerTvaDans(tx, org, "2026-10", "2026-10-05", user))).rejects.toThrow(/pas terminé/);

    const banque = newId();
    await db.insert(comptesTresorerie).values({ id: banque, organizationId: org, nom: "Banque", nature: "banque", compte: "5211" });
    const p = await db.transaction((tx) => payerTvaDans(tx, org, "2026-08", { compteTresorerieId: banque, date: "2026-09-12" }, user));
    expect(p.montant).toBe(27_000);
    await expect(db.transaction((tx) => payerTvaDans(tx, org, "2026-08", { compteTresorerieId: banque, date: "2026-09-13" }, user))).rejects.toThrow(/déjà payée/);

    const soldes = await soldesParCompte(org, "2026");
    const solde = (c: string) => {
      const s = soldes.find((x) => x.compte === c);
      return s ? s.debit - s.credit : 0;
    };
    // 443 soldé par la liquidation, 4441 soldé par le paiement.
    expect(solde("4431")).toBe(0);
    expect(solde("4441")).toBe(0);
    expect(solde("5211")).toBe(-27_000);
  });
});

describe("clôture d'exercice", () => {
  it("porte le résultat en 13, ferme l'exercice, et laisse les états intacts", async () => {
    await poser({ ...vente("2025-03-10", "T-2025-1", 0), lignes: [
      { compte: "571", libelleCompte: "Caisse", debit: 300_000, credit: 0 },
      { compte: "701", libelleCompte: "Ventes", debit: 0, credit: 300_000 },
    ] });
    await poser(achatSansTva("2025-04-10", "A-2025-1", 120_000));

    await expect(db.transaction((tx) => cloturerExerciceDans(tx, org, "2025", "2026-10-05", user))).rejects.toThrow(/impôt sur les bénéfices/);
    const regle = { tauxBp: 2_500, imfTauxBp: 0, imfMinimum: 0, imfMaximum: 0, echeances: ["04-20"], source: "" };
    await db.transaction((tx) => constaterImpotDans(tx, org, "2025", { reintegrations: 0, deductions: 0, chiffreAffaires: 300_000 }, regle, "2026-10-05", user));
    const r = await db.transaction((tx) => cloturerExerciceDans(tx, org, "2025", "2026-10-05", user));
    expect(r.resultat).toBe(180_000 - 45_000);

    await expect(poser(achatSansTva("2025-12-15", "A-2025-2", 1_000))).rejects.toBeInstanceOf(PeriodeVerrouillee);
    await expect(db.transaction((tx) => cloturerExerciceDans(tx, org, "2025", "2026-10-05", user))).rejects.toThrow(/déjà clôturé/);
    await expect(db.transaction((tx) => cloturerExerciceDans(tx, org, "2026", "2026-10-05", user))).rejects.toThrow(/pas terminé/);

    // Le compte de résultat 2025 se lit toujours : la clôture est écartée.
    const soldes = await soldesParCompte(org, "2025");
    expect(soldes.find((s) => s.compte === "701")?.credit).toBe(300_000);
    expect(soldes.find((s) => s.compte === "131")).toBeUndefined();
  });
});
