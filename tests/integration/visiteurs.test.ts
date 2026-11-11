import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, notifications, roles, users, visites } from "@/db/schema";
import { newId } from "@/lib/ids";
import { accueilsDeLAgent, affecterAgentPour, changerStatutPour, creerVisitePour, enregistrerAccueilPour, presents, purgerPhotosPour, visiteParJeton, visitesDe } from "@/modules/visiteurs/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let agent: string;
let directeur: string;
let siege: string;
let chantier: string;

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

const saisie = (nom: string, piece = true) => ({ nom, telephone: "07 07 12 34 56", societe: "SOCOCE", motif: "Livraison", typePiece: piece ? "cni" : "", numeroPiece: piece ? "C0012345" : "" });

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  agent = await compte("Agent d'accueil");
  directeur = await compte("Directeur technique");
  siege = await enregistrerAccueilPour(org, directeur, { nom: "Siège Cocody", lieu: "Cocody", pieceExigee: true, actif: true });
  chantier = await enregistrerAccueilPour(org, directeur, { nom: "Chantier Bingerville", lieu: "", pieceExigee: false, actif: true });
});
afterAll(async () => fermer());

describe("visiteurs sur une vraie base", () => {
  it("refuse deux accueils du même nom, et rattache un agent", async () => {
    await expect(enregistrerAccueilPour(org, directeur, { nom: "Siège Cocody", lieu: "", pieceExigee: true, actif: true })).rejects.toThrow(/déjà/);
    await affecterAgentPour(org, directeur, siege, agent, true);
    await affecterAgentPour(org, directeur, siege, agent, true);
    expect(await accueilsDeLAgent(org, agent)).toEqual([siege]);
  });

  it("numérote les visites et prévient la personne visitée à l'arrivée", async () => {
    const a = await creerVisitePour(org, agent, { accueilId: siege, saisie: saisie("Awa Koné"), visiteUserId: directeur, visiteLibelle: "" }, new Date("2026-11-10T09:00:00Z"));
    const b = await creerVisitePour(org, agent, { accueilId: chantier, saisie: saisie("Yao Kouassi", false), visiteUserId: null, visiteLibelle: "Chef de chantier" }, new Date("2026-11-10T09:05:00Z"));
    expect(a.numero).toBe("V-2026-00001");
    expect(b.numero).toBe("V-2026-00002");
    const prevenu = await db.select({ titre: notifications.titre }).from(notifications).where(and(eq(notifications.userId, directeur), eq(notifications.categorie, "visiteur")));
    expect(prevenu.map((n) => n.titre)).toEqual(["🛎️ Awa Koné (SOCOCE) est arrivé à l'accueil"]);
  });

  it("exige la pièce là où l'accueil l'impose", async () => {
    await expect(creerVisitePour(org, agent, { accueilId: siege, saisie: saisie("Sans pièce", false), visiteUserId: null, visiteLibelle: "" })).rejects.toThrow(/pièce/);
  });

  it("mène un rendez-vous de l'annonce à la sortie, sans sauter d'étape", async () => {
    const { id } = await creerVisitePour(org, directeur, { accueilId: siege, saisie: saisie("Adjoua Bamba", false), visiteUserId: directeur, visiteLibelle: "", attenduLe: new Date("2026-11-12T10:00:00Z") });
    await expect(changerStatutPour(org, agent, id, "sortie")).rejects.toThrow(/impossible/);
    // Attendue sans pièce relevée : l'arrivée la demande.
    await expect(changerStatutPour(org, agent, id, "presente")).rejects.toThrow(/pièce/);
    const arrivee = await changerStatutPour(org, agent, id, "presente", { saisie: saisie("Adjoua Bamba") });
    expect(arrivee.statut).toBe("presente");
    expect(arrivee.numeroPiece).toBe("C0012345");
    const [{ jeton }] = await db.select({ jeton: visites.jetonBadge }).from(visites).where(eq(visites.id, id));
    expect(await visiteParJeton(org, jeton)).toBe(id);
    expect((await changerStatutPour(org, agent, id, "sortie")).statut).toBe("sortie");
  });

  it("liste les présents par accueil lisible", async () => {
    expect((await presents(org, [siege])).map((v) => v.nom)).toEqual(["Awa Koné"]);
    expect((await presents(org, null)).map((v) => v.nom).sort()).toEqual(["Awa Koné", "Yao Kouassi"]);
    expect(await visitesDe(org, { accueilIds: [] })).toEqual([]);
    expect((await visitesDe(org, { accueilIds: null, recherche: "kouassi" })).map((v) => v.nom)).toEqual(["Yao Kouassi"]);
  });

  it("efface les photos après trois mois, garde le registre", async () => {
    const { id } = await creerVisitePour(org, agent, { accueilId: siege, saisie: saisie("Ancien visiteur"), visiteUserId: null, visiteLibelle: "" }, new Date("2026-08-01T10:00:00Z"));
    await db.update(visites).set({ photoRecto: `${org}/visites/x-recto.jpg`, photoVerso: `${org}/visites/x-verso.jpg` }).where(eq(visites.id, id));
    expect(await purgerPhotosPour(org, new Date("2026-10-31T23:00:00Z"))).toBe(0);
    expect(await purgerPhotosPour(org, new Date("2026-11-01T10:00:00Z"))).toBe(1);
    const [v] = await db.select().from(visites).where(eq(visites.id, id));
    expect(v).toMatchObject({ photoRecto: null, photoVerso: null, nom: "Ancien visiteur", motif: "Livraison" });
    expect(v.photosEffaceesLe).toEqual(new Date("2026-11-01T10:00:00Z"));
    expect(await purgerPhotosPour(org, new Date("2026-12-01T10:00:00Z"))).toBe(0);
  });
});
