import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { archiverPour, creerDossierPour, modifierDossierPour, regleDossier } from "@/modules/archives/creation";
import { dossiersVisibles } from "@/modules/archives/requetes";
import { newId } from "@/lib/ids";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

// Le dépôt de fichiers vit dans un dossier jetable : le même adaptateur disque qu'en production.
process.env.STOCKAGE_LOCAL = mkdtempSync(join(tmpdir(), "maria-archives-"));

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let admin: string;
let awa: string;
let kone: string;
let yao: string;

async function membre(nom: string): Promise<string> {
  const id = newId();
  await db.insert(users).values({ id, fullName: nom, email: `${id}@exemple.test` });
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId: org, key: `r-${roleId}`, name: "Membre" });
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId: id, roleId, status: "actif" });
  return id;
}

const pdf = () => ({ nom: "note.pdf", typeMime: "application/pdf", contenu: new TextEncoder().encode("%PDF-1.4 note").buffer as ArrayBuffer });

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: admin } = await semerEntreprise(db));
  awa = await membre("Awa Koné");
  kone = await membre("Kone Yao");
  yao = await membre("Yao Traoré");
});
afterAll(async () => fermer());

describe("dépôt accordé membre par membre, sur une vraie base", () => {
  it("accorde de voir à tous et de déposer à Awa seule", async () => {
    const { id } = await creerDossierPour(org, admin, { nom: "Plans d'architecture", visibilite: "tous", depotOuvert: false, membres: [], deposants: [awa] });
    const regle = (await regleDossier(org, id))!;
    expect(regle.deposants).toEqual([awa]);

    // Tout le monde le voit ; Awa dépose, Kone et Yao lisent.
    const [vue] = await dossiersVisibles(org, kone, false);
    expect(vue).toMatchObject({ id, visibilite: "tous" });
    expect(vue.deposants.map((d) => d.userId)).toEqual([awa]);

    await archiverPour(org, awa, { dossierId: id, fichiers: [pdf()] });
    await expect(archiverPour(org, kone, { dossierId: id, fichiers: [pdf()] })).rejects.toThrow(/n'accepte pas vos dépôts/);
    // Le gestionnaire dépose toujours.
    await archiverPour(org, admin, { dossierId: id, fichiers: [pdf()] }, true);
  });

  it("déposer suppose de voir : sur un dossier à sélection, le déposant est ajouté aux désignés", async () => {
    const { id } = await creerDossierPour(org, admin, { nom: "Contrats", visibilite: "selection", depotOuvert: false, membres: [kone], deposants: [awa] });
    const regle = (await regleDossier(org, id))!;
    expect([...regle.designes].sort()).toEqual([awa, kone].sort());
    expect(regle.deposants).toEqual([awa]);
    // Yao n'est ni désigné ni déposant : il ne voit pas ce dossier.
    expect((await dossiersVisibles(org, yao, false)).some((d) => d.id === id)).toBe(false);
    expect((await dossiersVisibles(org, awa, false)).some((d) => d.id === id)).toBe(true);
    await archiverPour(org, awa, { dossierId: id, fichiers: [pdf()] });
    await expect(archiverPour(org, kone, { dossierId: id, fichiers: [pdf()] })).rejects.toThrow(/n'accepte pas/);
  });

  it("le dépôt ouvert à tous l'emporte : la liste des déposants est vidée", async () => {
    const { id } = await creerDossierPour(org, admin, { nom: "Notes de service", visibilite: "tous", depotOuvert: true, membres: [], deposants: [awa] });
    expect((await regleDossier(org, id))!.deposants).toEqual([]);
    await archiverPour(org, kone, { dossierId: id, fichiers: [pdf()] });
  });

  it("modifier remplace les déposants d'un bloc, et refuse un identifiant inventé", async () => {
    const { id } = await creerDossierPour(org, admin, { nom: "Rapports", visibilite: "tous", depotOuvert: false, membres: [], deposants: [awa] });
    await modifierDossierPour(org, admin, id, { nom: "Rapports", visibilite: "tous", depotOuvert: false, membres: [], deposants: [kone, newId()] });
    expect((await regleDossier(org, id))!.deposants).toEqual([kone]);
    await archiverPour(org, kone, { dossierId: id, fichiers: [pdf()] });
    await expect(archiverPour(org, awa, { dossierId: id, fichiers: [pdf()] })).rejects.toThrow(/n'accepte pas/);
    // Retour à « administrateurs seulement » : plus personne ne dépose.
    await modifierDossierPour(org, admin, id, { nom: "Rapports", visibilite: "tous", depotOuvert: false, membres: [], deposants: [] });
    expect((await regleDossier(org, id))!.deposants).toEqual([]);
    await expect(archiverPour(org, kone, { dossierId: id, fichiers: [pdf()] })).rejects.toThrow(/n'accepte pas/);
  });
});
