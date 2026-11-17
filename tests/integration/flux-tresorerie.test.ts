import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import type { Ecriture } from "@/lib/comptabilite/ecritures";
import { calculerFluxTresorerie } from "@/lib/comptabilite/flux";
import { calculerNotesAnnexes } from "@/lib/comptabilite/notes";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { donneesFlux, donneesNotes } from "@/modules/comptabilite/requetes";

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

const poser = (date: string, piece: string, lignes: [string, number, number][]) => {
  const e: Ecriture = {
    journal: "OD",
    date,
    piece,
    libelle: piece,
    lignes: lignes.map(([compte, debit, credit]) => ({ compte, libelleCompte: compte, debit, credit })),
  };
  return db.transaction((tx) =>
    enregistrerEcritureDans(tx, e, { organizationId: org, userId: user, origine: "saisie", pieceId: null, exercice: date.slice(0, 4), dateIso: date }),
  );
};

describe("tableau des flux de trésorerie en base", () => {
  it("lit les mouvements, les deux situations et les cessions, et retombe sur la trésorerie du bilan", async () => {
    await poser("2025-01-05", "CAP", [["5211", 10_000_000, 0], ["101", 0, 10_000_000]]);
    await poser("2025-02-01", "MAT", [["2441", 1_000_000, 0], ["5211", 0, 1_000_000]]);
    await poser("2025-12-31", "DOT25", [["6813", 200_000, 0], ["2844", 0, 200_000]]);
    await poser("2026-03-01", "CAMION", [["2451", 2_000_000, 0], ["4812", 0, 2_000_000]]);
    await poser("2026-04-01", "PAIE-CAMION", [["4812", 1_500_000, 0], ["5211", 0, 1_500_000]]);
    await poser("2026-06-01", "SORTIE", [["2844", 200_000, 0], ["812", 800_000, 0], ["2441", 0, 1_000_000]]);
    await poser("2026-06-01", "CESSION", [["4851", 900_000, 0], ["822", 0, 900_000]]);
    await poser("2026-07-01", "ENC-CESSION", [["5211", 500_000, 0], ["4851", 0, 500_000]]);
    await poser("2026-09-01", "EMPRUNT", [["5211", 3_000_000, 0], ["162", 0, 3_000_000]]);
    await poser("2026-12-31", "DOT26", [["6813", 400_000, 0], ["2845", 0, 400_000]]);

    const flux = calculerFluxTresorerie(await donneesFlux(org, "2026"));
    const ligne = (code: string) => flux.lignes.find((l) => l.code === code)?.montant;

    expect(ligne("ZA")).toBe(9_000_000);
    expect(ligne("FA")).toBe(0);
    expect(ligne("FG")).toBe(-1_500_000);
    expect(ligne("FI")).toBe(500_000);
    expect(ligne("FO")).toBe(3_000_000);
    expect(ligne("ZG")).toBe(2_000_000);
    expect(ligne("ZH")).toBe(11_000_000);
    expect(flux.tresorerieFin).toBe(11_000_000);
    expect(flux.ecart).toBe(0);
  });

  it("les notes annexes lisent les mêmes écritures : immobilisations, cession, emprunt", async () => {
    const notes = calculerNotesAnnexes(await donneesNotes(org, "2026"), "2026");
    const totalNote = (numero: string, libelle?: string) =>
      notes.find((n) => n.numero === numero)?.lignes.find((l) => (libelle ? l.libelle === libelle && l.niveau === "rubrique" : l.niveau === "total"))?.valeurs;

    expect(totalNote("3A", "Immobilisations corporelles")).toEqual([1_000_000, 2_000_000, 1_000_000, 2_000_000]);
    expect(totalNote("3C", "Amortissements des immobilisations corporelles")).toEqual([200_000, 400_000, 200_000, 400_000]);
    expect(totalNote("3D")).toEqual([800_000, 900_000, 100_000]);
    expect(totalNote("16A")?.[0]).toBe(3_000_000);
    expect(totalNote("19")?.[0]).toBe(500_000);
  });
});
