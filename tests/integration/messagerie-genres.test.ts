import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  contactPartageable,
  conversation,
  ecrireStructure,
  ouvrirConversationPrivee,
  repondreEvenementPour,
  voterSondage,
} from "@/modules/messagerie/conversations";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let awa: string;
let yao: string;
let intrus: string;

async function membre(nom: string, cleRole: string): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, cleRole)));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: cleRole, name: cleRole });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, isOwner: false, status: "actif" });
  return userId;
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  awa = await membre("Awa Koné", "secretaire");
  yao = await membre("Yao Brou", "secretaire");
  intrus = await membre("Intrus", "secretaire");
});
afterAll(async () => fermer());

describe("sondages, événements et contacts", () => {
  it("un sondage : vote, changement de vote, retrait, et un étranger à la conversation ne vote pas", async () => {
    const c = await ouvrirConversationPrivee(org, awa, yao);
    const { id } = await ecrireStructure(org, awa, c, "sondage", { question: "Où déjeuner ?", options: ["Maquis", "Cantine", "Sandwich"], multiple: false });

    await voterSondage(org, yao, id, [1]);
    await voterSondage(org, awa, id, [1]);
    let vue = (await conversation(org, yao, c))!.messages[0];
    expect(vue).toMatchObject({ genre: "sondage", corps: "📊 Où déjeuner ?" });
    expect(vue.sondage?.resultat.votants).toBe(2);
    expect(vue.sondage?.resultat.options.map((o) => o.votes)).toEqual([0, 2, 0]);
    expect(vue.sondage?.resultat.options[1]).toMatchObject({ part: 100, moi: true });

    await voterSondage(org, yao, id, [0]);
    vue = (await conversation(org, yao, c))!.messages[0];
    expect(vue.sondage?.resultat.options.map((o) => o.votes)).toEqual([1, 1, 0]);

    await voterSondage(org, yao, id, []);
    vue = (await conversation(org, yao, c))!.messages[0];
    expect(vue.sondage?.resultat.votants).toBe(1);

    await expect(voterSondage(org, yao, id, [0, 1])).rejects.toThrow(/Une seule/);
    await expect(voterSondage(org, yao, id, [9])).rejects.toThrow(/inconnue/);
    await expect(voterSondage(org, intrus, id, [0])).rejects.toThrow(/ne participez/);
  });

  it("un événement : une réponse par personne, la même renvoyée la retire", async () => {
    const c = await ouvrirConversationPrivee(org, awa, yao);
    const { id } = await ecrireStructure(org, awa, c, "evenement", { titre: "Pot de fin d'année", date: "2026-12-18", heure: "17:00", lieu: "Siège", description: null });

    expect(await repondreEvenementPour(org, yao, id, "oui")).toBe("oui");
    await repondreEvenementPour(org, awa, id, "peut_etre");
    let m = (await conversation(org, yao, c))!.messages.find((x) => x.id === id)!;
    expect(m.evenement?.resultat).toEqual({ oui: 1, peutEtre: 1, non: 0, moi: "oui" });

    expect(await repondreEvenementPour(org, yao, id, "non")).toBe("non");
    expect(await repondreEvenementPour(org, yao, id, "non")).toBeNull();
    m = (await conversation(org, yao, c))!.messages.find((x) => x.id === id)!;
    expect(m.evenement?.resultat).toEqual({ oui: 0, peutEtre: 1, non: 0, moi: null });

    await expect(repondreEvenementPour(org, yao, id, "bof")).rejects.toThrow(/inconnue/);
    // Un sondage n'est pas un événement.
    const s = await ecrireStructure(org, awa, c, "sondage", { question: "Autre ?", options: ["a", "b"], multiple: false });
    await expect(repondreEvenementPour(org, yao, s.id, "oui")).rejects.toThrow(/introuvable/);
  });

  it("une carte de contact ne partage qu'un membre de l'entreprise", async () => {
    const c = await ouvrirConversationPrivee(org, awa, yao);
    const carte = await contactPartageable(org, yao);
    expect(carte).toEqual({ userId: yao, nom: "Yao Brou" });
    expect(await contactPartageable(org, newId())).toBeNull();
    await ecrireStructure(org, awa, c, "contact", carte!);
    const m = (await conversation(org, awa, c))!.messages.at(-1)!;
    expect(m).toMatchObject({ genre: "contact", corps: "👤 Yao Brou", contact: { userId: yao } });
  });
});
