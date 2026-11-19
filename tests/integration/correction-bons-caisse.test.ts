import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { ecritures } from "@/modules/comptabilite/schema";
import { annulerBonDans, creerCompteDans, decaisserBonPour, deciderBonDans, demanderBonDans, soldeDuCompte, type NouveauBon } from "@/modules/tresorerie/creation";
import { enregistrerMouvementDans } from "@/modules/tresorerie/creation-mouvements";
import { modifierBonDans, supprimerBonDans } from "@/modules/tresorerie/correction-bons";
import { bonCaisse, listerBons } from "@/modules/tresorerie/requetes";
import { bonsCaisse } from "@/modules/tresorerie/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let pdg: string;
let demandeur: string;
let caisse: string;

const aujourdhui = new Date().toISOString().slice(0, 10);
const APPORT = 500_000;

const CARBURANT: NouveauBon = { caisseId: "", nature: "carburant", montant: 25_000, beneficiaire: "Kadio Pierre", motif: "Transport du matériel pour Bassam" };

/** Le demandeur ne détient pas le droit d'approuver ; le PDG si. */
const parDemandeur = () => ({ userId: demandeur, approuve: false, estProprietaire: false });
const parPdg = () => ({ userId: pdg, approuve: true, estProprietaire: false });
const parInconnu = () => ({ userId: newId(), approuve: false, estProprietaire: false });

async function demander(bon: Partial<NouveauBon> = {}) {
  return db.transaction((tx) => demanderBonDans(tx, org, { ...CARBURANT, caisseId: caisse, ...bon }, demandeur));
}
async function approuver(id: string) {
  await db.transaction((tx) => deciderBonDans(tx, org, id, { approuve: true }, { userId: pdg, estProprietaire: false }));
}
async function ligne(id: string) {
  const [b] = await db.select().from(bonsCaisse).where(eq(bonsCaisse.id, id));
  return b;
}
async function ecrituresDu(id: string) {
  return db
    .select({ numero: ecritures.numero, piece: ecritures.pieceNumero, libelle: ecritures.libelle })
    .from(ecritures)
    .where(and(eq(ecritures.organizationId, org), eq(ecritures.pieceId, id)))
    .orderBy(asc(ecritures.createdAt), asc(ecritures.numero));
}
const solde = () => soldeDuCompte(db, org, "571");

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: pdg } = await semerEntreprise(db));
  demandeur = newId();
  await db.insert(users).values({ id: demandeur, email: `caissier-${demandeur.slice(0, 8)}@maria-groupe.com`, fullName: "Kadio Pierre Michael" });
  ({ id: caisse } = await db.transaction((tx) => creerCompteDans(tx, org, { nom: "Caisse siège", nature: "caisse", compte: "571", seuilAlerte: 0 }, pdg)));
  await db.transaction((tx) => enregistrerMouvementDans(tx, org, { compteId: caisse, nature: "apport", montant: APPORT, date: aujourdhui }, pdg));
});
afterAll(async () => fermer());

