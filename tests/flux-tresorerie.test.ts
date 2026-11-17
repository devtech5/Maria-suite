import { describe, expect, it } from "vitest";

import type { SoldeCompte } from "@/lib/comptabilite/etats";
import { calculerFluxTresorerie, estEcritureDeCession, type DonneesFlux, type FluxTresorerie } from "@/lib/comptabilite/flux";

/**
 * Tableau des flux de trésorerie SYSCOHADA révisé.
 *
 * La preuve qui compte : la trésorerie nette de clôture calculée par le
 * tableau (ZH = ZA + ZG) retombe au franc près sur celle du bilan. Un flux mal
 * classé ne se voit pas à l'œil ; il se voit à cet écart.
 */

interface Piece {
  date: string;
  lignes: [compte: string, debit: number, credit: number][];
  /** Écriture de clôture : elle solde les classes 6 à 8 dans le 13. */
  cloture?: boolean;
}

function cumuler(lignes: [string, number, number][]): SoldeCompte[] {
  const parCompte = new Map<string, SoldeCompte>();
  for (const [compte, debit, credit] of lignes) {
    const s = parCompte.get(compte) ?? { compte, libelle: compte, debit: 0, credit: 0 };
    parCompte.set(compte, { ...s, debit: s.debit + debit, credit: s.credit + credit });
  }
  return [...parCompte.values()].sort((a, b) => a.compte.localeCompare(b.compte));
}

/** Ce que les requêtes rendent, calculé ici à la main sur des pièces équilibrées. */
function donnees(pieces: Piece[], exercice: string): DonneesFlux {
  for (const p of pieces) {
    const d = p.lignes.reduce((t, [, debit]) => t + debit, 0);
    const c = p.lignes.reduce((t, [, , credit]) => t + credit, 0);
    if (d !== c) throw new Error(`Pièce du ${p.date} déséquilibrée`);
  }
  const delExercice = pieces.filter((p) => p.date.startsWith(exercice) && !p.cloture);
  return {
    mouvements: cumuler(delExercice.flatMap((p) => p.lignes)),
    soldesDebut: cumuler(pieces.filter((p) => p.date < `${exercice}-01-01`).flatMap((p) => p.lignes)),
    soldesFin: cumuler(pieces.filter((p) => p.date <= `${exercice}-12-31`).flatMap((p) => p.lignes)),
    sortiesCessions: cumuler(
      delExercice
        .filter((p) => estEcritureDeCession(p.lignes.map(([compte]) => compte)))
        .flatMap((p) => p.lignes.filter(([compte, , credit]) => /^2[1-7]/.test(compte) && credit > 0)),
    ),
  };
}

const ligne = (flux: FluxTresorerie, code: string) => {
  const trouvee = flux.lignes.find((l) => l.code === code);
  if (!trouvee) throw new Error(`Ligne ${code} absente`);
  return trouvee.montant;
};

/** Variation de trésorerie réelle, lue dans les comptes de la classe 5. */
const variationReelle = (flux: FluxTresorerie) => flux.tresorerieFin - flux.tresorerieDebut;

