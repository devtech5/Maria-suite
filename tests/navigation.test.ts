import { describe, expect, it } from "vitest";

import { definitionDroit } from "@/lib/droits/catalogue";
import { destinationApresConnexion, domaineDe, GROUPES_MODULES, groupesVisibles } from "@/lib/navigation";

const tous = GROUPES_MODULES.flatMap((g) => g.modules);
const modulesDe = (droits: string[]) => droits.map((d) => definitionDroit(d as never).moduleKey);

describe("groupesVisibles", () => {
  it("ne montre que les modules dont le rôle a le droit", () => {
    const groupes = groupesVisibles(["taches.consulter", "messagerie.utiliser"], ["taches", "messagerie"]);
    expect(groupes.map((g) => g.titre)).toEqual(["Ressources humaines", "Communication"]);
    expect(groupes.flatMap((g) => g.modules.map((m) => m.href))).toEqual(["/taches", "/messagerie"]);
  });

  it("cache un module fermé sur l'instance, même si le rôle a le droit", () => {
    expect(groupesVisibles(["reservation.consulter"], [])).toEqual([]);
  });

  it("garde le transverse ouvert sans qu'il soit déclaré", () => {
    const groupes = groupesVisibles(["organisation.membre.gerer"], []);
    expect(groupes[0].modules.map((m) => m.href)).toEqual(["/membres"]);
  });

  it("montre tout à qui a tous les droits, dans l'ordre de la carte", () => {
    const droits = tous.map((m) => m.droit);
    const groupes = groupesVisibles(droits, modulesDe(droits));
    expect(groupes.flatMap((g) => g.modules)).toEqual(tous);
  });

  it("chaque domaine a une clé unique et un libellé court", () => {
    expect(new Set(GROUPES_MODULES.map((g) => g.cle)).size).toBe(GROUPES_MODULES.length);
    for (const g of GROUPES_MODULES) expect(g.court.length).toBeLessThanOrEqual(14);
  });

  it("chaque entrée a un libellé, une description et un chemin unique", () => {
    expect(new Set(tous.map((m) => m.href)).size).toBe(tous.length);
    for (const m of tous) {
      expect(m.libelle.trim()).not.toBe("");
      expect(m.description.trim()).not.toBe("");
      expect(m.href.startsWith(m.racine)).toBe(true);
    }
  });
});

describe("domaineDe", () => {
  it("allume l'entrée la plus précise", () => {
    expect(domaineDe("/commercial/fournisseurs", GROUPES_MODULES)).toBe("achats");
    expect(domaineDe("/commercial/fournisseurs/abc", GROUPES_MODULES)).toBe("achats");
    expect(domaineDe("/commercial/factures", GROUPES_MODULES)).toBe("commerce");
    expect(domaineDe("/", GROUPES_MODULES)).toBe("pilotage");
    expect(domaineDe("/mot-de-passe", GROUPES_MODULES)).toBeNull();
  });
});

describe("destinationApresConnexion", () => {
  it("mène à l'accueil par défaut", () => {
    expect(destinationApresConnexion(null)).toBe("/accueil");
    expect(destinationApresConnexion("")).toBe("/accueil");
  });

  it("revient à la page demandée avant la connexion", () => {
    expect(destinationApresConnexion("/commercial/factures")).toBe("/commercial/factures");
  });

  it("refuse tout ce qui sort du site", () => {
    for (const s of ["https://exemple.com", "//exemple.com", "/\\exemple.com", "javascript:alert(1)", "commercial"]) {
      expect(destinationApresConnexion(s)).toBe("/accueil");
    }
  });

  it("ne renvoie pas vers la connexion elle-même", () => {
    expect(destinationApresConnexion("/connexion")).toBe("/accueil");
  });
});
