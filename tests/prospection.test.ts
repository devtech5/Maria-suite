import { describe, expect, it } from "vitest";

import { PRESETS_ROLES, resoudreDroits } from "@/lib/droits/catalogue";
import { GROUPES_MODULES } from "@/lib/navigation";
import { actionEnRetard, atteinte, bilanPlan, convertible, erreurPeriode, formatNumero, passagePermis } from "@/modules/prospection/regles";
import { NATURES_TIERS, estPersonneMorale, natureDepuisSaisie } from "@/modules/tiers/natures";

/**
 * Prospection et types de client. Ce qui compte : un bilan juste (des
 * entiers, jamais un taux flottant), un prospect converti qui ne revient
 * pas en arrière, et un type de client reconnu à l'import.
 */

describe("types de client", () => {
  it("garde l'ordre de l'énumération en base : les nouveaux types à la fin", () => {
    expect(NATURES_TIERS.slice(0, 2)).toEqual(["entreprise", "particulier"]);
    expect(NATURES_TIERS).toHaveLength(6);
  });

  it("reconnaît le type dans une saisie libre", () => {
    expect(natureDepuisSaisie("Particulier")).toBe("particulier");
    expect(natureDepuisSaisie("personne physique")).toBe("particulier");
    expect(natureDepuisSaisie("ONG")).toBe("ong");
    expect(natureDepuisSaisie("Mutuelle de santé")).toBe("mutuelle");
    expect(natureDepuisSaisie("Association")).toBe("association");
    expect(natureDepuisSaisie("Coopérative")).toBe("cooperative");
    expect(natureDepuisSaisie("SCOOPS Anouanzè")).toBe("cooperative");
    expect(natureDepuisSaisie("SARL")).toBe("entreprise");
    expect(natureDepuisSaisie("")).toBe("entreprise");
  });

  it("donne des contacts à toute personne morale, pas au particulier", () => {
    expect(estPersonneMorale("particulier")).toBe(false);
    for (const n of NATURES_TIERS.filter((x) => x !== "particulier")) expect(estPersonneMorale(n)).toBe(true);
  });
});

describe("plan de prospection", () => {
  it("refuse une période à l'envers ou de plus d'un an", () => {
    expect(erreurPeriode("2026-12-01", "2026-12-31")).toBeNull();
    expect(erreurPeriode("2026-12-31", "2026-12-01")).toMatch(/précède/);
    expect(erreurPeriode("2026-01-01", "2027-01-02")).toMatch(/un an/);
    expect(erreurPeriode("2026-02-30", "2026-03-10")).not.toBeNull();
    expect(erreurPeriode("", "2026-03-10")).not.toBeNull();
  });

  it("numérote PP-AAAA-NNNNN", () => {
    expect(formatNumero(2026)).toMatchObject({ prefix: "PP-2026-", padding: 5, cle: "prospection" });
  });

  it("ne fait jamais revenir un client converti, rouvre une piste perdue", () => {
    expect(passagePermis("converti", "a_contacter")).toBe(false);
    expect(passagePermis("perdu", "a_contacter")).toBe(true);
    expect(passagePermis("perdu", "interesse")).toBe(false);
    expect(passagePermis("a_contacter", "interesse")).toBe(true);
    expect(convertible("interesse")).toBe(true);
    expect(convertible("perdu")).toBe(false);
  });

  it("fait le bilan en entiers", () => {
    const b = bilanPlan(
      [
        { statut: "converti", nature: "mutuelle", potentiel: 1_500_000 },
        { statut: "interesse", nature: "cooperative", potentiel: 800_000 },
        { statut: "perdu", nature: "ong", potentiel: 2_000_000 },
      ],
      [
        { statut: "realisee", datePrevue: "2026-11-02" },
        { statut: "prevue", datePrevue: "2026-11-10" },
        { statut: "prevue", datePrevue: "2026-11-20" },
        { statut: "annulee", datePrevue: "2026-11-01" },
      ],
      "2026-11-12",
    );
    expect(b).toMatchObject({ prospects: 3, convertis: 1, tauxConversion: 33, actionsRealisees: 1, actionsPrevues: 2, actionsEnRetard: 1, potentielOuvert: 800_000, potentielGagne: 1_500_000 });
    expect(b.parNature).toEqual({ mutuelle: 1, cooperative: 1, ong: 1 });
    expect(Number.isInteger(b.tauxConversion)).toBe(true);
  });

  it("mesure l'atteinte d'un objectif, plafonnée, nulle sans objectif", () => {
    expect(atteinte(2, 3)).toBe(66);
    expect(atteinte(5, 3)).toBe(100);
    expect(atteinte(4, 0)).toBeNull();
  });

  it("ne compte en retard qu'une action prévue d'avant aujourd'hui", () => {
    expect(actionEnRetard({ statut: "prevue", datePrevue: "2026-11-11" }, "2026-11-12")).toBe(true);
    expect(actionEnRetard({ statut: "prevue", datePrevue: "2026-11-12" }, "2026-11-12")).toBe(false);
    expect(actionEnRetard({ statut: "realisee", datePrevue: "2026-11-01" }, "2026-11-12")).toBe(false);
  });
});

describe("droits et menu", () => {
  it("donne au commercial son plan et l'enregistrement des clients, pas l'encaissement", () => {
    expect(PRESETS_ROLES.some((p) => p.cle === "commercial")).toBe(true);
    const commercial = resoudreDroits({ cleRole: "commercial", estProprietaire: false });
    expect(commercial.has("commercial.prospection.planifier")).toBe(true);
    expect(commercial.has("tiers.fiche.gerer")).toBe(true);
    expect(commercial.has("commercial.prospection.superviser")).toBe(false);
    expect(commercial.has("commercial.reglement.encaisser")).toBe(false);
  });

  it("n'a plus d'entrée « Mes visiteurs » : la tuile Visiteurs ouvre les rendez-vous", () => {
    const entrees = GROUPES_MODULES.flatMap((g) => g.modules);
    expect(entrees.some((m) => m.libelle === "Mes visiteurs")).toBe(false);
    expect(entrees.find((m) => m.href === "/visiteurs")?.droit).toBe("visiteurs.annoncer");
    expect(entrees.find((m) => m.href === "/commercial/prospection")?.droit).toBe("commercial.prospection.planifier");
  });
});
