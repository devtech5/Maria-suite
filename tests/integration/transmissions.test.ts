import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, notifications, roles, transmissions, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { accuserPour, choixPossibles, creerTransmissionPour, recevoirPour, relancerRetardsPour, traiterPour, transmettrePour, transmissionsDe } from "@/modules/transmissions/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let daf: string;
let ingenieur: string;

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

const base = { emetteurServiceId: null, destinataireUserId: null as string | null, destinataireServiceId: null, tiersId: null, entreprise: "", contact: "", responsableUserId: null, dateLimite: "", dejaFait: false, moyen: "" };
const titres = async (u: string) => (await db.select({ t: notifications.titre }).from(notifications).where(and(eq(notifications.userId, u), eq(notifications.categorie, "transmission")))).map((n) => n.t);

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  daf = await compte("DAF");
  ingenieur = await compte("Ingénieur");
});
afterAll(async () => fermer());

describe("transmissions sur une vraie base", () => {
  it("interne : transmise, accusée par le seul destinataire, retour avec avis", async () => {
    const { id, numero } = await creerTransmissionPour(org, ingenieur, {
      ...base,
      sens: "interne",
      objet: "Contrat de sous-traitance lot 2",
      mention: "signature",
      pieces: [{ designation: "Contrat", exemplaires: 2, original: true }],
      destinataireUserId: daf,
    });
    expect(numero).toBe("BT-2026-00001".replace("2026", String(new Date().getUTCFullYear())));
    expect(await titres(daf)).toHaveLength(1);
    await expect(accuserPour(org, ingenieur, id, "")).rejects.toThrow(/pas adressé/);
    await accuserPour(org, daf, id, "");
    expect((await titres(ingenieur))[0]).toMatch(/reçu par DAF/);
    await traiterPour(org, daf, id, { avis: { 0: "vu" }, observations: { 0: "Signé" }, note: "Signé et retourné" });
    const [t] = await db.select().from(transmissions).where(eq(transmissions.id, id));
    expect(t).toMatchObject({ statut: "traitee", avis: "vu", note: "Signé et retourné" });
  });

  it("sortante : à transmettre avant une date, transmise, accusée par l'entreprise, retour du bureau de contrôle", async () => {
    await expect(
      creerTransmissionPour(org, ingenieur, { ...base, sens: "sortante", objet: "Plans", mention: "visa", pieces: [{ designation: "Plan" }], entreprise: "Bureau Veritas" }),
    ).rejects.toThrow(/date limite/);
    const { id } = await creerTransmissionPour(org, ingenieur, {
      ...base,
      sens: "sortante",
      objet: "Plans d'exécution R+3",
      mention: "visa",
      pieces: [{ designation: "Plan de fondation", indice: "B" }, { designation: "Plan de ferraillage", indice: "A" }],
      entreprise: "Bureau de contrôle",
      dateLimite: "2099-12-31",
    });
    await transmettrePour(org, ingenieur, id, "main_propre");
    await expect(accuserPour(org, ingenieur, id, "")).rejects.toThrow(/qui a signé/);
    await accuserPour(org, ingenieur, id, "M. Kouadio, ingénieur contrôle");
    const { avis } = await traiterPour(org, ingenieur, id, { avis: { 0: "bon_pour_execution", 1: "vise_observations" }, observations: { 1: "Revoir les recouvrements" }, note: "" });
    expect(avis).toBe("vise_observations");
  });

  it("entrante en retard : relancée au responsable, une fois par jour, puis reçue", async () => {
    const { id } = await creerTransmissionPour(org, daf, {
      ...base,
      sens: "entrante",
      objet: "Attestation de régularité fiscale",
      mention: "information",
      pieces: [{ designation: "ARF" }],
      entreprise: "Sous-traitant SOTRA BTP",
      dateLimite: "2099-01-01",
    });
    await db.update(transmissions).set({ dateLimite: "2026-01-01" }).where(eq(transmissions.id, id));
    const maintenant = new Date();
    expect(await relancerRetardsPour(org, maintenant)).toBe(1);
    expect(await relancerRetardsPour(org, new Date(maintenant.getTime() + 3_600_000))).toBe(0);
    expect((await titres(daf)).some((t) => t.includes("n'a pas transmis"))).toBe(true);
    await recevoirPour(org, daf, id, "courriel");
    expect((await transmissionsDe(org, { sens: "entrante" }))[0].statut).toBe("recue");
    expect(await relancerRetardsPour(org, new Date(maintenant.getTime() + 30 * 3_600_000))).toBe(0);
  });

  it("ne montre à chacun que ce qui le concerne", async () => {
    expect((await transmissionsDe(org, { concerne: daf })).length).toBe(2);
    expect((await transmissionsDe(org, { recherche: "ferraillage" })).map((t) => t.objet)).toEqual(["Plans d'exécution R+3"]);
  });

  it("propose tout le personnel comme destinataire, les salariés sans compte signalés", async () => {
    const { id: avecCompte } = await creerSalariePour(org, { nom: "Aya Touré", poste: "Comptable", debut: "2026-01-05", salaireBase: 200_000, service: "Finances" }, daf);
    await db.update(employees).set({ userId: daf }).where(eq(employees.id, avecCompte));
    const { id: sansCompte } = await creerSalariePour(org, { nom: "Zoé Bamba", poste: "Chauffeur", debut: "2026-01-05", salaireBase: 120_000 }, daf);

    const { personnes } = await choixPossibles(org);
    const noms = personnes.map((p) => p.nom);
    // Ordre alphabétique, et personne n'apparaît deux fois (la fiche et le compte de Aya sont une seule ligne).
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })));
    expect(new Set(personnes.map((p) => p.id)).size).toBe(personnes.length);
    expect(personnes.find((p) => p.nom === "Aya Touré")).toMatchObject({ id: daf, sansCompte: false, detail: "Comptable · Finances" });
    expect(personnes.find((p) => p.nom === "Zoé Bamba")).toMatchObject({ id: sansCompte, sansCompte: true, detail: "Chauffeur" });
    // Un compte sans fiche de salarié reste proposé.
    expect(personnes.find((p) => p.id === ingenieur)).toMatchObject({ sansCompte: false });
  });
});
