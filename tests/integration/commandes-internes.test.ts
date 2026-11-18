import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerSalariePour } from "@/modules/personnes/creation";
import { annulerCommandeInterneDans, deciderCommandeInterneDans, demanderCommandeInterneDans } from "@/modules/tresorerie/creation-commandes-internes";
import { commandeInterne, listerCommandesInternes } from "@/modules/tresorerie/requetes-commandes-internes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let demandeur: string;
let pdg: string;

const annee = new Date().toISOString().slice(0, 4);

const EQUIPEMENT = {
  objet: "Équipement — ordinateurs, téléphones et flotte Orange",
  service: "Direction",
  lieuLivraison: "Siège",
  beneficiaire: "Kouassi Aya",
  lignes: [
    { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Technicien", quantite: 1, prixUnitaire: 300_000 },
    { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Assistant", quantite: 1, prixUnitaire: 300_000 },
    { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Commercial", quantite: 1, prixUnitaire: 300_000 },
    { rubrique: "Achat d'ordinateurs", designation: "Ordinateur — poste Informaticien", quantite: 1, prixUnitaire: 300_000 },
    { rubrique: "Achat de téléphones", designation: "Téléphone — poste Commercial", quantite: 1, prixUnitaire: 50_000 },
    { rubrique: "Achat de téléphones", designation: "Téléphone — poste Assistant", quantite: 1, prixUnitaire: 50_000 },
    { rubrique: "Abonnement flotte Orange", designation: "Numéros Orange — 2 mois d'avance", quantite: 11, prixUnitaire: 10_000 },
  ],
};

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: pdg } = await semerEntreprise(db));
  demandeur = newId();
  await db.insert(users).values({ id: demandeur, email: `assistant-${demandeur.slice(0, 8)}@maria-groupe.com`, fullName: "Assistante de direction" });
});
afterAll(async () => fermer());

describe("bon de commande interne", () => {
  it("se numérote BCI-AAAA-NNNNN, sans trou, et fige le total des lignes", async () => {
    const a = await db.transaction((tx) => demanderCommandeInterneDans(tx, org, EQUIPEMENT, demandeur));
    const b = await db.transaction((tx) => demanderCommandeInterneDans(tx, org, { objet: "Fournitures", beneficiaire: "Kouassi Aya", lignes: [{ rubrique: "", designation: "Rame A4", quantite: 10, prixUnitaire: 3_000 }] }, demandeur));
    expect(a.numero).toBe(`BCI-${annee}-00001`);
    expect(b.numero).toBe(`BCI-${annee}-00002`);
    expect(a.total).toBe(1_410_000);

    const lu = await commandeInterne(org, pdg, true, a.id);
    expect(lu).toMatchObject({ objet: EQUIPEMENT.objet, total: 1_410_000, statut: "demande", demandeur: "Assistante de direction", beneficiaire: "Kouassi Aya" });
    expect(lu?.lignes).toHaveLength(7);
  });

  it("exige le nom et le prénom du bénéficiaire, ou sa fiche", async () => {
    const lignes = [{ rubrique: "", designation: "Rame A4", quantite: 1, prixUnitaire: 3_000 }];
    await expect(db.transaction((tx) => demanderCommandeInterneDans(tx, org, { objet: "Sans nom", lignes }, demandeur))).rejects.toThrow(/nom et le prénom/);
    await expect(db.transaction((tx) => demanderCommandeInterneDans(tx, org, { objet: "Prénom seul", beneficiaire: "Aya", lignes }, demandeur))).rejects.toThrow(/nom et le prénom/);
    const { id: konan } = await creerSalariePour(org, { nom: "Konan Michel", poste: "Technicien", debut: "2026-01-05", salaireBase: 150_000 }, pdg);
    const { id } = await db.transaction((tx) => demanderCommandeInterneDans(tx, org, { objet: "Par fiche", fiche: { employeId: konan }, lignes }, demandeur));
    expect((await commandeInterne(org, pdg, true, id))?.beneficiaire).toBe("Konan Michel");
  });

  it("refuse des lignes qui n'ont pas été relues", async () => {
    await expect(
      db.transaction((tx) => demanderCommandeInterneDans(tx, org, { objet: "Faux", beneficiaire: "Kouassi Aya", lignes: [{ rubrique: "", designation: "X", quantite: 1.5, prixUnitaire: 100 }] }, demandeur)),
    ).rejects.toThrow(/quantité/);
  });

  it("ne s'approuve pas par son demandeur, mais par un autre", async () => {
    const { id } = await db.transaction((tx) => demanderCommandeInterneDans(tx, org, EQUIPEMENT, demandeur));
    await expect(db.transaction((tx) => deciderCommandeInterneDans(tx, org, id, { approuve: true }, { userId: demandeur, estProprietaire: false }))).rejects.toThrow(/propre demande/);
    await db.transaction((tx) => deciderCommandeInterneDans(tx, org, id, { approuve: true }, { userId: pdg, estProprietaire: true }));
    expect((await commandeInterne(org, pdg, true, id))?.statut).toBe("approuve");
    await expect(db.transaction((tx) => deciderCommandeInterneDans(tx, org, id, { approuve: false, motif: "Trop tard" }, { userId: pdg, estProprietaire: true }))).rejects.toThrow(/déjà reçu/);
  });

  it("garde le motif d'un refus, puis ne s'annule plus", async () => {
    const { id } = await db.transaction((tx) => demanderCommandeInterneDans(tx, org, EQUIPEMENT, demandeur));
    await db.transaction((tx) => deciderCommandeInterneDans(tx, org, id, { approuve: false, motif: "Budget de décembre" }, { userId: pdg, estProprietaire: true }));
    expect(await commandeInterne(org, pdg, true, id)).toMatchObject({ statut: "rejete", motifRejet: "Budget de décembre" });
    await expect(db.transaction((tx) => annulerCommandeInterneDans(tx, org, id, { userId: demandeur, approuve: false }))).rejects.toThrow(/ne s'annule plus/);
  });

  it("s'annule par son demandeur, pas par un tiers sans droit", async () => {
    const { id } = await db.transaction((tx) => demanderCommandeInterneDans(tx, org, EQUIPEMENT, demandeur));
    await expect(db.transaction((tx) => annulerCommandeInterneDans(tx, org, id, { userId: newId(), approuve: false }))).rejects.toThrow(/Seul le demandeur/);
    await db.transaction((tx) => annulerCommandeInterneDans(tx, org, id, { userId: demandeur, approuve: false }));
    expect((await commandeInterne(org, pdg, true, id))?.statut).toBe("annule");
  });

  it("ne montre à qui ne voit pas tout que ses propres bons", async () => {
    await db.transaction((tx) => demanderCommandeInterneDans(tx, org, { objet: "Mon besoin", beneficiaire: "Kouassi Aya", lignes: [{ rubrique: "", designation: "Agrafeuse", quantite: 1, prixUnitaire: 5_000 }] }, pdg));
    const siens = await listerCommandesInternes(org, demandeur, false);
    expect(siens.length).toBeGreaterThan(0);
    expect(siens.every((c) => c.demandeParUserId === demandeur)).toBe(true);
    const tous = await listerCommandesInternes(org, pdg, true);
    expect(tous.some((c) => c.demandeParUserId === pdg)).toBe(true);
  });
});
