import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerIntervenantPour, creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { creerTiersDans } from "@/modules/tiers/creation";
import { tiers } from "@/modules/tiers/schema";
import { creerCompteDans, demanderBonDans, remettreAvanceDans } from "@/modules/tresorerie/creation";
import { enregistrerMouvementDans } from "@/modules/tresorerie/creation-mouvements";
import { beneficiairesProposes, listerAvances, listerBons } from "@/modules/tresorerie/requetes";
import { avancesTresorerie, bonsCaisse } from "@/modules/tresorerie/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;
let caisse: string;

const aujourdhui = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ id: caisse } = await db.transaction((tx) => creerCompteDans(tx, org, { nom: "Caisse siège", nature: "caisse", compte: "571", seuilAlerte: 0 }, user)));
  await db.transaction((tx) => enregistrerMouvementDans(tx, org, { compteId: caisse, nature: "apport", montant: 500_000, date: aujourdhui }, user));
});
afterAll(async () => fermer());

describe("bénéficiaire des bons de caisse", () => {
  it("se choisit parmi les fournisseurs, le Personnel et les intervenants", async () => {
    const { id: station } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Station Total Plateau", estClient: false, estFournisseur: true }, user));
    const { id: konan } = await creerSalariePour(org, { nom: "Konan Michel", poste: "Coursier", debut: "2026-01-05", salaireBase: 90_000 }, user);
    const { id: yao } = await creerIntervenantPour(org, { nom: "Yao Serge", qualification: "Maçon", taux: 6_000 }, user);

    const proposes = await beneficiairesProposes(org);
    expect(proposes.fournisseurs).toContainEqual({ valeur: `t:${station}`, nom: "Station Total Plateau", qualite: "Fournisseur" });
    expect(proposes.personnel).toContainEqual({ valeur: `e:${konan}`, nom: "Konan Michel", qualite: "Coursier" });
    expect(proposes.intervenants).toContainEqual({ valeur: `w:${yao}`, nom: "Yao Serge", qualite: "Maçon" });

    const carburant = await db.transaction((tx) =>
      demanderBonDans(tx, org, { caisseId: caisse, nature: "carburant", montant: 20_000, fiche: { tiersId: station }, motif: "Plein du pick-up" }, user),
    );
    const course = await db.transaction((tx) =>
      demanderBonDans(tx, org, { caisseId: caisse, nature: "transport", montant: 3_000, fiche: { employeId: konan }, motif: "Dépôt de courrier" }, user),
    );
    const sable = await db.transaction((tx) =>
      demanderBonDans(tx, org, { caisseId: caisse, nature: "divers", montant: 6_000, fiche: { workerId: yao }, motif: "Journée de reprise" }, user),
    );
    expect(carburant.beneficiaire).toBe("Station Total Plateau");

    const [ligne] = await db.select().from(bonsCaisse).where(eq(bonsCaisse.id, course.id));
    expect(ligne).toMatchObject({ beneficiaire: "Konan Michel", beneficiaireEmployeId: konan, beneficiaireTiersId: null });

    const bons = await listerBons(org, user, true);
    expect(bons.find((b) => b.id === carburant.id)).toMatchObject({ beneficiaire: "Station Total Plateau", beneficiaireQualite: "Fournisseur" });
    expect(bons.find((b) => b.id === course.id)).toMatchObject({ beneficiaire: "Konan Michel", beneficiaireQualite: "Coursier" });
    expect(bons.find((b) => b.id === sable.id)).toMatchObject({ beneficiaire: "Yao Serge", beneficiaireQualite: "Maçon" });
  });

  it("garde le nom saisi pour qui n'a pas de fiche, et l'exige", async () => {
    const taxi = await db.transaction((tx) =>
      demanderBonDans(tx, org, { caisseId: caisse, nature: "transport", montant: 2_000, beneficiaire: " Taxi compteur ", motif: "Course Plateau" }, user),
    );
    const bons = await listerBons(org, user, true);
    expect(bons.find((b) => b.id === taxi.id)).toMatchObject({ beneficiaire: "Taxi compteur", beneficiaireQualite: null });

    await expect(
      db.transaction((tx) => demanderBonDans(tx, org, { caisseId: caisse, nature: "transport", montant: 2_000, motif: "Course" }, user)),
    ).rejects.toThrow(/bénéficiaire/);
  });

  it("une fiche renommée se lit à jour ; l'écriture garde le nom du jour", async () => {
    const { id: fournisseur } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Quincaillerie Adjamé", estClient: false, estFournisseur: true }, user));
    const bon = await db.transaction((tx) =>
      demanderBonDans(tx, org, { caisseId: caisse, nature: "fournitures", montant: 7_500, fiche: { tiersId: fournisseur }, motif: "Cadenas" }, user),
    );
    await db.update(tiers).set({ nom: "Quincaillerie d'Adjamé SARL" }).where(eq(tiers.id, fournisseur));

    const bons = await listerBons(org, user, true);
    expect(bons.find((b) => b.id === bon.id)?.beneficiaire).toBe("Quincaillerie d'Adjamé SARL");
    const [ligne] = await db.select({ copie: bonsCaisse.beneficiaire }).from(bonsCaisse).where(eq(bonsCaisse.id, bon.id));
    expect(ligne.copie).toBe("Quincaillerie Adjamé");
  });

  it("refuse une fiche désactivée et deux fiches à la fois", async () => {
    const { id: parti } = await creerSalariePour(org, { nom: "Zadi Paul", poste: "Chauffeur", debut: "2025-01-05", salaireBase: 90_000 }, user);
    await db.update(employees).set({ actif: false }).where(eq(employees.id, parti));
    await expect(
      db.transaction((tx) => demanderBonDans(tx, org, { caisseId: caisse, nature: "mission", montant: 5_000, fiche: { employeId: parti }, motif: "Mission" }, user)),
    ).rejects.toThrow(/Personnel/);

    const { id: autre } = await creerSalariePour(org, { nom: "Kra Eric", poste: "Gardien", debut: "2026-01-05", salaireBase: 70_000 }, user);
    const { id: bon } = await db.transaction((tx) =>
      demanderBonDans(tx, org, { caisseId: caisse, nature: "divers", montant: 1_000, fiche: { employeId: autre }, motif: "Piles" }, user),
    );
    const [station] = await db.select({ id: tiers.id }).from(tiers).where(eq(tiers.organizationId, org)).limit(1);
    await expect(db.update(bonsCaisse).set({ beneficiaireTiersId: station.id }).where(eq(bonsCaisse.id, bon))).rejects.toThrow();
  });
});

