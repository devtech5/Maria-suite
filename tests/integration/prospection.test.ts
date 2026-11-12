import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { actionsProspection, contactsTiers, prospects, tiers } from "@/db/schema";
import { enregistrerCommercialDans } from "@/modules/commerciaux/creation";
import {
  ajouterProspectPour,
  annulerActionPour,
  changerStatutPlanPour,
  changerStatutProspectPour,
  convertirProspectPour,
  creerPlanPour,
  planifierActionPour,
  prospectsDes,
  realiserActionPour,
} from "@/modules/prospection/requetes";
import { creerTiersPour } from "@/modules/tiers/creation";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;
let commercial: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ id: commercial } = await db.transaction((tx) =>
    enregistrerCommercialDans(tx, org, null, { nom: "Awa Koné", base: "ca_ht", tauxBp: 0, fixeMensuel: 0, objectifMensuel: 0 }, user),
  ));
});
afterAll(async () => fermer());

const plan = (titre: string) => creerPlanPour(org, user, { commercialId: commercial, titre, debut: "2026-12-01", fin: "2026-12-31", zone: "Yopougon", objectifContacts: 20, objectifClients: 3 });

describe("prospection sur une vraie base", () => {
  it("numérote les plans et refuse une période à l'envers", async () => {
    const a = await plan("Mutuelles de Yopougon");
    const b = await plan("Coopératives agricoles");
    expect(a.numero).toBe("PP-2026-00001");
    expect(b.numero).toBe("PP-2026-00002");
    await expect(creerPlanPour(org, user, { commercialId: commercial, titre: "Mauvais", debut: "2026-12-31", fin: "2026-12-01" })).rejects.toThrow(/précède/);
  });

  it("de la visite au client : compte rendu, action suivante, conversion avec type et contact", async () => {
    const { id: planId } = await plan("ONG et mutuelles");
    const { id: prospectId } = await ajouterProspectPour(org, user, planId, {
      nom: "Mutuelle des enseignants",
      nature: "mutuelle",
      contact: "M. Koffi",
      fonction: "Président",
      telephone: "0707070707",
      potentiel: 1_500_000,
    });
    const { id: visite } = await planifierActionPour(org, user, prospectId, { datePrevue: "2026-12-03", heure: "10:00", canal: "visite", objet: "Présentation de l'offre" });

    await expect(realiserActionPour(org, user, visite, { compteRendu: "" })).rejects.toThrow(/compte rendu/);
    await realiserActionPour(org, user, visite, {
      compteRendu: "Intéressés par une offre de groupe.",
      statutProspect: "interesse",
      suite: { datePrevue: "2026-12-10", canal: "demonstration", objet: "Démonstration au bureau" },
    });
    let [vue] = await prospectsDes(org, [planId]);
    expect(vue.statut).toBe("interesse");
    expect(vue.actions.map((a) => [a.canal, a.statut])).toEqual([
      ["visite", "realisee"],
      ["demonstration", "prevue"],
    ]);
    await expect(realiserActionPour(org, user, visite, { compteRendu: "Encore" })).rejects.toThrow(/n'est plus à faire/);

    const { tiersId, code } = await convertirProspectPour(org, user, prospectId);
    expect(code).toMatch(/^C\d{4}$/);
    const [client] = await db.select().from(tiers).where(eq(tiers.id, tiersId));
    expect(client).toMatchObject({ nom: "Mutuelle des enseignants", nature: "mutuelle", estClient: true });
    expect(client.compteClient).toMatch(/^411/);
    const contacts = await db.select().from(contactsTiers).where(eq(contactsTiers.tiersId, tiersId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ nom: "M. Koffi", fonction: "Président", principal: true });

    [vue] = await prospectsDes(org, [planId]);
    expect(vue).toMatchObject({ statut: "converti", tiersId, client: code });
    // La démonstration encore prévue tombe : la suite se fait côté client.
    expect(vue.actions.find((a) => a.canal === "demonstration")?.statut).toBe("annulee");
    await expect(convertirProspectPour(org, user, prospectId)).rejects.toThrow(/déjà client/);
    await expect(changerStatutProspectPour(org, user, prospectId, "a_contacter")).rejects.toThrow();
  });

  it("rattache un prospect déjà au fichier sans créer de doublon", async () => {
    const { id: existant } = await creerTiersPour(org, { nom: "Coopérative Anouanzè", nature: "cooperative" }, user);
    const { id: planId } = await plan("Relances");
    const { id: prospectId } = await ajouterProspectPour(org, user, planId, { nom: "Coop Anouanzè", nature: "cooperative" });
    const avant = (await db.select({ id: tiers.id }).from(tiers)).length;
    const { tiersId } = await convertirProspectPour(org, user, prospectId, existant);
    expect(tiersId).toBe(existant);
    expect((await db.select({ id: tiers.id }).from(tiers)).length).toBe(avant);
  });

  it("exige un motif pour une piste perdue, la rouvre, et fige un plan clos", async () => {
    const { id: planId } = await plan("ONG");
    const { id: prospectId } = await ajouterProspectPour(org, user, planId, { nom: "ONG Espoir", nature: "ong" });
    await expect(changerStatutProspectPour(org, user, prospectId, "perdu")).rejects.toThrow(/pourquoi/);
    await changerStatutProspectPour(org, user, prospectId, "perdu", "Budget épuisé");
    await expect(planifierActionPour(org, user, prospectId, { datePrevue: "2026-12-05", canal: "appel", objet: "Relance" })).rejects.toThrow(/clos/);
    await changerStatutProspectPour(org, user, prospectId, "a_contacter");
    const [p] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
    expect(p).toMatchObject({ statut: "a_contacter", motifPerte: null });

    const { id: appel } = await planifierActionPour(org, user, prospectId, { datePrevue: "2026-12-05", canal: "appel", objet: "Relance" });
    await changerStatutPlanPour(org, user, planId, "clos");
    await expect(annulerActionPour(org, user, appel)).rejects.toThrow(/clos/);
    await expect(ajouterProspectPour(org, user, planId, { nom: "Autre", nature: "particulier" })).rejects.toThrow(/clos/);
    await changerStatutPlanPour(org, user, planId, "ouvert");
    await annulerActionPour(org, user, appel);
    const [a] = await db.select().from(actionsProspection).where(eq(actionsProspection.id, appel));
    expect(a.statut).toBe("annulee");
  });

  it("refuse un type de prospect inconnu et un potentiel non entier", async () => {
    const { id: planId } = await plan("Contrôles");
    await expect(ajouterProspectPour(org, user, planId, { nom: "X", nature: "syndicat" })).rejects.toThrow();
    await expect(ajouterProspectPour(org, user, planId, { nom: "Xavier", nature: "particulier", potentiel: 1.5 })).rejects.toThrow(/entier/);
  });
});
