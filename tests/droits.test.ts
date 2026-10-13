import { describe, expect, it } from "vitest";

import {
  DROITS,
  PRESETS_ROLES,
  TOUS_LES_DROITS,
  droitConnu,
  droitsAccordables,
  droitsParModule,
  presetRole,
  resoudreDroits,
} from "@/lib/droits/catalogue";

/**
 * Résolution des droits.
 *
 * Testé au même titre que l'argent : une erreur ici ne se voit pas non plus.
 * Un droit accordé par accident n'affiche aucun message — il laisse simplement
 * passer, et on l'apprend le jour où un caissier a annulé la recette du samedi.
 */

describe("catalogue", () => {
  it("ne déclare pas deux fois la même clé", () => {
    expect(new Set(TOUS_LES_DROITS).size).toBe(DROITS.length);
  });

  it("rattache chaque droit à un module", () => {
    for (const droit of DROITS) {
      expect(droit.moduleKey, droit.cle).not.toBe("");
    }
  });

  it("ne reconnaît pas une clé inventée", () => {
    expect(droitConnu("stock.article.gerer")).toBe(true);
    expect(droitConnu("stock.article.tout")).toBe(false);
  });
});

describe("rôles préréglés", () => {
  it("donne tout au propriétaire", () => {
    expect(presetRole("proprietaire")?.droits).toEqual(TOUS_LES_DROITS);
  });

  it("retient l'abonnement au gérant, et rien d'autre", () => {
    const gerant = presetRole("gerant")!;
    const manquants = TOUS_LES_DROITS.filter((cle) => !gerant.droits.includes(cle));
    expect(manquants).toEqual(["organisation.parametres.gerer"]);
  });

  it("fournit toujours un rôle de propriétaire", () => {
    // La création d'entreprise pose les préréglages puis rattache le créateur
    // à celui-ci. Sans lui, une entreprise naîtrait sans administrateur.
    expect(presetRole("proprietaire")).toBeDefined();
  });

  it("ne déclare pas deux fois la même clé de rôle", () => {
    const cles = PRESETS_ROLES.map((preset) => preset.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("n'accorde que des droits du catalogue", () => {
    for (const preset of PRESETS_ROLES) {
      for (const droit of preset.droits) {
        expect(droitConnu(droit), `${preset.cle} → ${droit}`).toBe(true);
      }
    }
  });

  it("laisse le caissier encaisser sans le laisser annuler", () => {
    const caissier = resoudreDroits({ cleRole: "caissier", estProprietaire: false });
    expect(caissier.has("pos.vente.encaisser")).toBe(true);
    expect(caissier.has("pos.vente.annuler")).toBe(false);
  });

  it("tient le comptable hors du stock et du tiroir", () => {
    const comptable = resoudreDroits({ cleRole: "comptable", estProprietaire: false });
    expect(comptable.has("comptabilite.ecriture.enregistrer")).toBe(true);
    expect(comptable.has("stock.mouvement.saisir")).toBe(false);
    expect(comptable.has("pos.vente.encaisser")).toBe(false);
  });

  it("tient le magasinier hors de la comptabilité", () => {
    const magasinier = resoudreDroits({ cleRole: "magasinier", estProprietaire: false });
    expect(magasinier.has("stock.mouvement.saisir")).toBe(true);
    expect(magasinier.has("comptabilite.ecriture.enregistrer")).toBe(false);
  });
});

describe("resoudreDroits", () => {
  it("donne tout au propriétaire, quel que soit son rôle", () => {
    // Le cas qui compte : un rôle mal configuré ne doit pas enfermer dehors
    // celui à qui l'entreprise appartient.
    const droits = resoudreDroits({ cleRole: "caissier", estProprietaire: true });
    expect(droits.size).toBe(TOUS_LES_DROITS.length);
  });

  it("échoue fermé sur un rôle inconnu", () => {
    expect(resoudreDroits({ cleRole: "stagiaire", estProprietaire: false }).size).toBe(0);
    expect(resoudreDroits({ cleRole: null, estProprietaire: false }).size).toBe(0);
  });

  it("lit les accords en base pour un rôle créé par l'entreprise", () => {
    const droits = resoudreDroits({
      cleRole: "vendeur_rayon",
      estProprietaire: false,
      accords: ["stock.article.consulter", "pos.vente.encaisser"],
    });
    expect([...droits].sort()).toEqual(["pos.vente.encaisser", "stock.article.consulter"]);
  });

  it("ignore un accord dont la clé n'existe plus au catalogue", () => {
    // Un droit renommé laisse des lignes derrière lui. Elles ne doivent plus
    // rien ouvrir, sans quoi un renommage rendrait des accès imprévisibles.
    const droits = resoudreDroits({
      cleRole: "vendeur_rayon",
      estProprietaire: false,
      accords: ["stock.article.consulter", "stock.tout.faire"],
    });
    expect([...droits]).toEqual(["stock.article.consulter"]);
  });

  it("ignore les accords d'un rôle préréglé", () => {
    // Le préréglage vient du code : une ligne ajoutée à la main en base ne doit
    // pas élargir un rôle que Maria Suite définit.
    const droits = resoudreDroits({
      cleRole: "caissier",
      estProprietaire: false,
      accords: ["organisation.parametres.gerer"],
    });
    expect(droits.has("organisation.parametres.gerer")).toBe(false);
  });
});

describe("composition d'un rôle", () => {
  it("groupe tous les droits, sans en perdre ni en dupliquer", () => {
    const groupes = droitsParModule();
    const plat = groupes.flatMap((groupe) => groupe.droits.map((d) => d.cle));

    expect(plat.length).toBe(DROITS.length);
    expect(new Set(plat).size).toBe(DROITS.length);
  });

  it("ne donne qu'un groupe par module", () => {
    const modules = droitsParModule().map((groupe) => groupe.moduleKey);
    expect(new Set(modules).size).toBe(modules.length);
  });

  it("n'accorde que ce que le compositeur détient", () => {
    // Le cas qui compte : sans cette règle, un gérant se composerait un rôle
    // portant l'abonnement — qu'il n'a pas — et le confierait à un tiers.
    const gerant = resoudreDroits({ cleRole: "gerant", estProprietaire: false });

    const accordes = droitsAccordables(gerant, [
      "pos.vente.encaisser",
      "organisation.parametres.gerer",
    ]);

    expect(accordes).toEqual(["pos.vente.encaisser"]);
  });

  it("écarte une clé inventée", () => {
    const proprietaire = new Set(TOUS_LES_DROITS);
    expect(droitsAccordables(proprietaire, ["stock.tout.faire"])).toEqual([]);
  });

  it("ne retient pas deux fois la même demande", () => {
    const proprietaire = new Set(TOUS_LES_DROITS);
    const accordes = droitsAccordables(proprietaire, [
      "stock.article.consulter",
      "stock.article.consulter",
    ]);
    expect(accordes).toEqual(["stock.article.consulter"]);
  });

  it("laisse le propriétaire tout accorder", () => {
    const proprietaire = resoudreDroits({ cleRole: null, estProprietaire: true });
    expect(droitsAccordables(proprietaire, TOUS_LES_DROITS)).toEqual([
      ...TOUS_LES_DROITS,
    ]);
  });
});
