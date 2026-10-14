import { describe, expect, it } from "vitest";

import { enregistrerErreur, erreurParDigest } from "@/lib/erreurs-recentes";

const erreur = (digest: string, message = "relation absente") => ({
  digest,
  message,
  chemin: "/",
  horodatage: "2026-10-14T20:00:00.000Z",
});

describe("erreurs récentes", () => {
  it("retrouve une erreur par son code, la plus récente d'abord", () => {
    enregistrerErreur(erreur("111", "première"));
    enregistrerErreur(erreur("111", "seconde"));
    expect(erreurParDigest("111")?.message).toBe("seconde");
    expect(erreurParDigest("inconnu")).toBeNull();
  });

  it("ne garde que les cinquante dernières", () => {
    for (let i = 0; i < 60; i++) enregistrerErreur(erreur(`lot-${i}`));
    expect(erreurParDigest("lot-0")).toBeNull();
    expect(erreurParDigest("lot-59")).not.toBeNull();
  });

  it("borne un message démesuré", () => {
    enregistrerErreur(erreur("long", "x".repeat(10_000)));
    expect(erreurParDigest("long")?.message).toHaveLength(2000);
  });
});
