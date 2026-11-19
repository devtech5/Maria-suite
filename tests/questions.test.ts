import { describe, expect, it } from "vitest";

import { decouperQuestion, libelleAction } from "@/lib/questions";

describe("fenêtre de confirmation : mise en forme de la question", () => {
  it("met la question en titre et la suite en détail", () => {
    expect(decouperQuestion("Supprimer le bon BCI-2026-00001 ? Il disparaîtra de la liste ; son numéro ne sera pas réattribué.")).toEqual({
      titre: "Supprimer le bon BCI-2026-00001 ?",
      detail: "Il disparaîtra de la liste ; son numéro ne sera pas réattribué.",
    });
  });

  it("garde une question sans suite entière, sans détail", () => {
    expect(decouperQuestion("Quitter ce groupe ?")).toEqual({ titre: "Quitter ce groupe ?", detail: null });
    expect(decouperQuestion("Une nouvelle clé coupe l'ancienne. Continuer ?")).toEqual({ titre: "Une nouvelle clé coupe l'ancienne. Continuer ?", detail: null });
  });

  it("coupe aussi sur un saut de ligne après le point d'interrogation", () => {
    expect(decouperQuestion("Publier la version 2 ?\n\nSon texte ne se modifiera plus.").detail).toBe("Son texte ne se modifiera plus.");
  });

  it("prend le verbe en tête comme libellé, en rouge s'il détruit", () => {
    expect(libelleAction("Supprimer le bon BCI-2026-00001 ?")).toEqual({ libelle: "Supprimer", danger: true });
    expect(libelleAction("Annuler ce bordereau ?")).toEqual({ libelle: "Annuler", danger: true });
    expect(libelleAction("Écarter l'échéance de mars sans dépense ?")).toEqual({ libelle: "Écarter", danger: true });
    expect(libelleAction("Publier ?")).toEqual({ libelle: "Publier", danger: false });
    expect(libelleAction("Clore ce plan ?")).toEqual({ libelle: "Clore", danger: false });
  });

  it("prend sinon le verbe final, et à défaut « Confirmer »", () => {
    expect(libelleAction("Une nouvelle clé coupe l'ancienne. Continuer ?")).toEqual({ libelle: "Continuer", danger: false });
    expect(libelleAction("Le relais sera coupé.")).toEqual({ libelle: "Confirmer", danger: false });
  });
});
