import { describe, expect, it } from "vitest";

import { natureApercu, typeServi } from "@/lib/apercu";
import { couleurSure, pourcent, resoudreChemin } from "@/lib/pptx";

describe("aperçu PowerPoint", () => {
  it("affiche un .pptx dans la plateforme, garde l'ancien .ppt en téléchargement", () => {
    expect(natureApercu({ nomFichier: "Maria Group — Présentation officielle.pptx" })).toBe("pptx");
    expect(natureApercu({ nomFichier: "ancien.ppt" })).toBe("telecharger");
    expect(typeServi("a/b.pptx")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
  });

  it("place un élément en pourcentage de la diapositive", () => {
    expect(pourcent(4_572_000, 9_144_000)).toBe(50);
    expect(pourcent(1_000, 0)).toBe(0);
  });

  it("n'accepte qu'une couleur hexadécimale à six chiffres", () => {
    expect(couleurSure("FFAA00")).toBe("#ffaa00");
    expect(couleurSure("red; background:url(x)")).toBeNull();
    expect(couleurSure(null)).toBeNull();
  });

  it("résout une cible relative dans l'archive", () => {
    expect(resoudreChemin("ppt/slides", "../media/image1.png")).toBe("ppt/media/image1.png");
    expect(resoudreChemin("ppt", "slides/slide1.xml")).toBe("ppt/slides/slide1.xml");
    expect(resoudreChemin("ppt/slides", "/ppt/media/a.png")).toBe("ppt/media/a.png");
  });
});
