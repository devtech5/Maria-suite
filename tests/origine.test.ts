import { describe, expect, it } from "vitest";

import { PAYS_PROPOSES, nomPays, origineDe, paysPourOrigine } from "@/modules/tiers/origine";

/**
 * Local ou international : déduit du pays du tiers, jamais saisi deux fois.
 * Ce qui compte : un étranger n'est jamais enregistré sans pays, et un
 * fournisseur du pays de l'entreprise ne passe pas pour international.
 */

describe("origine d'un tiers", () => {
  it("est locale sans pays, ou avec celui de l'entreprise", () => {
    expect(origineDe(null, "CI")).toBe("local");
    expect(origineDe("", "CI")).toBe("local");
    expect(origineDe("ci", "CI")).toBe("local");
  });

  it("est internationale dans tout autre pays", () => {
    expect(origineDe("FR", "CI")).toBe("international");
    expect(origineDe("CI", "SN")).toBe("international");
  });

  it("enregistre un local sans pays, quoi qu'on ait choisi", () => {
    expect(paysPourOrigine("local", "FR", "CI")).toEqual({ paysCode: null });
  });

  it("exige un pays connu pour un international", () => {
    expect(paysPourOrigine("international", "fr", "CI")).toEqual({ paysCode: "FR" });
    expect(paysPourOrigine("international", "", "CI")).toHaveProperty("erreur");
    expect(paysPourOrigine("international", undefined, "CI")).toHaveProperty("erreur");
    expect(paysPourOrigine("international", "ZZ", "CI")).toHaveProperty("erreur");
  });

  it("refuse un « international » du pays de l'entreprise", () => {
    expect(paysPourOrigine("international", "CI", "CI")).toHaveProperty("erreur");
  });

  it("ne propose que des codes pays valides, sans doublon", () => {
    expect(new Set(PAYS_PROPOSES).size).toBe(PAYS_PROPOSES.length);
    for (const code of PAYS_PROPOSES) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("nomme les pays en français", () => {
    expect(nomPays("CI")).toMatch(/Ivoire/);
    expect(nomPays("FR")).toBe("France");
    expect(nomPays(null)).toBe("");
  });
});
