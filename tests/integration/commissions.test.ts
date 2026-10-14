import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerArticleDans } from "@/modules/catalogue/creation";
import { enregistrerCommercialDans, payerCommissionDans, realisationsDuMois, validerCommissionDans } from "@/modules/commerciaux/creation";
import { commissions } from "@/modules/commerciaux/schema";
import { piecesCommerciales } from "@/modules/facturation/schema";
import { depots, mouvementsStock } from "@/modules/stock/schema";
import { creerTiersDans } from "@/modules/tiers/creation";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  // Le commercial lié à un compte en reprend le nom : le compte doit appartenir à l'entreprise.
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId: org, key: "vente", name: "Vente" });
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId: user, roleId, status: "actif" });
});
afterAll(async () => fermer());

describe("commissions", () => {
  it("attribue factures et avoirs, mesure la marge, valide puis paie", async () => {
    const { id: koffi } = await db.transaction((tx) =>
      enregistrerCommercialDans(tx, org, null, { nom: "Koffi", userId: user, base: "marge", tauxBp: 0, paliers: [{ seuil: 0, tauxBp: 1_000 }, { seuil: 500_000, tauxBp: 2_000 }], fixeMensuel: 25_000, objectifMensuel: 1_000_000 }, user),
    );
    const { id: client } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Client essai" }));
    const { id: article } = await db.transaction((tx) => creerArticleDans(tx, org, { reference: "A1", designation: "Article", prixVente: 10_000, prixAchat: 6_000 }));
    const depot = newId();
    await db.insert(depots).values({ id: depot, organizationId: org, code: "D", nom: "Dépôt" });

    const piece = (nature: "facture" | "avoir", numero: string, ht: number, date: string, commercialId: string | null = null) => ({
      id: newId(), organizationId: org, nature, numero, statut: "emise" as const, clientId: client, clientNom: "Client essai", datePiece: date, totalHt: ht, totalTva: 0, totalTtc: ht, userId: user, commercialId,
    });
    // Facture attribuée par l'utilisateur (aucun commercial choisi) : 100 unités vendues, coût 6 000.
    const f1 = piece("facture", "FAC-1", 1_000_000, "2026-09-10");
    await db.insert(piecesCommerciales).values(f1);
    await db.insert(mouvementsStock).values({ id: newId(), organizationId: org, depotId: depot, articleId: article, type: "vente", quantite: -100_000, coutUnitaire: 6_000, piece: "FAC-1", origineId: f1.id });
    // Avoir partiel le même mois, 10 unités reprises.
    const a1 = piece("avoir", "AVO-1", 100_000, "2026-09-20", koffi);
    await db.insert(piecesCommerciales).values(a1);
    await db.insert(mouvementsStock).values({ id: newId(), organizationId: org, depotId: depot, articleId: article, type: "retour", quantite: 10_000, coutUnitaire: 6_000, piece: "AVO-1", origineId: a1.id });
    // Une facture d'un autre mois ne compte pas.
    await db.insert(piecesCommerciales).values(piece("facture", "FAC-2", 999_000, "2026-10-01"));

    const r = (await realisationsDuMois(db, org, "2026-09")).get(koffi);
    expect(r).toEqual({ caHt: 900_000, marge: 900_000 - 540_000 });

    // Marge 360 000 : 10 % jusqu'à 500 000 = 36 000, plus 25 000 de fixe.
    const v = await db.transaction((tx) => validerCommissionDans(tx, org, koffi, "2026-09", "2026-10-05", user));
    expect(v.total).toBe(61_000);
    await expect(db.transaction((tx) => validerCommissionDans(tx, org, koffi, "2026-09", "2026-10-05", user))).rejects.toThrow(/déjà validée/);
    await expect(db.transaction((tx) => validerCommissionDans(tx, org, koffi, "2026-10", "2026-10-05", user))).rejects.toThrow(/pas terminé/);

    const banque = newId();
    await db.insert(comptesTresorerie).values({ id: banque, organizationId: org, nom: "Banque", nature: "banque", compte: "5211" });
    const [{ id: commission }] = await db.select({ id: commissions.id }).from(commissions).where(eq(commissions.commercialId, koffi));
    const p = await db.transaction((tx) => payerCommissionDans(tx, org, commission, { compteTresorerieId: banque, date: "2026-10-05" }, user));
    expect(p.montant).toBe(61_000);
    await expect(db.transaction((tx) => payerCommissionDans(tx, org, commission, { compteTresorerieId: banque, date: "2026-10-06" }, user))).rejects.toThrow(/déjà payée/);
  });
});
