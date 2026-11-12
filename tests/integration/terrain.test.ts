import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, notifications, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { creerProjetDans } from "@/modules/projets/creation";
import {
  changerRoleMembrePour,
  confierMembrePour,
  creerRelevePour,
  equipeDuProjet,
  examinerRelevePour,
  personnelPourProjet,
  preuvesAvecContexte,
  projetsDuTerrain,
  relevesDuProjet,
  retirerMembrePour,
} from "@/modules/projets/terrain";
import { lirePosition } from "@/modules/projets/terrain-regles";
import { preuvesReleve } from "@/modules/projets/terrain-schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

// Le dépôt de fichiers vit dans un dossier jetable : le même adaptateur disque qu'en production.
const depot = mkdtempSync(join(tmpdir(), "maria-terrain-"));
process.env.STOCKAGE_LOCAL = depot;

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let exploitant: string;
let chef: string;
let superviseur: string;
let agent: string;
let projetId: string;

async function compte(nom: string): Promise<string> {
  const id = newId();
  await db.insert(users).values({ id, fullName: nom, email: `${id}@exemple.test` });
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId: org, key: `r-${roleId}`, name: "Terrain" });
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId: id, roleId, status: "actif" });
  return id;
}

async function salarie(nom: string, userId: string | null): Promise<string> {
  const { id } = await creerSalariePour(org, { nom, poste: "Technicien", debut: "2026-01-05", salaireBase: 150_000 }, exploitant);
  if (userId) await db.update(employees).set({ userId }).where(eq(employees.id, id));
  return id;
}

const position = lirePosition(5.345678, -4.024429, 9) as Exclude<ReturnType<typeof lirePosition>, { erreur: string }>;
const image = () => ({ nature: "photo" as const, nom: "chantier.jpg", typeMime: "image/jpeg", contenu: new TextEncoder().encode("jpeg").buffer as ArrayBuffer });
const titres = async (u: string) => (await db.select({ t: notifications.titre }).from(notifications).where(and(eq(notifications.userId, u), eq(notifications.categorie, "projet")))).map((n) => n.t);

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: exploitant } = await semerEntreprise(db));
  chef = await compte("Chef de projet");
  superviseur = await compte("Superviseur Koné");
  agent = await compte("Agent Traoré");
  ({ id: projetId } = await db.transaction((tx) => creerProjetDans(tx, org, { nom: "Campagne Bouaké", responsableUserId: chef, debut: "2026-10-10" }, exploitant)));
});
afterAll(async () => fermer());

