import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { ecritures, lignesEcriture } from "@/modules/comptabilite/schema";
import {
  changerStatutPour,
  creerPrestatairePour,
  demanderPrestationPour,
  evaluerPour,
  listerPrestataires,
  payerPour,
} from "@/modules/prestataires/creation";
import { creerCompteDans } from "@/modules/tresorerie/creation";
import { tiers } from "@/modules/tiers/schema";

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

describe("prestataires en base", () => {
  it("de l'inscription au paiement comptabilisé, avec avis", async () => {
    const { id, tiersId } = await creerPrestatairePour(org, user, { nom: "Koné Plomberie", metiers: ["Plombier"], tarif: 15_000, uniteTarif: "prestation", telephone: "0707000000" });
    const [t] = await db.select().from(tiers).where(eq(tiers.id, tiersId));
    // Une fiche tiers fournisseur, pas cliente.
    expect({ client: t.estClient, fournisseur: t.estFournisseur }).toEqual({ client: false, fournisseur: true });

    await expect(creerPrestatairePour(org, user, { nom: "Sans métier", metiers: [] })).rejects.toThrow(/métier/);
    await expect(creerPrestatairePour(org, user, { tiersId, metiers: ["Plombier"] })).rejects.toThrow();

    const { id: pid, numero } = await demanderPrestationPour(org, user, { prestataireId: id, objet: "Fuite cuisine", montantConvenu: 100_000 });
    expect(numero).toMatch(/^PRE-\d{4}-00001$/);

    const { id: caisse } = await db.transaction((tx) => creerCompteDans(tx, org, { nom: "Caisse siège", nature: "caisse", compte: "571", seuilAlerte: 0 }, user));
    const paiement = { montant: 100_000, retenueBp: 750, compteCharge: "624" as const, compteTresorerieId: caisse, date: "2026-10-06" };

    await expect(payerPour(org, user, pid, paiement)).rejects.toThrow(/réalisation/);
    await expect(evaluerPour(org, user, pid, 5, null)).rejects.toThrow(/réalisée/);

    await changerStatutPour(org, user, pid, "confirmee");
    await changerStatutPour(org, user, pid, "realisee");
    await evaluerPour(org, user, pid, 4, "Rapide et propre");

    const { ecriture } = await payerPour(org, user, pid, paiement);
    const [e] = await db.select().from(ecritures).where(eq(ecritures.pieceNumero, numero));
    expect(e).toBeDefined();
    const lignes = await db.select().from(lignesEcriture).where(eq(lignesEcriture.ecritureId, e.id));
    const parCompte = Object.fromEntries(lignes.map((l) => [l.compte, { debit: Number(l.debit), credit: Number(l.credit) }]));
    expect(parCompte["624"]).toEqual({ debit: 100_000, credit: 0 });
    expect(parCompte["571"]).toEqual({ debit: 0, credit: 92_500 });
    expect(parCompte["447"]).toEqual({ debit: 0, credit: 7_500 });
    expect(ecriture).toBeTruthy();

    // Payée une fois, pas deux.
    await expect(payerPour(org, user, pid, paiement)).rejects.toThrow(/déjà payée/);

    const [fiche] = await listerPrestataires(org);
    expect({ note: fiche.note, realisees: fiche.realisees, totalPaye: fiche.totalPaye }).toEqual({ note: 40, realisees: 1, totalPaye: 100_000 });
  });

  it("une annulation exige son motif", async () => {
    const [p] = await listerPrestataires(org);
    const { id } = await demanderPrestationPour(org, user, { prestataireId: p.id, objet: "Contrôle chauffe-eau" });
    await expect(changerStatutPour(org, user, id, "annulee")).rejects.toThrow(/motif/);
    await changerStatutPour(org, user, id, "annulee", { motif: "Fait par le propriétaire" });
    await expect(changerStatutPour(org, user, id, "realisee")).rejects.toThrow();
  });

  it("enregistre le type du prestataire et son origine : local par défaut, international avec son pays", async () => {
    const local = await creerPrestatairePour(org, user, { nom: "Mutuelle Santé Plus", nature: "mutuelle", metiers: ["Assurance santé"] });
    const etranger = await creerPrestatairePour(org, user, { nom: "Studio Lumière Paris", nature: "entreprise", paysCode: "FR", ville: "Paris", metiers: ["Photographe"] });
    const liste = await listerPrestataires(org);
    expect(liste.find((p) => p.tiersId === local.tiersId)).toMatchObject({ nature: "mutuelle", paysCode: null });
    expect(liste.find((p) => p.tiersId === etranger.tiersId)).toMatchObject({ nature: "entreprise", paysCode: "FR", ville: "Paris" });
    // Sans type, un prestataire reste un particulier, comme avant.
    const simple = await creerPrestatairePour(org, user, { nom: "Yao Électricité", metiers: ["Électricien"] });
    expect(liste.length).toBeGreaterThan(0);
    expect((await listerPrestataires(org)).find((p) => p.tiersId === simple.tiersId)).toMatchObject({ nature: "particulier", paysCode: null });
  });
});
