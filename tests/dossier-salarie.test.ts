import { describe, expect, it } from "vitest";

import { etatsPieces, photoValide, piecesManquantes, type PieceDatee } from "@/modules/personnes/pieces";

const piece = (id: string, nature: PieceDatee["nature"], delivreeLe: string | null, expireLe: string | null, cree = "2026-01-01"): PieceDatee => ({
  id,
  nature,
  delivreeLe,
  expireLe,
  creeLe: new Date(`${cree}T10:00:00Z`),
});

describe("état des pièces d'un collaborateur", () => {
  const aujourdhui = "2026-10-06";

  it("expirée, bientôt expirée, valide, sans échéance", () => {
    const etats = etatsPieces(
      [
        piece("a", "permis", "2016-01-01", "2026-10-01"),
        piece("b", "cmu", "2024-01-01", "2026-11-05"),
        piece("c", "passeport", "2024-01-01", "2029-01-01"),
        piece("d", "rib", null, null),
      ],
      aujourdhui,
    );
    expect(etats.get("a")).toEqual({ etat: "expiree", jours: -5 });
    expect(etats.get("b")).toEqual({ etat: "expire_bientot", jours: 30 });
    expect(etats.get("c")?.etat).toBe("valide");
    expect(etats.get("d")).toEqual({ etat: "sans_echeance", jours: null });
  });

  it("une CNI renouvelée efface l'alerte de l'ancienne", () => {
    const etats = etatsPieces(
      [piece("vieille", "cni", "2015-03-01", "2025-03-01"), piece("neuve", "cni", "2025-02-20", "2035-02-20")],
      aujourdhui,
    );
    expect(etats.get("vieille")?.etat).toBe("remplacee");
    expect(etats.get("neuve")?.etat).toBe("valide");
  });

  it("sans date de délivrance, la plus récemment enregistrée l'emporte", () => {
    const etats = etatsPieces(
      [piece("x", "rib", null, null, "2026-01-01"), piece("y", "rib", null, null, "2026-05-01")],
      aujourdhui,
    );
    expect(etats.get("x")?.etat).toBe("remplacee");
    expect(etats.get("y")?.etat).toBe("sans_echeance");
  });

  it("les diplômes et assurances s'accumulent sans se remplacer", () => {
    const etats = etatsPieces(
      [
        piece("bts", "diplome", "2018-07-01", null),
        piece("licence", "diplome", "2020-07-01", null),
        piece("sante", "assurance", "2026-01-01", "2026-12-31"),
        piece("accident", "assurance", "2026-02-01", "2026-10-20"),
      ],
      aujourdhui,
    );
    expect(etats.get("bts")?.etat).toBe("sans_echeance");
    expect(etats.get("licence")?.etat).toBe("sans_echeance");
    expect(etats.get("sante")?.etat).toBe("valide");
    expect(etats.get("accident")?.etat).toBe("expire_bientot");
  });
});

describe("dossier minimal", () => {
  it("la CNI ou le passeport suffit comme pièce d'identité", () => {
    expect(piecesManquantes(new Set(["passeport", "cmu", "rib", "cv"]), true)).toEqual([]);
    expect(piecesManquantes(new Set(["cni", "cmu", "rib", "cv"]), true)).toEqual([]);
  });

  it("dit ce qui manque, photo comprise", () => {
    expect(piecesManquantes(new Set(["cv"]), false)).toEqual([
      "pièce d'identité (CNI ou passeport)",
      "carte CMU",
      "RIB",
      "photo",
    ]);
  });
});

describe("photo d'identité", () => {
  it("n'accepte qu'une image en data URL sous la borne de la base", () => {
    expect(photoValide("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(photoValide("data:text/html;base64,AAAA")).toBe(false);
    expect(photoValide("https://exemple.test/photo.jpg")).toBe(false);
    expect(photoValide(`data:image/jpeg;base64,${"A".repeat(140_000)}`)).toBe(false);
  });
});
