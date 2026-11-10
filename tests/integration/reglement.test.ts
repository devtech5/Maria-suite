import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, notifications, organizationModules, reglementAcceptations, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { jourLocal } from "@/modules/presences/calcul";
import { versionAAccepter } from "@/modules/reglement/garde";
import { RELANCE_MIN_MS } from "@/modules/reglement/regles";
import { accepterPour, creerBrouillonPour, enregistrerBrouillonPour, publierPour, relancerPour, suiviDe, supprimerBrouillonPour, versionDe } from "@/modules/reglement/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let rh: string;
let awa: string;
let kone: string;

async function compte(nom: string, cleRole: string): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, cleRole)));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: cleRole, name: cleRole, isSystem: true });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, status: "actif" });
  return userId;
}

// Le blocage lit l'heure de la base (`now()`) : les dates d'effet se posent par rapport au vrai jour.
const aujourdhui = () => jourLocal(new Date());
const dans = (jours: number) => jourLocal(new Date(Date.now() + jours * 86_400_000));

const saisie = (dateEffet: string, articles = [{ titre: "Objet", texte: "Le présent règlement s'applique à tout le personnel." }]) => ({
  titre: "Règlement intérieur",
  preambule: "",
  resume: "",
  dateEffet,
  articles,
});

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  rh = await compte("Responsable RH", "gerant");
  awa = await compte("Awa Koné", "secretaire");
  kone = await compte("Koné Yao", "comptable");
});
afterAll(async () => fermer());

describe("règlement intérieur sur une vraie base", () => {
  let v1: string;

  it("ne bloque personne tant que rien n'est publié", async () => {
    expect(await versionAAccepter(org, awa)).toBeNull();
  });

  it("n'ouvre qu'un brouillon à la fois", async () => {
    v1 = await creerBrouillonPour(org, rh);
    expect(await creerBrouillonPour(org, rh)).toBe(v1);
    await enregistrerBrouillonPour(org, rh, v1, saisie(aujourdhui()));
    // Un brouillon ne bloque pas, même daté d'aujourd'hui.
    expect(await versionAAccepter(org, awa)).toBeNull();
  });

  it("publie avec un numéro, prévient tout le monde, puis bloque qui n'a pas accepté", async () => {
    const { numero } = await publierPour(org, rh, v1);
    expect(numero).toBe(1);
    const prevenus = await db.select({ userId: notifications.userId }).from(notifications).where(and(eq(notifications.organizationId, org), eq(notifications.categorie, "reglement")));
    expect(new Set(prevenus.map((p) => p.userId))).toEqual(new Set([rh, awa, kone]));

    expect(await versionAAccepter(org, awa)).toBe(v1);
    expect(await versionAAccepter(org, rh)).toBe(v1);
  });

  it("ne modifie plus une version publiée", async () => {
    await expect(enregistrerBrouillonPour(org, rh, v1, saisie(aujourdhui()))).rejects.toThrow(/publiée/);
    await expect(supprimerBrouillonPour(org, rh, v1)).rejects.toThrow(/publiée/);
  });

  it("débloque à l'acceptation, horodatée une seule fois", async () => {
    await accepterPour(org, awa, v1, { adresseIp: "10.0.0.1", appareil: "Test" });
    const [premiere] = await db.select().from(reglementAcceptations).where(eq(reglementAcceptations.userId, awa));
    await accepterPour(org, awa, v1);
    const lignes = await db.select().from(reglementAcceptations).where(eq(reglementAcceptations.userId, awa));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].accepteLe).toEqual(premiere.accepteLe);
    expect(lignes[0].adresseIp).toBe("10.0.0.1");
    expect(await versionAAccepter(org, awa)).toBeNull();
    expect(await versionAAccepter(org, kone)).toBe(v1);
  });

  it("refuse une publication rétroactive", async () => {
    const id = await creerBrouillonPour(org, rh);
    await enregistrerBrouillonPour(org, rh, id, saisie(dans(-1)));
    await expect(publierPour(org, rh, id)).rejects.toThrow(/rétroactif/);
    await supprimerBrouillonPour(org, rh, id);
  });

  it("ne bloque une version publiée à l'avance qu'à sa date d'effet", async () => {
    const v2 = await creerBrouillonPour(org, rh);
    expect(v2).not.toBe(v1);
    // Le brouillon reprend le texte de la dernière version publiée.
    expect((await versionDe(org, v2))?.articles).toHaveLength(1);
    await enregistrerBrouillonPour(org, rh, v2, saisie(dans(30)));
    expect((await publierPour(org, rh, v2)).numero).toBe(2);
    // Awa a accepté la version 1, toujours en vigueur : rien ne la bloque.
    expect(await versionAAccepter(org, awa)).toBeNull();
    // Elle peut accepter la 2 dès maintenant.
    await accepterPour(org, awa, v2);
    expect((await suiviDe(org, v2)).lus).toBe(1);
  });

  it("relance ceux qui n'ont pas accepté, au plus une fois par heure", async () => {
    const avant = await db.select().from(notifications).where(and(eq(notifications.userId, kone), eq(notifications.categorie, "reglement")));
    const maintenant = new Date();
    expect(await relancerPour(org, rh, v1, maintenant)).toBe(1); // Koné ; le RH, qui relance, ne se notifie pas.
    const apres = await db.select().from(notifications).where(and(eq(notifications.userId, kone), eq(notifications.categorie, "reglement")));
    expect(apres.length).toBe(avant.length + 1);
    await expect(relancerPour(org, rh, v1, new Date(maintenant.getTime() + 60_000))).rejects.toThrow(/moins d'une heure/);
    expect(await relancerPour(org, rh, v1, new Date(maintenant.getTime() + RELANCE_MIN_MS))).toBe(1);
  });

  it("ne bloque plus personne quand le module est coupé", async () => {
    await db.insert(organizationModules).values({ id: newId(), organizationId: org, moduleKey: "reglement", enabled: false });
    expect(await versionAAccepter(org, kone)).toBeNull();
    await db.delete(organizationModules).where(and(eq(organizationModules.organizationId, org), eq(organizationModules.moduleKey, "reglement")));
    expect(await versionAAccepter(org, kone)).toBe(v1);
  });
});
