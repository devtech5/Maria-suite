import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  enregistrerCreneauDans,
  enregistrerHorairesDans,
  poserStatutDans,
  supprimerCreneauDans,
  terminerStatutDans,
  type Acteur,
} from "@/modules/planning/creation";
import { creneauxSur, horairesDe } from "@/modules/planning/requetes";
import { creneauxPlanning } from "@/modules/planning/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let gerant: Acteur;
let awa: Acteur;
let kone: Acteur;

const t = (iso: string) => new Date(`${iso}:00Z`);

async function membre(nom: string, cleRole: string, gere: boolean): Promise<Acteur> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, cleRole)));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: cleRole, name: cleRole });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, isOwner: false, status: "actif" });
  return { userId, gere };
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  gerant = await membre("Gérant", "gerant", true);
  awa = await membre("Awa", "caissier", false);
  kone = await membre("Koné", "magasinier", false);
});
afterAll(async () => fermer());

const vivants = (userId: string) =>
  db.select().from(creneauxPlanning).where(and(eq(creneauxPlanning.organizationId, org), eq(creneauxPlanning.userId, userId), isNull(creneauxPlanning.deletedAt)));

describe("planning sur une vraie base", () => {
  it("chacun pose ses créneaux ; un chevauchement est refusé avec ce qu'il heurte", async () => {
    await db.transaction((tx) =>
      enregistrerCreneauDans(tx, org, { userId: awa.userId, statut: "en_course", debut: t("2026-10-06T09:00"), fin: t("2026-10-06T10:00"), lieu: "Banque" }, awa),
    );
    await expect(
      db.transaction((tx) => enregistrerCreneauDans(tx, org, { userId: awa.userId, statut: "en_reunion", debut: t("2026-10-06T09:30"), fin: t("2026-10-06T11:00") }, awa)),
    ).rejects.toThrow(/empiète sur « En courses » du 06\/10 de 09:00 à 10:00/);
    // Bout à bout : accepté.
    await db.transaction((tx) => enregistrerCreneauDans(tx, org, { userId: awa.userId, statut: "en_reunion", debut: t("2026-10-06T10:00"), fin: t("2026-10-06T11:00") }, awa));
    expect(await vivants(awa.userId)).toHaveLength(2);
  });

  it("pose un congé de maternité de 14 semaines ; la base refuse plus de six mois", async () => {
    await db.transaction((tx) =>
      enregistrerCreneauDans(tx, org, { userId: kone.userId, statut: "conge_maternite", debut: t("2026-11-02T00:00"), fin: t("2027-02-08T00:00") }, kone),
    );
    expect((await vivants(kone.userId)).map((c) => c.statut)).toEqual(["conge_maternite"]);
    // Même en contournant la règle applicative, la contrainte de la base tient.
    await expect(
      db.insert(creneauxPlanning).values({ id: newId(), organizationId: org, userId: kone.userId, statut: "en_mission", debut: t("2027-03-01T00:00"), fin: t("2027-04-15T00:00"), saisiParUserId: kone.userId }),
    ).rejects.toThrow();
    await expect(
      db.insert(creneauxPlanning).values({ id: newId(), organizationId: org, userId: kone.userId, statut: "arret_maladie", debut: t("2027-03-01T00:00"), fin: t("2027-10-01T00:00"), saisiParUserId: kone.userId }),
    ).rejects.toThrow();
    await db.delete(creneauxPlanning).where(eq(creneauxPlanning.userId, kone.userId));
  });

  it("un membre sans droit de gestion ne touche pas au planning d'un autre", async () => {
    await expect(
      db.transaction((tx) => enregistrerCreneauDans(tx, org, { userId: kone.userId, statut: "absent", debut: t("2026-10-07T08:00"), fin: t("2026-10-07T18:00") }, awa)),
    ).rejects.toThrow(/planning d'un autre membre/);
    const [sien] = await vivants(awa.userId);
    await expect(db.transaction((tx) => supprimerCreneauDans(tx, org, sien.id, kone))).rejects.toThrow(/planning d'un autre membre/);
  });

  it("le gérant modifie le planning de n'importe qui, et la base garde qui l'a saisi", async () => {
    const { id } = await db.transaction((tx) =>
      enregistrerCreneauDans(tx, org, { userId: kone.userId, statut: "sur_terrain", debut: t("2026-10-07T08:00"), fin: t("2026-10-07T17:00"), lieu: "Dépôt Yopougon" }, gerant),
    );
    const [c] = await db.select().from(creneauxPlanning).where(eq(creneauxPlanning.id, id));
    expect(c).toMatchObject({ userId: kone.userId, saisiParUserId: gerant.userId, statut: "sur_terrain" });

    await db.transaction((tx) => enregistrerCreneauDans(tx, org, { id, userId: kone.userId, statut: "en_mission", debut: t("2026-10-07T08:00"), fin: t("2026-10-07T12:00") }, gerant));
    const [apres] = await db.select().from(creneauxPlanning).where(eq(creneauxPlanning.id, id));
    expect(apres).toMatchObject({ statut: "en_mission", version: 2, lieu: null });

    await db.transaction((tx) => supprimerCreneauDans(tx, org, id, gerant));
    expect(await vivants(kone.userId)).toHaveLength(0);
  });

  it("un statut posé maintenant coupe ce qui était en cours et s'arrête avant le créneau suivant", async () => {
    await db.transaction((tx) => enregistrerCreneauDans(tx, org, { userId: kone.userId, statut: "occupe", debut: t("2026-10-08T08:00"), fin: t("2026-10-08T12:00") }, kone));
    await db.transaction((tx) => enregistrerCreneauDans(tx, org, { userId: kone.userId, statut: "en_reunion", debut: t("2026-10-08T15:00"), fin: t("2026-10-08T16:00") }, kone));

    const { fin } = await db.transaction((tx) =>
      poserStatutDans(tx, org, { userId: kone.userId, statut: "en_course", fin: t("2026-10-08T18:00") }, kone, t("2026-10-08T10:00")),
    );
    expect(fin).toEqual(t("2026-10-08T15:00"));

    const liste = (await creneauxSur(org, t("2026-10-08T00:00"), t("2026-10-09T00:00"), [kone.userId])).map((c) => [c.statut, c.debut.toISOString().slice(11, 16), c.fin.toISOString().slice(11, 16)]);
    expect(liste).toEqual([
      ["occupe", "08:00", "10:00"],
      ["en_course", "10:00", "15:00"],
      ["en_reunion", "15:00", "16:00"],
    ]);

    await db.transaction((tx) => terminerStatutDans(tx, org, kone.userId, kone, t("2026-10-08T11:00")));
    const [course] = await creneauxSur(org, t("2026-10-08T10:30"), t("2026-10-08T10:31"), [kone.userId]);
    expect(course.fin).toEqual(t("2026-10-08T11:00"));
  });

  it("les horaires se remplacent en bloc ; un chevauchement est refusé", async () => {
    const bureau = [
      { jour: 1, debutMinutes: 480, finMinutes: 720 },
      { jour: 1, debutMinutes: 840, finMinutes: 1080 },
    ];
    await db.transaction((tx) => enregistrerHorairesDans(tx, org, awa.userId, bureau, awa));
    await db.transaction((tx) => enregistrerHorairesDans(tx, org, awa.userId, [{ jour: 2, debutMinutes: 450, finMinutes: 990 }], awa));
    expect((await horairesDe(org, [awa.userId])).get(awa.userId)).toEqual([{ jour: 2, debutMinutes: 450, finMinutes: 990 }]);

    await expect(
      db.transaction((tx) => enregistrerHorairesDans(tx, org, awa.userId, [...bureau, { jour: 1, debutMinutes: 700, finMinutes: 900 }], awa)),
    ).rejects.toThrow(/chevauchent/);
    await expect(db.transaction((tx) => enregistrerHorairesDans(tx, org, kone.userId, bureau, awa))).rejects.toThrow(/planning d'un autre membre/);
  });

  it("la base refuse d'elle-même un créneau à l'envers", async () => {
    await expect(
      db.insert(creneauxPlanning).values({ id: newId(), organizationId: org, userId: awa.userId, statut: "absent", debut: t("2026-10-09T10:00"), fin: t("2026-10-09T09:00"), saisiParUserId: awa.userId }),
    ).rejects.toThrow();
  });
});
