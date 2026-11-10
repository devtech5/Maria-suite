import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  ajouterMembres,
  conversation,
  conversationsDe,
  creerGroupe,
  ecrire,
  effacerMessage,
  marquerConversationLue,
  ouvrirConversationPrivee,
  retirerMembre,
  totalNonLus,
} from "@/modules/messagerie/conversations";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let patron: string;
let awa: string;
let yao: string;

async function membre(nom: string, cleRole: string, estProprietaire = false): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, cleRole)));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: cleRole, name: cleRole });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, isOwner: estProprietaire, status: "actif" });
  return userId;
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  patron = await membre("Patron", "proprietaire", true);
  awa = await membre("Awa", "secretaire");
  yao = await membre("Yao", "magasinier");
});
afterAll(async () => fermer());

describe("conversation privée", () => {
  it("une seule par paire, quel que soit celui qui l'ouvre ; fermée aux autres", async () => {
    const c1 = await ouvrirConversationPrivee(org, awa, yao);
    const c2 = await ouvrirConversationPrivee(org, yao, awa);
    expect(c2).toBe(c1);
    await expect(ouvrirConversationPrivee(org, awa, awa)).rejects.toThrow(/soi-même/);

    await ecrire(org, awa, c1, "Bonjour Yao, tu as reçu la livraison ?", null);
    expect(await totalNonLus(org, yao)).toBe(1);
    expect(await totalNonLus(org, awa)).toBe(0);

    // Le patron ne participe pas : il ne lit ni n'écrit, même en connaissant l'identifiant.
    expect(await conversation(org, patron, c1)).toBeNull();
    await expect(ecrire(org, patron, c1, "Intrus", null)).rejects.toThrow(/ne participez pas/);

    // Accusé de lecture : vu quand Yao a lu.
    let vue = await conversation(org, awa, c1);
    expect(vue?.messages[0]).toMatchObject({ luPar: 0, autres: 1 });
    await marquerConversationLue(org, yao, c1);
    vue = await conversation(org, awa, c1);
    expect(vue?.messages[0]).toMatchObject({ luPar: 1, autres: 1 });
    expect(await totalNonLus(org, yao)).toBe(0);

    // On ne supprime que ses propres messages.
    const id = vue!.messages[0].id;
    await expect(effacerMessage(org, yao, id)).rejects.toThrow(/propres messages/);
    await effacerMessage(org, awa, id);
    expect((await conversation(org, yao, c1))?.messages[0].efface).toBe(true);
  });
});

describe("groupes", () => {
  it("créé par l'administration ; un membre retiré ne lit plus la suite", async () => {
    const g = await creerGroupe(org, patron, { nom: "Équipe magasin", membres: [awa] });
    const liste = await conversationsDe(org, awa);
    expect(liste.find((c) => c.id === g)?.nom).toBe("Équipe magasin");

    // Un simple membre n'administre pas le groupe.
    await expect(ajouterMembres(org, awa, g, [yao], false)).rejects.toThrow(/administrateur/);
    expect(await ajouterMembres(org, patron, g, [yao], false)).toBe(1);

    await ecrire(org, patron, g, "Inventaire samedi", null);
    expect((await conversation(org, yao, g))?.messages.map((m) => m.corps)).toEqual(["Inventaire samedi"]);

    await retirerMembre(org, yao, g, yao, false);
    await ecrire(org, patron, g, "Merci à tous", null);
    // Yao garde ce qui précède son départ, ne voit pas la suite, ne peut plus écrire.
    const pourYao = await conversation(org, yao, g);
    expect(pourYao?.retire).toBe(true);
    expect(pourYao?.messages.map((m) => m.corps)).toEqual(["Inventaire samedi"]);
    await expect(ecrire(org, yao, g, "Je reviens", null)).rejects.toThrow(/ne participez pas/);
    expect((await conversationsDe(org, yao)).find((c) => c.id === g)?.nonLus).toBe(0);

    expect((await conversation(org, awa, g))?.messages.map((m) => m.corps)).toEqual(["Inventaire samedi", "Merci à tous"]);
  });
});
