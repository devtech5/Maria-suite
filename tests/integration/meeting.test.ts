import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs, memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Acteur } from "@/modules/meeting/calcul";
import { cheminFlux } from "@/modules/meeting/calcul";
import { deciderReunion } from "@/modules/meeting/autorisation";
import {
  appliquerGesteDans,
  creerReunionDans,
  enregistrerCompteRenduDans,
  inviterDans,
  quitterDans,
  rejoindreDans,
  signalerDans,
} from "@/modules/meeting/creation";
import { signerFlux } from "@/modules/meeting/jetons";
import { listerReunions, participantsDe, reunionDe } from "@/modules/meeting/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let gerant: Acteur;
let awa: Acteur;
let kone: Acteur;
let yao: Acteur;

async function membre(nom: string, organise: boolean): Promise<Acteur> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, "caissier")));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: "caissier", name: "Caissier" });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, isOwner: false, status: "actif" });
  return { userId, organise };
}

const t = (iso: string) => new Date(`2026-10-14T${iso}Z`);

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  gerant = await membre("Gérant", true);
  awa = await membre("Awa", false);
  kone = await membre("Koné", false);
  yao = await membre("Yao", false);
});
afterAll(async () => fermer());

describe("réunion de bout en bout", () => {
  it("programme, ouvre à la première arrivée, compte la présence et se termine pour tous", async () => {
    const { id, numero, invites } = await db.transaction((tx) =>
      creerReunionDans(tx, org, { titre: "Point hebdomadaire", debutPrevu: t("09:00:00"), dureeMinutes: 45, participants: [awa.userId, kone.userId, gerant.userId] }, gerant),
    );
    expect(numero).toBe("REU-2026-00001");
    // L'organisateur n'est pas « invité » à sa propre réunion : il y est d'office.
    expect(invites.sort()).toEqual([awa.userId, kone.userId].sort());
    expect((await participantsDe(org, id, t("09:00:00"))).map((p) => p.nom)).toEqual(["Awa", "Gérant", "Koné"]);

    // Yao n'est pas invité : il n'entre pas.
    await expect(db.transaction((tx) => rejoindreDans(tx, org, id, yao, t("09:00:00")))).rejects.toThrow(/pas invité/);

    // Awa arrive la première : la réunion s'ouvre.
    expect(await db.transaction((tx) => rejoindreDans(tx, org, id, awa, t("09:01:00")))).toEqual({ numero, ouverte: true });
    expect((await reunionDe(org, id))?.statut).toBe("en_cours");
    await db.transaction((tx) => rejoindreDans(tx, org, id, kone, t("09:02:00")));

    // Signaux toutes les quatre secondes.
    for (let s = 4; s <= 20; s += 4) {
      await db.transaction((tx) => signalerDans(tx, org, id, awa.userId, { micro: true, camera: true, ecran: s === 20 }, new Date(t("09:01:00").getTime() + s * 1000)));
    }
    let salle = await participantsDe(org, id, t("09:01:20"));
    const presenceAwa = salle.find((p) => p.userId === awa.userId)!;
    expect(presenceAwa).toMatchObject({ present: true, secondesPresence: 20, micro: true, camera: true, ecran: true });
    // Koné ne s'est plus signalé depuis 09:02 : il n'est plus compté à 09:03.
    expect((await participantsDe(org, id, t("09:03:00"))).find((p) => p.userId === kone.userId)?.present).toBe(false);

    // Awa s'absente une minute puis revient : le trou n'est pas de la présence.
    await db.transaction((tx) => signalerDans(tx, org, id, awa.userId, { micro: false, camera: true, ecran: false }, t("09:02:30")));
    salle = await participantsDe(org, id, t("09:02:30"));
    expect(salle.find((p) => p.userId === awa.userId)?.secondesPresence).toBe(20);

    // Koné quitte : son temps est compté jusqu'à son dernier signal.
    await db.transaction((tx) => quitterDans(tx, org, id, kone.userId, t("09:02:10")));
    expect((await participantsDe(org, id, t("09:02:10"))).find((p) => p.userId === kone.userId)).toMatchObject({ present: false, secondesPresence: 10 });

    // Un participant ne termine pas la réunion des autres.
    await expect(db.transaction((tx) => appliquerGesteDans(tx, org, id, "terminer", awa, null, t("09:30:00")))).rejects.toThrow(/organisateur/);

    // L'organisateur termine : la salle se vide, le temps de chacun s'arrête au geste.
    await db.transaction((tx) => signalerDans(tx, org, id, awa.userId, { micro: true, camera: true, ecran: false }, t("09:29:56")));
    await db.transaction((tx) => appliquerGesteDans(tx, org, id, "terminer", gerant, null, t("09:30:00")));
    const close = await reunionDe(org, id);
    expect(close).toMatchObject({ statut: "terminee", terminateur: "Gérant" });
    salle = await participantsDe(org, id, t("09:30:00"));
    expect(salle.every((p) => !p.present)).toBe(true);
    expect(salle.find((p) => p.userId === awa.userId)?.secondesPresence).toBe(24);

    // Close : plus de signal accepté, plus personne n'entre.
    expect(await db.transaction((tx) => signalerDans(tx, org, id, awa.userId, { micro: true, camera: true, ecran: false }, t("09:30:04")))).toEqual({ statut: "terminee" });
    await expect(db.transaction((tx) => rejoindreDans(tx, org, id, awa, t("09:31:00")))).rejects.toThrow(/terminée/);

    // Le compte rendu reste à l'organisateur, et au journal.
    await db.transaction((tx) => enregistrerCompteRenduDans(tx, org, id, "Relances : Awa d'ici vendredi.", gerant));
    await expect(db.transaction((tx) => enregistrerCompteRenduDans(tx, org, id, "Autre chose", awa))).rejects.toThrow(/organisateur/);
    expect((await reunionDe(org, id))?.compteRendu).toBe("Relances : Awa d'ici vendredi.");

    const actions = (await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entityId, id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["reunion.programmer", "reunion.ouvrir", "reunion.rejoindre", "reunion.terminer", "reunion.compte_rendu"]));
  });

  it("annule avec un motif, et n'invite que des membres actifs", async () => {
    const { id } = await db.transaction((tx) =>
      creerReunionDans(tx, org, { titre: "Revue budgétaire", debutPrevu: t("15:00:00"), dureeMinutes: 60, participants: [awa.userId] }, gerant),
    );
    await expect(db.transaction((tx) => inviterDans(tx, org, id, [newId()], gerant))).rejects.toThrow(/accès actif/);
    expect((await db.transaction((tx) => inviterDans(tx, org, id, [awa.userId, yao.userId], gerant))).nouveaux).toEqual([yao.userId]);

    await expect(db.transaction((tx) => appliquerGesteDans(tx, org, id, "annuler", gerant, ""))).rejects.toThrow(/motif/);
    await db.transaction((tx) => appliquerGesteDans(tx, org, id, "annuler", gerant, "Client reçu en urgence"));
    expect(await reunionDe(org, id)).toMatchObject({ statut: "annulee", motifAnnulation: "Client reçu en urgence" });
    await expect(db.transaction((tx) => inviterDans(tx, org, id, [kone.userId], gerant))).rejects.toThrow(/close/);
  });

  it("refuse d'organiser sans le droit", async () => {
    await expect(
      db.transaction((tx) => creerReunionDans(tx, org, { titre: "Réunion sauvage", debutPrevu: t("10:00:00"), dureeMinutes: 30, participants: [] }, awa)),
    ).rejects.toThrow(/organiser/);
  });

  it("ne liste à chacun que ses réunions, en cours d'abord", async () => {
    const { id } = await db.transaction((tx) =>
      creerReunionDans(tx, org, { titre: "Réunion du matin", debutPrevu: new Date(), dureeMinutes: 30, participants: [kone.userId] }, gerant),
    );
    await db.transaction((tx) => rejoindreDans(tx, org, id, kone));
    const deKone = await listerReunions(org, kone.userId);
    expect(deKone[0]).toMatchObject({ id, statut: "en_cours", presents: 1, invites: 2 });
    expect((await listerReunions(org, yao.userId)).some((r) => r.id === id)).toBe(false);
  });
});

