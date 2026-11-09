import { describe, expect, it } from "vitest";

import {
  clePoste,
  motifRefusLibellePoste,
  normaliserLibellePoste,
  optionsPoste,
  POSTES_DE_DEPART,
  posteRetenu,
} from "@/modules/personnes/postes";

describe("postes de travail", () => {
  it("la liste de départ est celle de la direction, sans doublon", () => {
    expect(POSTES_DE_DEPART).toHaveLength(25);
    expect(POSTES_DE_DEPART[0]).toBe("Assistant(e)");
    expect(POSTES_DE_DEPART[11]).toBe("Gardien");
    expect(POSTES_DE_DEPART.at(-1)).toBe("Technicien(ne) biomédical(e)");
    expect(new Set(POSTES_DE_DEPART.map(clePoste)).size).toBe(POSTES_DE_DEPART.length);
  });

  it("normalise les espaces et compare sans la casse", () => {
    expect(normaliserLibellePoste("  Chef   de\tprojet ")).toBe("Chef de projet");
    expect(clePoste(" RÉCEPTIONNISTE")).toBe(clePoste("réceptionniste"));
  });

  it("refuse un libellé vide, trop long ou déjà pris", () => {
    expect(motifRefusLibellePoste(" ", [])).toMatch(/Indiquez/);
    expect(motifRefusLibellePoste("x".repeat(81), [])).toMatch(/80 caractères/);
    expect(motifRefusLibellePoste("comptable ", ["Comptable"])).toMatch(/existe déjà/);
    expect(motifRefusLibellePoste("Chauffeur", ["Comptable"])).toBeNull();
  });

  it("garde le poste actuel d'une fiche même hors de la liste", () => {
    const actifs = ["Comptable", "Gardien"];
    expect(optionsPoste(actifs, "Magasinier")).toEqual(["Magasinier", "Comptable", "Gardien"]);
    expect(optionsPoste(actifs, "gardien")).toEqual(actifs);
    expect(optionsPoste(actifs, null)).toEqual(actifs);
  });

  it("ne retient qu'un poste de la liste, sous son libellé exact", () => {
    const actifs = ["Comptable", "Chef de projet"];
    expect(posteRetenu("chef de  projet", actifs)).toBe("Chef de projet");
    expect(posteRetenu("Magasinier", actifs)).toBeNull();
    expect(posteRetenu("Magasinier", actifs, "Magasinier")).toBe("Magasinier");
    expect(posteRetenu("", actifs)).toBeNull();
  });
});
