import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerIntervenantPour, creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { creerColonneDans, definirValeurDans } from "@/modules/taches/colonnes-base";
import { creerTacheDans } from "@/modules/taches/creation";
import { ajouterIntervenantDans, intervenantsDe, retirerIntervenantDans } from "@/modules/taches/intervenants";
import { listerTaches } from "@/modules/taches/requetes";
import { tachesIntervenants } from "@/modules/taches/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let chef: string;

async function compte(nom: string): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId: org, key: `r-${roleId}`, name: "Équipe" });
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId, status: "actif" });
  return userId;
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  chef = await compte("Chef de chantier");
});
afterAll(async () => fermer());

const chefActeur = () => ({ userId: chef, attribue: true });

describe("intervenants d'une tâche", () => {
  it("met plusieurs personnes sur une tâche dès sa création, et prévient le collaborateur qui a un compte", async () => {
    const awaCompte = await compte("Awa");
    const { id: awa } = await creerSalariePour(org, { nom: "Awa Koné", poste: "Conductrice de travaux", debut: "2026-01-05", salaireBase: 300_000 }, chef);
    await db.update(employees).set({ userId: awaCompte }).where(eq(employees.id, awa));
    const { id: macon } = await creerIntervenantPour(org, { nom: "Yao Koffi", qualification: "Maçon", taux: 8_000 });

    const { id, aPrevenir } = await db.transaction((tx) =>
      creerTacheDans(
        tx,
        org,
        { titre: "Couler la dalle", priorite: "haute", intervenants: [{ employeId: awa }, { workerId: macon }, { workerId: macon }] },
        chefActeur(),
      ),
    );
    expect(aPrevenir).toEqual([awaCompte]);
    const liste = (await intervenantsDe(org, [id])).get(id)!;
    expect(liste.map((i) => `${i.nom} (${i.nature}, ${i.detail})`)).toEqual([
      "Awa Koné (collaborateur, Conductrice de travaux)",
      "Yao Koffi (intervenant, Maçon)",
    ]);

    // Awa voit la tâche dans sa liste, et peut en remplir les colonnes.
    expect((await listerTaches(org, awaCompte, "miennes")).some((t) => t.id === id)).toBe(true);
    const { id: avancement } = await db.transaction((tx) => creerColonneDans(tx, org, { libelle: "Avancement", type: "nombre", options: { unite: "%" } }, chef));
    await db.transaction((tx) => definirValeurDans(tx, org, id, avancement, "40", { userId: awaCompte, attribue: false }));
  });

  it("retire puis remet un intervenant sur la même ligne, sans doublon", async () => {
    const { id: ferrailleur } = await creerIntervenantPour(org, { nom: "Bakayoko Issa", qualification: "Ferrailleur", taux: 7_000 });
    const { id } = await db.transaction((tx) => creerTacheDans(tx, org, { titre: "Ferraillage", priorite: "normale" }, chefActeur()));

    const premier = await db.transaction((tx) => ajouterIntervenantDans(tx, org, id, { workerId: ferrailleur }, chefActeur()));
    expect(premier.ajoute).toBe(true);
    expect((await db.transaction((tx) => ajouterIntervenantDans(tx, org, id, { workerId: ferrailleur }, chefActeur()))).ajoute).toBe(false);

    await db.transaction((tx) => retirerIntervenantDans(tx, org, id, { workerId: ferrailleur }, chefActeur()));
    expect((await intervenantsDe(org, [id])).get(id)).toBeUndefined();

    await db.transaction((tx) => ajouterIntervenantDans(tx, org, id, { workerId: ferrailleur }, chefActeur()));
    const lignes = await db.select().from(tachesIntervenants).where(eq(tachesIntervenants.tacheId, id));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ deletedAt: null, version: 3 });
  });

  it("réserve le choix au créateur ou à qui attribue, et refuse un intervenant inactif ou d'ailleurs", async () => {
    const autreCompte = await compte("Curieux");
    const { id: inactif } = await creerIntervenantPour(org, { nom: "Parti", qualification: "Manœuvre", taux: 5_000 });
    const { id: actif } = await creerIntervenantPour(org, { nom: "Présent", qualification: "Manœuvre", taux: 5_000 });
    const { workers } = await import("@/modules/personnes/schema");
    await db.update(workers).set({ actif: false }).where(eq(workers.id, inactif));
    const { id } = await db.transaction((tx) => creerTacheDans(tx, org, { titre: "Nettoyage", priorite: "basse" }, chefActeur()));

    await expect(
      db.transaction((tx) => ajouterIntervenantDans(tx, org, id, { workerId: actif }, { userId: autreCompte, attribue: false })),
    ).rejects.toThrow("Seul le créateur");
    await expect(db.transaction((tx) => ajouterIntervenantDans(tx, org, id, { workerId: inactif }, chefActeur()))).rejects.toThrow("ne figure pas");

    const { organizationId: ailleurs } = await semerEntreprise(db, "Ailleurs");
    const { id: etranger } = await creerIntervenantPour(ailleurs, { nom: "Étranger", qualification: "Maçon", taux: 5_000 });
    await expect(db.transaction((tx) => ajouterIntervenantDans(tx, org, id, { workerId: etranger }, chefActeur()))).rejects.toThrow("ne figure pas");
  });
});
