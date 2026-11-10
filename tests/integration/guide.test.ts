import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { guideLectures, memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Correction } from "@/modules/guide/regles";
import { chapitresLus, enregistrerQuizPour, marquerLuPour, nombreEssais, resultatQuiz, suiviGuide } from "@/modules/guide/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let awa: string;
let kone: string;

async function compte(nom: string): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, "secretaire")));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: "secretaire", name: "Secrétaire", isSystem: true });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, status: "actif" });
  return userId;
}

const copie = (bonnes: number, total: number): Correction => ({
  bonnes,
  total,
  pourcent: Math.floor((bonnes * 100) / total),
  reussi: bonnes * 100 >= total * 80,
  details: Array.from({ length: total }, (_, i) => ({ cle: `q${i}`, donnee: i < bonnes ? 0 : 1, bonne: 0, juste: i < bonnes, explication: "" })),
});

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  awa = await compte("Awa Koné");
  kone = await compte("Koné Yao");
});
afterAll(async () => fermer());

describe("guide d'utilisation sur une vraie base", () => {
  it("marque un chapitre lu une seule fois", async () => {
    await marquerLuPour(org, awa, "premiers-pas");
    const [premiere] = await db.select().from(guideLectures).where(eq(guideLectures.userId, awa));
    await marquerLuPour(org, awa, "premiers-pas");
    await marquerLuPour(org, awa, "taches");
    expect(await chapitresLus(org, awa)).toEqual(new Set(["premiers-pas", "taches"]));
    const [encore] = await db.select().from(guideLectures).where(and(eq(guideLectures.userId, awa), eq(guideLectures.chapitre, "premiers-pas")));
    expect(encore.luLe).toEqual(premiere.luLe);
  });

  it("retient le passage réussi plutôt que le dernier essai", async () => {
    expect(await resultatQuiz(org, awa)).toBeNull();
    expect(await nombreEssais(org, awa)).toBe(0);
    await enregistrerQuizPour(org, awa, copie(5, 10), new Date("2026-11-10T08:00:00Z"));
    await enregistrerQuizPour(org, awa, copie(9, 10), new Date("2026-11-10T09:00:00Z"));
    await enregistrerQuizPour(org, awa, copie(6, 10), new Date("2026-11-10T10:00:00Z"));
    expect(await nombreEssais(org, awa)).toBe(3);
    expect(await resultatQuiz(org, awa)).toMatchObject({ bonnes: 9, reussi: true });
  });

  it("donne aux RH où en est chacun", async () => {
    const suivi = await suiviGuide(org);
    const deAwa = suivi.find((l) => l.userId === awa)!;
    const deKone = suivi.find((l) => l.userId === kone)!;
    expect(deAwa).toMatchObject({ lus: 2, meilleur: { bonnes: 9, total: 10 } });
    expect(deAwa.reussiLe).toEqual(new Date("2026-11-10T09:00:00Z"));
    expect(deKone).toMatchObject({ lus: 0, reussiLe: null, meilleur: null, derniereLecture: null });
  });
});
