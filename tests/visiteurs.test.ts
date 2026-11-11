import { describe, expect, it } from "vitest";

import { presetRole } from "@/lib/droits/catalogue";
import { dureeLisible, dureeMinutes, effacementDes, initiales, passagePermis, photosEchues, refusSaisie } from "@/modules/visiteurs/regles";

/**
 * Visiteurs. Ce qui compte : que les photos d'identité s'effacent au bon
 * jour — ni trop tôt, ni jamais — et qu'une visite ne saute pas d'étape.
 */

const d = (iso: string) => new Date(iso);

describe("conservation des photos", () => {
  it("efface trois mois civils après la visite", () => {
    expect(effacementDes(d("2026-11-10T09:30:00Z")).toISOString()).toBe("2027-02-10T09:30:00.000Z");
  });

  it("ramène au dernier jour d'un mois plus court", () => {
    expect(effacementDes(d("2026-11-30T08:00:00Z")).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(effacementDes(d("2027-11-30T08:00:00Z")).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(effacementDes(d("2026-05-31T08:00:00Z")).toISOString().slice(0, 10)).toBe("2026-08-31");
  });

  it("dit si les photos sont échues", () => {
    const visite = d("2026-08-10T10:00:00Z");
    expect(photosEchues(visite, d("2026-11-10T09:59:59Z"))).toBe(false);
    expect(photosEchues(visite, d("2026-11-10T10:00:00Z"))).toBe(true);
  });
});

describe("statuts d'une visite", () => {
  it("suit attendue, présente, sortie — ou annulée", () => {
    expect(passagePermis("attendue", "presente")).toBe(true);
    expect(passagePermis("attendue", "annulee")).toBe(true);
    expect(passagePermis("presente", "sortie")).toBe(true);
  });

  it("ne revient jamais en arrière et ne saute pas l'arrivée", () => {
    expect(passagePermis("attendue", "sortie")).toBe(false);
    expect(passagePermis("sortie", "presente")).toBe(false);
    expect(passagePermis("presente", "annulee")).toBe(false);
    expect(passagePermis("annulee", "presente")).toBe(false);
  });
});

describe("saisie", () => {
  const base = { nom: "Awa Koné", telephone: "", societe: "", motif: "Rendez-vous", typePiece: "cni", numeroPiece: "C0012345" };

  it("exige la pièce à l'arrivée quand l'accueil l'impose", () => {
    expect(refusSaisie(base, { pieceExigee: true })).toBeNull();
    expect(refusSaisie({ ...base, numeroPiece: "" }, { pieceExigee: true })).toMatch(/numéro de la pièce/);
    expect(refusSaisie({ ...base, typePiece: "carte-de-fidelite" }, { pieceExigee: true })).toMatch(/pièce d'identité/);
    expect(refusSaisie({ ...base, typePiece: "", numeroPiece: "" }, { pieceExigee: false })).toBeNull();
  });

  it("exige un nom et un motif", () => {
    expect(refusSaisie({ ...base, nom: " " }, { pieceExigee: false })).toMatch(/nom/);
    expect(refusSaisie({ ...base, motif: "" }, { pieceExigee: false })).toMatch(/motif/);
  });
});

describe("affichage", () => {
  it("compte la durée en minutes entières, jusqu'à maintenant tant qu'on n'est pas sorti", () => {
    expect(dureeMinutes(d("2026-11-10T09:00:00Z"), d("2026-11-10T10:05:59Z"), d("2026-11-10T12:00:00Z"))).toBe(65);
    expect(dureeMinutes(d("2026-11-10T09:00:00Z"), null, d("2026-11-10T09:45:00Z"))).toBe(45);
    expect(dureeLisible(45)).toBe("45 min");
    expect(dureeLisible(125)).toBe("2 h 05");
    expect(initiales("Awa Marie Koné")).toBe("AM");
  });
});

describe("droits des visiteurs", () => {
  it("donne l'accueil au secrétariat, l'annonce aux métiers, la supervision à la direction", () => {
    expect(presetRole("secretaire")!.droits).toContain("visiteurs.accueillir");
    expect(presetRole("secretaire")!.droits).not.toContain("visiteurs.superviser");
    expect(presetRole("comptable")!.droits).toContain("visiteurs.annoncer");
    expect(presetRole("comptable")!.droits).not.toContain("visiteurs.accueillir");
    expect(presetRole("gerant")!.droits).toContain("visiteurs.superviser");
  });
});
