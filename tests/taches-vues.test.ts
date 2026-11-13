import { describe, expect, it } from "vitest";

import {
  ajouterJours,
  deplacerEcheance,
  ecartJours,
  gesteVers,
  grilleMois,
  initiales,
  intervalleTache,
  lireAffichage,
  lundiDe,
  moisVoisin,
  plageFrise,
  rangerEnCouloirs,
  regrouper,
  repartitionStatuts,
  trancheEcheance,
  type Regroupable,
} from "@/modules/taches/vues";

const tache = (p: Partial<Regroupable> = {}): Regroupable => ({
  statut: "a_faire",
  priorite: "normale",
  echeance: null,
  assignee: "Awa Koné",
  ...p,
});

describe("affichage demandé", () => {
  it("retombe sur le tableur pour une valeur inconnue", () => {
    expect(lireAffichage("kanban")).toBe("kanban");
    expect(lireAffichage("toString")).toBe("tableur");
    expect(lireAffichage(undefined)).toBe("tableur");
  });
});

describe("Kanban : passage d'une colonne à l'autre", () => {
  it("traduit le dépôt en geste", () => {
    expect(gesteVers("a_faire", "en_cours")).toBe("demarrer");
    expect(gesteVers("en_cours", "terminee")).toBe("terminer");
    expect(gesteVers("a_faire", "terminee")).toBe("terminer");
    expect(gesteVers("terminee", "a_faire")).toBe("rouvrir");
    expect(gesteVers("annulee", "a_faire")).toBe("rouvrir");
    expect(gesteVers("en_cours", "annulee")).toBe("annuler");
  });

  it("refuse les passages qui n'existent pas", () => {
    expect(gesteVers("en_cours", "a_faire")).toBeNull();
    expect(gesteVers("annulee", "terminee")).toBeNull();
    expect(gesteVers("terminee", "en_cours")).toBeNull();
    expect(gesteVers("a_faire", "a_faire")).toBeNull();
  });
});

describe("jours", () => {
  it("compte en jours entiers, à travers les mois et les années", () => {
    expect(ajouterJours("2026-12-30", 3)).toBe("2027-01-02");
    expect(ajouterJours("2028-03-01", -1)).toBe("2028-02-29");
    expect(ecartJours("2026-11-01", "2026-11-13")).toBe(12);
    expect(ecartJours("2026-11-13", "2026-11-01")).toBe(-12);
  });

  it("trouve le lundi de la semaine", () => {
    expect(lundiDe("2026-11-13")).toBe("2026-11-09"); // vendredi
    expect(lundiDe("2026-11-09")).toBe("2026-11-09");
    expect(lundiDe("2026-11-15")).toBe("2026-11-09"); // dimanche
  });

  it("passe d'un mois à l'autre, année comprise", () => {
    expect(moisVoisin("2026-12", 1)).toBe("2027-01");
    expect(moisVoisin("2026-01", -1)).toBe("2025-12");
  });

  it("dresse le calendrier en semaines entières du lundi au dimanche", () => {
    const novembre = grilleMois("2026-11");
    expect(novembre.length % 7).toBe(0);
    expect(novembre[0]).toEqual({ jour: "2026-10-26", duMois: false });
    expect(novembre.at(-1)).toEqual({ jour: "2026-12-06", duMois: false });
    expect(novembre.filter((c) => c.duMois)).toHaveLength(30);
    // Février 2027 commence un lundi et finit un dimanche : quatre rangées pile.
    expect(grilleMois("2027-02")).toHaveLength(28);
  });
});

