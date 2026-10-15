import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import type { Ecriture } from "@/lib/comptabilite/ecritures";
import { calculerBilan } from "@/lib/comptabilite/etats";
import { newId } from "@/lib/ids";
import { enregistrerEcritureDans, PeriodeVerrouillee } from "@/modules/comptabilite/enregistrement";
import { RAPPORTS_COMPTABILITE } from "@/modules/comptabilite/rapports";
import { soldesAuJour } from "@/modules/comptabilite/requetes";
import { ecritures } from "@/modules/comptabilite/schema";
import { cloturerExerciceDans } from "@/modules/fiscalite/creation";
import {
  affecterResultatDans,
  annulerImpotDans,
  constaterImpotDans,
  enregistrerRegleImpotDans,
  fractionsDe,
  payerFractionDans,
  regleImpotDe,
  reouverturesDe,
  rouvrirExerciceDans,
  sortiesImpot,
} from "@/modules/fiscalite/exercice";
import { exercicesClotures, impotsBenefices } from "@/modules/fiscalite/schema";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;
let banque: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  banque = newId();
  await db.insert(comptesTresorerie).values({ id: banque, organizationId: org, nom: "Banque", nature: "banque", compte: "5211" });
});
afterAll(async () => fermer());

const poser = (e: Ecriture) =>
  db.transaction((tx) => enregistrerEcritureDans(tx, e, { organizationId: org, userId: user, origine: "saisie", pieceId: null, exercice: e.date.slice(0, 4), dateIso: e.date }));
const ecriture = (date: string, piece: string, lignes: [string, number, number][]): Ecriture => ({
  journal: "OD",
  date,
  piece,
  libelle: piece,
  lignes: lignes.map(([compte, debit, credit]) => ({ compte, libelleCompte: compte, debit, credit })),
});
const REGLE = { tauxBp: 2_500, imfTauxBp: 50, imfMinimum: 300_000, imfMaximum: 0, echeances: ["04-20", "06-20", "09-20"], source: "Essai" };
const AUJOURDHUI = "2026-10-05";