describe("tableau des flux de trésorerie", () => {
  it("présente les lignes du modèle SYSCOHADA révisé, dans l'ordre", () => {
    const flux = calculerFluxTresorerie(donnees([], "2026"));
    expect(flux.lignes.map((l) => l.code)).toEqual([
      "ZA", "FA", "FB", "FC", "FD", "FE", "ZB",
      "FF", "FG", "FH", "FI", "FJ", "ZC",
      "FK", "FL", "FM", "FN", "ZD",
      "FO", "FP", "FQ", "ZE", "ZF", "ZG", "ZH",
    ]);
    expect(flux.lignes.every((l) => l.montant === 0 && !Object.is(l.montant, -0))).toBe(true);
  });

  it("activités opérationnelles : la CAFG corrigée de la variation du besoin de financement", () => {
    const pieces: Piece[] = [
      { date: "2025-01-10", lignes: [["5211", 5_000_000, 0], ["101", 0, 5_000_000]] },
      { date: "2026-02-01", lignes: [["411", 1_000_000, 0], ["701", 0, 1_000_000]] },
      { date: "2026-02-20", lignes: [["5211", 600_000, 0], ["411", 0, 600_000]] },
      { date: "2026-03-01", lignes: [["601", 400_000, 0], ["401", 0, 400_000]] },
      { date: "2026-03-15", lignes: [["401", 100_000, 0], ["5211", 0, 100_000]] },
      { date: "2026-04-30", lignes: [["661", 200_000, 0], ["5211", 0, 200_000]] },
      // Inventaire : le stock a monté de 150 000.
      { date: "2026-12-31", lignes: [["311", 150_000, 0], ["6031", 0, 150_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));

    expect(ligne(flux, "ZA")).toBe(5_000_000);
    expect(ligne(flux, "FA")).toBe(550_000);
    expect(ligne(flux, "FC")).toBe(-150_000);
    expect(ligne(flux, "FD")).toBe(-400_000);
    expect(ligne(flux, "FE")).toBe(300_000);
    expect(ligne(flux, "ZB")).toBe(300_000);
    expect(ligne(flux, "ZG")).toBe(300_000);
    expect(ligne(flux, "ZH")).toBe(5_300_000);
    expect(flux.tresorerieFin).toBe(5_300_000);
    expect(flux.ecart).toBe(0);
  });

  it("investissement : acquisition payée en partie, cession encaissée en partie, sans compter l'amortissement", () => {
    const pieces: Piece[] = [
      { date: "2025-01-05", lignes: [["5211", 10_000_000, 0], ["101", 0, 10_000_000]] },
      { date: "2025-02-01", lignes: [["2441", 1_000_000, 0], ["5211", 0, 1_000_000]] },
      { date: "2025-12-31", lignes: [["6813", 200_000, 0], ["2844", 0, 200_000]] },
      // 2026 : un camion acheté à crédit au fournisseur d'investissement, payé aux trois quarts.
      { date: "2026-03-01", lignes: [["2451", 2_000_000, 0], ["4812", 0, 2_000_000]] },
      { date: "2026-04-01", lignes: [["4812", 1_500_000, 0], ["5211", 0, 1_500_000]] },
      // L'ancien matériel est cédé 900 000, dont 500 000 encaissés.
      { date: "2026-06-01", lignes: [["2844", 200_000, 0], ["812", 800_000, 0], ["2441", 0, 1_000_000]] },
      { date: "2026-06-01", lignes: [["4851", 900_000, 0], ["822", 0, 900_000]] },
      { date: "2026-07-01", lignes: [["5211", 500_000, 0], ["4851", 0, 500_000]] },
      { date: "2026-12-31", lignes: [["6813", 400_000, 0], ["2845", 0, 400_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));

    // Résultat −300 000 : dotation 400 000, valeur comptable 800 000, prix 900 000. Rien de tout cela n'est de la trésorerie.
    expect(ligne(flux, "FA")).toBe(0);
    expect(ligne(flux, "FG")).toBe(-1_500_000);
    expect(ligne(flux, "FI")).toBe(500_000);
    expect(ligne(flux, "ZC")).toBe(-1_000_000);
    expect(ligne(flux, "ZG")).toBe(-1_000_000);
    expect(variationReelle(flux)).toBe(-1_000_000);
    expect(flux.ecart).toBe(0);
  });

  it("une avance sur immobilisation reprise dans le bien n'est décaissée qu'une fois", () => {
    const pieces: Piece[] = [
      { date: "2025-01-05", lignes: [["5211", 5_000_000, 0], ["101", 0, 5_000_000]] },
      { date: "2026-01-10", lignes: [["251", 700_000, 0], ["5211", 0, 700_000]] },
      { date: "2026-02-10", lignes: [["2441", 700_000, 0], ["251", 0, 700_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));
    expect(ligne(flux, "FG")).toBe(-700_000);
    expect(flux.ecart).toBe(0);
  });

  it("financement : capital, emprunt, subvention, dividendes déclarés à l'affectation", () => {
    const pieces: Piece[] = [
      { date: "2025-05-01", lignes: [["5211", 1_000_000, 0], ["701", 0, 1_000_000]] },
      { date: "2025-12-31", cloture: true, lignes: [["701", 1_000_000, 0], ["131", 0, 1_000_000]] },
      { date: "2026-01-15", lignes: [["5211", 3_000_000, 0], ["101", 0, 3_000_000]] },
      { date: "2026-02-01", lignes: [["5211", 5_000_000, 0], ["162", 0, 5_000_000]] },
      { date: "2026-08-01", lignes: [["162", 1_000_000, 0], ["6712", 300_000, 0], ["5211", 0, 1_300_000]] },
      // Affectation du bénéfice 2025 : 300 000 de dividendes, payés sous retenue de 15 %.
      { date: "2026-05-30", lignes: [["131", 1_000_000, 0], ["111", 0, 100_000], ["121", 0, 600_000], ["465", 0, 300_000]] },
      { date: "2026-06-30", lignes: [["465", 300_000, 0], ["4471", 0, 45_000], ["5211", 0, 255_000]] },
      // Subvention d'investissement : accordée 600 000, versée 400 000, 60 000 virés au résultat.
      { date: "2026-03-01", lignes: [["4494", 600_000, 0], ["141", 0, 600_000]] },
      { date: "2026-04-01", lignes: [["5211", 400_000, 0], ["4494", 0, 400_000]] },
      { date: "2026-12-31", lignes: [["141", 60_000, 0], ["799", 0, 60_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));

    expect(ligne(flux, "ZA")).toBe(1_000_000);
    // Seuls les intérêts sont de la trésorerie ; la quote-part de subvention n'en est pas.
    expect(ligne(flux, "FA")).toBe(-300_000);
    expect(ligne(flux, "FE")).toBe(45_000);
    expect(ligne(flux, "FK")).toBe(3_000_000);
    expect(ligne(flux, "FL")).toBe(400_000);
    expect(ligne(flux, "FM")).toBe(0);
    expect(ligne(flux, "FN")).toBe(-300_000);
    expect(ligne(flux, "ZD")).toBe(3_100_000);
    expect(ligne(flux, "FO")).toBe(5_000_000);
    expect(ligne(flux, "FQ")).toBe(-1_000_000);
    expect(ligne(flux, "ZE")).toBe(4_000_000);
    expect(ligne(flux, "ZF")).toBe(7_100_000);
    expect(ligne(flux, "ZG")).toBe(6_845_000);
    expect(variationReelle(flux)).toBe(6_845_000);
    expect(flux.ecart).toBe(0);
  });

  it("une dépréciation de créance à court terme reste dans la CAFG et dans la variation des créances", () => {
    const pieces: Piece[] = [
      { date: "2026-02-01", lignes: [["411", 500_000, 0], ["701", 0, 500_000]] },
      { date: "2026-12-31", lignes: [["6594", 50_000, 0], ["491", 0, 50_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));
    expect(ligne(flux, "FA")).toBe(450_000);
    expect(ligne(flux, "FD")).toBe(-450_000);
    expect(ligne(flux, "ZG")).toBe(0);
    expect(flux.ecart).toBe(0);
  });

  it("un fournisseur payé au-delà de sa facture passe des dettes aux créances", () => {
    const pieces: Piece[] = [
      { date: "2025-01-05", lignes: [["5211", 1_000_000, 0], ["101", 0, 1_000_000]] },
      { date: "2025-11-01", lignes: [["601", 100_000, 0], ["401", 0, 100_000]] },
      { date: "2026-01-20", lignes: [["401", 150_000, 0], ["5211", 0, 150_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));
    expect(ligne(flux, "FD")).toBe(-50_000);
    expect(ligne(flux, "FE")).toBe(-100_000);
    expect(ligne(flux, "ZG")).toBe(-150_000);
    expect(flux.ecart).toBe(0);
  });

  it("un découvert bancaire diminue la trésorerie nette au lieu d'être une dette financière", () => {
    const pieces: Piece[] = [
      { date: "2026-03-01", lignes: [["661", 300_000, 0], ["5211", 0, 300_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));
    expect(ligne(flux, "ZG")).toBe(-300_000);
    expect(ligne(flux, "ZH")).toBe(-300_000);
    expect(flux.tresorerieFin).toBe(-300_000);
    expect(flux.ecart).toBe(0);
  });

  it("signale l'écart d'un mouvement qu'aucune ligne ne classe, au lieu de le cacher", () => {
    const pieces: Piece[] = [
      { date: "2025-01-05", lignes: [["5211", 1_000_000, 0], ["101", 0, 1_000_000]] },
      // Charges immobilisées (ancien plan) : hors du modèle.
      { date: "2026-02-01", lignes: [["201", 100_000, 0], ["5211", 0, 100_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));
    expect(variationReelle(flux)).toBe(-100_000);
    expect(ligne(flux, "ZG")).toBe(0);
    expect(flux.ecart).toBe(-100_000);
  });

  it("ignore l'écriture de clôture, qui ne touche pas la trésorerie", () => {
    const pieces: Piece[] = [
      { date: "2026-05-01", lignes: [["5211", 800_000, 0], ["701", 0, 800_000]] },
      { date: "2026-12-31", cloture: true, lignes: [["701", 800_000, 0], ["131", 0, 800_000]] },
    ];
    const flux = calculerFluxTresorerie(donnees(pieces, "2026"));
    expect(ligne(flux, "FA")).toBe(800_000);
    expect(ligne(flux, "ZD")).toBe(0);
    expect(flux.ecart).toBe(0);
  });

  it("reconnaît une écriture de cession à sa valeur comptable sortie (81 ou 654)", () => {
    expect(estEcritureDeCession(["2844", "812", "2441"])).toBe(true);
    expect(estEcritureDeCession(["2844", "6541", "2441"])).toBe(true);
    expect(estEcritureDeCession(["2441", "251"])).toBe(false);
  });
});
