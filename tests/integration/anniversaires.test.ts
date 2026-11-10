import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { employees, memberships, notifications, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { anniversairesPour, annoncerAnniversaires } from "@/modules/personnes/anniversaires-annonces";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let patronne: string;
let gerant: string;
let awa: string;
let kone: string;

async function compte(nom: string, cleRole: string, proprietaire = false): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, cleRole)));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: cleRole, name: cleRole, isSystem: true });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, isOwner: proprietaire, status: "actif" });
  return userId;
}

async function salarie(nom: string, dateNaissance: string, userId: string | null, annonce = true): Promise<string> {
  const id = newId();
  await db.insert(employees).values({
    id,
    organizationId: org,
    matricule: `S${id.slice(-4)}`,
    nom,
    poste: "Secrétaire",
    service: "Secrétariat, accueil et protocole",
    debut: "2024-01-01",
    dateNaissance,
    userId,
    anniversaireAnnonce: annonce,
  });
  return id;
}

const recues = async (userId: string) =>
  (await db.select({ titre: notifications.titre }).from(notifications).where(and(eq(notifications.organizationId, org), eq(notifications.userId, userId)))).map((n) => n.titre);

// Midi à Abidjan (UTC+0) : le jour civil est sans ambiguïté.
const le = (jour: string) => new Date(`${jour}T12:00:00Z`);

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  patronne = await compte("La Patronne", "proprietaire", true);
  gerant = await compte("Le Gérant", "gerant");
  awa = await compte("Awa Koné", "secretaire");
  kone = await compte("Koné Yao", "secretaire");
});
afterAll(async () => fermer());

describe("anniversaires sur une vraie base", () => {
  it("rappelle à la direction dans la semaine, une seule fois", async () => {
    await salarie("Awa Koné", "1992-11-15", awa);
    expect(await annoncerAnniversaires(org, le("2026-11-10"))).toBe(1);
    expect(await annoncerAnniversaires(org, le("2026-11-11"))).toBe(0);

    expect((await recues(patronne)).filter((t) => t.includes("Awa Koné"))).toEqual(["🎂 Anniversaire de Awa Koné dimanche (dans 5 jours)"]);
    expect((await recues(gerant)).some((t) => t.includes("Awa Koné"))).toBe(true);
    // L'équipe, et Awa elle-même, n'en savent rien avant le jour.
    expect(await recues(kone)).toEqual([]);
    expect(await recues(awa)).toEqual([]);
  });

  it("le jour même : vœux à la personne, âge à la direction, nouvelle à l'équipe — une fois", async () => {
    expect(await annoncerAnniversaires(org, le("2026-11-15"))).toBe(1);
    expect(await annoncerAnniversaires(org, le("2026-11-15"))).toBe(0);

    expect(await recues(awa)).toEqual(["🎂 Joyeux anniversaire, Awa !"]);
    expect(await recues(patronne)).toContain("🎂 Awa Koné fête ses 34 ans aujourd'hui");
    expect(await recues(kone)).toEqual(["🎂 C'est l'anniversaire de Awa Koné aujourd'hui"]);
    // L'âge ne va qu'à la direction.
    expect((await recues(kone)).some((t) => t.includes("34"))).toBe(false);
  });

  it("n'annonce pas à l'équipe qui ne le souhaite pas ; la direction est prévenue quand même", async () => {
    await salarie("Discrète Bamba", "1990-12-01", null, false);
    await annoncerAnniversaires(org, le("2026-12-01"));
    expect(await recues(patronne)).toContain("🎂 Discrète Bamba fête ses 36 ans aujourd'hui");
    expect((await recues(kone)).some((t) => t.includes("Discrète"))).toBe(false);

    // À l'écran aussi : l'équipe ne la voit pas, la direction si, avec l'âge.
    const equipe = await anniversairesPour(org, { direction: false, horizon: 366 }, le("2026-11-20"));
    expect(equipe.prochains.map((p) => [p.nom, p.age])).toEqual([["Awa Koné", null]]);
    const direction = await anniversairesPour(org, { direction: true, horizon: 366 }, le("2026-11-20"));
    expect(direction.prochains.map((p) => [p.nom, p.age])).toEqual([
      ["Discrète Bamba", 36],
      ["Awa Koné", 35],
    ]);
  });

  it("oublie qui a quitté l'entreprise", async () => {
    const parti = await salarie("Parti Diallo", "1991-11-22", null);
    await db.update(employees).set({ actif: false }).where(eq(employees.id, parti));
    expect(await annoncerAnniversaires(org, le("2026-11-20"))).toBe(0);
  });
});
