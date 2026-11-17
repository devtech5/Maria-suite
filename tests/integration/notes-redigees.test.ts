import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { enregistrerRedactionPour, notesRedigeesPourLiasse, redactionsDe, reprendrePrecedentPour } from "@/modules/comptabilite/notes-redigees";
import { notesAnnexesRedigees } from "@/modules/comptabilite/schema";
import { newId } from "@/lib/ids";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

describe("notes annexes rédigées en base", () => {
  it("rédige, réécrit, déclare néant, puis reprend l'exercice précédent", async () => {
    await enregistrerRedactionPour(org, user, "2025", { numero: "2", texte: "Conformité au SYSCOHADA révisé.", neant: false });
    await enregistrerRedactionPour(org, user, "2025", { numero: "1", texte: "", neant: true });
    await enregistrerRedactionPour(org, user, "2026", { numero: "2", texte: "Première version", neant: false });
    await enregistrerRedactionPour(org, user, "2026", { numero: "2", texte: "  Méthodes 2026  ", neant: false });

    const n2026 = await redactionsDe(org, "2026");
    expect(n2026).toHaveLength(1);
    expect(n2026[0].texte).toBe("Méthodes 2026");

    await expect(enregistrerRedactionPour(org, user, "2026", { numero: "7", texte: "Clients", neant: false })).rejects.toThrow(/note/i);

    // Reprend la note 1 (néant) de 2025 ; la note 2, déjà rédigée en 2026, reste telle quelle.
    expect(await reprendrePrecedentPour(org, user, "2026")).toBe(1);
    expect(await reprendrePrecedentPour(org, user, "2026")).toBe(0);
    const apres = new Map((await redactionsDe(org, "2026")).map((r) => [r.numero, r]));
    expect(apres.get("1")?.neant).toBe(true);
    expect(apres.get("2")?.texte).toBe("Méthodes 2026");

    const liasse = await notesRedigeesPourLiasse(org, "2026");
    expect(liasse.find((n) => n.numero === "2")?.texte).toEqual(["Méthodes 2026"]);
    expect(liasse.find((n) => n.numero === "1")?.vide).toBe(true);
    expect(liasse.find((n) => n.numero === "35")?.aRediger).toBe(true);
  });

  it("la base refuse une note néant qui porterait un texte", async () => {
    await expect(
      db.insert(notesAnnexesRedigees).values({ id: newId(), organizationId: org, exercice: "2024", numero: "1", texte: "x", neant: true, redigeParUserId: user }),
    ).rejects.toThrow();
  });
});
