import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerIntervenantPour } from "@/modules/personnes/creation";
import { appliquerGesteDans, creerTacheDans } from "@/modules/taches/creation";
import {
  ajouterSousTacheDans,
  cocherDansMessageDans,
  cocherSousTacheDans,
  modifierSousTacheDans,
  publierMessageDans,
  retirerMessageDans,
  sousTachesDe,
  suiviDe,
  supprimerSousTacheDans,
} from "@/modules/taches/suivi";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let chef: string;
let agent: string;
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
  chef = await compte("Chef");
  agent = await compte("Agent");
  tiers = await compte("Tiers");
});
afterAll(async () => fermer());

const chefActeur = () => ({ userId: chef, attribue: true });
const agentActeur = () => ({ userId: agent, attribue: false });

describe("sous-tâches", () => {
  it("se définissent, se cochent, se confient et se retirent", async () => {
    const { id: tache } = await db.transaction((tx) =>
      creerTacheDans(tx, org, { titre: "Dalle R+1", priorite: "haute", executant: { userId: agent } }, chefActeur()),
    );
    const { id: coffrage } = await db.transaction((tx) => ajouterSousTacheDans(tx, org, tache, "  Coffrage  ", chefActeur()));
    const { id: ferraillage } = await db.transaction((tx) => ajouterSousTacheDans(tx, org, tache, "Ferraillage", agentActeur()));
    const { id: macon } = await creerIntervenantPour(org, { nom: "Yao Koffi", qualification: "Maçon", taux: 8_000 });

    await db.transaction((tx) => cocherSousTacheDans(tx, org, coffrage, true, agentActeur()));
    await db.transaction((tx) => modifierSousTacheDans(tx, org, ferraillage, { responsable: { workerId: macon }, echeance: "2026-11-20" }, chefActeur()));

    const liste = (await sousTachesDe(org, [tache])).get(tache)!;
    expect(liste.map((s) => [s.titre, s.faite, s.responsableNom, s.echeance])).toEqual([
      ["Coffrage", true, null, null],
      ["Ferraillage", false, "Yao Koffi", "2026-11-20"],
    ]);

    await expect(db.transaction((tx) => ajouterSousTacheDans(tx, org, tache, "Intrus", { userId: tiers, attribue: false }))).rejects.toThrow("n'est pas la vôtre");
    await expect(db.transaction((tx) => ajouterSousTacheDans(tx, org, tache, "x", chefActeur()))).rejects.toThrow("Dites ce qu'il faut faire");

    await db.transaction((tx) => supprimerSousTacheDans(tx, org, coffrage, chefActeur()));
    expect((await sousTachesDe(org, [tache])).get(tache)!.map((s) => s.titre)).toEqual(["Ferraillage"]);

    // Close, la tâche ne bouge plus : on la rouvre d'abord.
    await db.transaction((tx) => appliquerGesteDans(tx, org, tache, "terminer", chefActeur(), null));
    await expect(db.transaction((tx) => cocherSousTacheDans(tx, org, ferraillage, true, chefActeur()))).rejects.toThrow("close");
  });
});

describe("mises à jour et activités", () => {
  it("publie, prévient les parties et les mentionnés, coche une case, retire, et tout se lit au journal", async () => {
    const { id: tache } = await db.transaction((tx) =>
      creerTacheDans(tx, org, { titre: "Réception du chantier", priorite: "normale", executant: { userId: agent } }, chefActeur()),
    );
    const { aPrevenir, numero } = await db.transaction((tx) =>
      publierMessageDans(tx, org, tache, `Point du jour @[Tiers](u:${tiers})\n[ ] PV signé\n[ ] clés remises`, chefActeur()),
    );
    expect(numero).toMatch(/^TCH-/);
    expect(aPrevenir.sort()).toEqual([agent, tiers].sort());

    let suivi = await suiviDe(org, tache, agentActeur());
    expect(suivi.messages).toHaveLength(1);
    await db.transaction((tx) => cocherDansMessageDans(tx, org, suivi.messages[0].id, 1, agentActeur()));
    suivi = await suiviDe(org, tache, agentActeur());
    expect(suivi.messages[0].corps).toContain("[x] clés remises");

    // Seul l'auteur retire sa mise à jour.
    await expect(db.transaction((tx) => retirerMessageDans(tx, org, suivi.messages[0].id, agentActeur()))).rejects.toThrow("Seul son auteur");
    await db.transaction((tx) => retirerMessageDans(tx, org, suivi.messages[0].id, chefActeur()));
    suivi = await suiviDe(org, tache, chefActeur());
    expect(suivi.messages).toHaveLength(0);
    expect(suivi.activites.map((a) => a.phrase)).toEqual(expect.arrayContaining(["a créé la tâche", "a publié une mise à jour"]));

    await expect(suiviDe(org, tache, { userId: tiers, attribue: false })).rejects.toThrow("n'est pas la vôtre");
  });
});