describe("équipe d'un projet", () => {
  it("confie du personnel interne (choisi dans le personnel) et externe (enregistré sur place)", async () => {
    const kone = await salarie("Koné Superviseur", superviseur);
    const traore = await salarie("Traoré Agent", agent);
    const sansCompte = await salarie("Yao Manœuvre", null);

    await confierMembrePour(org, chef, projetId, { role: "superviseur", origine: "interne", personne: `e:${kone}` });
    await confierMembrePour(org, chef, projetId, { role: "agent", origine: "interne", personne: `e:${traore}` });
    await confierMembrePour(org, chef, projetId, { role: "agent", origine: "interne", personne: `e:${sansCompte}` });
    await confierMembrePour(org, chef, projetId, { role: "agent", origine: "externe", nom: "Diabaté Sous-traitant", telephone: "0707", organisme: "Entreprise Diabaté" });

    const equipe = await equipeDuProjet(org, projetId);
    expect(equipe.map((m) => [m.nom, m.role, m.origine, m.userId !== null])).toEqual(
      expect.arrayContaining([
        ["Koné Superviseur", "superviseur", "interne", true],
        ["Traoré Agent", "agent", "interne", true],
        ["Yao Manœuvre", "agent", "interne", false],
        ["Diabaté Sous-traitant", "agent", "externe", false],
      ]),
    );
    // Le compte d'un salarié se lit à sa fiche : agent et superviseur retrouvent leur projet.
    expect((await projetsDuTerrain(org, agent)).map((p) => [p.id, p.role])).toEqual([[projetId, "agent"]]);
    expect((await projetsDuTerrain(org, superviseur))[0]).toMatchObject({ id: projetId, role: "superviseur", chef: false });
    expect((await projetsDuTerrain(org, chef))[0]).toMatchObject({ id: projetId, chef: true });
    expect(await titres(agent)).toHaveLength(1);
  });

  it("propose tout le personnel et marque ceux qui sont déjà au projet", async () => {
    const choix = await personnelPourProjet(org, await equipeDuProjet(org, projetId));
    expect(choix.find((p) => p.nom === "Traoré Agent")).toMatchObject({ pris: true, avecCompte: true });
    expect(choix.find((p) => p.nom === "Yao Manœuvre")).toMatchObject({ pris: true, avecCompte: false });
    // Un compte sans fiche de salarié reste proposé.
    expect(choix.find((p) => p.cle === `u:${exploitant}`)).toBeUndefined();
    const libre = await salarie("Libre Disponible", null);
    expect((await personnelPourProjet(org, await equipeDuProjet(org, projetId))).find((p) => p.cle === `e:${libre}`)).toMatchObject({ pris: false });
  });

  it("refuse un doublon, un externe superviseur, et un superviseur sans compte", async () => {
    const [traore] = (await equipeDuProjet(org, projetId)).filter((m) => m.nom === "Traoré Agent");
    await expect(confierMembrePour(org, chef, projetId, { role: "agent", origine: "interne", personne: `e:${traore.employeeId}` })).rejects.toThrow();
    await expect(confierMembrePour(org, chef, projetId, { role: "superviseur", origine: "externe", nom: "Faux Superviseur" })).rejects.toThrow(/compte/);
    const sansCompte = await salarie("Sans Compte Libre", null);
    await expect(confierMembrePour(org, chef, projetId, { role: "superviseur", origine: "interne", personne: `e:${sansCompte}` })).rejects.toThrow(/compte/);
    await expect(confierMembrePour(org, chef, projetId, { role: "agent", origine: "externe", nom: "X" })).rejects.toThrow(/nom/);
  });

  it("nomme un nouveau superviseur : l'ancien reste, comme agent", async () => {
    const nouveau = await compte("Nouveau Superviseur");
    const { id } = await confierMembrePour(org, chef, projetId, { role: "agent", origine: "interne", personne: `u:${nouveau}` });
    await changerRoleMembrePour(org, chef, id, "superviseur");
    const equipe = await equipeDuProjet(org, projetId);
    expect(equipe.filter((m) => m.role === "superviseur").map((m) => m.nom)).toEqual(["Nouveau Superviseur"]);
    expect(equipe.find((m) => m.nom === "Koné Superviseur")).toMatchObject({ role: "agent" });
    // On remet Koné : le suivant redevient agent.
    const kone = equipe.find((m) => m.nom === "Koné Superviseur")!;
    await changerRoleMembrePour(org, chef, kone.id, "superviseur");
    expect((await equipeDuProjet(org, projetId)).filter((m) => m.role === "superviseur").map((m) => m.nom)).toEqual(["Koné Superviseur"]);
    await retirerMembrePour(org, chef, id);
    expect((await equipeDuProjet(org, projetId)).some((m) => m.id === id)).toBe(false);
  });
});

