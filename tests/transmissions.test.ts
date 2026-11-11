import { describe, expect, it } from "vitest";

import { DROITS_DE_TOUS, presetRole } from "@/lib/droits/catalogue";
import { avisDensemble, bientotDu, enRetard, formatNumero, normaliserPieces, passagePermis, relanceDue, statutInitial, totalExemplaires } from "@/modules/transmissions/regles";

describe("bordereaux", () => {
  it("numérote BT-AAAA, naît au bon statut selon le sens", () => {
    expect(formatNumero(2026).prefix).toBe("BT-2026-");
    expect(statutInitial("interne", false)).toBe("transmise");
    expect(statutInitial("sortante", false)).toBe("a_transmettre");
    expect(statutInitial("sortante", true)).toBe("transmise");
    expect(statutInitial("entrante", false)).toBe("attendue");
    expect(statutInitial("entrante", true)).toBe("recue");
  });

  it("suit l'ordre de chaque sens", () => {
    expect(passagePermis("interne", "transmise", "accusee")).toBe(true);
    expect(passagePermis("interne", "transmise", "traitee")).toBe(false);
    expect(passagePermis("sortante", "a_transmettre", "transmise")).toBe(true);
    expect(passagePermis("sortante", "transmise", "traitee")).toBe(true);
    expect(passagePermis("entrante", "attendue", "traitee")).toBe(false);
    expect(passagePermis("entrante", "recue", "traitee")).toBe(true);
    expect(passagePermis("entrante", "traitee", "annulee")).toBe(false);
  });

  it("nettoie les pièces et refuse un bordereau vide", () => {
    const pieces = normaliserPieces([{ designation: " Plan de masse ", indice: "b", exemplaires: 3, original: true }, { designation: "" }, { designation: "Note de calcul", exemplaires: 1 }]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ designation: "Plan de masse", indice: "B", exemplaires: 3, original: true, avis: null });
    expect(totalExemplaires(pieces)).toBe(4);
    expect(() => normaliserPieces([])).toThrow(/au moins une pièce/);
    expect(() => normaliserPieces([{ designation: "x", exemplaires: 0 }])).toThrow(/exemplaires/);
  });

  it("retient l'avis le plus sévère du lot", () => {
    expect(avisDensemble([{ avis: "bon_pour_execution" }, { avis: "vise_observations" }])).toBe("vise_observations");
    expect(avisDensemble([{ avis: "bon_pour_execution" }, { avis: "refuse" }])).toBe("refuse");
    expect(avisDensemble([{ avis: null }])).toBeNull();
  });
});

describe("obligations", () => {
  const due = { statut: "attendue" as const, dateLimite: "2026-11-10", derniereRelanceLe: null };
  it("est en retard le lendemain, bientôt due dans les trois jours", () => {
    expect(enRetard(due, "2026-11-10")).toBe(false);
    expect(enRetard(due, "2026-11-11")).toBe(true);
    expect(enRetard({ ...due, statut: "recue" }, "2026-11-20")).toBe(false);
    expect(bientotDu({ ...due, dateLimite: "2026-11-13" }, "2026-11-10")).toBe(true);
    expect(bientotDu({ ...due, dateLimite: "2026-11-14" }, "2026-11-10")).toBe(false);
  });
  it("relance une fois par jour", () => {
    const m = new Date("2026-11-12T09:00:00Z");
    expect(relanceDue(due, "2026-11-12", m)).toBe(true);
    expect(relanceDue({ ...due, derniereRelanceLe: new Date("2026-11-12T06:00:00Z") }, "2026-11-12", m)).toBe(false);
  });
  it("ouvre la réception à tous, l'émission aux métiers", () => {
    expect(DROITS_DE_TOUS).toContain("transmissions.recevoir");
    expect(presetRole("secretaire")!.droits).toContain("transmissions.emettre");
    expect(presetRole("secretaire")!.droits).not.toContain("transmissions.superviser");
  });
});
