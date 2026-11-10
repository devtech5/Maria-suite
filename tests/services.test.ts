import { describe, expect, it } from "vitest";

import { clePoste, POSTES_DE_DEPART } from "@/modules/personnes/postes";
import {
  cleService,
  LISTE_POLES,
  motifRefusLibelleService,
  normaliserCodeService,
  optionsService,
  serviceDuPoste,
  SERVICES_DE_DEPART,
} from "@/modules/personnes/services";

describe("services de l'entreprise", () => {
  it("range chaque poste de départ dans un seul service", () => {
    for (const poste of POSTES_DE_DEPART) {
      const siens = SERVICES_DE_DEPART.filter((s) => s.postes.some((p) => clePoste(p) === clePoste(poste)));
      expect(siens, poste).toHaveLength(1);
    }
    const ranges = SERVICES_DE_DEPART.flatMap((s) => s.postes);
    expect(ranges).toHaveLength(POSTES_DE_DEPART.length);
  });

  it("couvre la direction, les fonctions support et chaque métier exercé", () => {
    for (const pole of LISTE_POLES) expect(SERVICES_DE_DEPART.some((s) => s.pole === pole), pole).toBe(true);
    const metiers = SERVICES_DE_DEPART.filter((s) => s.pole === "metiers").map((s) => s.code);
    expect(metiers).toEqual(["CEV", "BET", "TRV", "CTL", "IMM", "MIN", "IPF"]);
  });

  it("n'a ni libellé ni sigle en double", () => {
    expect(new Set(SERVICES_DE_DEPART.map((s) => cleService(s.libelle))).size).toBe(SERVICES_DE_DEPART.length);
    expect(new Set(SERVICES_DE_DEPART.map((s) => s.code)).size).toBe(SERVICES_DE_DEPART.length);
    for (const s of SERVICES_DE_DEPART) expect(normaliserCodeService(s.code)).toBe(s.code);
  });

  it("retrouve le service d'un poste sans tenir compte de la casse", () => {
    expect(serviceDuPoste("comptable")?.code).toBe("DAF");
    expect(serviceDuPoste("Géologue")?.code).toBe("MIN");
    expect(serviceDuPoste("Poste inconnu")).toBeUndefined();
  });

  it("normalise le sigle et refuse un libellé vide ou déjà pris", () => {
    expect(normaliserCodeService(" q.h.s.e ")).toBe("QHSE");
    expect(normaliserCodeService("très-long-sigle")).toBe("TRÈS-LON");
    expect(motifRefusLibelleService(" ", [])).toMatch(/Indiquez/);
    expect(motifRefusLibelleService("ressources  humaines", ["Ressources humaines"])).toMatch(/existe déjà/);
    expect(motifRefusLibelleService("Logistique", ["Ressources humaines"])).toBeNull();
  });

  it("garde le service actuel d'une fiche même hors de la liste", () => {
    expect(optionsService(["Informatique"], "Chantier de Cocody")).toEqual(["Chantier de Cocody", "Informatique"]);
    expect(optionsService(["Informatique"], "informatique")).toEqual(["Informatique"]);
    expect(optionsService(["Informatique"], null)).toEqual(["Informatique"]);
  });
});
