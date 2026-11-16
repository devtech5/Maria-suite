import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { commandesAchat, lignesCommandeAchat, lignesPiece, notesCalcul, notesCalculSuites, piecesCommerciales, projets } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  annulerNotePour,
  correspondancesDe,
  creerCommandeDepuisNotePour,
  creerDevisDepuisNotePour,
  enregistrerCorrespondancePour,
  enregistrerNotePour,
  listerNotes,
  noteDe,
} from "@/modules/calculs/donnees";
import { creerArticlePour } from "@/modules/catalogue/creation";
import { creerTiersDans } from "@/modules/tiers/creation";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let autreOrg: string;
let user: string;
let autreUser: string;
let projet: string;
let projetSansClient: string;
let projetClos: string;
let fournisseur: string;
let ciment: string;
let sableM3: string;
let sableKg: string;
let fer: string;

const dalle = { ouvrage: "dalle", longueurMm: 5000, largeurMm: 4000, hauteurMm: 120, nombre: 1, diametreFer: 10 };

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ organizationId: autreOrg, userId: autreUser } = await semerEntreprise(db, "Autre entreprise"));
  const { id: client } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "SCI Les Palmiers", estClient: true }, user));
  ({ id: fournisseur } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Quincaillerie du Plateau", estClient: false, estFournisseur: true }, user)));
  projet = newId();
  projetSansClient = newId();
  projetClos = newId();
  await db.insert(projets).values([
    { id: projet, organizationId: org, code: "CH-001", nom: "Résidence Les Palmiers", clientId: client, statut: "en_cours" },
    { id: projetSansClient, organizationId: org, code: "CH-002", nom: "Siège", statut: "preparation" },
    { id: projetClos, organizationId: org, code: "CH-000", nom: "Ancien chantier", statut: "termine" },
  ]);
  ({ id: ciment } = await creerArticlePour(org, { designation: "Ciment CPJ 42,5 (sac 50 kg)", unite: "piece", prixVente: 5_500, prixAchat: 4_900 }, user));
  ({ id: sableM3 } = await creerArticlePour(org, { designation: "Sable lagunaire", unite: "m3", prixVente: 12_000, prixAchat: 9_000 }, user));
  ({ id: sableKg } = await creerArticlePour(org, { designation: "Sable en sac", unite: "kg", prixVente: 50, prixAchat: 40 }, user));
  ({ id: fer } = await creerArticlePour(org, { designation: "Fer HA10 (barre 12 m)", unite: "piece", prixVente: 4_000, prixAchat: 3_500, tauxTva: 900, compteAchat: "6022" }, user));
});
afterAll(async () => fermer());