describe("relevés de terrain", () => {
  it("exige position et preuve, enregistre, garde le fichier et prévient superviseur et chef", async () => {
    const equipe = await equipeDuProjet(org, projetId);
    const base = { libelle: "Fondations bloc B coulées", note: "Béton C25", avancement: "40", position, priseLe: new Date(), fichiers: [image()] };

    await expect(creerRelevePour(org, agent, projetId, { ...base, position: null }, equipe)).rejects.toThrow(/GPS/);
    await expect(creerRelevePour(org, agent, projetId, { ...base, fichiers: [] }, equipe)).rejects.toThrow(/photo/);
    await expect(creerRelevePour(org, agent, projetId, { ...base, libelle: "ab" }, equipe)).rejects.toThrow(/titre/);
    await expect(creerRelevePour(org, agent, projetId, { ...base, avancement: "140" }, equipe)).rejects.toThrow(/pourcentage/);
    await expect(creerRelevePour(org, agent, projetId, { ...base, priseLe: new Date(Date.now() + 3_600_000) }, equipe)).rejects.toThrow(/futur/);
    expect(await relevesDuProjet(org, projetId)).toHaveLength(0);

    const { id } = await creerRelevePour(org, agent, projetId, base, equipe);
    const [r] = await relevesDuProjet(org, projetId);
    expect(r).toMatchObject({ id, auteur: "Traoré Agent", saisiPar: null, avancement: 40, latitudeMicro: 5_345_678, longitudeMicro: -4_024_429, precisionM: 9, statut: "soumis" });
    expect(r.preuves).toHaveLength(1);
    const [preuve] = await db.select().from(preuvesReleve).where(eq(preuvesReleve.releveId, id));
    expect(existsSync(join(depot, preuve.chemin))).toBe(true);
    // Le superviseur et le chef de projet sont prévenus ; l'auteur, non.
    expect((await titres(superviseur)).some((t) => t.includes("Nouveau relevé de Traoré Agent"))).toBe(true);
    expect((await titres(chef)).some((t) => t.includes("Nouveau relevé"))).toBe(true);
    expect((await titres(agent)).some((t) => t.includes("Nouveau relevé"))).toBe(false);
  });

  it("relève pour un externe sans compte : l'auteur est l'externe, le compte qui a saisi est gardé", async () => {
    const equipe = await equipeDuProjet(org, projetId);
    const externe = equipe.find((m) => m.origine === "externe")!;
    await creerRelevePour(org, agent, projetId, { membreId: externe.id, libelle: "Pose des briques", position, priseLe: new Date(), fichiers: [image(), { ...image(), nature: "capture", nom: "capture.png", typeMime: "image/png" }] }, equipe);
    const r = (await relevesDuProjet(org, projetId)).find((x) => x.libelle === "Pose des briques")!;
    expect(r).toMatchObject({ auteur: "Diabaté Sous-traitant", saisiPar: "Agent Traoré", saisiParUserId: agent });
    expect(r.preuves.map((p) => p.nature).sort()).toEqual(["capture", "photo"]);
    // Un agent ne voit que ce qu'il a saisi.
    expect((await relevesDuProjet(org, projetId, { deUserId: agent })).length).toBeGreaterThan(0);
    expect(await relevesDuProjet(org, projetId, { deUserId: superviseur })).toHaveLength(0);
  });

  it("refuse un relevé pour quelqu'un qui n'est pas en poste, et sur un projet clos", async () => {
    const equipe = await equipeDuProjet(org, projetId);
    await expect(creerRelevePour(org, chef, projetId, { libelle: "Passage du chef", position, priseLe: new Date(), fichiers: [image()] }, equipe)).rejects.toThrow(/pas en poste/);
    const { id: clos } = await db.transaction((tx) => creerProjetDans(tx, org, { nom: "Projet clos", responsableUserId: chef }, exploitant));
    await db.execute(`update projets set statut = 'termine' where id = '${clos}'` as never);
    await expect(creerRelevePour(org, agent, clos, { libelle: "Trop tard", position, priseLe: new Date(), fichiers: [image()] }, equipe)).rejects.toThrow(/plus en cours/);
  });

  it("examine : renvoyer exige un motif, valider prévient l'auteur", async () => {
    const [r] = await relevesDuProjet(org, projetId, { deUserId: agent });
    await expect(examinerRelevePour(org, superviseur, r.id, "a_refaire", "")).rejects.toThrow(/refaire/);
    await examinerRelevePour(org, superviseur, r.id, "a_refaire", "Photo floue, reprendre de face");
    let relu = (await relevesDuProjet(org, projetId)).find((x) => x.id === r.id)!;
    expect(relu).toMatchObject({ statut: "a_refaire", commentaire: "Photo floue, reprendre de face", revisePar: "Superviseur Koné" });
    expect((await titres(agent)).some((t) => t.includes("à refaire"))).toBe(true);
    await examinerRelevePour(org, chef, r.id, "valide", "");
    relu = (await relevesDuProjet(org, projetId)).find((x) => x.id === r.id)!;
    expect(relu).toMatchObject({ statut: "valide", revisePar: "Chef de projet" });
    await expect(examinerRelevePour(org, chef, r.id, "valide", "")).rejects.toThrow(/déjà validé/);
  });

  it("donne le projet et l'auteur de chaque preuve, pour contrôler l'accès avant de signer", async () => {
    const [r] = await relevesDuProjet(org, projetId, { deUserId: agent });
    const lignes = await preuvesAvecContexte(org, r.preuves.map((p) => p.id));
    expect(lignes).toHaveLength(r.preuves.length);
    expect(lignes.every((l) => l.projetId === projetId && l.saisiParUserId === agent)).toBe(true);
  });
});
