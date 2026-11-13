import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { creerMissionDans } from "@/modules/missions/creation";
import { annulerIntervenantPour, cheminDecharge, confierIntervenantPour, fixerBudgetPour, intervenantsDe, missionBudgetee, payerIntervenantPour } from "@/modules/missions/intervenants";
import { intervenantsMission } from "@/modules/missions/schema";
import { creerIntervenantDans } from "@/modules/personnes/creation";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

// Le dépôt de fichiers vit dans un dossier jetable : le même adaptateur disque qu'en production.
const depot = mkdtempSync(join(tmpdir(), "maria-missions-"));
process.env.STOCKAGE_LOCAL = depot;

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;
let missionId: string;

const decharge = (nom = "decharge.jpg") => ({ nom, typeMime: "image/jpeg", contenu: new TextEncoder().encode("signature").buffer as ArrayBuffer });

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ id: missionId } = await db.transaction((tx) => creerMissionDans(tx, org, { nature: "chantier", titre: "Salon de l'habitat", montant: 0 }, user)));
});
afterAll(async () => fermer());

describe("mission budgétisée et intervenants payés sur place", () => {
  it("exige un budget avant de confier une tâche, puis refuse de le dépasser", async () => {
    await expect(confierIntervenantPour(org, user, missionId, { tache: "Manutention", nature: "intervenant", nom: "Yao Kouassi", montantConvenu: 30_000 })).rejects.toThrow(/budget/);
    await fixerBudgetPour(org, user, missionId, 100_000);
    expect((await missionBudgetee(org, missionId))?.budget).toBe(100_000);

    await confierIntervenantPour(org, user, missionId, { tache: "Manutention", nature: "intervenant", nom: "Yao Kouassi", telephone: "0707", montantConvenu: 40_000 });
    await confierIntervenantPour(org, user, missionId, { tache: "Vente sur stand", nature: "intervenant", nom: "Awa Koné", montantConvenu: 35_000 });
    await expect(confierIntervenantPour(org, user, missionId, { tache: "Nettoyage", nature: "entreprise", nom: "Net Plus SARL", montantConvenu: 30_000 })).rejects.toThrow(/dépassé de 5.000 F/);
    await expect(confierIntervenantPour(org, user, missionId, { tache: "ab", nature: "entreprise", nom: "Net Plus", montantConvenu: 1000 })).rejects.toThrow(/tâche/);
    await expect(confierIntervenantPour(org, user, missionId, { tache: "Nettoyage", nature: "robot", nom: "R2", montantConvenu: 1000 })).rejects.toThrow(/entreprise/);
    await confierIntervenantPour(org, user, missionId, { tache: "Nettoyage", nature: "entreprise", nom: "Net Plus SARL", montantConvenu: 25_000 });
    expect((await intervenantsDe(org, missionId)).map((l) => [l.tache, l.montantConvenu, l.statut])).toEqual([["Manutention", 40_000, "a_payer"], ["Vente sur stand", 35_000, "a_payer"], ["Nettoyage", 25_000, "a_payer"]]);
  });

  it("recopie le nom d'un intervenant du registre", async () => {
    const { id: workerId } = await db.transaction((tx) => creerIntervenantDans(tx, org, { nom: "Traoré Ibrahim", qualification: "Manutentionnaire", taux: 8000 }, user));
    await annulerIntervenantPour(org, user, (await intervenantsDe(org, missionId))[2].id, "Remplacé par l'intervenant du registre");
    await confierIntervenantPour(org, user, missionId, { tache: "Nettoyage", nature: "intervenant", workerId, montantConvenu: 25_000 });
    expect((await intervenantsDe(org, missionId)).at(-1)).toMatchObject({ nom: "Traoré Ibrahim", statut: "a_payer" });
  });

  it("ne paie pas sans décharge, sans nom de qui reçoit, ni avec une date fausse", async () => {
    const [premier] = await intervenantsDe(org, missionId);
    const base = { payeLe: "2026-11-12", moyen: "especes", recuPar: "Yao Kouassi", decharge: decharge() };
    await expect(payerIntervenantPour(org, user, premier.id, { ...base, decharge: null })).rejects.toThrow(/décharge/);
    await expect(payerIntervenantPour(org, user, premier.id, { ...base, recuPar: " " })).rejects.toThrow(/reçu/);
    await expect(payerIntervenantPour(org, user, premier.id, { ...base, payeLe: "2026-02-30" })).rejects.toThrow(/date/i);
    await expect(payerIntervenantPour(org, user, premier.id, { ...base, moyen: "cheque" })).rejects.toThrow(/moyen/);
    expect((await intervenantsDe(org, missionId))[0].statut).toBe("a_payer");
  });

  it("paie sur place, garde la décharge au dépôt, et ne paie pas deux fois", async () => {
    const [premier] = await intervenantsDe(org, missionId);
    await payerIntervenantPour(org, user, premier.id, { payeLe: "2026-11-12", moyen: "mobile_money", recuPar: "Yao Kouassi", decharge: decharge() });
    const [paye] = await intervenantsDe(org, missionId);
    expect(paye).toMatchObject({ statut: "paye", payeLe: "2026-11-12", moyen: "mobile_money", recuPar: "Yao Kouassi", decharge: true });
    const chemin = await cheminDecharge(org, premier.id);
    expect(chemin && existsSync(join(depot, chemin))).toBe(true);
    await expect(payerIntervenantPour(org, user, premier.id, { payeLe: "2026-11-13", moyen: "especes", recuPar: "Yao", decharge: decharge() })).rejects.toThrow(/déjà payé/);
    await expect(annulerIntervenantPour(org, user, premier.id, "Erreur")).rejects.toThrow(/payé/);
  });

  it("la base refuse elle-même un payé sans décharge", async () => {
    const [, second] = await intervenantsDe(org, missionId);
    await expect(db.update(intervenantsMission).set({ statut: "paye", payeLe: "2026-11-12", moyen: "especes", recuPar: "Awa" }).where(eq(intervenantsMission.id, second.id))).rejects.toThrow();
  });

  it("annule avec un motif, libère le budget, et ne laisse pas baisser le budget sous le confié", async () => {
    const lignes = await intervenantsDe(org, missionId);
    const second = lignes[1];
    await expect(annulerIntervenantPour(org, user, second.id, " ")).rejects.toThrow(/pourquoi/);
    await expect(fixerBudgetPour(org, user, missionId, 50_000)).rejects.toThrow(/inférieur/);
    await annulerIntervenantPour(org, user, second.id, "Plus besoin");
    const [m] = await db.select({ n: intervenantsMission.id }).from(intervenantsMission).where(and(eq(intervenantsMission.id, second.id), eq(intervenantsMission.statut, "annule")));
    expect(m).toBeTruthy();
    // 35 000 F libérés : une autre tâche de cette valeur rentre de nouveau.
    await confierIntervenantPour(org, user, missionId, { tache: "Animation", nature: "prestataire", nom: "DJ Studio", montantConvenu: 35_000 });
  });
});