describe("notes de calcul sur une vraie base", () => {
  let note: string;

  it("numérote la note, refait le calcul et fige les matériaux", async () => {
    const r = await enregistrerNotePour(org, user, { type: "beton", saisie: { ...dalle, resultat: "ignoré" }, projetId: projet, libelle: "Dalle du RDC" });
    note = r.id;
    expect(r.numero).toMatch(/^NC-\d{4}-00001$/);
    const r2 = await enregistrerNotePour(org, user, { type: "pente", saisie: { longueurMm: 5000, hauteurMm: 100, penteCentiemes: null }, projetId: projet, libelle: "Terrasse" });
    expect(r2.numero).toMatch(/-00002$/);

    const [ligne] = await db.select().from(notesCalcul).where(eq(notesCalcul.id, note));
    expect(ligne.saisie).not.toHaveProperty("resultat");
    expect(ligne.resultat).toMatchObject({ sacsCiment: 18, ferKg: 216, barresFer: 30 });
    expect(ligne.reglagesVerifies).toBe(false);
    expect((ligne.materiaux as { cle: string }[]).map((m) => m.cle)).toEqual(["ciment", "sable", "gravier", "fer_ha10"]);

    const d = await noteDe(org, note);
    expect(d?.projet).toMatchObject({ code: "CH-001", clientNom: "SCI Les Palmiers" });
    expect(await listerNotes(org, projet)).toHaveLength(2);
  });

  it("refuse un projet clos, d'une autre entreprise, ou une saisie invalide", async () => {
    await expect(enregistrerNotePour(org, user, { type: "beton", saisie: dalle, projetId: projetClos, libelle: "Dalle" })).rejects.toThrow(/clos/);
    await expect(enregistrerNotePour(autreOrg, autreUser, { type: "beton", saisie: dalle, projetId: projet, libelle: "Dalle" })).rejects.toThrow(/introuvable/);
    await expect(enregistrerNotePour(org, user, { type: "beton", saisie: { ...dalle, longueurMm: -1 }, projetId: projet, libelle: "Dalle" })).rejects.toThrow(/Longueur/);
    await expect(enregistrerNotePour(org, user, { type: "beton", saisie: dalle, projetId: projet, libelle: " " })).rejects.toThrow(/libellé/);
  });

  it("associe un matériau à un article de la même unité seulement", async () => {
    await enregistrerCorrespondancePour(org, user, "ciment", ciment);
    await expect(enregistrerCorrespondancePour(org, user, "sable", sableKg)).rejects.toThrow(/se compte en kg/);
    await enregistrerCorrespondancePour(org, user, "sable", sableM3);
    await expect(enregistrerCorrespondancePour(autreOrg, autreUser, "ciment", ciment)).rejects.toThrow(/introuvable/);
    expect(await correspondancesDe(org)).toEqual({ ciment, sable: sableM3 });
    await enregistrerCorrespondancePour(org, user, "sable", null);
    expect(await correspondancesDe(org)).toEqual({ ciment });
  });

  it("prépare le devis brouillon du client, au prix de vente, rattaché au projet", async () => {
    const { id } = await creerDevisDepuisNotePour(org, user, note, [
      { cle: "ciment", articleId: ciment },
      { cle: "sable", articleId: sableM3 },
    ]);
    const [piece] = await db.select().from(piecesCommerciales).where(eq(piecesCommerciales.id, id));
    expect(piece).toMatchObject({ nature: "devis", statut: "brouillon", projetId: projet, clientNom: "SCI Les Palmiers" });
    expect(piece.notes).toContain("NC-");
    const lignes = await db.select().from(lignesPiece).where(eq(lignesPiece.pieceId, id));
    // 18 sacs à 5 500 F ; 1,008 m³ à 12 000 F.
    expect(lignes.map((l) => [l.quantite, l.prixUnitaireHt, l.montantHt]).sort()).toEqual([
      [1_008, 12_000, 12_096],
      [18_000, 5_500, 99_000],
    ]);
  });

  it("prépare la commande fournisseur au prix d'achat, TVA et compte de l'article", async () => {
    const { id, numero } = await creerCommandeDepuisNotePour(org, user, note, fournisseur, [
      { cle: "ciment", articleId: ciment },
      { cle: "fer_ha10", articleId: fer },
    ]);
    expect(numero).toMatch(/^BCF-/);
    const [c] = await db.select().from(commandesAchat).where(eq(commandesAchat.id, id));
    expect(c.fournisseurNom).toBe("Quincaillerie du Plateau");
    const lignes = await db.select().from(lignesCommandeAchat).where(eq(lignesCommandeAchat.commandeId, id));
    const ligneFer = lignes.find((l) => l.articleId === fer);
    expect(ligneFer).toMatchObject({ quantite: 30_000, prixUnitaireHt: 3_500, tauxTva: 900, compteAchat: "6022" });
    expect(lignes.find((l) => l.articleId === ciment)).toMatchObject({ quantite: 18_000, prixUnitaireHt: 4_900, tauxTva: 1800, compteAchat: "601" });

    const suites = await db.select().from(notesCalculSuites).where(and(eq(notesCalculSuites.noteId, note), eq(notesCalculSuites.organizationId, org)));
    expect(suites.map((s) => s.nature).sort()).toEqual(["commande", "devis"]);
  });

  it("refuse une unité incompatible, un matériau absent, un doublon, un projet sans client", async () => {
    await expect(creerCommandeDepuisNotePour(org, user, note, fournisseur, [{ cle: "sable", articleId: sableKg }])).rejects.toThrow(/se compte en kg/);
    await expect(creerCommandeDepuisNotePour(org, user, note, fournisseur, [{ cle: "colle", articleId: ciment }])).rejects.toThrow(/pas sur la note/);
    await expect(
      creerCommandeDepuisNotePour(org, user, note, fournisseur, [
        { cle: "ciment", articleId: ciment },
        { cle: "ciment", articleId: ciment },
      ]),
    ).rejects.toThrow(/deux fois/);
    await expect(creerDevisDepuisNotePour(autreOrg, autreUser, note, [{ cle: "ciment", articleId: ciment }])).rejects.toThrow(/introuvable/);
    const { id: autre } = await enregistrerNotePour(org, user, { type: "beton", saisie: dalle, projetId: projetSansClient, libelle: "Dalle" });
    await expect(creerDevisDepuisNotePour(org, user, autre, [{ cle: "ciment", articleId: ciment }])).rejects.toThrow(/pas de client/);
  });

  it("une note annulée garde son numéro et ne donne plus de pièce", async () => {
    await expect(annulerNotePour(org, autreUser, note, "Erreur de cote", false)).rejects.toThrow(/rédacteur/);
    await expect(annulerNotePour(org, user, note, "x", false)).rejects.toThrow(/motif/);
    const { numero } = await annulerNotePour(org, user, note, "Erreur de cote", false);
    expect(numero).toMatch(/-00001$/);
    await expect(annulerNotePour(org, user, note, "Encore", true)).rejects.toThrow(/déjà annulée/);
    await expect(creerDevisDepuisNotePour(org, user, note, [{ cle: "ciment", articleId: ciment }])).rejects.toThrow(/annulée/);
    expect((await listerNotes(org, projet)).find((n) => n.id === note)?.annulee).toBe(true);
  });
});
