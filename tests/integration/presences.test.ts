import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { jourLocal } from "@/modules/presences/calcul";
import {
  ajusterSoldePour,
  annulerCongePour,
  deciderCongePour,
  demanderCongePour,
  pointerManuellementPour,
  proposerFeriesPour,
  reglagesDe,
  salarieDuCompte,
} from "@/modules/presences/creation";
import { pointerPresence } from "@/modules/presences/pointage";
import { presencesDuJour, registre, soldesConges } from "@/modules/presences/requetes";
import { presences } from "@/modules/presences/schema";

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

describe("présences en base", () => {
  it("pointe automatiquement le compte, une ligne par jour, rattachée à sa fiche", async () => {
    const caissiere = newId();
    await db.insert(users).values({ id: caissiere, fullName: "Adjoua Caissière", email: `${caissiere}@exemple.test` });
    const { id: fiche } = await creerSalariePour(org, { nom: "Adjoua Yao", poste: "Caissière", debut: "2026-01-05", salaireBase: 120_000 }, user);
    await db.update(employees).set({ userId: caissiere }).where(eq(employees.id, fiche));

    await pointerPresence(org, caissiere);
    await pointerPresence(org, caissiere); // le second appel, rapproché, ne crée rien
    await pointerPresence(org, user); // l'exploitant, sans fiche collaborateur

    const jour = jourLocal(new Date());
    const lignes = await db.select().from(presences).where(and(eq(presences.organizationId, org), eq(presences.jour, jour)));
    expect(lignes).toHaveLength(2);
    const sienne = lignes.find((l) => l.userId === caissiere)!;
    expect(sienne.employeeId).toBe(fiche);
    expect(sienne.source).toBe("automatique");

    const jourNoms = (await presencesDuJour(org, jour, "Africa/Abidjan")).map((p) => p.nom).sort();
    expect(jourNoms).toEqual(["Adjoua Yao", "Exploitant"]);
    expect(await salarieDuCompte(org, caissiere)).toMatchObject({ id: fiche });
  });

  it("pointe à la main un collaborateur sans compte, puis corrige, motif obligatoire", async () => {
    const { id } = await creerSalariePour(org, { nom: "Koffi Magasinier", poste: "Magasinier", debut: "2026-01-05", salaireBase: 100_000 }, user);
    await expect(pointerManuellementPour(org, user, { employeeId: id, jour: "2026-10-05", arrivee: "08:00", depart: null, motif: "" })).rejects.toThrow(/motif/);
    await expect(pointerManuellementPour(org, user, { employeeId: id, jour: "2026-10-05", arrivee: "17:00", depart: "08:00", motif: "Oubli" })).rejects.toThrow(/précéder/);

    await pointerManuellementPour(org, user, { employeeId: id, jour: "2026-10-05", arrivee: "08:40", depart: "17:00", motif: "Sans compte" });
    await pointerManuellementPour(org, user, { employeeId: id, jour: "2026-10-05", arrivee: "07:55", depart: "17:00", motif: "Heure corrigée" });
    const lignes = await db.select().from(presences).where(and(eq(presences.organizationId, org), eq(presences.employeeId, id)));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ source: "manuel", motif: "Heure corrigée", userId: null });
    expect(lignes[0].arrivee.toISOString()).toBe("2026-10-05T07:55:00.000Z");

    const r = await reglagesDe(org);
    const { lignes: reg } = await registre(org, "2026-10-01", "2026-10-07", r, "2026-10-07", "12:00");
    const koffi = reg.find((l) => l.salarie.id === id)!;
    expect(koffi.jours[4]).toMatchObject({ etat: "present", arrivee: "07:55", retard: 0 });
    expect(koffi.jours[3]).toEqual({ etat: "repos" }); // dimanche 4
    expect(koffi.jours[0]).toEqual({ etat: "absent" }); // jeudi 1er, rien
  });

  it("congés : demande, solde, chevauchement, décision, annulation, reprise", async () => {
    const { id } = await creerSalariePour(org, { nom: "Awa Comptable", poste: "Comptable", debut: "2025-10-01", salaireBase: 300_000 }, user);
    const r = await reglagesDe(org);
    expect(r.congesCentiemesParMois).toBe(220);
    expect(r.verifie).toBe(false);
    expect(await proposerFeriesPour(org, user, 2026)).toBe(10);
    expect(await proposerFeriesPour(org, user, 2026)).toBe(0);

    // Au 6 octobre 2026 : 12 mois de service, 26,4 jours acquis.
    const [avant] = await soldesConges(org, r, "2026-10-06", [id]);
    expect(avant).toMatchObject({ acquis: 2640, solde: 2640, enAttente: 0 });

    // Du lundi 2 au samedi 14 novembre : 12 jours ouvrables, moins le férié du dimanche 1er (hors période).
    const demande = await demanderCongePour(org, user, { employeeId: id, nature: "paye", debut: "2026-11-02", fin: "2026-11-14", debutDemi: false, finDemi: false, motif: null }, { accorder: false, soldeApresDemandes: avant.apresDemandes });
    expect(demande.numero).toMatch(/^CONG-2026-00001$/);
    expect(demande.jours).toBe(1200);

    await expect(
      demanderCongePour(org, user, { employeeId: id, nature: "maladie", debut: "2026-11-10", fin: "2026-11-11", debutDemi: false, finDemi: false, motif: null }, { accorder: true }),
    ).rejects.toThrow(/chevauche/);

    // La Journée nationale de la paix (dimanche 15) n'entre pas ; au-delà du solde, refusé.
    await expect(
      demanderCongePour(org, user, { employeeId: id, nature: "paye", debut: "2026-12-01", fin: "2026-12-31", debutDemi: false, finDemi: false, motif: null }, { accorder: false, soldeApresDemandes: 1440 }),
    ).rejects.toThrow(/Solde insuffisant/);

    const [enAttente] = await soldesConges(org, r, "2026-10-06", [id]);
    expect(enAttente).toMatchObject({ solde: 2640, enAttente: 1200, apresDemandes: 1440 });

    await expect(deciderCongePour(org, user, demande.id, "refuse", "")).rejects.toThrow(/pourquoi/);
    await deciderCongePour(org, user, demande.id, "approuve", null);
    await expect(deciderCongePour(org, user, demande.id, "approuve", null)).rejects.toThrow(/déjà/);
    const [apres] = await soldesConges(org, r, "2026-10-06", [id]);
    expect(apres).toMatchObject({ pris: 1200, solde: 1440, enAttente: 0 });

    const { lignes } = await registre(org, "2026-11-01", "2026-11-03", r, "2026-11-03", "12:00");
    const awa = lignes.find((l) => l.salarie.id === id)!;
    expect(awa.jours[0]).toEqual({ etat: "ferie", libelle: "Toussaint" });
    expect(awa.jours[1]).toEqual({ etat: "conge", nature: "paye" });

    await annulerCongePour(org, user, demande.id, true, "2026-10-06");
    const [annule] = await soldesConges(org, r, "2026-10-06", [id]);
    expect(annule.solde).toBe(2640);

    // Reprise : le vrai solde au 1er juillet, puis l'acquis repart de là.
    await ajusterSoldePour(org, user, { employeeId: id, jour: "2026-07-01", motif: "reprise", centiemes: 500, note: "Solde papier" });
    await ajusterSoldePour(org, user, { employeeId: id, jour: "2026-09-01", motif: "majoration", centiemes: 100, note: "Ancienneté" });
    const [repris] = await soldesConges(org, r, "2026-10-06", [id]);
    expect(repris).toMatchObject({ depuis: "2026-07-01", acquis: 660, solde: 500 + 660 + 100 });
  });
});
