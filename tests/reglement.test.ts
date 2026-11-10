import { describe, expect, it } from "vitest";

import { DROITS_DE_TOUS, avecDroitsDeTous, droitConnu, presetRole, resoudreDroits } from "@/lib/droits/catalogue";
import { groupesVisibles } from "@/lib/navigation";
import {
  ARTICLES_MAX,
  RELANCE_MIN_MS,
  dateLongue,
  dateValide,
  etatVersion,
  intituleArticle,
  normaliserArticles,
  paragraphes,
  refusPublication,
  relancePermise,
  suiviLectures,
  versionAVenir,
  versionEnVigueur,
  type VersionDatee,
} from "@/modules/reglement/regles";

/**
 * Règlement intérieur. La règle qui compte : la version en vigueur est la
 * bonne. Se tromper d'un jour, c'est bloquer toute l'entreprise sur une
 * version qui n'est pas encore applicable — ou la laisser passer sans qu'on
 * ait accepté celle qui l'est.
 */

const v = (id: string, numero: number | null, dateEffet: string | null, statut: "brouillon" | "publie" = "publie"): VersionDatee => ({ id, numero, dateEffet, statut });

describe("version en vigueur", () => {
  const versions = [v("v1", 1, "2026-01-01"), v("v2", 2, "2026-06-01"), v("v3", 3, "2026-12-01"), v("b", null, null, "brouillon")];

  it("retient la dernière publiée dont la date d'effet est passée", () => {
    expect(versionEnVigueur(versions, "2026-11-10")?.id).toBe("v2");
  });

  it("prend effet le jour même, pas le lendemain", () => {
    expect(versionEnVigueur(versions, "2026-12-01")?.id).toBe("v3");
    expect(versionEnVigueur(versions, "2026-11-30")?.id).toBe("v2");
  });

  it("n'a rien en vigueur avant la première date d'effet", () => {
    expect(versionEnVigueur(versions, "2025-12-31")).toBeNull();
  });

  it("ignore un brouillon, même daté", () => {
    expect(versionEnVigueur([v("b", null, "2026-01-01", "brouillon")], "2026-11-10")).toBeNull();
  });

  it("départage deux publications du même jour par le numéro", () => {
    expect(versionEnVigueur([v("a", 4, "2026-11-10"), v("b", 5, "2026-11-10")], "2026-11-10")?.id).toBe("b");
  });

  it("annonce la plus proche des versions à venir", () => {
    expect(versionAVenir([...versions, v("v4", 4, "2027-03-01")], "2026-11-10")?.id).toBe("v3");
    expect(versionAVenir(versions, "2026-12-01")).toBeNull();
  });

  it("dit l'état de chaque version", () => {
    expect(etatVersion(versions[0], versions, "2026-11-10")).toBe("remplacee");
    expect(etatVersion(versions[1], versions, "2026-11-10")).toBe("en_vigueur");
    expect(etatVersion(versions[2], versions, "2026-11-10")).toBe("a_venir");
    expect(etatVersion(versions[3], versions, "2026-11-10")).toBe("brouillon");
  });
});

