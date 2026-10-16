import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { BAREME_PAR_DEFAUT } from "@/modules/paie/calcul";
import { RAPPORTS_PAIE } from "@/modules/paie/rapports";
import { contexteAbsences, enregistrerBaremeDans, modifierElementsDans, preparerPeriodeDans, proposerRappel, validerPeriodeDans } from "@/modules/paie/creation";
import { bulletinsPaie, periodesPaie } from "@/modules/paie/schema";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { demanderCongePour } from "@/modules/presences/creation";

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

const preparer = async (mois: string) => {
  const absences = await contexteAbsences(org, mois);
  return db.transaction((tx) => preparerPeriodeDans(tx, org, mois, BAREME_PAR_DEFAUT, absences, user));
};
const bulletinDe = async (periodeId: string, employeId: string) => {
  const [b] = await db.select().from(bulletinsPaie).where(and(eq(bulletinsPaie.periodeId, periodeId), eq(bulletinsPaie.employeId, employeId)));
  return b;
};

describe("absences et congés dans la paie", () => {
  it("paie au prorata, retient le sans solde, conserve les absences saisies", async () => {
    const ancien = await creerSalariePour(org, { nom: "Awa Comptable", poste: "Comptable", debut: "2025-01-06", salaireBase: 270_000 }, user);
    const nouveau = await creerSalariePour(org, { nom: "Koffi Commercial", poste: "Commercial", debut: "2026-10-15", salaireBase: 270_000 }, user);
    await creerSalariePour(org, { nom: "Yao Futur", poste: "Chauffeur", debut: "2026-11-02", salaireBase: 150_000 }, user);

    await demanderCongePour(org, user, { employeeId: ancien.id, nature: "sans_solde", debut: "2026-10-19", fin: "2026-10-20", debutDemi: false, finDemi: false, motif: "Affaire personnelle" }, { accorder: true });
    await demanderCongePour(org, user, { employeeId: ancien.id, nature: "paye", debut: "2026-10-05", fin: "2026-10-07", debutDemi: false, finDemi: false, motif: null }, { accorder: true });

    // Octobre 2026 : 27 jours ouvrables. Le salarié embauché en novembre n'a pas de bulletin.
    const { id: periode, bulletins } = await preparer("2026-10");
    expect(bulletins).toBe(2);

    const a = await bulletinDe(periode, ancien.id);
    expect(a).toMatchObject({ joursMois: 2_700, joursHorsContrat: 0, joursSansSolde: 200, retenueAbsence: 20_000, brut: 250_000, congesPris: 300 });
    expect(a.soldeConges).not.toBeNull();

    const n = await bulletinDe(periode, nouveau.id);
    expect(n).toMatchObject({ joursHorsContrat: 1_200, retenueAbsence: 120_000, brut: 150_000 });

    // Un jour et demi d'absence injustifiée s'ajoute au sans solde.
    await db.transaction((tx) =>
      modifierElementsDans(tx, org, a.id, { primesImposables: 5_000, indemnitesNonImposables: 0, retenuesDiverses: 0, joursAbsenceSaisis: 150, rappel: 0, rappelLibelle: null }, BAREME_PAR_DEFAUT, user),
    );
    expect(await bulletinDe(periode, ancien.id)).toMatchObject({ joursAbsenceSaisis: 150, retenueAbsence: 35_000, brut: 240_000 });

    await expect(
      db.transaction((tx) => modifierElementsDans(tx, org, a.id, { primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0, joursAbsenceSaisis: 25, rappel: 0, rappelLibelle: null }, BAREME_PAR_DEFAUT, user)),
    ).rejects.toThrow(/demi-journées/);
    await expect(
      db.transaction((tx) => modifierElementsDans(tx, org, n.id, { primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0, joursAbsenceSaisis: 1_600, rappel: 0, rappelLibelle: null }, BAREME_PAR_DEFAUT, user)),
    ).rejects.toThrow(/Plus de jours/);

    // Recalculer garde la saisie et la prime.
    await preparer("2026-10");
    expect(await bulletinDe(periode, ancien.id)).toMatchObject({ joursAbsenceSaisis: 150, primesImposables: 5_000, retenueAbsence: 35_000 });

    // La validation fige le salaire dû.
    await db.transaction((tx) => enregistrerBaremeDans(tx, org, BAREME_PAR_DEFAUT, true, user));
    await db.transaction((tx) => validerPeriodeDans(tx, org, periode, BAREME_PAR_DEFAUT, user));
    const [p] = await db.select().from(periodesPaie).where(eq(periodesPaie.id, periode));
    expect(p.totalBrut).toBe(240_000 + 150_000);
    expect((await bulletinDe(periode, ancien.id)).numero).toMatch(/^BUL-2026-10-/);
  });

  it("rattrape une augmentation rétroactive au mois suivant", async () => {
    const [awa] = await db.select().from(employees).where(and(eq(employees.organizationId, org), eq(employees.nom, "Awa Comptable")));
    await db.update(employees).set({ salaireBase: 297_000 }).where(eq(employees.id, awa.id));
    const { id: periode } = await preparer("2026-11");
    const b = await bulletinDe(periode, awa.id);
    expect(b.salaireBase).toBe(297_000);

    // Octobre payé 270 000 moins 35 000 d'absences : 235/270 de l'écart de 27 000.
    const r = await proposerRappel(org, b.id, "2026-10", 297_000);
    expect(r).toEqual({ montant: 23_500, mois: ["2026-10"], libelle: "Rappel de salaire d'octobre 2026" });
    await expect(proposerRappel(org, b.id, "2026-11", 297_000)).rejects.toThrow(/avant celui-ci/);

    await expect(
      db.transaction((tx) => modifierElementsDans(tx, org, b.id, { primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0, joursAbsenceSaisis: 0, rappel: r.montant, rappelLibelle: " " }, BAREME_PAR_DEFAUT, user)),
    ).rejects.toThrow(/rattrape/);
    await db.transaction((tx) =>
      modifierElementsDans(tx, org, b.id, { primesImposables: 0, indemnitesNonImposables: 0, retenuesDiverses: 0, joursAbsenceSaisis: 0, rappel: r.montant, rappelLibelle: r.libelle }, BAREME_PAR_DEFAUT, user),
    );
    await preparer("2026-11");
    const apres = await bulletinDe(periode, awa.id);
    expect(apres).toMatchObject({ rappel: 23_500, rappelLibelle: r.libelle });
    expect(apres.brut).toBe(apres.salaireBase - apres.retenueAbsence + 23_500);
  });

  it("cumule l'année par salarié pour la DISA, assiette plafonnée mois par mois", async () => {
    const disa = RAPPORTS_PAIE.find((r) => r.cle === "disa")!;
    const r = await disa.executer(org, { du: "2026-01-01", au: "2026-12-31" });
    // Seul octobre est validé ; novembre est en préparation.
    expect(r.lignes.map((l) => l.nom)).toEqual(["Awa Comptable", "Koffi Commercial"]);
    expect(r.lignes[0]).toMatchObject({ mois: 1, brut: 240_000, assiette: 240_000, entree: "2025-01-06", sortie: null, cnps: null });
    expect(r.note).toMatch(/2 salariés n'ont pas de numéro CNPS/);

    // Un plafond bas plafonne l'assiette, pas le brut.
    await db.update(periodesPaie).set({ baremeApplique: { ...BAREME_PAR_DEFAUT, cnpsPlafondMensuel: 200_000 } }).where(eq(periodesPaie.mois, "2026-10"));
    const plafonne = await disa.executer(org, { du: "2026-01-01", au: "2026-12-31" });
    expect(plafonne.lignes[0]).toMatchObject({ brut: 240_000, assiette: 200_000 });
    expect(plafonne.lignes[1]).toMatchObject({ brut: 150_000, assiette: 150_000 });
    expect((await disa.executer(org, { du: "2025-01-01", au: "2025-12-31" })).lignes).toEqual([]);
  });
});
