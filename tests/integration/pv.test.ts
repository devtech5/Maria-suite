import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerReunionDans, enregistrerCompteRenduDans } from "@/modules/meeting/creation";
import { reunionParticipants } from "@/modules/meeting/schema";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees, services } from "@/modules/personnes/schema";
import {
  accuserLectureDans,
  actionEnTacheDans,
  creerPvDans,
  enregistrerPvDans,
  listerPv,
  publierPvDans,
  pvComplet,
  relancerPvDans,
  renvoyerPvDans,
  reviserPvDans,
  soumettrePvDans,
  type SaisieBrouillon,
} from "@/modules/pv/donnees";
import { taches } from "@/modules/taches/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let direction: string;
let redac: string;
let lecteur: string;
let autre: string;
let serviceTech: string;
let employeLecteur: string;

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
  lecteur = await compte("Lecteur technique");
  autre = await compte("Autre service");
  serviceTech = newId();
  await db.insert(services).values({ id: serviceTech, organizationId: org, code: "DT", libelle: "Direction technique" });
  ({ id: employeLecteur } = await creerSalariePour(org, { nom: "Lecteur technique", poste: "Ingénieur", debut: "2026-01-05", salaireBase: 300_000 }, direction));
  await db.update(employees).set({ userId: lecteur, service: "Direction technique" }).where(eq(employees.id, employeLecteur));
});
afterAll(async () => fermer());

const dir = () => ({ userId: direction, valideur: true });
const red = () => ({ userId: redac, valideur: false });

const saisie = (p: Partial<SaisieBrouillon> = {}): SaisieBrouillon => ({
  type: "reunion",
  objet: "Réunion de chantier n° 4",
  dateSeance: "2026-11-12",
  lieu: "Bingerville",
  participants: [{ nom: "Lecteur technique", qualite: "Ingénieur", presence: "present" }],
  points: [{ titre: "Avancement", texte: "Dalle **coulée**.", decisions: ["Commander les aciers"] }],
  conclusion: null,
  diffusion: { tous: false, services: [serviceTech], comptes: [] },
  accuseRequis: true,
  confidentiel: false,
  actions: [{ libelle: "Commander les aciers HA12", responsableEmployeId: employeLecteur, echeance: "2026-11-20" }],
  ...p,
});