describe("modification d'un bon de caisse", () => {
  it("corrige une demande, par son demandeur seulement ou qui approuve", async () => {
    const { id } = await demander();
    const m = await db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, nature: "transport", montant: 30_000, motif: "Taxi Bassam" }, parDemandeur()));
    expect(m).toMatchObject({ statut: "demande", correction: null });
    expect(await ligne(id)).toMatchObject({ nature: "transport", montant: 30_000, motif: "Taxi Bassam", statut: "demande" });

    await expect(db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse }, parInconnu()))).rejects.toThrow(/Seul le demandeur/);
  });

  it("renvoie à l'approbation un bon approuvé que son demandeur modifie ; qui approuve le garde approuvé", async () => {
    const { id } = await demander();
    await approuver(id);
    await db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: 27_000 }, parPdg()));
    expect(await ligne(id)).toMatchObject({ statut: "approuve", montant: 27_000, approuveParUserId: pdg });

    const m = await db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: 28_000 }, parDemandeur()));
    expect(m).toMatchObject({ statutAvant: "approuve", statut: "demande" });
    expect(await ligne(id)).toMatchObject({ statut: "demande", montant: 28_000, approuveParUserId: null, approuveLe: null });
  });

  it("soumet de nouveau un bon refusé qu'on corrige", async () => {
    const { id } = await demander();
    await db.transaction((tx) => deciderBonDans(tx, org, id, { approuve: false, motif: "Montant trop élevé" }, { userId: pdg, estProprietaire: false }));
    await db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: 15_000 }, parDemandeur()));
    expect(await ligne(id)).toMatchObject({ statut: "demande", montant: 15_000, motifRejet: null });
  });

  it("ne modifie pas un bon annulé", async () => {
    const { id } = await demander();
    await db.transaction((tx) => annulerBonDans(tx, org, id, { userId: demandeur, approuve: false }));
    await expect(db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse }, parPdg()))).rejects.toThrow(/annulé/);
  });

  it("corrige un bon décaissé par contre-passation et nouvelle écriture, et la caisse suit", async () => {
    const { id } = await demander();
    await approuver(id);
    const avant = await solde();
    const { ecriture: premiere } = await decaisserBonPour(org, id, null, pdg);
    expect(await solde()).toBe(avant - 25_000);

    await expect(
      db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: 20_000 }, parDemandeur())),
    ).rejects.toThrow(/décaissé : seul qui approuve/);

    const m = await db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: 20_000 }, parPdg()));
    expect(m.statut).toBe("decaisse");
    expect(m.correction).not.toBeNull();
    expect(await solde()).toBe(avant - 20_000);
    expect(await ligne(id)).toMatchObject({ statut: "decaisse", montant: 20_000, ecriture: m.correction!.nouvelle });

    // Une deuxième correction prend les rangs suivants : une pièce ne se comptabilise qu'une fois.
    const encore = await db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: 22_000 }, parPdg()));
    expect(await solde()).toBe(avant - 22_000);
    const passees = await ecrituresDu(id);
    const numero = (await ligne(id)).numero;
    expect(passees.map((e) => e.piece)).toEqual([numero, `${numero}-2`, `${numero}-3`, `${numero}-4`, `${numero}-5`]);
    expect(passees[0].numero).toBe(premiere);
    expect(passees.at(-1)?.numero).toBe(encore.correction?.nouvelle);
  });

  it("ne refait pas l'écriture d'un bon décaissé quand seul le motif change", async () => {
    const { id } = await demander({ montant: 5_000 });
    await approuver(id);
    await decaisserBonPour(org, id, null, pdg);
    const m = await db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: 5_000, motif: "Plein du pick-up" }, parPdg()));
    expect(m.correction).toBeNull();
    expect(await ecrituresDu(id)).toHaveLength(1);
    expect((await ligne(id)).motif).toBe("Plein du pick-up");
  });

  it("refuse de porter un bon décaissé au-delà de ce que la caisse contient, sans rien toucher", async () => {
    const { id } = await demander({ montant: 1_000 });
    await approuver(id);
    await decaisserBonPour(org, id, null, pdg);
    const avant = await solde();
    await expect(
      db.transaction((tx) => modifierBonDans(tx, org, id, { ...CARBURANT, caisseId: caisse, montant: avant + 1_000 + 1 }, parPdg())),
    ).rejects.toThrow(/ne contient que/);
    expect(await solde()).toBe(avant);
    expect(await ecrituresDu(id)).toHaveLength(1);
    expect((await ligne(id)).montant).toBe(1_000);
  });
});

describe("suppression d'un bon de caisse", () => {
  it("retire un bon des listes ; il ne se décide plus", async () => {
    const { id, numero } = await demander();
    await expect(db.transaction((tx) => supprimerBonDans(tx, org, id, parInconnu()))).rejects.toThrow(/Seul le demandeur/);

    const s = await db.transaction((tx) => supprimerBonDans(tx, org, id, parDemandeur()));
    expect(s).toEqual({ numero, montant: 25_000, contrepassee: null });
    expect((await ligne(id)).deletedAt).not.toBeNull();
    expect((await listerBons(org, pdg, true)).some((b) => b.id === id)).toBe(false);
    expect(await bonCaisse(org, pdg, true, id)).toBeNull();
    await expect(approuver(id)).rejects.toThrow(/introuvable/);
    await expect(db.transaction((tx) => supprimerBonDans(tx, org, id, parPdg()))).rejects.toThrow(/introuvable/);
  });

  it("supprime un bon annulé ou approuvé", async () => {
    const annule = await demander();
    await db.transaction((tx) => annulerBonDans(tx, org, annule.id, { userId: demandeur, approuve: false }));
    await db.transaction((tx) => supprimerBonDans(tx, org, annule.id, parDemandeur()));

    const approuve = await demander();
    await approuver(approuve.id);
    await db.transaction((tx) => supprimerBonDans(tx, org, approuve.id, parPdg()));
    const restants = await listerBons(org, pdg, true);
    expect(restants.some((b) => b.id === annule.id || b.id === approuve.id)).toBe(false);
  });

  it("contrepasse l'écriture d'un bon décaissé : l'argent revient en caisse", async () => {
    const { id, numero } = await demander({ montant: 40_000 });
    await approuver(id);
    const avant = await solde();
    await decaisserBonPour(org, id, null, pdg);
    expect(await solde()).toBe(avant - 40_000);

    await expect(db.transaction((tx) => supprimerBonDans(tx, org, id, parDemandeur()))).rejects.toThrow(/décaissé : seul qui approuve/);

    const s = await db.transaction((tx) => supprimerBonDans(tx, org, id, parPdg()));
    expect(s.contrepassee).not.toBeNull();
    expect(await solde()).toBe(avant);
    const passees = await ecrituresDu(id);
    expect(passees.map((e) => e.piece)).toEqual([numero, `${numero}-2`]);
    expect(passees[1].libelle).toMatch(/supprimé/);
  });
});