describe("autorisation des flux par le serveur vidéo", () => {
  it("ne laisse publier que ses propres flux, et lire que les participants, réunion en cours", async () => {
    const { id } = await db.transaction((tx) =>
      creerReunionDans(tx, org, { titre: "Visio", debutPrevu: new Date(), dureeMinutes: 30, participants: [awa.userId] }, gerant),
    );
    const camAwa = cheminFlux(id, awa.userId, "cam");
    const publier = signerFlux({ organizationId: org, reunionId: id, userId: awa.userId, sens: "publier" });
    const lire = signerFlux({ organizationId: org, reunionId: id, userId: gerant.userId, sens: "lire" });

    // Programmée, pas encore ouverte : rien ne passe.
    expect(await deciderReunion({ action: "publish", path: camAwa, query: `jeton=${encodeURIComponent(publier)}` })).toMatchObject({ autorise: false, raison: "réunion close" });

    await db.transaction((tx) => rejoindreDans(tx, org, id, awa));
    expect(await deciderReunion({ action: "publish", path: camAwa, query: `jeton=${encodeURIComponent(publier)}` })).toEqual({ autorise: true });
    expect(await deciderReunion({ action: "publish", path: cheminFlux(id, awa.userId, "ecran"), token: publier })).toEqual({ autorise: true });
    // Publier sous le nom d'un autre, ou avec un jeton de lecture : non.
    expect(await deciderReunion({ action: "publish", path: cheminFlux(id, gerant.userId, "cam"), token: publier })).toMatchObject({ autorise: false });
    expect(await deciderReunion({ action: "publish", path: camAwa, token: lire })).toMatchObject({ autorise: false });

    expect(await deciderReunion({ action: "read", path: camAwa, token: lire })).toEqual({ autorise: true });
    expect(await deciderReunion({ action: "read", path: camAwa, token: publier })).toMatchObject({ autorise: false });

    // Yao n'est pas invité : son jeton, même bien signé, n'ouvre rien.
    const intrus = signerFlux({ organizationId: org, reunionId: id, userId: yao.userId, sens: "lire" });
    expect(await deciderReunion({ action: "read", path: camAwa, token: intrus })).toMatchObject({ autorise: false, raison: "participant retiré" });
    // Jeton d'une autre réunion, ou périmé.
    const ailleurs = signerFlux({ organizationId: org, reunionId: newId(), userId: gerant.userId, sens: "lire" });
    expect(await deciderReunion({ action: "read", path: camAwa, token: ailleurs })).toMatchObject({ autorise: false });
    const perime = signerFlux({ organizationId: org, reunionId: id, userId: gerant.userId, sens: "lire" }, Date.now() - 10 * 60_000);
    expect(await deciderReunion({ action: "read", path: camAwa, token: perime })).toMatchObject({ autorise: false });
    expect(await deciderReunion({ action: "api", path: camAwa, token: lire })).toMatchObject({ autorise: false });

    // Terminée : plus aucun flux.
    await db.transaction((tx) => appliquerGesteDans(tx, org, id, "terminer", gerant));
    expect(await deciderReunion({ action: "read", path: camAwa, token: lire })).toMatchObject({ autorise: false, raison: "réunion close" });
  });
});