describe("publication", () => {
  const articles = [{ titre: "Objet", texte: "Le présent règlement…" }];

  it("refuse un règlement sans article ou sans date", () => {
    expect(refusPublication({ articles: [], dateEffet: "2026-12-01" }, "2026-11-10")).toMatch(/aucun article/);
    expect(refusPublication({ articles, dateEffet: null }, "2026-11-10")).toMatch(/date d'effet/);
    expect(refusPublication({ articles, dateEffet: "2026-02-30" }, "2026-11-10")).toMatch(/date d'effet/);
  });

  it("n'est jamais rétroactive", () => {
    expect(refusPublication({ articles, dateEffet: "2026-11-09" }, "2026-11-10")).toMatch(/rétroactif/);
    expect(refusPublication({ articles, dateEffet: "2026-11-10" }, "2026-11-10")).toBeNull();
  });

  it("reconnaît un jour qui existe", () => {
    expect(dateValide("2028-02-29")).toBe(true);
    expect(dateValide("2026-02-29")).toBe(false);
    expect(dateValide("10/11/2026")).toBe(false);
  });
});

describe("articles", () => {
  it("nettoie la saisie et écarte les articles vides", () => {
    const propres = normaliserArticles([
      { titre: "  Horaires ", texte: " Du lundi au vendredi.\r\n\r\nSamedi matin. " },
      { titre: "", texte: "   " },
      { titre: "", texte: "Sans titre." },
    ]);
    expect(propres).toEqual([
      { titre: "Horaires", texte: "Du lundi au vendredi.\n\nSamedi matin." },
      { titre: "", texte: "Sans titre." },
    ]);
  });

  it("refuse un article titré sans texte, en disant lequel", () => {
    expect(() => normaliserArticles([{ titre: "Objet", texte: "Texte" }, { titre: "Sanctions", texte: "" }])).toThrow(/article 2/);
  });

  it("refuse ce qui n'est pas une liste, et une liste démesurée", () => {
    expect(() => normaliserArticles(null)).toThrow();
    expect(() => normaliserArticles(Array.from({ length: ARTICLES_MAX + 1 }, () => ({ titre: "", texte: "x" })))).toThrow(/au plus/);
  });

  it("numérote et découpe en paragraphes", () => {
    expect(intituleArticle({ titre: "Horaires", texte: "" }, 3)).toBe("Article 3 — Horaires");
    expect(intituleArticle({ titre: "", texte: "" }, 3)).toBe("Article 3");
    expect(paragraphes("Un.\n\n\nDeux,\nsuite.\n \nTrois.")).toEqual(["Un.", "Deux,\nsuite.", "Trois."]);
    expect(dateLongue("2026-12-01")).toBe("1er décembre 2026");
  });
});

describe("suivi des lectures", () => {
  const membres = [
    { userId: "a", nom: "Awa" },
    { userId: "b", nom: "Bamba" },
    { userId: "c", nom: "Coulibaly" },
  ];

  it("sépare qui a accepté de qui ne l'a pas encore fait", () => {
    const suivi = suiviLectures(membres, [
      { userId: "b", accepteLe: new Date("2026-11-10T08:00:00Z") },
      { userId: "a", accepteLe: new Date("2026-11-10T09:00:00Z") },
      // Un ancien compte, plus actif : il ne compte pas.
      { userId: "z", accepteLe: new Date("2026-11-01T09:00:00Z") },
    ]);
    expect(suivi.lus).toBe(2);
    expect(suivi.total).toBe(3);
    expect(suivi.lecteurs.map((l) => l.userId)).toEqual(["a", "b"]);
    expect(suivi.enAttente.map((m) => m.userId)).toEqual(["c"]);
  });

  it("arrondit le pourcentage vers le bas : 100 % seulement quand tout le monde a lu", () => {
    const tous = Array.from({ length: 200 }, (_, i) => ({ userId: String(i), nom: `N${i}` }));
    const lectures = tous.slice(0, 199).map((m) => ({ userId: m.userId, accepteLe: new Date() }));
    expect(suiviLectures(tous, lectures).pourcent).toBe(99);
    expect(suiviLectures([], []).pourcent).toBe(0);
  });

  it("ne relance pas deux fois dans l'heure", () => {
    const maintenant = new Date("2026-11-10T10:00:00Z");
    expect(relancePermise(null, maintenant)).toBe(true);
    expect(relancePermise(new Date(maintenant.getTime() - RELANCE_MIN_MS + 1), maintenant)).toBe(false);
    expect(relancePermise(new Date(maintenant.getTime() - RELANCE_MIN_MS), maintenant)).toBe(true);
  });
});

describe("droits", () => {
  it("donne la lecture du règlement à tout compte, quel que soit son rôle", () => {
    for (const cle of DROITS_DE_TOUS) expect(droitConnu(cle)).toBe(true);
    const compose = avecDroitsDeTous(resoudreDroits({ cleRole: "vendeur_rayon", estProprietaire: false, accords: [] }));
    expect(compose.has("reglement.consulter")).toBe(true);
    expect(compose.has("reglement.gerer")).toBe(false);
  });

  it("réserve la publication à l'administration", () => {
    expect(presetRole("secretaire")!.droits).not.toContain("reglement.gerer");
    expect(presetRole("gerant")!.droits).toContain("reglement.gerer");
  });

  it("montre le règlement dans le menu de chacun", () => {
    const entrees = groupesVisibles(avecDroitsDeTous(new Set()), ["reglement"]).flatMap((g) => g.modules.map((m) => m.href));
    expect(entrees).toEqual(["/reglement"]);
  });
});
