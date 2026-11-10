import { describe, expect, it } from "vitest";

import { DELAI_ENTRE_RECHARGEMENTS_MS, erreurDeVersion, rechargementPermis } from "@/lib/version-deployee";

describe("version périmée dans l'onglet", () => {
  it("reconnaît les erreurs d'un onglet resté sur l'ancienne version", () => {
    expect(erreurDeVersion({ name: "ChunkLoadError", message: "Loading chunk 812 failed." })).toBe(true);
    expect(erreurDeVersion({ message: "Loading CSS chunk app-layout failed" })).toBe(true);
    expect(erreurDeVersion({ message: 'Failed to find Server Action "7f3a". This request might be from an older or newer deployment.' })).toBe(true);
    expect(erreurDeVersion({ message: "Failed to fetch dynamically imported module: /_next/static/chunks/a.js" })).toBe(true);
  });

  it("laisse passer une vraie panne", () => {
    expect(erreurDeVersion({ message: "Cannot read properties of undefined (reading 'nom')" })).toBe(false);
    expect(erreurDeVersion({ message: "", digest: "3105694817" })).toBe(false);
  });

  it("ne recharge pas en boucle : une fois par minute au plus", () => {
    const t = 1_000_000;
    expect(rechargementPermis(null, t)).toBe(true);
    expect(rechargementPermis(t, t + 5_000)).toBe(false);
    expect(rechargementPermis(t, t + DELAI_ENTRE_RECHARGEMENTS_MS)).toBe(true);
  });
});