describe("fin d'exercice en base", () => {
  it("constate l'impôt, clôture, affecte, et le bilan s'enchaîne d'une année sur l'autre", async () => {
    await poser(ecriture("2025-01-10", "CAP-1", [["5211", 5_000_000, 0], ["101", 0, 5_000_000]]));
    await poser(ecriture("2025-06-10", "V-1", [["5211", 12_000_000, 0], ["701", 0, 12_000_000]]));
    await poser(ecriture("2025-07-10", "A-1", [["601", 8_000_000, 0], ["5211", 0, 8_000_000]]));

    // Règle non attestée : connue, mais refusée par l'action ; ici on l'atteste.
    expect((await regleImpotDe(org)).verifie).toBe(false);
    await db.transaction((tx) => enregistrerRegleImpotDans(tx, org, REGLE, true, user));
    expect((await regleImpotDe(org)).verifie).toBe(true);

    await expect(
      db.transaction((tx) => constaterImpotDans(tx, org, "2026", { reintegrations: 0, deductions: 0, chiffreAffaires: 0 }, REGLE, AUJOURDHUI, user)),
    ).rejects.toThrow(/pas terminé/);
    const impot = await db.transaction((tx) => constaterImpotDans(tx, org, "2025", { reintegrations: 0, deductions: 0, chiffreAffaires: 12_000_000 }, REGLE, AUJOURDHUI, user));
    expect(impot).toMatchObject({ resultatComptable: 4_000_000, impotTheorique: 1_000_000, imf: 300_000, impotDu: 1_000_000 });
    expect((await fractionsDe(org)).map((f) => [f.echeance, f.montant])).toEqual([
      ["2026-04-20", 333_334],
      ["2026-06-20", 333_333],
      ["2026-09-20", 333_333],
    ]);

    const c = await db.transaction((tx) => cloturerExerciceDans(tx, org, "2025", AUJOURDHUI, user));
    expect(c.resultat).toBe(3_000_000);

    // Bilan au 31/12/2025 : capital, bénéfice en 13, dette d'impôt.
    const bilan = calculerBilan(await soldesAuJour(org, "2025-12-31"));
    expect(bilan.totalActif).toBe(bilan.totalPassif);
    expect(bilan.resultatEnInstance).toBe(0);
    expect(bilan.passif.find((p) => p.code === "CJ")?.montant).toBe(3_000_000);
    expect(bilan.passif.find((p) => p.code === "DK")?.montant).toBe(1_000_000);

    // À-nouveaux 2026 : les comptes de bilan au 31/12/2025, rien de la gestion.
    const ouverture = await RAPPORTS_COMPTABILITE.find((r) => r.cle === "balance-ouverture")!.executer(org, { du: "2026-10-05", au: "2026-10-05" });
    expect(ouverture.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["101", null, 5_000_000],
      ["131", null, 3_000_000],
      ["441", null, 1_000_000],
      ["5211", 9_000_000, null],
    ]);

    // Une fraction payée en 2026 éteint d'autant la dette.
    const [premiere] = await fractionsDe(org);
    await expect(db.transaction((tx) => payerFractionDans(tx, org, premiere.id, { compteTresorerieId: banque, date: "2025-12-31" }, user))).rejects.toThrow(/après la fin/);
    await db.transaction((tx) => payerFractionDans(tx, org, premiere.id, { compteTresorerieId: banque, date: "2026-04-18" }, user));
    await expect(db.transaction((tx) => payerFractionDans(tx, org, premiere.id, { compteTresorerieId: banque, date: "2026-04-19" }, user))).rejects.toThrow(/déjà payée/);
    expect((await sortiesImpot(org)).map((s) => s.montant)).toEqual([333_333, 333_333]);

    await expect(
      db.transaction((tx) => affecterResultatDans(tx, org, "2025", { reserveLegale: 300_000, autresReserves: 0, dividendes: 1_000_000, reportANouveau: 1_000_000 }, "2026-05-15", user)),
    ).rejects.toThrow(/en entier/);
    await db.transaction((tx) =>
      affecterResultatDans(tx, org, "2025", { reserveLegale: 300_000, autresReserves: 0, dividendes: 1_000_000, reportANouveau: 1_700_000 }, "2026-05-15", user),
    );
    const apres = calculerBilan(await soldesAuJour(org, "2026-06-30"));
    expect(apres.totalActif).toBe(apres.totalPassif);
    expect(apres.passif.find((p) => p.code === "CD")?.montant).toBe(300_000);
    expect(apres.passif.find((p) => p.code === "CH")?.montant).toBe(1_700_000);
    expect(apres.passif.find((p) => p.code === "CJ")?.montant).toBe(0);
    expect(apres.passif.find((p) => p.code === "DM")?.montant).toBe(1_000_000);
  });

  it("rouvre en contrepassant affectation et clôture, puis reclôture sous une nouvelle pièce", async () => {
    await expect(db.transaction((tx) => rouvrirExerciceDans(tx, org, "2025", "", user))).rejects.toThrow(/pourquoi/);
    const r = await db.transaction((tx) => rouvrirExerciceDans(tx, org, "2025", "Facture d'achat oubliée", user));
    expect(r.ecritures).toHaveLength(2);
    expect(await db.select().from(exercicesClotures).where(eq(exercicesClotures.organizationId, org))).toHaveLength(0);
    expect((await reouverturesDe(org))[0]).toMatchObject({ exercice: "2025", motif: "Facture d'achat oubliée", resultatAnnule: 3_000_000 });

    // Rouvert : l'exercice accepte de nouveau une écriture, et le bilan retombe juste.
    await poser(ecriture("2025-12-20", "A-2", [["601", 400_000, 0], ["5211", 0, 400_000]]));
    const bilan = calculerBilan(await soldesAuJour(org, "2025-12-31"));
    expect(bilan.totalActif).toBe(bilan.totalPassif);
    expect(bilan.resultatEnInstance).toBe(3_000_000 - 400_000);

    // L'impôt a une fraction payée : il ne s'annule plus, la clôture se refait telle quelle.
    await expect(db.transaction((tx) => annulerImpotDans(tx, org, "2025", "Base revue", user))).rejects.toThrow(/déjà payée/);
    const c = await db.transaction((tx) => cloturerExerciceDans(tx, org, "2025", AUJOURDHUI, user));
    expect(c.resultat).toBe(2_600_000);
    const pieces = await db.select({ piece: ecritures.pieceNumero }).from(ecritures).where(and(eq(ecritures.organizationId, org), eq(ecritures.origine, "cloture")));
    expect(pieces.map((p) => p.piece).sort()).toEqual(["CLO-2025", "CLO-2025-2", "CLO-2025-ANN"]);
    await expect(poser(ecriture("2025-12-21", "A-3", [["601", 1, 0], ["5211", 0, 1]]))).rejects.toBeInstanceOf(PeriodeVerrouillee);
  });

  it("annule un impôt sans fraction payée, puis le reconstate", async () => {
    await poser(ecriture("2026-03-10", "V-2", [["5211", 1_000_000, 0], ["701", 0, 1_000_000]]));
    await db.transaction((tx) => constaterImpotDans(tx, org, "2026", { reintegrations: 0, deductions: 0, chiffreAffaires: 1_000_000 }, REGLE, "2027-02-01", user));
    await db.transaction((tx) => annulerImpotDans(tx, org, "2026", "Chiffre d'affaires corrigé", user));
    expect(await db.select().from(impotsBenefices).where(and(eq(impotsBenefices.organizationId, org), eq(impotsBenefices.exercice, "2026")))).toHaveLength(0);
    const encore = await db.transaction((tx) => constaterImpotDans(tx, org, "2026", { reintegrations: 0, deductions: 0, chiffreAffaires: 1_000_000 }, REGLE, "2027-02-01", user));
    expect(encore.ecriture).toBeTruthy();
    const pieces = await db.select({ piece: ecritures.pieceNumero }).from(ecritures).where(and(eq(ecritures.organizationId, org), eq(ecritures.origine, "impot"), eq(ecritures.exercice, "2026")));
    expect(pieces.map((p) => p.piece).sort()).toEqual(["IS-2025-F1", "IS-2026", "IS-2026-2", "IS-2026-ANN"]);
  });
});
