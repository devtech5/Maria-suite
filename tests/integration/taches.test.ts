import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { creerTacheDans, modifierTacheDans } from "@/modules/taches/creation";
import { listerTaches, personnelActif } from "@/modules/taches/requetes";
import { taches } from "@/modules/taches/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let chef: string;

/** Un compte avec un accès actif à l'entreprise. */
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
  chef = await compte("Chef d'équipe");
});
afterAll(async () => fermer());

const acteur = () => ({ userId: chef, attribue: true });

describe("tâches confiées au Personnel", () => {
  it("propose le Personnel actif avec sa fonction, sans les partis", async () => {
    await creerSalariePour(org, { nom: "Bamba Issa", poste: "Magasinier", debut: "2026-01-05", salaireBase: 90_000 }, chef);
    const { id: parti } = await creerSalariePour(org, { nom: "Zadi Paul", poste: "Chauffeur", debut: "2025-01-05", salaireBase: 90_000 }, chef);
    await db.update(employees).set({ actif: false }).where(eq(employees.id, parti));

    const liste = await personnelActif(org);
    expect(liste.map((p) => `${p.nom} — ${p.poste}`)).toContain("Bamba Issa — Magasinier");
    expect(liste.some((p) => p.id === parti)).toBe(false);
  });

  it("un salarié avec un compte reçoit la tâche dans sa liste", async () => {
    const awaCompte = await compte("Awa (compte)");
    const { id: awa } = await creerSalariePour(org, { nom: "Awa Koné", poste: "Comptable", debut: "2026-01-05", salaireBase: 200_000 }, chef);
    await db.update(employees).set({ userId: awaCompte }).where(eq(employees.id, awa));

    const tache = await db.transaction((tx) =>
      creerTacheDans(tx, org, { titre: "Lettrer les règlements", priorite: "normale", executant: { employeId: awa } }, acteur()),
    );
    expect(tache).toMatchObject({ assigneeUserId: awaCompte, pourAutrui: true });

    const siennes = await listerTaches(org, awaCompte, "miennes");
    expect(siennes.find((t) => t.id === tache.id)).toMatchObject({ assignee: "Awa Koné", assigneeEmployeId: awa, sansCompte: false });
  });

  it("un salarié sans compte : l'auteur suit la tâche pour lui", async () => {
    const { id: kone } = await creerSalariePour(org, { nom: "Koné Yao", poste: "Manutentionnaire", debut: "2026-01-05", salaireBase: 80_000 }, chef);

    const tache = await db.transaction((tx) =>
      creerTacheDans(tx, org, { titre: "Ranger le dépôt", priorite: "haute", executant: { employeId: kone } }, acteur()),
    );
    expect(tache).toMatchObject({ assigneeUserId: chef, pourAutrui: true });

    const confiees = await listerTaches(org, chef, "confiees");
    expect(confiees.find((t) => t.id === tache.id)).toMatchObject({ assignee: "Koné Yao", sansCompte: true });
  });

  it("réattribuer à un autre salarié remet la tâche à faire", async () => {
    const { id: premier } = await creerSalariePour(org, { nom: "Diallo Ali", poste: "Livreur", debut: "2026-01-05", salaireBase: 80_000 }, chef);
    const { id: second } = await creerSalariePour(org, { nom: "Ouattara Ina", poste: "Livreuse", debut: "2026-01-05", salaireBase: 80_000 }, chef);
    const { id } = await db.transaction((tx) =>
      creerTacheDans(tx, org, { titre: "Livrer le client Kouassi", priorite: "normale", executant: { employeId: premier } }, acteur()),
    );
    await db.transaction((tx) =>
      modifierTacheDans(tx, org, id, { titre: "Livrer le client Kouassi", priorite: "normale", executant: { employeId: second } }, acteur()),
    );
    const [ligne] = await db.select().from(taches).where(eq(taches.id, id));
    expect(ligne).toMatchObject({ assigneeEmployeId: second, statut: "a_faire" });
  });

  it("refuse un salarié parti, et l'attribution sans le droit", async () => {
    const { id: parti } = await creerSalariePour(org, { nom: "Gnagne Luc", poste: "Gardien", debut: "2025-01-05", salaireBase: 70_000 }, chef);
    await db.update(employees).set({ actif: false }).where(eq(employees.id, parti));
    await expect(
      db.transaction((tx) => creerTacheDans(tx, org, { titre: "Fermer le portail", priorite: "normale", executant: { employeId: parti } }, acteur())),
    ).rejects.toThrow(/Personnel/);

    const { id: present } = await creerSalariePour(org, { nom: "Kra Eric", poste: "Gardien", debut: "2026-01-05", salaireBase: 70_000 }, chef);
    await expect(
      db.transaction((tx) =>
        creerTacheDans(tx, org, { titre: "Fermer le portail", priorite: "normale", executant: { employeId: present } }, { userId: chef, attribue: false }),
      ),
    ).rejects.toThrow(/attribuer/);
  });
});
