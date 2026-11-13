import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { articles, lignesPiece, piecesCommerciales, tiers } from "@/db/schema";
import { creerArticlePour } from "@/modules/catalogue/creation";
import { enregistrerBrouillonDans } from "@/modules/facturation/creation";
import { creerTiersPour } from "@/modules/tiers/creation";

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

const base = { nature: "facture" as const, datePiece: "2026-11-12", creerServices: true };
const ligne = (designation: string, prix = 100_000) => ({ articleId: null, designation, quantite: 1000, prixUnitaireHt: prix });

describe("devis et factures : services et client créés sur place", () => {
  it("enregistre le client absent du fichier, avec son type, dans la même transaction que la pièce", async () => {
    const { id } = await db.transaction((tx) =>
      enregistrerBrouillonDans(tx, org, { ...base, nouveauClient: { nom: "Mutuelle des enseignants", nature: "mutuelle", telephone: "0707" }, lignes: [ligne("Pose et montage")] }, user),
    );
    const [piece] = await db.select().from(piecesCommerciales).where(eq(piecesCommerciales.id, id));
    const [client] = await db.select().from(tiers).where(eq(tiers.id, piece.clientId));
    expect(client).toMatchObject({ nom: "Mutuelle des enseignants", nature: "mutuelle", estClient: true, telephone: "0707" });
    expect(client.compteClient).toMatch(/^411/);
    expect(piece.clientNom).toBe("Mutuelle des enseignants");
  });

  it("ne crée aucun client si la pièce échoue", async () => {
    const avant = (await db.select({ id: tiers.id }).from(tiers)).length;
    await expect(db.transaction((tx) => enregistrerBrouillonDans(tx, org, { ...base, nouveauClient: { nom: "Fantôme SARL", nature: "entreprise" }, lignes: [] }, user))).rejects.toThrow(/au moins une ligne/);
    await expect(db.transaction((tx) => enregistrerBrouillonDans(tx, org, { ...base, nouveauClient: { nom: "Fantôme SARL", nature: "entreprise" }, projetId: "00000000-0000-4000-8000-000000000000", lignes: [ligne("X")] }, user))).rejects.toThrow();
    expect((await db.select({ id: tiers.id }).from(tiers)).length).toBe(avant);
  });

  it("refuse de recréer un client déjà au fichier, quelle que soit la casse", async () => {
    await creerTiersPour(org, { nom: "Coopérative Anouanzè", nature: "cooperative" }, user);
    await expect(
      db.transaction((tx) => enregistrerBrouillonDans(tx, org, { ...base, nouveauClient: { nom: "COOPÉRATIVE ANOUANZÈ", nature: "cooperative" }, lignes: [ligne("Audit")] }, user)),
    ).rejects.toThrow(/déjà au fichier/);
  });

  it("exige un client : du fichier, ou décrit sur place", async () => {
    await expect(db.transaction((tx) => enregistrerBrouillonDans(tx, org, { ...base, lignes: [ligne("Audit")] }, user))).rejects.toThrow(/client/i);
  });

  it("ajoute au catalogue un service nouveau, une seule fois même sur deux lignes", async () => {
    const { id: clientId } = await creerTiersPour(org, { nom: "Client Services", nature: "entreprise" }, user);
    const { id } = await db.transaction((tx) =>
      enregistrerBrouillonDans(tx, org, { ...base, clientId, lignes: [ligne("Étude de faisabilité", 500_000), ligne("étude de faisabilité", 500_000)] }, user),
    );
    const trouves = await db.select().from(articles).where(and(eq(articles.organizationId, org), eq(articles.designation, "Étude de faisabilité")));
    expect(trouves).toHaveLength(1);
    // Service : ni stock, TVA normale, compte de prestations ; prix de rayon TTC = HT + 18 %.
    expect(trouves[0]).toMatchObject({ type: "service", suiviStock: false, tauxTva: 1800, compteVente: "706", prixVente: 590_000 });
    const lignes = await db.select().from(lignesPiece).where(eq(lignesPiece.pieceId, id));
    expect(lignes.map((l) => l.articleId)).toEqual([trouves[0].id, trouves[0].id]);
    expect(lignes.every((l) => l.compteVente === "706" && l.tauxTva === 1800)).toBe(true);
  });

  it("rattache le service qui existe déjà au lieu d'en créer un second", async () => {
    const { id: clientId } = await creerTiersPour(org, { nom: "Client Existant", nature: "association" }, user);
    const { id: existant } = await creerArticlePour(org, { designation: "Formation sécurité", type: "service", prixVente: 118_000, tauxTva: 1800, compteVente: "706" }, user);
    const avant = (await db.select({ id: articles.id }).from(articles)).length;
    const { id } = await db.transaction((tx) => enregistrerBrouillonDans(tx, org, { ...base, clientId, lignes: [ligne("formation sécurité", 100_000)] }, user));
    expect((await db.select({ id: articles.id }).from(articles)).length).toBe(avant);
    const [l] = await db.select().from(lignesPiece).where(eq(lignesPiece.pieceId, id));
    expect(l.articleId).toBe(existant);
  });

  it("garde les lignes libres telles quelles quand la création de services n'est pas demandée", async () => {
    const { id: clientId } = await creerTiersPour(org, { nom: "Client Libre", nature: "entreprise" }, user);
    const avant = (await db.select({ id: articles.id }).from(articles)).length;
    const { id } = await db.transaction((tx) => enregistrerBrouillonDans(tx, org, { nature: "devis", datePiece: "2026-11-12", clientId, lignes: [ligne("Prestation ponctuelle")] }, user));
    expect((await db.select({ id: articles.id }).from(articles)).length).toBe(avant);
    const [l] = await db.select().from(lignesPiece).where(eq(lignesPiece.pieceId, id));
    expect(l.articleId).toBeNull();
  });
});
