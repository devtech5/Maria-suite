import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  creerPvDans,
  enregistrerPvDans,
  joindreFichierPv,
  publierPvDans,
  pvComplet,
  retirerFichierPv,
  reviserPvDans,
  soumettrePvDans,
  urlFichierPv,
  type SaisieBrouillon,
} from "@/modules/pv/donnees";
import { pvFichiers } from "@/modules/pv/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

// Le dépôt de fichiers vit dans un dossier jetable : le même adaptateur disque qu'en production.
const depot = mkdtempSync(join(tmpdir(), "maria-pv-"));
process.env.STOCKAGE_LOCAL = depot;

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let direction: string;
let redac: string;
let lecteur: string;
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
  lecteur = await compte("Lecteur");
  tiers = await compte("Tiers");
});
afterAll(async () => fermer());

const dir = () => ({ userId: direction, valideur: true });
const red = () => ({ userId: redac, valideur: false });
const pdf = (texte: string) => ({ nom: "plan.pdf", typeMime: "application/pdf", contenu: new TextEncoder().encode(`%PDF-1.4 ${texte}`).buffer as ArrayBuffer });
const saisie = (): SaisieBrouillon => ({
  type: "rapport",
  objet: "Rapport d'incident",
  dateSeance: "2026-11-13",
  lieu: null,
  participants: [],
  points: [{ titre: "Faits", texte: "Chute de matériel.", decisions: [] }],
  conclusion: null,
  diffusion: { tous: false, services: [], comptes: [lecteur] },
  accuseRequis: false,
  confidentiel: false,
  actions: [],
});
const fichierSurDisque = async (id: string) => {
  const [f] = await db.select().from(pvFichiers).where(eq(pvFichiers.id, id));
  return existsSync(join(depot, f.chemin));
};

describe("pièces jointes des procès-verbaux", () => {
  it("se joignent au brouillon, partent avec le PV et se figent à la publication", async () => {
    const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "rapport", objet: "Rapport d'incident", dateSeance: "2026-11-13" }, red()));
    await db.transaction((tx) => enregistrerPvDans(tx, org, id, saisie(), red()));

    await joindreFichierPv(org, id, pdf("un"), red());
    await expect(joindreFichierPv(org, id, { nom: "virus.exe", typeMime: "application/x-msdownload", contenu: new ArrayBuffer(10) }, red())).rejects.toThrow("Format non accepté");
    await expect(joindreFichierPv(org, id, pdf("x"), { userId: tiers, valideur: false })).rejects.toThrow("Seuls le rédacteur et la direction");

    let [piece] = (await pvComplet(org, id, red()))!.fichiers;
    expect(piece).toMatchObject({ nom: "plan.pdf", typeMime: "application/pdf" });
    expect(await fichierSurDisque(piece.id)).toBe(true);

    // Soumis : le rédacteur ne touche plus aux pièces, la direction si.
    await db.transaction((tx) => soumettrePvDans(tx, org, id, red()));
    await expect(joindreFichierPv(org, id, pdf("deux"), red())).rejects.toThrow("Seuls le rédacteur et la direction");
    await joindreFichierPv(org, id, pdf("deux"), dir());

    await db.transaction((tx) => publierPvDans(tx, org, id, dir()));
    await expect(joindreFichierPv(org, id, pdf("trois"), dir())).rejects.toThrow("figé");
    [piece] = (await pvComplet(org, id, red()))!.fichiers;
    await expect(retirerFichierPv(org, piece.id, dir())).rejects.toThrow("figé");

    // Le destinataire ouvre la pièce ; un compte à qui le PV n'est pas diffusé, non.
    expect(await urlFichierPv(org, piece.id, { userId: lecteur, valideur: false })).toMatch(/^\/fichiers\//);
    expect(await urlFichierPv(org, piece.id, { userId: tiers, valideur: false })).toBeNull();
  });

  it("suivent la nouvelle version sans que la retirer n'efface le fichier de la version publiée", async () => {
    const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "rapport", objet: "Rapport d'incident", dateSeance: "2026-11-13" }, red()));
    await db.transaction((tx) => enregistrerPvDans(tx, org, id, saisie(), red()));
    await joindreFichierPv(org, id, pdf("partagé"), red());
    await db.transaction((tx) => publierPvDans(tx, org, id, dir()));

    const { id: v2 } = await db.transaction((tx) => reviserPvDans(tx, org, id, red()));
    const [copie] = (await pvComplet(org, v2, red()))!.fichiers;
    const [originale] = (await pvComplet(org, id, red()))!.fichiers;
    expect(copie.nom).toBe("plan.pdf");

    // Retirée de la version 2 : le fichier reste sur le disque, la version 1 le désigne encore.
    await retirerFichierPv(org, copie.id, red());
    expect((await pvComplet(org, v2, red()))!.fichiers).toHaveLength(0);
    expect(await fichierSurDisque(originale.id)).toBe(true);

    // Une pièce qui n'est qu'au brouillon quitte vraiment le dépôt.
    await joindreFichierPv(org, v2, pdf("propre à la v2"), red());
    const [seule] = (await pvComplet(org, v2, red()))!.fichiers;
    await retirerFichierPv(org, seule.id, red());
    expect(await fichierSurDisque(seule.id)).toBe(false);
  });
});
