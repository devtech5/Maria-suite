import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { adressesPro, employees, numerosCollaborateurs, services } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  adressesDe,
  affecterAdressePour,
  ajouterNumeroPour,
  annuaireDe,
  basculerAdressePour,
  enregistrerAdressePour,
  numerosDe,
  reprendreFichesPour,
  retirerAdressePour,
  retirerNumeroPour,
} from "@/modules/contacts/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let autreOrg: string;
let user: string;
let compta: string;
let rh: string;
let awa: string;
let yao: string;
let sansService: string;

async function service(organizationId: string, code: string, libelle: string): Promise<string> {
  const id = newId();
  await db.insert(services).values({ id, organizationId, code, libelle });
  return id;
}

async function collaborateur(organizationId: string, nom: string, serviceLibelle: string | null, extra: Partial<typeof employees.$inferInsert> = {}): Promise<string> {
  const id = newId();
  await db.insert(employees).values({ id, organizationId, matricule: `S${id.slice(-6)}`, nom, poste: "Agent", service: serviceLibelle, debut: "2024-01-01", ...extra });
  return id;
}

const nouvelle = (adresse: string, serviceId: string | null = null, employeeId: string | null = null) => ({ adresse, libelle: "", serviceId, employeeId });

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ organizationId: autreOrg } = await semerEntreprise(db, "Autre entreprise"));
  compta = await service(org, "DAF", "Administration et finances");
  rh = await service(org, "RH", "Ressources humaines");
  awa = await collaborateur(org, "Koné Awa", "Administration et finances", { telephone: "05 05 00 00 02", emailProfessionnel: "awa.kone@maria-groupe.com" });
  yao = await collaborateur(org, "Yao Marc", "Ressources humaines");
  sansService = await collaborateur(org, "Traoré Ali", null);
});
afterAll(async () => fermer());

