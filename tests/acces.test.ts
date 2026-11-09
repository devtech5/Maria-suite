import { describe, expect, it } from "vitest";

import { appliquerRestrictions, modulesDuRole, niveauEffectif } from "@/lib/droits/acces";
import { PRESETS_ROLES, TOUS_LES_DROITS, type Droit } from "@/lib/droits/catalogue";

/**
 * Accès par module.
 *
 * Testé parce qu'une erreur ici est silencieuse dans les deux sens : un module
 * resté ouvert à qui ne devait pas le voir, ou un caissier qui ne peut plus
 * encaisser le samedi matin.
 */

const tous = new Set<Droit>(TOUS_LES_DROITS);
const caissier = new Set<Droit>(PRESETS_ROLES.find((p) => p.cle === "caissier")!.droits);
const vide = { modulesCoupes: new Set<string>(), niveaux: new Map(), estProprietaire: false };

describe("appliquerRestrictions", () => {
  it("ne change rien sans restriction", () => {
    expect(appliquerRestrictions(tous, vide).size).toBe(tous.size);
  });

  it("retire tout un module coupé, propriétaire compris", () => {
    const effectifs = appliquerRestrictions(tous, {
      ...vide,
      modulesCoupes: new Set(["missions"]),
      estProprietaire: true,
    });
    expect([...effectifs].some((d) => d.startsWith("missions."))).toBe(false);
    expect(effectifs.has("stock.article.consulter")).toBe(true);
  });

  it("réduit un module à la consultation", () => {
    const effectifs = appliquerRestrictions(tous, {
      ...vide,
      niveaux: new Map([["stock", "consultation"]]),
    });
    expect(effectifs.has("stock.article.consulter")).toBe(true);
    expect(effectifs.has("stock.article.gerer")).toBe(false);
    expect(effectifs.has("stock.mouvement.saisir")).toBe(false);
  });

  it("ferme un module au niveau aucun", () => {
    const effectifs = appliquerRestrictions(tous, {
      ...vide,
      niveaux: new Map([["comptabilite", "aucun"]]),
    });
    expect([...effectifs].some((d) => d.startsWith("comptabilite."))).toBe(false);
  });

  it("retire un module désactivé pour le rôle, jamais au propriétaire", () => {
    const desactive = { ...vide, modulesRole: new Set(["tresorerie"]) };
    expect([...appliquerRestrictions(tous, desactive)].some((d) => d.startsWith("tresorerie."))).toBe(false);
    expect(appliquerRestrictions(tous, desactive).has("stock.article.consulter")).toBe(true);
    const proprietaire = appliquerRestrictions(tous, { ...desactive, estProprietaire: true });
    expect([...proprietaire].some((d) => d.startsWith("tresorerie."))).toBe(true);
  });

  it("n'ajoute jamais un droit que le rôle n'a pas", () => {
    const effectifs = appliquerRestrictions(caissier, {
      ...vide,
      niveaux: new Map([["comptabilite", "complet"]]),
    });
    expect([...effectifs].every((d) => caissier.has(d))).toBe(true);
    expect(effectifs.has("comptabilite.ecriture.enregistrer")).toBe(false);
  });

  it("ne restreint jamais le propriétaire par les niveaux", () => {
    const effectifs = appliquerRestrictions(tous, {
      ...vide,
      niveaux: new Map([["stock", "aucun"]]),
      estProprietaire: true,
    });
    expect(effectifs.has("stock.article.gerer")).toBe(true);
  });

  it("laisse toujours la gestion des membres au transverse", () => {
    const effectifs = appliquerRestrictions(tous, {
      ...vide,
      niveaux: new Map([["organisation", "aucun"]]),
    });
    expect(effectifs.has("organisation.membre.gerer")).toBe(true);
  });
});

describe("niveauEffectif", () => {
  it("plafonne au rôle", () => {
    expect(niveauEffectif(caissier, "pos", "complet")).toBe("complet");
    expect(niveauEffectif(caissier, "comptabilite", "complet")).toBe("aucun");
    expect(niveauEffectif(caissier, "stock", "complet")).toBe("consultation");
  });

  it("respecte la restriction demandée", () => {
    expect(niveauEffectif(tous, "stock", "consultation")).toBe("consultation");
    expect(niveauEffectif(tous, "stock", "aucun")).toBe("aucun");
  });
});

describe("modulesDuRole", () => {
  it("liste les modules où le rôle a un droit, sans le transverse", () => {
    const modules = modulesDuRole(caissier);
    expect(modules.has("organisation")).toBe(false);
    expect(modules.size).toBeGreaterThan(0);
    expect(modulesDuRole(tous).size).toBeGreaterThan(modules.size);
  });
});
