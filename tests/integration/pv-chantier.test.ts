import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { projets } from "@/modules/projets/schema";
import { membresProjet } from "@/modules/projets/terrain-schema";
import {
  actionEnTacheDans,
  creerPvDans,
  enregistrerPvDans,
  listerPv,
  publierPvDans,
  pvComplet,
  reviserPvDans,
  type SaisieBrouillon,
} from "@/modules/pv/donnees";
import { taches } from "@/modules/taches/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let direction: string;
let awa: string;
let projet: string;

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
  awa = await compte("Awa Koné");
  projet = newId();
  await db.insert(projets).values({ id: projet, organizationId: org, code: "CH-001", nom: "Résidence Les Palmiers", responsableUserId: awa, statut: "en_cours" });
  await db.insert(membresProjet).values({ id: newId(), organizationId: org, projetId: projet, role: "agent", origine: "externe", nom: "Kouadio Serge", organisme: "Bureau de contrôle VERITAS" });
});
afterAll(async () => fermer());

const dir = () => ({ userId: direction, valideur: true });
const chef = () => ({ userId: awa, valideur: false });

describe("PV de chantier", () => {
  it("se rattache à un projet : sans lui, pas de PV de chantier", async () => {
    await expect(db.transaction((tx) => creerPvDans(tx, org, { type: "chantier", objet: "", dateSeance: "2026-11-13" }, chef()))).rejects.toThrow("Choisissez le projet");
  });

  it("numérote les réunions du projet et reprend la précédente", async () => {
    // Première réunion : l'équipe du projet, chef de projet en tête.
    const { id: premier } = await db.transaction((tx) => creerPvDans(tx, org, { type: "chantier", objet: "", dateSeance: "2026-11-06", projetId: projet }, chef()));
    let pv = (await pvComplet(org, premier, chef()))!;
    expect(pv.pv.objet).toBe("Réunion de chantier n° 1 — Résidence Les Palmiers");
    expect(pv.pv.numeroReunion).toBe(1);
    expect(pv.projet).toMatchObject({ code: "CH-001" });
    expect(pv.pv.participants).toEqual([
      { nom: "Awa Koné", qualite: "Chef de projet", presence: "present", userId: awa },
      { nom: "Kouadio Serge", qualite: "Bureau de contrôle VERITAS", presence: "present", userId: null },
    ]);

    const saisie: SaisieBrouillon = {
      type: "chantier",
      objet: pv.pv.objet,
      dateSeance: "2026-11-06",
      lieu: "Base vie",
      participants: pv.pv.participants,
      points: [],
      conclusion: null,
      diffusion: { tous: false, services: [], comptes: [direction] },
      accuseRequis: false,
      confidentiel: false,
      actions: [
        { libelle: "Livrer les aciers HA12", echeance: "2026-11-10" },
        { libelle: "Reprendre l'enduit du pignon nord" },
      ],
      projetId: projet,
      numeroReunion: 1,
      chantier: {
        meteo: "pluvieux",
        intemperies: false,
        effectifs: [{ entreprise: "MARIA GROUP", lot: "Gros œuvre", nombre: 14 }],
        avancement: [{ lot: "Élévation R+1", prevu: 60, realise: 45, observation: "Retard d'aciers" }],
        prochaineReunion: { date: "2026-11-13", heure: "09:00", lieu: "Base vie" },
      },
    };
    await db.transaction((tx) => enregistrerPvDans(tx, org, premier, saisie, chef()));
    await db.transaction((tx) => publierPvDans(tx, org, premier, dir()));
    pv = (await pvComplet(org, premier, dir()))!;
    expect(pv.pv.chantier?.effectifs).toEqual([{ entreprise: "MARIA GROUP", lot: "Gros œuvre", nombre: 14 }]);

    // La première action devient une tâche, achevée ; la seconde reste ouverte.
    const [aciers, enduit] = pv.actions;
    const { numeroTache } = await db.transaction((tx) => actionEnTacheDans(tx, org, aciers.id, dir()));
    await db.update(taches).set({ statut: "terminee", termineeLe: new Date() }).where(eq(taches.numero, numeroTache));

    // Deuxième réunion : n° 2, mêmes participants, entreprises et lots ; seule l'action ouverte suit.
    const { id: second } = await db.transaction((tx) => creerPvDans(tx, org, { type: "chantier", objet: "", dateSeance: "2026-11-13", projetId: projet }, chef()));
    const suite = (await pvComplet(org, second, chef()))!;
    expect(suite.pv.numeroReunion).toBe(2);
    expect(suite.pv.objet).toBe("Réunion de chantier n° 2 — Résidence Les Palmiers");
    expect(suite.pv.participants.map((p) => p.nom)).toEqual(["Awa Koné", "Kouadio Serge"]);
    expect(suite.pv.chantier).toMatchObject({
      meteo: null,
      effectifs: [{ entreprise: "MARIA GROUP", lot: "Gros œuvre", nombre: 0 }],
      avancement: [{ lot: "Élévation R+1", prevu: null, realise: 45, observation: "" }],
    });
    expect(suite.actions.map((a) => a.libelle)).toEqual([enduit.libelle]);
    expect(suite.pv).toMatchObject({ lieu: "Base vie", diffusion: { tous: false, services: [], comptes: [direction] } });

    // La liste porte le projet et le numéro de réunion.
    const liste = await listerPv(org, dir());
    expect(liste.find((l) => l.id === premier)).toMatchObject({ projetId: projet, projet: "CH-001 — Résidence Les Palmiers", numeroReunion: 1 });

    // Corriger la réunion n° 1 garde son projet, son numéro et ses données.
    const { id: v2 } = await db.transaction((tx) => reviserPvDans(tx, org, premier, dir()));
    // Le brouillon de correction reste celui du rédacteur : lui seul le voit avant soumission.
    const corrige = (await pvComplet(org, v2, chef()))!;
    expect(corrige.pv).toMatchObject({ projetId: projet, numeroReunion: 1, revision: 2 });
    expect(corrige.pv.chantier?.avancement[0].realise).toBe(45);
  });

  it("refuse de publier une réunion de chantier sans point ni avancement", async () => {
    const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "chantier", objet: "", dateSeance: "2026-11-20", projetId: projet }, dir()));
    const pv = (await pvComplet(org, id, dir()))!;
    await db.transaction((tx) =>
      enregistrerPvDans(
        tx,
        org,
        id,
        {
          type: "chantier",
          objet: pv.pv.objet,
          dateSeance: "2026-11-20",
          lieu: null,
          participants: pv.pv.participants,
          points: [],
          conclusion: null,
          diffusion: { tous: true, services: [], comptes: [] },
          accuseRequis: false,
          confidentiel: false,
          actions: [],
          projetId: projet,
          numeroReunion: pv.pv.numeroReunion,
          chantier: { avancement: [] },
        },
        dir(),
      ),
    );
    await expect(db.transaction((tx) => publierPvDans(tx, org, id, dir()))).rejects.toThrow("Rédigez au moins un point ou l'avancement d'un lot.");
  });
});
