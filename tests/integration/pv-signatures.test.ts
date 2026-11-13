import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  creerPvDans,
  enregistrerPvDans,
  listerPv,
  publierPvDans,
  pvComplet,
  relancerPvDans,
  reviserPvDans,
  signerPvDans,
  type SaisieBrouillon,
} from "@/modules/pv/donnees";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let direction: string;
let redac: string;
let awa: string;
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
  direction = await compte("Directrice");
  redac = await compte("Rédacteur");
  awa = await compte("Awa Koné");
  tiers = await compte("Tiers");
});
afterAll(async () => fermer());

const dir = () => ({ userId: direction, valideur: true });
const red = () => ({ userId: redac, valideur: false });
const SIGNATURE = "M100 300 L150 250 L200 220 L260 240 L300 300 L340 260 L380 200 M420 310 L470 280 L520 260 L600 250 L700 270";

const saisie = (): SaisieBrouillon => ({
  type: "reunion",
  objet: "Réunion de chantier n° 5",
  dateSeance: "2026-11-13",
  lieu: "Bingerville",
  participants: [
    { nom: "Awa Koné", qualite: "Ingénieure", presence: "present", userId: awa },
    { nom: "Kouadio Serge", qualite: "Bureau de contrôle", presence: "present", userId: null },
    { nom: "Traoré Ali", qualite: "Chef de chantier", presence: "excuse", userId: null },
  ],
  points: [{ titre: "Avancement", texte: "Dalle coulée.", decisions: [] }],
  conclusion: null,
  // Diffusé à personne d'autre que la direction : Awa signe parce qu'elle était présente, pas parce qu'elle est destinataire.
  diffusion: { tous: false, services: [], comptes: [direction] },
  accuseRequis: false,
  confidentiel: false,
  actions: [],
});

async function pvPublie(): Promise<{ id: string; signataires: string[] }> {
  const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "reunion", objet: "Réunion de chantier n° 5", dateSeance: "2026-11-13" }, red()));
  await db.transaction((tx) => enregistrerPvDans(tx, org, id, saisie(), red()));
  const r = await db.transaction((tx) => publierPvDans(tx, org, id, dir()));
  return { id, signataires: r.signataires };
}

describe("signatures des participants", () => {
  it("chacun signe pour soi, l'extérieur sur place, une seule fois", async () => {
    const { id, signataires } = await pvPublie();
    expect(signataires).toEqual([awa]);

    // Awa voit le PV (présente) et l'a à signer, sans en être destinataire.
    const [ligne] = (await listerPv(org, { userId: awa, valideur: false })).filter((l) => l.id === id);
    expect(ligne).toMatchObject({ participant: true, aSigner: true, destinataire: false });

    // Un tiers ne signe pour personne ; Awa ne signe pas pour Kouadio.
    await expect(db.transaction((tx) => signerPvDans(tx, org, id, 0, SIGNATURE, { userId: tiers, valideur: false }))).rejects.toThrow("pour vous-même");
    await expect(db.transaction((tx) => signerPvDans(tx, org, id, 1, SIGNATURE, { userId: awa, valideur: false }))).rejects.toThrow("pour vous-même");
    // Un excusé ne signe pas.
    await expect(db.transaction((tx) => signerPvDans(tx, org, id, 2, SIGNATURE, red()))).rejects.toThrow("présents");
    await expect(db.transaction((tx) => signerPvDans(tx, org, id, 0, "M1 1 L2 2", { userId: awa, valideur: false }))).rejects.toThrow("trop courte");

    const r1 = await db.transaction((tx) => signerPvDans(tx, org, id, 0, SIGNATURE, { userId: awa, valideur: false }, { adresseIp: "10.0.0.7", appareil: "Test" }));
    expect(r1).toMatchObject({ mode: "personnelle", restantes: 1 });
    await expect(db.transaction((tx) => signerPvDans(tx, org, id, 0, SIGNATURE, { userId: awa, valideur: false }))).rejects.toThrow("déjà signé");

    const r2 = await db.transaction((tx) => signerPvDans(tx, org, id, 1, SIGNATURE, red()));
    expect(r2).toMatchObject({ mode: "sur_place", restantes: 0 });

    const { signatures } = (await pvComplet(org, id, dir()))!;
    expect(signatures.map((s) => [s.nom, s.personnelle, s.recueilliePar])).toEqual([
      ["Awa Koné", true, null],
      ["Kouadio Serge", false, "Rédacteur"],
    ]);
    expect((await listerPv(org, { userId: awa, valideur: false })).find((l) => l.id === id)!.aSigner).toBe(false);
  });

  it("relance les signataires en retard, et se signe à nouveau dans une nouvelle version", async () => {
    const { id } = await pvPublie();
    const relance = await db.transaction((tx) => relancerPvDans(tx, org, id, red()));
    expect(relance.aRelancer).toEqual([awa]);

    await db.transaction((tx) => signerPvDans(tx, org, id, 0, SIGNATURE, { userId: awa, valideur: false }));
    const { id: v2 } = await db.transaction((tx) => reviserPvDans(tx, org, id, red()));
    // Brouillon : on ne signe pas un texte qui peut encore changer.
    await expect(db.transaction((tx) => signerPvDans(tx, org, v2, 0, SIGNATURE, { userId: awa, valideur: false }))).rejects.toThrow("publié");
    await db.transaction((tx) => publierPvDans(tx, org, v2, dir()));
    expect((await pvComplet(org, v2, dir()))!.signatures).toHaveLength(0);
    expect((await pvComplet(org, id, dir()))!.signatures).toHaveLength(1);
  });
});
