import { describe, expect, it } from "vitest";

import { choixValides, corpsDuGenre, depouillerEvenement, depouillerSondage, validerEvenement, validerSondage } from "@/modules/messagerie/genres";

describe("sondage", () => {
  it("exige une question et deux réponses différentes", () => {
    expect(validerSondage({ question: "Où déjeuner ?", options: ["Maquis", "maquis", " "] })).toHaveProperty("erreur");
    expect(validerSondage({ question: "?", options: ["a", "b"] })).toHaveProperty("erreur");
    expect(validerSondage({ question: "Où déjeuner ?", options: ["Maquis", "Cantine ", "Maquis"], multiple: true })).toEqual({
      question: "Où déjeuner ?",
      options: ["Maquis", "Cantine"],
      multiple: true,
    });
  });

  it("limite à douze réponses", () => {
    const options = Array.from({ length: 13 }, (_, i) => `Choix ${i}`);
    expect(validerSondage({ question: "Trop ?", options })).toHaveProperty("erreur");
  });

  it("dépouille en entiers, une part du nombre de votants", () => {
    const r = depouillerSondage(
      ["A", "B", "C"],
      [
        { userId: "u1", valeur: "0" },
        { userId: "u2", valeur: "0" },
        { userId: "u3", valeur: "1" },
      ],
      "u3",
    );
    expect(r.votants).toBe(3);
    expect(r.options.map((o) => o.part)).toEqual([66, 33, 0]);
    expect(r.options.map((o) => o.moi)).toEqual([false, true, false]);
    expect(depouillerSondage(["A", "B"], [], "u1").options[0].part).toBe(0);
  });

  it("un électeur à choix multiple compte une fois dans les votants", () => {
    const r = depouillerSondage(["A", "B"], [{ userId: "u1", valeur: "0" }, { userId: "u1", valeur: "1" }], "u1");
    expect(r.votants).toBe(1);
    expect(r.options.map((o) => o.part)).toEqual([100, 100]);
  });

  it("refuse une réponse hors liste et plusieurs réponses sans choix multiple", () => {
    expect(choixValides([5], 3, false)).toHaveProperty("erreur");
    expect(choixValides([0, 1], 3, false)).toHaveProperty("erreur");
    expect(choixValides([0, 1], 3, true)).toEqual([0, 1]);
    expect(choixValides([], 3, false)).toEqual([]);
  });
});

describe("événement", () => {
  it("valide titre, jour réel et heure", () => {
    expect(validerEvenement({ titre: "Réunion", date: "2026-02-30" })).toHaveProperty("erreur");
    expect(validerEvenement({ titre: "Ré", date: "2026-03-01" })).toHaveProperty("erreur");
    expect(validerEvenement({ titre: "Réunion", date: "2026-03-01", heure: "25:00" })).toHaveProperty("erreur");
    expect(validerEvenement({ titre: "Réunion", date: "2026-03-01", heure: "09:30", lieu: " Siège ", description: "" })).toEqual({
      titre: "Réunion",
      date: "2026-03-01",
      heure: "09:30",
      lieu: "Siège",
      description: null,
    });
  });

  it("compte les réponses et retrouve la sienne", () => {
    const r = depouillerEvenement(
      [
        { userId: "u1", valeur: "oui" },
        { userId: "u2", valeur: "non" },
        { userId: "u3", valeur: "oui" },
      ],
      "u2",
    );
    expect(r).toEqual({ oui: 2, peutEtre: 0, non: 1, moi: "non" });
  });
});

describe("aperçu des genres", () => {
  it("garde un corps lisible", () => {
    expect(corpsDuGenre("sondage", { question: "Où ?", options: [], multiple: false })).toBe("📊 Où ?");
    expect(corpsDuGenre("evenement", { titre: "Réunion", date: "2026-03-01", heure: null, lieu: null, description: null })).toBe("📅 Réunion");
    expect(corpsDuGenre("contact", { userId: "u", nom: "Awa Koné" })).toBe("👤 Awa Koné");
  });
});
