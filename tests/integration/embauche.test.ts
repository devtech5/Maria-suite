import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { termeApresDuree } from "@/modules/personnes/calcul";
import { creerSalariePour } from "@/modules/personnes/creation";
import { servicesConnus } from "@/modules/personnes/requetes";
import { employees } from "@/modules/personnes/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

describe("embauche complète en base", () => {
  it("garde identité, contact, contrat et rémunération saisis à l'embauche", async () => {
    const debut = "2026-02-02";
    const { id } = await creerSalariePour(
      org,
      {
        nom: "KOUASSI Yao Bernard",
        poste: "Comptable",
        contrat: "cdd",
        debut,
        fin: termeApresDuree(debut, 6),
        salaireBase: 350_000,
        civilite: "M",
        sexe: "M",
        dateNaissance: "1994-05-12",
        lieuNaissance: "Bouaké",
        nationalite: "Ivoirienne",
        situationFamiliale: "marie",
        enfantsACharge: 2,
        contactUrgence: "Aya Kouassi",
        contactUrgenceLien: "epouse",
        contactUrgenceTelephone: "0700000000",
        service: "Comptabilité",
        paiementSalaire: "mobile_money",
        coordonneesPaiement: "0701020304",
        notes: "Embauché pour la clôture.",
      },
      user,
    );

    const [ligne] = await db.select().from(employees).where(eq(employees.id, id));
    expect(ligne).toMatchObject({
      nom: "KOUASSI Yao Bernard",
      contrat: "cdd",
      fin: "2026-08-01",
      civilite: "M",
      enfantsACharge: 2,
      service: "Comptabilité",
      paiementSalaire: "mobile_money",
      coordonneesPaiement: "0701020304",
    });
    expect(await servicesConnus(org)).toEqual(["Comptabilité"]);
  });

  it("refuse en base une civilité ou un mode de paiement hors liste", async () => {
    const base = { nom: "Test", poste: "Comptable", debut: "2026-01-01", salaireBase: 0 };
    await expect(creerSalariePour(org, { ...base, civilite: "Dr" as never })).rejects.toThrow();
    await expect(creerSalariePour(org, { ...base, paiementSalaire: "bitcoin" as never })).rejects.toThrow();
  });
});

describe("contrat de travail au dossier", () => {
  it("exige le document, et la base connaît la nature", async () => {
    const { ajouterPiecePour } = await import("@/modules/personnes/dossier");
    const { piecesEmploye } = await import("@/modules/personnes/schema");
    const { newId } = await import("@/lib/ids");
    const { id } = await creerSalariePour(org, { nom: "Contrat Test", poste: "Comptable", debut: "2026-01-01", salaireBase: 0 }, user);
    await expect(ajouterPiecePour(org, user, id, { nature: "contrat_travail" }, null)).rejects.toThrow(/Contrat de travail : joignez le document/);
    await db.insert(piecesEmploye).values({
      id: newId(),
      organizationId: org,
      employeeId: id,
      nature: "contrat_travail",
      precision: "Contrat à durée indéterminée",
      chemin: `${org}/contrat.pdf`,
      nomFichier: "contrat-signe.pdf",
      typeMime: "application/pdf",
      tailleOctets: 1024,
    });
    const lignes = await db.select({ nature: piecesEmploye.nature }).from(piecesEmploye).where(eq(piecesEmploye.employeeId, id));
    expect(lignes.map((l) => l.nature)).toEqual(["contrat_travail"]);
  });
});