describe("adresses professionnelles sur une vraie base", () => {
  it("enregistre une adresse du domaine, en minuscules, et refuse les autres", async () => {
    const { adresse } = await enregistrerAdressePour(org, user, nouvelle("Direction@Maria-Groupe.com"));
    expect(adresse).toBe("direction@maria-groupe.com");
    await expect(enregistrerAdressePour(org, user, nouvelle("dg@gmail.com"))).rejects.toThrow(/maria-groupe\.com/);
    await expect(enregistrerAdressePour(org, user, nouvelle("pas une adresse"))).rejects.toThrow(/valide/);
  });

  it("refuse un doublon dans l'entreprise, mais l'accepte dans une autre", async () => {
    await expect(enregistrerAdressePour(org, user, nouvelle("DIRECTION@maria-groupe.com"))).rejects.toThrow(/déjà dans l'annuaire/);
    await expect(enregistrerAdressePour(autreOrg, user, nouvelle("direction@maria-groupe.com"))).resolves.toBeTruthy();
  });

  it("affecte au service puis à une personne de ce service", async () => {
    const { id } = await enregistrerAdressePour(org, user, nouvelle("compta@maria-groupe.com"));
    await affecterAdressePour(org, user, id, compta, null);
    await affecterAdressePour(org, user, id, compta, awa);
    const ligne = (await adressesDe(org)).find((l) => l.id === id)!;
    expect(ligne).toMatchObject({ serviceId: compta, serviceLibelle: "Administration et finances", employeeId: awa, titulaire: "Koné Awa", statut: "titulaire" });
  });

  it("refuse une personne qui n'est pas du service, ou une personne sans service choisi", async () => {
    const { id } = await enregistrerAdressePour(org, user, nouvelle("recrutement@maria-groupe.com"));
    await expect(affecterAdressePour(org, user, id, compta, yao)).rejects.toThrow(/ne fait pas partie du service/);
    await expect(affecterAdressePour(org, user, id, rh, sansService)).rejects.toThrow(/ne fait pas partie du service/);
    await expect(enregistrerAdressePour(org, user, nouvelle("x@maria-groupe.com", null, awa))).rejects.toThrow(/d'abord le service/);
    // Rien n'a bougé.
    expect((await adressesDe(org)).find((l) => l.id === id)).toMatchObject({ serviceId: null, employeeId: null, statut: "libre" });
  });

  it("garde la contrainte en base : pas de titulaire sans service", async () => {
    await expect(db.insert(adressesPro).values({ id: newId(), organizationId: org, adresse: "orphelin@maria-groupe.com", employeeId: awa })).rejects.toThrow();
  });

  it("retire le titulaire quand l'adresse est remise sans service", async () => {
    const { id } = await enregistrerAdressePour(org, user, nouvelle("temp@maria-groupe.com", compta, awa));
    await affecterAdressePour(org, user, id, null, awa);
    expect((await adressesDe(org)).find((l) => l.id === id)).toMatchObject({ serviceId: null, employeeId: null });
  });

  it("signale « à revoir » l'adresse dont le titulaire a changé de service", async () => {
    const { id } = await enregistrerAdressePour(org, user, nouvelle("mobile@maria-groupe.com", rh, yao));
    expect((await adressesDe(org)).find((l) => l.id === id)!.statut).toBe("titulaire");
    await db.update(employees).set({ service: "Administration et finances" }).where(eq(employees.id, yao));
    expect((await adressesDe(org)).find((l) => l.id === id)!.statut).toBe("a_revoir");
    await db.update(employees).set({ service: "Ressources humaines" }).where(eq(employees.id, yao));
  });

  it("ferme, rouvre et retire ; une adresse retirée peut être inscrite de nouveau", async () => {
    const { id } = await enregistrerAdressePour(org, user, nouvelle("achats@maria-groupe.com"));
    await basculerAdressePour(org, user, id, false);
    expect((await adressesDe(org)).find((l) => l.id === id)!.actif).toBe(false);
    await retirerAdressePour(org, user, id);
    expect((await adressesDe(org)).some((l) => l.id === id)).toBe(false);
    const [ligne] = await db.select().from(adressesPro).where(eq(adressesPro.id, id));
    expect(ligne.deletedAt).not.toBeNull();
    expect(ligne.version).toBeGreaterThan(1);
    await expect(enregistrerAdressePour(org, user, nouvelle("achats@maria-groupe.com"))).resolves.toBeTruthy();
  });

  it("ne touche jamais une adresse d'une autre entreprise", async () => {
    const [etrangere] = await db.select().from(adressesPro).where(and(eq(adressesPro.organizationId, autreOrg)));
    await expect(basculerAdressePour(org, user, etrangere.id, false)).rejects.toThrow(/introuvable/);
    await expect(retirerAdressePour(org, user, etrangere.id)).rejects.toThrow(/introuvable/);
    await expect(affecterAdressePour(org, user, etrangere.id, compta, null)).rejects.toThrow(/introuvable/);
    expect((await adressesDe(org)).some((l) => l.id === etrangere.id)).toBe(false);
  });
});

describe("reprise des fiches", () => {
  it("inscrit l'adresse de la fiche, affectée au service et à la personne, une seule fois", async () => {
    const dg = await collaborateur(org, "Diallo Fanta", "Ressources humaines", { emailProfessionnel: "fanta.diallo@maria-groupe.com" });
    await collaborateur(org, "Externe Test", "Ressources humaines", { emailProfessionnel: "externe@gmail.com" });
    // La fiche d'Awa porte aussi une adresse que l'annuaire ne listait pas.
    expect(await reprendreFichesPour(org, user)).toBe(2);
    const ligne = (await adressesDe(org)).find((l) => l.adresse === "fanta.diallo@maria-groupe.com")!;
    expect(ligne).toMatchObject({ serviceId: rh, employeeId: dg, statut: "titulaire" });
    expect((await adressesDe(org)).find((l) => l.adresse === "awa.kone@maria-groupe.com")).toMatchObject({ serviceId: compta, employeeId: awa });
    expect((await adressesDe(org)).some((l) => l.adresse === "externe@gmail.com")).toBe(false);
    expect(await reprendreFichesPour(org, user)).toBe(0);
  });
});

describe("numéros de téléphone sur une vraie base", () => {
  it("ajoute, refuse le doublon et retire un numéro", async () => {
    const id = await ajouterNumeroPour(org, user, awa, { numero: "07 07 12 34 56", nature: "mobile", usage: "professionnel" });
    await expect(ajouterNumeroPour(org, user, awa, { numero: "+225 0707123456", nature: "whatsapp", usage: "professionnel" })).rejects.toThrow(/déjà/);
    await expect(ajouterNumeroPour(org, user, awa, { numero: "0707", nature: "mobile", usage: "professionnel" })).rejects.toThrow(/valide/);
    await expect(ajouterNumeroPour(org, user, awa, { numero: "07 08 12 34 56", nature: "radio", usage: "professionnel" })).rejects.toThrow(/nature/);
    await expect(ajouterNumeroPour(org, user, awa, { numero: "07 08 12 34 56", nature: "mobile", usage: "secret" })).rejects.toThrow(/usage|professionnel/);
    await retirerNumeroPour(org, user, id);
    expect((await numerosDe(org, awa)).some((n) => n.id === id)).toBe(false);
    await expect(retirerNumeroPour(org, user, id)).rejects.toThrow(/introuvable/);
  });

  it("refuse un collaborateur d'une autre entreprise", async () => {
    const etranger = await collaborateur(autreOrg, "Étranger", null);
    await expect(ajouterNumeroPour(org, user, etranger, { numero: "07 07 12 34 56", nature: "mobile", usage: "professionnel" })).rejects.toThrow(/introuvable/);
  });
});

describe("annuaire du personnel", () => {
  beforeAll(async () => {
    await ajouterNumeroPour(org, user, awa, { numero: "01 02 03 04 05", nature: "fixe", usage: "professionnel" });
    await ajouterNumeroPour(org, user, awa, { numero: "07 99 00 00 01", nature: "whatsapp", usage: "personnel" });
  });

  it("sans le droit de tenir l'annuaire, aucun numéro personnel ne sort — pas même celui de la fiche", async () => {
    const lecteur = (await annuaireDe(org, false)).find((f) => f.id === awa)!;
    expect(lecteur.numeros.map((n) => n.numero)).toEqual(["2250102030405"]);
    expect(JSON.stringify(lecteur)).not.toContain("2250505000002");
    expect(JSON.stringify(lecteur)).not.toContain("2250799000001");
  });

  it("l'adresse e-mail personnelle de la fiche ne sort pas sans le droit de tenir l'annuaire", async () => {
    await db.update(employees).set({ email: "Awa.Privee@Gmail.com" }).where(eq(employees.id, awa));
    const lecteur = (await annuaireDe(org, false)).find((f) => f.id === awa)!;
    expect(lecteur.emailPersonnel).toBeNull();
    expect(JSON.stringify(lecteur)).not.toContain("privee@gmail.com");
    expect(lecteur.emails).not.toContain("awa.privee@gmail.com");
    const gestionnaire = (await annuaireDe(org, true)).find((f) => f.id === awa)!;
    expect(gestionnaire.emailPersonnel).toBe("awa.privee@gmail.com");
    // Elle n'entre jamais dans la liste des adresses professionnelles.
    expect(gestionnaire.emails).not.toContain("awa.privee@gmail.com");
  });

  it("avec le droit, tout sort : annuaire et fiche", async () => {
    const gestionnaire = (await annuaireDe(org, true)).find((f) => f.id === awa)!;
    expect(gestionnaire.numeros.map((n) => n.numero).sort()).toEqual(["2250102030405", "2250505000002", "2250799000001"]);
  });

  it("réunit les adresses affectées et celle de la fiche, sans doublon", async () => {
    const f = (await annuaireDe(org, false)).find((x) => x.id === awa)!;
    expect(f.emails.filter((e) => e === "awa.kone@maria-groupe.com")).toHaveLength(1);
    expect(f.emails).toContain("awa.kone@maria-groupe.com");
  });

  it("ne liste que les collaborateurs en poste de l'entreprise", async () => {
    const parti = await collaborateur(org, "Parti Jean", "Ressources humaines", { actif: false });
    const etranger = await collaborateur(autreOrg, "Autre Société", null);
    const ids = (await annuaireDe(org, true)).map((f) => f.id);
    expect(ids).toContain(awa);
    expect(ids).not.toContain(parti);
    expect(ids).not.toContain(etranger);
  });

  it("garde l'unicité d'un numéro par collaborateur en base", async () => {
    const [existant] = await db.select().from(numerosCollaborateurs).where(and(eq(numerosCollaborateurs.employeeId, awa), isNull(numerosCollaborateurs.deletedAt)));
    await expect(db.insert(numerosCollaborateurs).values({ id: newId(), organizationId: org, employeeId: awa, numero: existant.numero })).rejects.toThrow();
  });
});
