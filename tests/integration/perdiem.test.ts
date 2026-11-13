import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs } from "@/db/schema";
import { creerSalariePour } from "@/modules/personnes/creation";
import { ajouterBaremePour, annulerPour, attribuerPour, listerAttributions, listerBareme, modifierBaremePour, payerPour, supprimerBaremePour } from "@/modules/perdiem/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let comptable: string;
let collaborateur: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: comptable } = await semerEntreprise(db));
  ({ id: collaborateur } = await creerSalariePour(org, { nom: "Awa Koné", poste: "Chargée de projet", debut: "2026-01-05", salaireBase: 200_000 }, comptable));
});
afterAll(async () => fermer());

describe("barème des perdiem : la comptable ajoute, modifie, supprime", () => {
  it("ajoute des lignes, refuse un montant faux et un doublon (casse ignorée)", async () => {
    await ajouterBaremePour(org, comptable, { libelle: "Abidjan", montantJournalier: 15_000, notes: "Repas" });
    await ajouterBaremePour(org, comptable, { libelle: "Intérieur du pays", montantJournalier: 25_000 });
    await expect(ajouterBaremePour(org, comptable, { libelle: "abidjan", montantJournalier: 18_000 })).rejects.toThrow(/déjà au barème/);
    await expect(ajouterBaremePour(org, comptable, { libelle: "Gratuit", montantJournalier: 0 })).rejects.toThrow(/supérieur à zéro/);
    await expect(ajouterBaremePour(org, comptable, { libelle: "A", montantJournalier: 5000 })).rejects.toThrow(/libellé/);
    expect((await listerBareme(org)).map((l) => [l.libelle, l.montantJournalier])).toEqual([["Abidjan", 15_000], ["Intérieur du pays", 25_000]]);
  });

  it("modifie un montant sans réécrire les perdiem déjà attribués", async () => {
    const abidjan = (await listerBareme(org)).find((l) => l.libelle === "Abidjan")!;
    const { id, montantTotal } = await attribuerPour(org, comptable, { employeeId: collaborateur, baremeId: abidjan.id, jours: 4, debut: "2026-11-10", motif: "Mission Cocody" });
    expect(montantTotal).toBe(60_000);
    await modifierBaremePour(org, comptable, abidjan.id, { libelle: "Abidjan", montantJournalier: 20_000, notes: "Repas et transport", actif: true });
    const [a] = await listerAttributions(org);
    expect(a).toMatchObject({ id, montantJournalier: 15_000, montantTotal: 60_000, baremeLibelle: "Abidjan" });
    // Une nouvelle attribution prend le nouveau montant.
    expect((await attribuerPour(org, comptable, { employeeId: collaborateur, baremeId: abidjan.id, jours: 2 })).montantTotal).toBe(40_000);
    const trace = await db.select().from(auditLogs).where(eq(auditLogs.action, "perdiem.bareme.modifier"));
    expect(trace[0].before).toMatchObject({ montant: 15_000 });
    expect(trace[0].after).toMatchObject({ montant: 20_000 });
  });

  it("supprime une ligne jamais utilisée, retire du barème celle qui a servi", async () => {
    const neuve = await ajouterBaremePour(org, comptable, { libelle: "Zone minière", montantJournalier: 40_000 });
    expect(await supprimerBaremePour(org, comptable, neuve.id)).toBe("supprimee");
    expect((await listerBareme(org)).some((l) => l.libelle === "Zone minière")).toBe(false);
    // Le libellé est de nouveau libre.
    await ajouterBaremePour(org, comptable, { libelle: "Zone minière", montantJournalier: 42_000 });

    const abidjan = (await listerBareme(org)).find((l) => l.libelle === "Abidjan")!;
    expect(abidjan.utilisations).toBe(2);
    expect(await supprimerBaremePour(org, comptable, abidjan.id)).toBe("retiree");
    const apres = (await listerBareme(org)).find((l) => l.id === abidjan.id)!;
    expect(apres.actif).toBe(false);
    await expect(attribuerPour(org, comptable, { employeeId: collaborateur, baremeId: abidjan.id, jours: 1 })).rejects.toThrow(/plus au barème/);
    expect((await listerAttributions(org)).filter((a) => a.baremeLibelle === "Abidjan")).toHaveLength(2);
  });
});

describe("attribuer, payer, annuler", () => {
  it("numérote, refuse des jours faux, paie une fois, n'annule pas ce qui est payé", async () => {
    const interieur = (await listerBareme(org)).find((l) => l.libelle === "Intérieur du pays")!;
    await expect(attribuerPour(org, comptable, { employeeId: collaborateur, baremeId: interieur.id, jours: 0 })).rejects.toThrow(/jours/);
    await expect(attribuerPour(org, comptable, { employeeId: collaborateur, baremeId: interieur.id, jours: 2.5 })).rejects.toThrow(/jours/);
    const { id, numero, montantTotal } = await attribuerPour(org, comptable, { employeeId: collaborateur, baremeId: interieur.id, jours: 3, debut: "2026-12-01" });
    expect(numero).toBe("PD-2026-00003");
    expect(montantTotal).toBe(75_000);

    await expect(payerPour(org, comptable, id, { payeLe: "2026-12-05", moyen: "cheque" })).rejects.toThrow(/moyen/);
    await expect(payerPour(org, comptable, id, { payeLe: "2026-02-30", moyen: "especes" })).rejects.toThrow(/date/i);
    await payerPour(org, comptable, id, { payeLe: "2026-12-05", moyen: "mobile_money", reference: "MM-4471" });
    const paye = (await listerAttributions(org)).find((a) => a.id === id)!;
    expect(paye).toMatchObject({ statut: "paye", payeLe: "2026-12-05", moyen: "mobile_money", reference: "MM-4471" });
    await expect(payerPour(org, comptable, id, { payeLe: "2026-12-06", moyen: "especes" })).rejects.toThrow(/déjà payé/);
    await expect(annulerPour(org, comptable, id, "Erreur")).rejects.toThrow(/payé/);
  });

  it("annule avec un motif obligatoire, et un annulé ne se paie plus", async () => {
    const interieur = (await listerBareme(org)).find((l) => l.libelle === "Intérieur du pays")!;
    const { id } = await attribuerPour(org, comptable, { employeeId: collaborateur, baremeId: interieur.id, jours: 1 });
    await expect(annulerPour(org, comptable, id, " ")).rejects.toThrow(/pourquoi/);
    await annulerPour(org, comptable, id, "Mission reportée");
    const a = (await listerAttributions(org)).find((x) => x.id === id)!;
    expect(a).toMatchObject({ statut: "annule", motifAnnulation: "Mission reportée" });
    await expect(payerPour(org, comptable, id, { payeLe: "2026-12-05", moyen: "especes" })).rejects.toThrow(/annulé/);
  });

  it("refuse un collaborateur absent du Personnel", async () => {
    const interieur = (await listerBareme(org)).find((l) => l.libelle === "Intérieur du pays")!;
    await expect(attribuerPour(org, comptable, { employeeId: "00000000-0000-4000-8000-000000000000", baremeId: interieur.id, jours: 1 })).rejects.toThrow(/Personnel/);
  });
});
