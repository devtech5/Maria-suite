import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, notifications, plis, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { accuserPour, enregistrerPliPour, entitesDeLivraison, expedierPour, imputerPour, jetonEtiquette, pliParJeton, plisDe, relancerRetardsPour, remettrePour, traiterPour } from "@/modules/courrier/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let secretaire: string;
let dg: string;
let ingenieur: string;

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

const saisie = (objet: string) => ({ objet, correspondant: "Ministère de la Construction", reference: "MC/2026/112", nature: "lettre", canal: "coursier", dateDocument: "2026-11-05" });
const titres = async (userId: string) =>
  (await db.select({ titre: notifications.titre }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.categorie, "courrier")))).map((n) => n.titre);

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  dg = await compte("Directrice générale", "proprietaire", true);
  secretaire = await compte("Secrétaire", "secretaire");
  ingenieur = await compte("Ingénieur", "comptable");
});
afterAll(async () => fermer());

describe("courrier sur une vraie base", () => {
  let arrive: string;
  let reponse: string;

  it("numérote le registre sans trou, CA et CD séparément", async () => {
    const a1 = await enregistrerPliPour(org, secretaire, "arrivee", saisie("Demande de devis"), {}, new Date("2026-11-11T08:00:00Z"));
    const d1 = await enregistrerPliPour(org, secretaire, "depart", { ...saisie("Réponse au devis"), correspondant: "Ministère" }, {}, new Date("2026-11-11T08:05:00Z"));
    const a2 = await enregistrerPliPour(org, secretaire, "arrivee", saisie("Invitation"), { confidentiel: true }, new Date("2026-11-11T08:10:00Z"));
    expect([a1.numero, d1.numero, a2.numero]).toEqual(["CA-2026-00001", "CD-2026-00001", "CA-2026-00002"]);
    arrive = a1.id;
    reponse = d1.id;
  });

  it("pose une étiquette QR que le scan retrouve", async () => {
    const jeton = await jetonEtiquette(org, arrive);
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(await pliParJeton(org, jeton as string)).toBe(arrive);
  });

  it("prévient la direction d'une arrivée à imputer", async () => {
    expect(await titres(dg)).toContain("📨 Courrier à imputer : CA-2026-00001");
    expect(await titres(secretaire)).toEqual([]);
  });

  it("impute, prévient l'imputé, puis accuse et traite avec la réponse partie", async () => {
    await expect(traiterPour(org, ingenieur, arrive, { note: "", reponsePliId: null })).rejects.toThrow(/plus possible/);
    await imputerPour(org, dg, arrive, { userId: ingenieur, serviceId: null, instructions: "Préparer le devis", delaiReponse: "2026-11-20" });
    expect(await titres(ingenieur)).toEqual(["📨 Courrier imputé : CA-2026-00001"]);
    await expect(accuserPour(org, secretaire, arrive)).rejects.toThrow(/pas imputé/);
    await accuserPour(org, ingenieur, arrive);
    await expect(traiterPour(org, ingenieur, arrive, { note: "", reponsePliId: arrive })).rejects.toThrow(/pli parti/);
    await traiterPour(org, ingenieur, arrive, { note: "Devis envoyé", reponsePliId: reponse });
    const [p] = await db.select().from(plis).where(eq(plis.id, arrive));
    expect(p).toMatchObject({ statut: "traite", reponsePliId: reponse, noteTraitement: "Devis envoyé" });
    expect(p.accuseLe).not.toBeNull();
    expect(await titres(dg)).toContain("✅ Courrier traité : CA-2026-00001");
  });

  it("expédie puis remet un départ contre décharge, dans l'ordre", async () => {
    await expect(remettrePour(org, secretaire, reponse, { dechargeNom: "M. Koné" })).rejects.toThrow(/plus possible/);
    await expedierPour(org, secretaire, reponse, { transporteur: "Coursier interne", numeroSuivi: "" });
    await expect(remettrePour(org, secretaire, reponse, { dechargeNom: "" })).rejects.toThrow(/qui a reçu/);
    await remettrePour(org, secretaire, reponse, { dechargeNom: "M. Koné, secrétariat du ministère" });
    expect((await plisDe(org, { sens: "depart" }))[0]).toMatchObject({ statut: "remis", dechargeNom: "M. Koné, secrétariat du ministère", transporteur: "Coursier interne" });
  });

  it("relance un imputé en retard une fois par jour", async () => {
    const { id } = await enregistrerPliPour(org, secretaire, "arrivee", saisie("Mise en demeure"));
    await imputerPour(org, dg, id, { userId: ingenieur, serviceId: null, instructions: "", delaiReponse: "2099-01-01" });
    // Le délai est posé dans l'avenir ; on le ramène dans le passé, comme le temps l'aurait fait.
    await db.update(plis).set({ delaiReponse: "2026-11-01" }).where(eq(plis.id, id));
    const maintenant = new Date();
    expect(await relancerRetardsPour(org, maintenant)).toBe(1);
    expect(await relancerRetardsPour(org, new Date(maintenant.getTime() + 60 * 60_000))).toBe(0);
    expect(await relancerRetardsPour(org, new Date(maintenant.getTime() + 21 * 60 * 60_000))).toBe(1);
    expect((await titres(ingenieur)).filter((t) => t.startsWith("⏰"))).toHaveLength(2);
  });

  it("cherche dans le registre", async () => {
    expect((await plisDe(org, { recherche: "MC/2026" })).length).toBe(4);
    expect((await plisDe(org, { imputeA: ingenieur, statuts: ["impute", "recu"] })).map((p) => p.objet)).toEqual(["Mise en demeure"]);
  });

  it("ajoute l'entité qui livre au premier pli, la propose ensuite, sans doublon ; Yango est un canal", async () => {
    expect(await entitesDeLivraison(org)).toEqual([]);
    const a = await enregistrerPliPour(org, secretaire, "arrivee", { ...saisie("Colis Glovo"), canal: "__nouvelle__", entite: "  Glovo  Abidjan " });
    expect(await entitesDeLivraison(org)).toEqual(["Glovo Abidjan"]);
    const [p1] = await db.select().from(plis).where(eq(plis.id, a.id));
    expect(p1).toMatchObject({ canal: "entite", transporteur: "Glovo Abidjan" });

    // La même entité, retapée autrement, ne crée rien ; choisie dans la liste, elle non plus.
    await enregistrerPliPour(org, secretaire, "arrivee", { ...saisie("Autre colis"), canal: "__nouvelle__", entite: "glovo abidjan" });
    await enregistrerPliPour(org, secretaire, "arrivee", { ...saisie("Encore"), canal: "entite:Glovo Abidjan" });
    expect(await entitesDeLivraison(org)).toEqual(["Glovo Abidjan"]);

    const y = await enregistrerPliPour(org, secretaire, "arrivee", { ...saisie("Livré par Yango"), canal: "yango" });
    const [p2] = await db.select().from(plis).where(eq(plis.id, y.id));
    expect(p2).toMatchObject({ canal: "yango", transporteur: null });
    // Taper « Yango » comme nouvelle entité rend le canal Yango, pas une entité en double.
    const z = await enregistrerPliPour(org, secretaire, "arrivee", { ...saisie("Retapé"), canal: "__nouvelle__", entite: "yango" });
    expect((await db.select().from(plis).where(eq(plis.id, z.id)))[0]).toMatchObject({ canal: "yango" });
    expect(await entitesDeLivraison(org)).toEqual(["Glovo Abidjan"]);
    await expect(enregistrerPliPour(org, secretaire, "arrivee", { ...saisie("Sans nom"), canal: "__nouvelle__", entite: "" })).rejects.toThrow(/entité/);
  });
});