describe("regroupement", () => {
  const aujourdhui = "2026-11-13"; // vendredi

  it("range par état, en cours d'abord, et garde les états ouverts même vides", () => {
    const groupes = regrouper([tache({ statut: "terminee" })], "statut", aujourdhui);
    expect(groupes.map((g) => [g.cle, g.taches.length])).toEqual([
      ["en_cours", 0],
      ["a_faire", 0],
      ["terminee", 1],
    ]);
  });

  it("range par échéance, le retard d'abord, la semaine jusqu'au dimanche", () => {
    expect(trancheEcheance(tache({ echeance: "2026-11-12" }), aujourdhui)).toBe("retard");
    expect(trancheEcheance(tache({ echeance: "2026-11-13" }), aujourdhui)).toBe("aujourdhui");
    expect(trancheEcheance(tache({ echeance: "2026-11-15" }), aujourdhui)).toBe("semaine");
    expect(trancheEcheance(tache({ echeance: "2026-11-16" }), aujourdhui)).toBe("plus-tard");
    expect(trancheEcheance(tache(), aujourdhui)).toBe("sans");
    expect(trancheEcheance(tache({ statut: "terminee", echeance: "2026-11-01" }), aujourdhui)).toBe("closes");

    const groupes = regrouper([tache(), tache({ echeance: "2026-11-01" })], "echeance", aujourdhui);
    expect(groupes.map((g) => g.cle)).toEqual(["retard", "sans"]);
  });

  it("range par responsable dans l'ordre alphabétique, et par priorité l'urgente d'abord", () => {
    const liste = [tache({ assignee: "Yao" }), tache({ assignee: "Awa", priorite: "urgente" }), tache({ assignee: "Éric" })];
    expect(regrouper(liste, "responsable", aujourdhui).map((g) => g.libelle)).toEqual(["Awa", "Éric", "Yao"]);
    expect(regrouper(liste, "priorite", aujourdhui).map((g) => g.cle)).toEqual(["urgente", "normale"]);
  });

  it("ne perd ni ne double aucune tâche", () => {
    const liste = [
      tache(),
      tache({ statut: "en_cours", echeance: "2026-11-20" }),
      tache({ statut: "annulee" }),
      tache({ priorite: "basse", echeance: "2026-11-02", assignee: "Yao" }),
    ];
    for (const critere of ["statut", "echeance", "responsable", "priorite"] as const) {
      expect(regrouper(liste, critere, aujourdhui).reduce((n, g) => n + g.taches.length, 0)).toBe(liste.length);
    }
  });

  it("compte chaque état du groupe", () => {
    expect(repartitionStatuts([tache(), tache(), tache({ statut: "terminee" })])).toEqual([
      { statut: "a_faire", nombre: 2 },
      { statut: "terminee", nombre: 1 },
    ]);
  });

  it("tire des initiales lisibles", () => {
    expect(initiales("Awa Koné")).toBe("AK");
    expect(initiales("Jean-Marc N'Guessan Kouadio")).toBe("JK");
    expect(initiales("Kouassi")).toBe("KO");
    expect(initiales("  ")).toBe("?");
  });
});

describe("frises : Gantt et Échéancier", () => {
  it("tire la période d'une tâche de son début et de son échéance", () => {
    expect(intervalleTache({ dateDebut: "2026-11-02", echeance: "2026-11-10" })).toEqual({ debut: "2026-11-02", fin: "2026-11-10" });
    expect(intervalleTache({ dateDebut: null, echeance: "2026-11-10" })).toEqual({ debut: "2026-11-10", fin: "2026-11-10" });
    expect(intervalleTache({ dateDebut: "2026-11-02", echeance: null })).toEqual({ debut: "2026-11-02", fin: "2026-11-02" });
    expect(intervalleTache({ dateDebut: null, echeance: null })).toBeNull();
  });

  it("cale la fenêtre du lundi au dimanche, aujourd'hui compris", () => {
    const plage = plageFrise([{ debut: "2026-12-20", fin: "2027-01-08" }], "2026-11-13");
    expect(plage.debut).toBe("2026-11-02");
    expect(plage.fin).toBe("2027-01-10");
    expect(ecartJours(plage.debut, plage.fin) + 1).toBeGreaterThanOrEqual(28);
  });

  it("range les barres en couloirs sans chevauchement", () => {
    const barres = [
      { debut: "2026-11-01", fin: "2026-11-05" },
      { debut: "2026-11-03", fin: "2026-11-04" },
      { debut: "2026-11-06", fin: "2026-11-08" },
      { debut: "2026-11-05", fin: "2026-11-05" },
    ];
    const { couloirs, nombre } = rangerEnCouloirs(barres);
    expect(nombre).toBe(2);
    expect(couloirs).toEqual([0, 1, 0, 1]);
    // Deux barres d'un même couloir ne se touchent jamais.
    for (let a = 0; a < barres.length; a++)
      for (let b = a + 1; b < barres.length; b++)
        if (couloirs[a] === couloirs[b]) expect(barres[a].fin < barres[b].debut || barres[b].fin < barres[a].debut).toBe(true);
  });

  it("reporte une tâche en gardant sa durée", () => {
    expect(deplacerEcheance({ dateDebut: "2026-11-02", echeance: "2026-11-06" }, "2026-11-13")).toEqual({
      dateDebut: "2026-11-09",
      echeance: "2026-11-13",
    });
    expect(deplacerEcheance({ dateDebut: null, echeance: "2026-11-06" }, "2026-11-13")).toEqual({ dateDebut: null, echeance: "2026-11-13" });
    expect(deplacerEcheance({ dateDebut: "2026-11-02", echeance: null }, "2026-11-13")).toEqual({
      dateDebut: "2026-11-13",
      echeance: "2026-11-13",
    });
  });
});