describe("bénéficiaire des avances", () => {
  it("se choisit au Personnel ; le compte du salarié suit", async () => {
    const compte = newId();
    await db.insert(users).values({ id: compte, fullName: "Awa (compte)", email: `${compte}@exemple.test` });
    const { id: awa } = await creerSalariePour(org, { nom: "Awa Koné", poste: "Commerciale", debut: "2026-01-05", salaireBase: 150_000 }, user);
    await db.update(employees).set({ userId: compte }).where(eq(employees.id, awa));

    const { numero, beneficiaire } = await db.transaction((tx) =>
      remettreAvanceDans(tx, org, { caisseId: caisse, fiche: { employeId: awa }, montant: 50_000, motif: "Mission Bouaké" }, user),
    );
    expect(beneficiaire).toBe("Awa Koné");

    const [ligne] = await db.select().from(avancesTresorerie).where(eq(avancesTresorerie.numero, numero));
    expect(ligne).toMatchObject({ beneficiaireEmployeId: awa, beneficiaireUserId: compte, beneficiaire: "Awa Koné" });
    const avances = await listerAvances(org);
    expect(avances.find((a) => a.numero === numero)).toMatchObject({ beneficiaire: "Awa Koné", beneficiaireQualite: "Commerciale" });
  });

  it("propose les comptes hors Personnel, et vérifie leur accès", async () => {
    const associe = newId();
    await db.insert(users).values({ id: associe, fullName: "Associé gérant", email: `${associe}@exemple.test` });
    const roleId = newId();
    await db.insert(roles).values({ id: roleId, organizationId: org, key: `r-${roleId}`, name: "Direction" });
    await db.insert(memberships).values({ id: newId(), organizationId: org, userId: associe, roleId, status: "actif" });

    const { comptes } = await beneficiairesProposes(org);
    expect(comptes).toContainEqual({ valeur: `u:${associe}`, nom: "Associé gérant", qualite: "Compte" });

    const { beneficiaire } = await db.transaction((tx) =>
      remettreAvanceDans(tx, org, { caisseId: caisse, fiche: { userId: associe }, montant: 10_000, motif: "Frais de route" }, user),
    );
    expect(beneficiaire).toBe("Associé gérant");

    await expect(
      db.transaction((tx) => remettreAvanceDans(tx, org, { caisseId: caisse, fiche: { userId: newId() }, montant: 10_000, motif: "Frais" }, user)),
    ).rejects.toThrow(/accès/);
  });
});
