import { describe, expect, it } from "vitest";

import { DROITS } from "@/lib/droits/catalogue";
import { MODULES, MODULES_LIVRES, estLivre, getModule } from "@/modules/registry";

/**
 * Ouverture des modules.
 *
 * Testé parce que la conséquence d'une erreur est invisible à la relecture :
 * un module rouvert par inadvertance n'affiche aucun avertissement, il montre
 * simplement un stock ou une trésorerie qui n'appartiennent à personne. Le
 * client, lui, ne fait pas la différence — et c'est exactement ce qu'on lui
 * reproche chez le concurrent.
 */
describe("registre des modules", () => {
  it("n'ouvre que les modules dont les écrans lisent la base", () => {
    // Liste figée à dessein. Y ajouter une clé doit être un geste délibéré,
    // fait le jour où le module cesse de lire `src/lib/fixtures`.
    expect(MODULES_LIVRES).toEqual(["tiers", "stock", "pos", "comptabilite", "personnes", "documents", "archives", "presences", "taches", "planning", "achats", "tresorerie", "communication", "messagerie", "meeting", "prestataires", "marches", "boite_mail", "securite", "actifs", "reservation", "missions", "billetterie", "valeur_electronique", "boutique", "restaurant", "maquis", "hotellerie", "parc_auto", "parc_informatique", "projet", "enquetes"]);
  });

  it("ferme tout module inconnu du registre", () => {
    expect(estLivre("module-qui-n-existe-pas")).toBe(false);
  });

  it("ferme les modules encore sur jeu d'essai", () => {
    for (const definition of MODULES) {
      expect(estLivre(definition.key)).toBe(definition.status !== "planifie");
    }
  });

  it("rattache chaque droit à un module connu", () => {
    // La barre latérale déduit le module d'une entrée à partir de son droit.
    // Un `moduleKey` orphelin y ferait disparaître l'entrée sans rien dire.
    for (const droit of DROITS) {
      if (droit.moduleKey === "organisation") continue;
      expect(getModule(droit.moduleKey), droit.cle).toBeDefined();
    }
  });

  it("ne déclare aucune clé en double", () => {
    const cles = MODULES.map((m) => m.key);
    expect(new Set(cles).size).toBe(cles.length);
  });
});
