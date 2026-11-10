import { describe, expect, it } from "vitest";

import {
  annonceDuJour,
  anniversairesAVenir,
  anniversairesDuMois,
  dateLisible,
  jourEtMois,
  prochainAnniversaire,
  quandAnniversaire,
  RAPPEL_JOURS,
} from "@/modules/personnes/anniversaires";

describe("prochain anniversaire", () => {
  it("compte aujourd'hui, l'âge atteint et les jours d'ici là", () => {
    expect(prochainAnniversaire("1990-11-10", "2026-11-10")).toEqual({ jour: "2026-11-10", dans: 0, age: 36 });
    expect(prochainAnniversaire("1990-11-12", "2026-11-10")).toEqual({ jour: "2026-11-12", dans: 2, age: 36 });
  });

  it("passe à l'année suivante une fois la date passée, fin d'année comprise", () => {
    expect(prochainAnniversaire("1985-11-09", "2026-11-10")).toEqual({ jour: "2027-11-09", dans: 364, age: 42 });
    expect(prochainAnniversaire("2000-01-02", "2026-12-30")).toEqual({ jour: "2027-01-02", dans: 3, age: 27 });
  });

  it("fête un 29 février le 28 les années non bissextiles, le 29 sinon", () => {
    expect(prochainAnniversaire("1996-02-29", "2027-02-01")).toEqual({ jour: "2027-02-28", dans: 27, age: 31 });
    expect(prochainAnniversaire("1996-02-29", "2028-02-01")).toEqual({ jour: "2028-02-29", dans: 28, age: 32 });
    expect(prochainAnniversaire("1996-02-29", "2027-02-28")?.dans).toBe(0);
  });

  it("ignore une date illisible ou à venir", () => {
    expect(prochainAnniversaire(null, "2026-11-10")).toBeNull();
    expect(prochainAnniversaire("10/11/1990", "2026-11-10")).toBeNull();
    expect(prochainAnniversaire("2027-01-01", "2026-11-10")).toBeNull();
  });
});

describe("liste et calendrier", () => {
  const equipe = [
    { id: "a", nom: "Yao Kouassi", dateNaissance: "1988-11-20" },
    { id: "b", nom: "Awa Koné", dateNaissance: "1992-11-10" },
    { id: "c", nom: "Adjoua Bamba", dateNaissance: "1990-11-20" },
    { id: "d", nom: "Sans date", dateNaissance: null },
    { id: "e", nom: "Loin", dateNaissance: "1980-06-01" },
  ];

  it("range les anniversaires à venir du plus proche au plus lointain, puis par nom", () => {
    const prochains = anniversairesAVenir(equipe, "2026-11-10", 31);
    expect(prochains.map((p) => [p.nom, p.dans])).toEqual([
      ["Awa Koné", 0],
      ["Adjoua Bamba", 10],
      ["Yao Kouassi", 10],
    ]);
  });

  it("place chaque anniversaire du mois sur son jour", () => {
    const mois = anniversairesDuMois(equipe, "2026-11");
    expect([...mois.keys()].sort()).toEqual(["2026-11-10", "2026-11-20"]);
    expect(mois.get("2026-11-20")!.map((p) => p.nom)).toEqual(["Yao Kouassi", "Adjoua Bamba"]);
    expect(anniversairesDuMois([{ id: "x", nom: "Bissextile", dateNaissance: "1996-02-29" }], "2027-02").get("2027-02-28")).toHaveLength(1);
    // Pas d'anniversaire avant la naissance.
    expect(anniversairesDuMois([{ id: "y", nom: "Bébé", dateNaissance: "2026-12-05" }], "2026-11").size).toBe(0);
  });
});

describe("annonces", () => {
  it("annonce le jour même, rappelle dans la semaine qui précède, se tait au-delà", () => {
    expect(annonceDuJour({ jour: "2026-11-10", dans: 0, age: 30 })).toBe("jour");
    expect(annonceDuJour({ jour: "2026-11-11", dans: 1, age: 30 })).toBe("rappel");
    expect(annonceDuJour({ jour: "2026-11-17", dans: RAPPEL_JOURS, age: 30 })).toBe("rappel");
    expect(annonceDuJour({ jour: "2026-11-18", dans: RAPPEL_JOURS + 1, age: 30 })).toBeNull();
    expect(annonceDuJour(null)).toBeNull();
  });

  it("dit quand, en mots", () => {
    expect(quandAnniversaire({ jour: "2026-11-10", dans: 0 })).toBe("aujourd'hui");
    expect(quandAnniversaire({ jour: "2026-11-11", dans: 1 })).toBe("demain");
    expect(quandAnniversaire({ jour: "2026-11-12", dans: 2 })).toBe("jeudi (dans 2 jours)");
    expect(quandAnniversaire({ jour: "2026-11-20", dans: 10 })).toBe("vendredi 20 novembre");
    expect(dateLisible("2027-02-28")).toBe("dimanche 28 février");
    expect(jourEtMois("1990-03-01")).toBe("1 mars");
  });
});
