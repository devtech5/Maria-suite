import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs, memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  creerColonneDans,
  definirValeurDans,
  deplacerColonneDans,
  listerColonnes,
  modifierColonneDans,
  supprimerColonneDans,
  valeursDe,
} from "@/modules/taches/colonnes-base";
import { creerTacheDans } from "@/modules/taches/creation";
import { tachesValeurs } from "@/modules/taches/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let chef: string;
let agent: string;
let tiers: string;

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
  chef = await compte("Chef");
  agent = await compte("Agent");
  tiers = await compte("Tiers");
});
afterAll(async () => fermer());

const chefActeur = () => ({ userId: chef, attribue: true });

describe("colonnes personnalisées des tâches", () => {
  it("ajoute des colonnes au bout, les déplace et les retire", async () => {
    const { id: client } = await db.transaction((tx) => creerColonneDans(tx, org, { libelle: "Client", type: "texte" }, chef));
    const { id: montant } = await db.transaction((tx) =>
      creerColonneDans(tx, org, { libelle: "Montant", type: "nombre", options: { unite: "FCFA" } }, chef),
    );
    expect((await listerColonnes(org)).map((c) => c.libelle)).toEqual(["Client", "Montant"]);

    await db.transaction((tx) => deplacerColonneDans(tx, org, montant, -1, chef));
    expect((await listerColonnes(org)).map((c) => c.libelle)).toEqual(["Montant", "Client"]);

    await db.transaction((tx) => supprimerColonneDans(tx, org, client, chef));
    expect((await listerColonnes(org)).map((c) => c.libelle)).toEqual(["Montant"]);
    await db.transaction((tx) => supprimerColonneDans(tx, org, montant, chef));
  });

  it("pose, change et vide une valeur, avec sa trace", async () => {
    const { id: tache } = await db.transaction((tx) => creerTacheDans(tx, org, { titre: "Devis Kouassi", priorite: "normale" }, chefActeur()));
    const { id: montant } = await db.transaction((tx) =>
      creerColonneDans(tx, org, { libelle: "Montant", type: "nombre", options: { unite: "FCFA" } }, chef),
    );

    await db.transaction((tx) => definirValeurDans(tx, org, tache, montant, "1 250 000", chefActeur()));
    expect((await valeursDe(org, [tache])).get(tache)).toEqual({ [montant]: "1250000" });

    await db.transaction((tx) => definirValeurDans(tx, org, tache, montant, "900000", chefActeur()));
    const [ligne] = await db.select().from(tachesValeurs).where(eq(tachesValeurs.tacheId, tache));
    expect(ligne).toMatchObject({ valeur: "900000", version: 2 });

    await db.transaction((tx) => definirValeurDans(tx, org, tache, montant, "", chefActeur()));
    expect((await valeursDe(org, [tache])).get(tache)).toBeUndefined();

    const traces = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, tache), eq(auditLogs.action, "tache.champ")));
    expect(traces).toHaveLength(3);

    await expect(db.transaction((tx) => definirValeurDans(tx, org, tache, montant, "2,5", chefActeur()))).rejects.toThrow("Montant : Un nombre entier");
  });

  it("garde les valeurs d'une étiquette renommée", async () => {
    const { id: tache } = await db.transaction((tx) => creerTacheDans(tx, org, { titre: "Visa du plan", priorite: "normale" }, chefActeur()));
    const { id: visa } = await db.transaction((tx) =>
      creerColonneDans(tx, org, { libelle: "Visa", type: "etiquette", options: { etiquettes: [{ cle: "", libelle: "À valider", couleur: "#fdab3d" }] } }, chef),
    );
    const [colonne] = (await listerColonnes(org)).filter((c) => c.id === visa);
    const cle = colonne.options.etiquettes![0].cle;
    await db.transaction((tx) => definirValeurDans(tx, org, tache, visa, cle, chefActeur()));
    await db.transaction((tx) =>
      modifierColonneDans(tx, org, visa, { libelle: "Visa BC", options: { etiquettes: [{ cle, libelle: "En attente", couleur: "#fdab3d" }] } }, chef),
    );
    expect((await valeursDe(org, [tache])).get(tache)).toEqual({ [visa]: cle });
    await expect(db.transaction((tx) => definirValeurDans(tx, org, tache, visa, "e99", chefActeur()))).rejects.toThrow("Étiquette inconnue");
  });

  it("laisse l'exécutant remplir sa tâche, pas un tiers", async () => {
    const { id: tache } = await db.transaction((tx) =>
      creerTacheDans(tx, org, { titre: "Livrer", priorite: "normale", executant: { userId: agent } }, chefActeur()),
    );
    const { id: livre } = await db.transaction((tx) => creerColonneDans(tx, org, { libelle: "Livré", type: "case" }, chef));
    await db.transaction((tx) => definirValeurDans(tx, org, tache, livre, "1", { userId: agent, attribue: false }));
    await expect(db.transaction((tx) => definirValeurDans(tx, org, tache, livre, null, { userId: tiers, attribue: false }))).rejects.toThrow(
      "Seuls le responsable",
    );
    expect((await valeursDe(org, [tache])).get(tache)).toEqual({ [livre]: "1" });
  });

  it("ne touche pas aux colonnes d'une autre entreprise", async () => {
    const { organizationId: autre } = await semerEntreprise(db, "Autre");
    const { id } = await db.transaction((tx) => creerColonneDans(tx, org, { libelle: "Chantier", type: "texte" }, chef));
    await expect(db.transaction((tx) => supprimerColonneDans(tx, autre, id, chef))).rejects.toThrow("n'existe plus");
    expect((await listerColonnes(autre)).length).toBe(0);
  });
});
