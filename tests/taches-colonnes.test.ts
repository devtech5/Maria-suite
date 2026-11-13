import { describe, expect, it } from "vitest";

import { deplacer, domaineDe, nombreLisible, normaliserLibelle, normaliserOptions, normaliserValeur, sommeNombres } from "@/modules/taches/colonnes";

const etiquettes = { etiquettes: [{ cle: "e1", libelle: "Validé", couleur: "#00c875" }] };

describe("valeur d'une colonne", () => {
  it("vide la cellule sur une saisie blanche, quel que soit le type", () => {
    for (const type of ["texte", "nombre", "date", "etiquette", "case", "lien"] as const) {
      expect(normaliserValeur(type, "  ", etiquettes)).toEqual({ ok: true, valeur: null });
    }
  });

  it("garde un nombre ENTIER, espaces de milliers admis, virgule refusée", () => {
    expect(normaliserValeur("nombre", "1 250 000", {})).toEqual({ ok: true, valeur: "1250000" });
    expect(normaliserValeur("nombre", "1 250", {})).toEqual({ ok: true, valeur: "1250" });
    expect(normaliserValeur("nombre", "-15", {})).toEqual({ ok: true, valeur: "-15" });
    expect(normaliserValeur("nombre", "007", {})).toEqual({ ok: true, valeur: "7" });
    expect(normaliserValeur("nombre", "2,5", {}).ok).toBe(false);
    expect(normaliserValeur("nombre", "1e3", {}).ok).toBe(false);
    expect(normaliserValeur("nombre", "99999999999999999999", {}).ok).toBe(false);
  });

  it("ne garde qu'une date réelle", () => {
    expect(normaliserValeur("date", "2026-11-13", {})).toEqual({ ok: true, valeur: "2026-11-13" });
    expect(normaliserValeur("date", "2026-02-30", {}).ok).toBe(false);
    expect(normaliserValeur("date", "13/11/2026", {}).ok).toBe(false);
  });

  it("n'accepte qu'une étiquette de la colonne", () => {
    expect(normaliserValeur("etiquette", "e1", etiquettes)).toEqual({ ok: true, valeur: "e1" });
    expect(normaliserValeur("etiquette", "e9", etiquettes).ok).toBe(false);
  });

  it("coche ou décoche", () => {
    expect(normaliserValeur("case", "1", {})).toEqual({ ok: true, valeur: "1" });
    expect(normaliserValeur("case", "0", {})).toEqual({ ok: true, valeur: null });
  });

  it("complète un lien sans protocole et refuse tout autre que le web", () => {
    expect(normaliserValeur("lien", "maria-groupe.com/devis", {})).toEqual({ ok: true, valeur: "https://maria-groupe.com/devis" });
    expect(normaliserValeur("lien", "http://exemple.ci", {})).toEqual({ ok: true, valeur: "http://exemple.ci/" });
    expect(normaliserValeur("lien", "javascript:alert(1)", {}).ok).toBe(false);
    expect(normaliserValeur("lien", "data:text/html,x", {}).ok).toBe(false);
    expect(normaliserValeur("lien", "pas une adresse", {}).ok).toBe(false);
  });

  it("resserre un texte et le borne", () => {
    expect(normaliserValeur("texte", "  Client   Kouassi ", {})).toEqual({ ok: true, valeur: "Client Kouassi" });
    expect(normaliserValeur("texte", "x".repeat(501), {}).ok).toBe(false);
  });
});

describe("options d'une colonne", () => {
  it("garde les clés des étiquettes existantes et en donne une libre aux nouvelles", () => {
    const r = normaliserOptions("etiquette", {
      etiquettes: [
        { cle: "e2", libelle: "Refusé", couleur: "#df2f4a" },
        { cle: "", libelle: " Nouvelle ", couleur: "#nimporte" },
        { cle: "e1", libelle: "Validé", couleur: "#00c875" },
      ],
    });
    expect(r).toEqual({
      ok: true,
      valeur: {
        etiquettes: [
          { cle: "e2", libelle: "Refusé", couleur: "#df2f4a" },
          { cle: "e3", libelle: "Nouvelle", couleur: "#00c875" },
          { cle: "e1", libelle: "Validé", couleur: "#00c875" },
        ],
      },
    });
  });

  it("refuse une liste vide ou un doublon", () => {
    expect(normaliserOptions("etiquette", { etiquettes: [{ cle: "", libelle: " ", couleur: "#00c875" }] }).ok).toBe(false);
    expect(
      normaliserOptions("etiquette", {
        etiquettes: [
          { cle: "", libelle: "Oui", couleur: "#00c875" },
          { cle: "", libelle: "oui", couleur: "#00c875" },
        ],
      }).ok,
    ).toBe(false);
  });

  it("ne garde que les options du type", () => {
    expect(normaliserOptions("nombre", { unite: " FCFA ", etiquettes: [] })).toEqual({ ok: true, valeur: { unite: "FCFA" } });
    expect(normaliserOptions("texte", { unite: "x" })).toEqual({ ok: true, valeur: {} });
  });

  it("exige un nom de colonne", () => {
    expect(normaliserLibelle("  Montant   du devis ")).toEqual({ ok: true, valeur: "Montant du devis" });
    expect(normaliserLibelle("  ").ok).toBe(false);
  });
});

describe("affichage et somme", () => {
  it("additionne les entiers, sans compter les vides", () => {
    expect(sommeNombres(["1250000", null, "-250000", undefined, "x"])).toBe(1_000_000);
    expect(sommeNombres([null, undefined])).toBeNull();
  });

  it("écrit le nombre à la française, avec son unité", () => {
    expect(nombreLisible("1250000", "FCFA").replace(/\s/g, " ")).toBe("1 250 000 FCFA");
  });

  it("montre le domaine d'un lien", () => {
    expect(domaineDe("https://www.maria-groupe.com/devis")).toBe("maria-groupe.com");
  });

  it("déplace une colonne d'un cran, jamais hors du tableau", () => {
    expect(deplacer(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(deplacer(["a", "b", "c"], "a", -1)).toBeNull();
    expect(deplacer(["a", "b", "c"], "z", 1)).toBeNull();
  });
});
