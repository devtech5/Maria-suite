import { describe, expect, it } from "vitest";

import { DROITS_DE_TOUS, presetRole } from "@/lib/droits/catalogue";
import { CANAUX_PROPOSES, NOUVELLE_ENTITE, canalValide, enRetard, formatNumero, joursDeRetard, lireCanal, passagePermis, refusImputation, refusSaisie, relanceDue, statutInitial } from "@/modules/courrier/regles";

/**
 * Courrier. Ce qui compte : un registre sans trou, un pli qui ne saute pas
 * d'étape, et une relance qui part quand il faut — pas tous les quarts d'heure.
 */

describe("registre", () => {
  it("numérote CA à l'arrivée, CD au départ, par année", () => {
    expect(formatNumero("arrivee", 2026)).toEqual({ cle: "courrier:CA", prefix: "CA-2026-", padding: 5, periode: "2026" });
    expect(formatNumero("depart", 2027).prefix).toBe("CD-2027-");
    expect(statutInitial("arrivee")).toBe("enregistre");
    expect(statutInitial("depart")).toBe("a_expedier");
  });

  it("refuse un pli sans objet, sans correspondant, ou de nature inconnue", () => {
    const s = { objet: "Appel d'offres", correspondant: "Ministère", reference: "", nature: "lettre", canal: "coursier", dateDocument: "" };
    expect(refusSaisie(s, "arrivee")).toBeNull();
    expect(refusSaisie({ ...s, objet: "" }, "arrivee")).toMatch(/objet/);
    expect(refusSaisie({ ...s, correspondant: "" }, "arrivee")).toMatch(/expéditeur/);
    expect(refusSaisie({ ...s, correspondant: "" }, "depart")).toMatch(/destinataire/);
    expect(refusSaisie({ ...s, nature: "pigeon" }, "arrivee")).toMatch(/nature/);
    expect(refusSaisie({ ...s, dateDocument: "12/11/2026" }, "arrivee")).toMatch(/date/);
  });
});

describe("parcours d'un pli", () => {
  it("arrivée : enregistré, imputé, reçu, traité — réimputable avant la fin", () => {
    expect(passagePermis("enregistre", "impute")).toBe(true);
    expect(passagePermis("impute", "recu")).toBe(true);
    expect(passagePermis("recu", "traite")).toBe(true);
    expect(passagePermis("recu", "impute")).toBe(true);
    expect(passagePermis("enregistre", "traite")).toBe(false);
    expect(passagePermis("traite", "impute")).toBe(false);
  });

  it("départ : à expédier, expédié, remis", () => {
    expect(passagePermis("a_expedier", "expedie")).toBe(true);
    expect(passagePermis("expedie", "remis")).toBe(true);
    expect(passagePermis("a_expedier", "remis")).toBe(false);
    expect(passagePermis("a_expedier", "impute")).toBe(false);
  });

  it("impute à une personne, pour un délai qui n'est pas passé", () => {
    expect(refusImputation({ userId: null, delaiReponse: "", instructions: "" }, "2026-11-11")).toMatch(/personne/);
    expect(refusImputation({ userId: "u", delaiReponse: "2026-11-10", instructions: "" }, "2026-11-11")).toMatch(/passé/);
    expect(refusImputation({ userId: "u", delaiReponse: "2026-11-11", instructions: "Pour suite à donner" }, "2026-11-11")).toBeNull();
  });
});

describe("retards et relances", () => {
  const pli = { statut: "impute" as const, delaiReponse: "2026-11-10", derniereRelanceLe: null };

  it("est en retard le lendemain du délai, plus une fois traité", () => {
    expect(enRetard(pli, "2026-11-10")).toBe(false);
    expect(enRetard(pli, "2026-11-11")).toBe(true);
    expect(enRetard({ ...pli, statut: "traite" }, "2026-11-20")).toBe(false);
    expect(enRetard({ ...pli, delaiReponse: null }, "2026-11-20")).toBe(false);
    expect(joursDeRetard("2026-11-10", "2026-11-13")).toBe(3);
  });

  it("relance au plus une fois par jour", () => {
    const maintenant = new Date("2026-11-12T09:00:00Z");
    expect(relanceDue(pli, "2026-11-12", maintenant)).toBe(true);
    expect(relanceDue({ ...pli, derniereRelanceLe: new Date("2026-11-12T07:00:00Z") }, "2026-11-12", maintenant)).toBe(false);
    expect(relanceDue({ ...pli, derniereRelanceLe: new Date("2026-11-11T09:00:00Z") }, "2026-11-12", maintenant)).toBe(true);
  });
});

describe("droits du courrier", () => {
  it("donne le registre au secrétariat, l'imputation à la direction, la réception à tous", () => {
    expect(presetRole("secretaire")!.droits).toContain("courrier.enregistrer");
    expect(presetRole("secretaire")!.droits).not.toContain("courrier.imputer");
    expect(presetRole("gerant")!.droits).toContain("courrier.imputer");
    expect(DROITS_DE_TOUS).toContain("courrier.recevoir");
  });
});

describe("« Arrivé par » : Yango et les entités de livraison", () => {
  it("propose Yango dans la liste, et garde l'entité hors de la liste des canaux", () => {
    expect(CANAUX_PROPOSES.map(([cle]) => cle)).toContain("yango");
    expect(CANAUX_PROPOSES.map(([cle]) => cle)).not.toContain("entite");
    expect(canalValide("yango")).toBe(true);
  });

  it("rend le canal choisi tel quel", () => {
    expect(lireCanal("yango", "", [])).toEqual({ canal: "yango", transporteur: null });
    expect(lireCanal("poste", "", [])).toEqual({ canal: "poste", transporteur: null });
    expect(lireCanal("pigeon", "", [])).toHaveProperty("erreur");
    expect(lireCanal("entite", "", [])).toHaveProperty("erreur");
  });

  it("ajoute une entité nouvelle, avec son nom nettoyé", () => {
    expect(lireCanal(NOUVELLE_ENTITE, "  Glovo   Abidjan ", [])).toEqual({ canal: "entite", transporteur: "Glovo Abidjan" });
    expect(lireCanal(NOUVELLE_ENTITE, "", [])).toHaveProperty("erreur");
    expect(lireCanal(NOUVELLE_ENTITE, "x", [])).toHaveProperty("erreur");
    expect(lireCanal(NOUVELLE_ENTITE, "a".repeat(81), [])).toHaveProperty("erreur");
  });

  it("ne crée pas de doublon : un nom déjà canal rend ce canal, un nom connu garde son orthographe", () => {
    expect(lireCanal(NOUVELLE_ENTITE, "yango", [])).toEqual({ canal: "yango", transporteur: null });
    expect(lireCanal(NOUVELLE_ENTITE, "YANGO", [])).toEqual({ canal: "yango", transporteur: null });
    expect(lireCanal(NOUVELLE_ENTITE, "la poste", [])).toEqual({ canal: "poste", transporteur: null });
    expect(lireCanal(NOUVELLE_ENTITE, "glovo abidjan", ["Glovo Abidjan"])).toEqual({ canal: "entite", transporteur: "Glovo Abidjan" });
    expect(lireCanal("entite:Jumia", "", ["Jumia"])).toEqual({ canal: "entite", transporteur: "Jumia" });
    expect(lireCanal(NOUVELLE_ENTITE, "Courriel", [])).toEqual({ canal: "email", transporteur: null });
  });
});