describe("procès-verbaux", () => {
  it("se rédige, se soumet, se renvoie, se publie et se diffuse au service", async () => {
    const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "reunion", objet: "Réunion de chantier", dateSeance: "2026-11-12" }, red()));
    await db.transaction((tx) => enregistrerPvDans(tx, org, id, saisie(), red()));

    // Le rédacteur ne publie pas lui-même.
    await expect(db.transaction((tx) => publierPvDans(tx, org, id, red()))).rejects.toThrow("Seule la direction");

    await db.transaction((tx) => soumettrePvDans(tx, org, id, red()));
    await expect(db.transaction((tx) => renvoyerPvDans(tx, org, id, "", dir()))).rejects.toThrow("ce qu'il faut reprendre");
    await db.transaction((tx) => renvoyerPvDans(tx, org, id, "Ajoutez le lieu exact.", dir()));
    expect((await pvComplet(org, id, red()))!.pv).toMatchObject({ statut: "brouillon", remarque: "Ajoutez le lieu exact." });

    await db.transaction((tx) => soumettrePvDans(tx, org, id, red()));
    const r = await db.transaction((tx) => publierPvDans(tx, org, id, dir()));
    expect(r.numero).toMatch(/^PV-\d{4}-00001$/);
    expect(r.destinataires).toEqual([lecteur]);

    // Le lecteur le voit et l'accuse ; l'autre service ne le voit pas.
    expect((await listerPv(org, { userId: lecteur, valideur: false })).map((l) => l.id)).toContain(id);
    expect(await pvComplet(org, id, { userId: autre, valideur: false })).toBeNull();
    expect((await listerPv(org, { userId: autre, valideur: false })).some((l) => l.id === id)).toBe(false);

    const relance = await db.transaction((tx) => relancerPvDans(tx, org, id, red()));
    expect(relance.aRelancer).toEqual([lecteur]);
    await expect(db.transaction((tx) => relancerPvDans(tx, org, id, red()))).rejects.toThrow("moins d'une heure");

    await db.transaction((tx) => accuserLectureDans(tx, org, id, lecteur));
    const complet = (await pvComplet(org, id, dir()))!;
    expect(complet.lectures.map((l) => [l.nom, l.luLe !== null])).toEqual([["Lecteur technique", true]]);
    await expect(db.transaction((tx) => accuserLectureDans(tx, org, id, autre))).rejects.toThrow("ne vous est pas diffusé");

    // Publié : figé.
    await expect(db.transaction((tx) => enregistrerPvDans(tx, org, id, saisie({ objet: "Réécrit" }), red()))).rejects.toThrow("ne se modifie plus");
  });

  it("change une action en tâche confiée à son responsable, une seule fois", async () => {
    const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "compte_rendu", objet: "Point achats", dateSeance: "2026-11-13" }, red()));
    await db.transaction((tx) => enregistrerPvDans(tx, org, id, saisie({ type: "compte_rendu", objet: "Point achats" }), red()));
    const [action] = (await pvComplet(org, id, red()))!.actions;
    await expect(db.transaction((tx) => actionEnTacheDans(tx, org, action.id, red()))).rejects.toThrow("Publiez");

    await db.transaction((tx) => publierPvDans(tx, org, id, dir()));
    const r = await db.transaction((tx) => actionEnTacheDans(tx, org, action.id, red()));
    expect(r.assigneeUserId).toBe(lecteur);
    const [tache] = await db.select().from(taches).where(eq(taches.numero, r.numeroTache));
    expect(tache).toMatchObject({ titre: "Commander les aciers HA12", echeance: "2026-11-20", assigneeEmployeId: employeLecteur });
    await expect(db.transaction((tx) => actionEnTacheDans(tx, org, action.id, red()))).rejects.toThrow("existe déjà");
    expect((await pvComplet(org, id, red()))!.actions[0]).toMatchObject({ tacheNumero: r.numeroTache, tacheStatut: "a_faire" });
  });

  it("se corrige par une nouvelle version sous le même numéro", async () => {
    const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "rapport", objet: "Rapport d'incident", dateSeance: "2026-11-10" }, red()));
    await db.transaction((tx) => enregistrerPvDans(tx, org, id, saisie({ type: "rapport", objet: "Rapport d'incident", participants: [], actions: [] }), red()));
    const premier = await db.transaction((tx) => publierPvDans(tx, org, id, dir()));

    const { id: v2 } = await db.transaction((tx) => reviserPvDans(tx, org, id, red()));
    // Demander deux fois rend la même version en cours.
    expect((await db.transaction((tx) => reviserPvDans(tx, org, id, dir()))).id).toBe(v2);
    await db.transaction((tx) => enregistrerPvDans(tx, org, v2, saisie({ type: "rapport", objet: "Rapport d'incident (corrigé)", participants: [], actions: [] }), red()));
    const second = await db.transaction((tx) => publierPvDans(tx, org, v2, dir()));
    expect([second.numero, second.revision]).toEqual([premier.numero, 2]);

    const lignes = await listerPv(org, dir());
    expect(lignes.find((l) => l.id === id)!.remplace).toBe(true);
    expect(lignes.find((l) => l.id === v2)!.remplace).toBe(false);
  });

  it("reprend une réunion Meeting : objet, présences et compte rendu", async () => {
    const { id: reunionId } = await db.transaction((tx) =>
      creerReunionDans(tx, org, { titre: "Point hebdomadaire", debutPrevu: new Date("2026-11-12T09:00:00Z"), dureeMinutes: 60, participants: [lecteur, autre] }, { userId: redac, organise: true, attribue: false } as never),
    );
    await db.update(reunionParticipants).set({ rejointLe: new Date() }).where(and(eq(reunionParticipants.reunionId, reunionId), eq(reunionParticipants.userId, lecteur)));
    await db.transaction((tx) => enregistrerCompteRenduDans(tx, org, reunionId, "Tout va bien.", { userId: redac, organise: true, attribue: false } as never));

    const { id } = await db.transaction((tx) => creerPvDans(tx, org, { type: "reunion", objet: "", dateSeance: "2026-11-12", reunionId }, red()));
    const { pv } = (await pvComplet(org, id, red()))!;
    expect(pv.objet).toBe("Point hebdomadaire");
    expect(pv.participants.map((p) => `${p.nom}:${p.presence}`).sort()).toEqual(["Autre service:absent", "Lecteur technique:present", "Rédacteur:absent"]);
    expect(pv.points[0]).toMatchObject({ titre: "Compte rendu de la réunion", texte: "Tout va bien." });

    // Qui n'en était pas ne peut pas en tirer de PV.
    const etranger = await compte("Étranger");
    await expect(db.transaction((tx) => creerPvDans(tx, org, { type: "reunion", objet: "", dateSeance: "2026-11-12", reunionId }, { userId: etranger, valideur: false }))).rejects.toThrow(
      "pas de cette réunion",
    );
  });
});
