import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import type { Ecriture } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { notesComplementaires } from "@/modules/comptabilite/notes-donnees";
import { employees, postes } from "@/modules/personnes/schema";

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

const poser = (date: string, lignes: [string, number, number][]) => {
  const e: Ecriture = { journal: "OD", date, piece: date, libelle: date, lignes: lignes.map(([compte, debit, credit]) => ({ compte, libelleCompte: compte, debit, credit })) };
  return db.transaction((tx) => enregistrerEcritureDans(tx, e, { organizationId: org, userId: user, origine: "saisie", pieceId: null, exercice: date.slice(0, 4), dateIso: date }));
};

describe("notes annexes du lot 2 en base", () => {
  it("lit le capital de la fiche, les collaborateurs et la catégorie de leur poste", async () => {
    await db.update(organizations).set({ capitalSocial: 10_000_000, valeurNominalePart: 10_000 }).where(eq(organizations.id, org));
    await db.insert(postes).values([
      { id: newId(), organizationId: org, libelle: "Directeur", categorie: "cadre_superieur" },
      { id: newId(), organizationId: org, libelle: "Chauffeur", categorie: "employe" },
      { id: newId(), organizationId: org, libelle: "Stagiaire" },
    ]);
    const salarie = (nom: string, poste: string, extra: Partial<typeof employees.$inferInsert> = {}) =>
      db.insert(employees).values({ id: newId(), organizationId: org, matricule: `M-${nom}`, nom, poste, debut: "2024-01-01", ...extra });
    await salarie("Kouassi", "Directeur", { sexe: "M", nationalite: "Ivoirien" });
    await salarie("Traoré", "Chauffeur", { sexe: "F", nationalite: "Malienne" });
    await salarie("Diallo", "Stagiaire", { sexe: "M", nationalite: "Guinéen" });
    // Parti en mars : la fiche passe inactive, la date est au journal.
    const ancien = newId();
    await db.insert(employees).values({ id: ancien, organizationId: org, matricule: "M-Ancien", nom: "Ancien", poste: "Chauffeur", debut: "2024-01-01", sexe: "M", nationalite: "Ivoirien", actif: false });
    await db.insert(auditLogs).values({ id: newId(), organizationId: org, userId: user, action: "salarie.sortir", entityType: "employe", entityId: ancien, createdAt: new Date("2026-03-31T10:00:00Z") });
    // Un CDD arrivé à son terme fin juin.
    await salarie("Kone", "Chauffeur", { sexe: "F", nationalite: "Ivoirienne", contrat: "cdd", debut: "2026-01-01", fin: "2026-06-30" });
    await poser("2026-01-10", [["5211", 10_000_000, 0], ["101", 0, 10_000_000]]);
    await poser("2026-06-30", [["661", 4_000_000, 0], ["5211", 0, 4_000_000]]);

    const [n13, n27b, n31] = await notesComplementaires(org, "2026");

    expect(n13.lignes.find((l) => l.libelle === "Nombre de parts")?.valeurs[0]).toBe(1_000);
    expect(n13.remarques).toEqual([]);

    const ligne = (libelle: string) => n27b.lignes.find((l) => l.libelle === libelle)?.valeurs;
    expect(ligne("Cadres supérieurs")).toEqual([1, 0, 0, 0, 0, 0, 0, 1]);
    expect(ligne("Employés, manœuvres, ouvriers et apprentis")).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
    expect(ligne("Catégorie non renseignée")).toEqual([0, 0, 1, 0, 0, 0, 0, 1]);
    expect(ligne("Effectif au 31 décembre")?.at(-1)).toBe(3);
    expect(ligne("Rémunérations comptabilisées (661 à 663)")?.at(-1)).toBe(4_000_000);

    expect(n31.colonnes.map((c) => c.titre)).toEqual(["2026", "2025", "2024", "2023", "2022"]);
    expect(n31.lignes.find((l) => l.libelle === "Capital social")?.valeurs).toEqual([10_000_000, 0, 0, 0, 0]);
    // 2026 : trois toute l'année (36), l'ancien jusqu'à mars (3), le CDD jusqu'à juin (6) : 45 / 12 = 3,75.
    // 2025 : les quatre premiers toute l'année.
    expect(n31.lignes.find((l) => l.libelle === "Effectif moyen des collaborateurs")?.valeurs.slice(0, 2)).toEqual([4, 4]);
  });
});
