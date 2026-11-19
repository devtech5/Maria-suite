import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs } from "@/db/schema";
import { tableDecrite } from "@/modules/donnees/catalogue";
import {
  basculerActifDans,
  effacerLigneDans,
  mettreALaCorbeilleDans,
  modifierLigneDans,
  restaurerLigneDans,
  type Contexte,
} from "@/modules/donnees/operations";
import type { TableDecrite } from "@/modules/donnees/regles";
import { compterTables, lireLigne, listerLignes, referencesVers } from "@/modules/donnees/requetes";
import { creerTiersDans } from "@/modules/tiers/creation";
import { tiers } from "@/modules/tiers/schema";
import { creerCompteDans, decaisserBonPour, deciderBonDans, demanderBonDans } from "@/modules/tresorerie/creation";
import { enregistrerMouvementDans } from "@/modules/tresorerie/creation-mouvements";
import { demanderCommandeInterneDans } from "@/modules/tresorerie/creation-commandes-internes";
import { bonsCaisse } from "@/modules/tresorerie/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let ctx: Contexte;
let autre: string;
let caisse: string;

const aujourdhui = new Date().toISOString().slice(0, 10);

const t = (nom: string): TableDecrite => {
  const d = tableDecrite(nom);
  if (!d) throw new Error(nom);
  return d;
};
const formulaire = (champs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
};
const geste = <R,>(f: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<R>) => db.transaction(f);

async function nouveauTiers(nom: string) {
  return db.transaction((tx) => creerTiersDans(tx, ctx.organizationId, { nom, estClient: true }, ctx.userId));
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  const { organizationId, userId } = await semerEntreprise(db);
  ctx = { organizationId, userId };
  ({ organizationId: autre } = await semerEntreprise(db, "Autre entreprise"));
  ({ id: caisse } = await db.transaction((tx) => creerCompteDans(tx, organizationId, { nom: "Caisse siège", nature: "caisse", compte: "571", seuilAlerte: 0 }, userId)));
  await db.transaction((tx) => enregistrerMouvementDans(tx, organizationId, { compteId: caisse, nature: "apport", montant: 500_000, date: aujourdhui }, userId));
});
afterAll(async () => fermer());

describe("console des données — lecture", () => {
  it("compte, liste et retrouve les lignes de l'entreprise seulement", async () => {
    const { id } = await nouveauTiers("Station Total Plateau");
    await db.transaction((tx) => creerTiersDans(tx, autre, { nom: "Station d'une autre entreprise", estClient: true }));

    const comptes = await compterTables(ctx.organizationId);
    expect(comptes.get("tiers")?.actives).toBe(1);

    const page = await listerLignes(t("tiers"), ctx.organizationId, { q: "total" });
    expect(page.lignes.map((l) => l.id)).toEqual([id]);
    expect((await listerLignes(t("tiers"), ctx.organizationId, { q: "autre entreprise" })).lignes).toHaveLength(0);
    // Un « % » saisi se cherche tel quel, il ne vaut pas « n'importe quoi ».
    expect((await listerLignes(t("tiers"), ctx.organizationId, { q: "%" })).lignes).toHaveLength(0);

    const ligne = await lireLigne(t("tiers"), ctx.organizationId, id);
    expect(ligne).toMatchObject({ nom: "Station Total Plateau", actif: true, deleted_at: null });
    expect(await lireLigne(t("tiers"), autre, id)).toBeNull();
  });

  it("filtre une table par la ligne qu'elle désigne, et compte qui désigne une ligne", async () => {
    const { id } = await db.transaction((tx) => demanderBonDans(tx, ctx.organizationId, { caisseId: caisse, nature: "carburant", montant: 9_000, beneficiaire: "Bamba Ali", motif: "Plein" }, ctx.userId));
    const page = await listerLignes(t("bons_caisse"), ctx.organizationId, { filtre: { colonne: "caisse_id", valeur: caisse } });
    expect(page.lignes.some((l) => l.id === id)).toBe(true);
    const refs = await referencesVers(t("comptes_tresorerie"), ctx.organizationId, caisse);
    expect(refs).toContainEqual({ table: "bons_caisse", colonne: "caisse_id", nombre: expect.any(Number) });
  });
});

describe("console des données — gestes", () => {
  it("modifie du texte, un entier, une énumération, une date et une case, en traçant avant et après", async () => {
    const { id } = await nouveauTiers("Quincaillerie Adjamé");
    const r = await geste((tx) =>
      modifierLigneDans(tx, t("tiers"), ctx, id, formulaire({ nom: "Quincaillerie d'Adjamé SARL", telephone: "", ville: "Abidjan", "present:est_fournisseur": "1", est_fournisseur: "on", "present:est_client": "1", est_client: "on" })),
    );
    expect(r).toMatchObject({ ok: true });
    const [apres] = await db.select().from(tiers).where(eq(tiers.id, id));
    expect(apres).toMatchObject({ nom: "Quincaillerie d'Adjamé SARL", ville: "Abidjan", telephone: null, estFournisseur: true, version: 2 });

    const [trace] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, "donnees.modifier")));
    expect(trace.before).toMatchObject({ nom: "Quincaillerie Adjamé" });
    expect(trace.after).toMatchObject({ nom: "Quincaillerie d'Adjamé SARL", ville: "Abidjan" });

    const { id: bon } = await db.transaction((tx) => demanderBonDans(tx, ctx.organizationId, { caisseId: caisse, nature: "transport", montant: 3_000, beneficiaire: "Konan Michel", motif: "Course" }, ctx.userId));
    const m = await geste((tx) => modifierLigneDans(tx, t("bons_caisse"), ctx, bon, formulaire({ montant: "4 500", nature: "divers", motif: "Course Plateau" })));
    expect(m).toMatchObject({ ok: true });
    const [b] = await db.select().from(bonsCaisse).where(eq(bonsCaisse.id, bon));
    expect(b).toMatchObject({ montant: 4_500, nature: "divers", motif: "Course Plateau" });

    expect(await geste((tx) => modifierLigneDans(tx, t("bons_caisse"), ctx, bon, formulaire({ montant: "4 500" })))).toEqual({ ok: true, message: "Aucun changement." });
    expect(await geste((tx) => modifierLigneDans(tx, t("bons_caisse"), ctx, bon, formulaire({ montant: "4,5" })))).toMatchObject({ ok: false });
  });

  it("modifie un JSON en gardant sa forme", async () => {
    const { id } = await db.transaction((tx) =>
      demanderCommandeInterneDans(
        tx,
        ctx.organizationId,
        { objet: "Fournitures", service: null, beneficiaire: "Kouassi Aya", lignes: [{ rubrique: "Bureau", designation: "Ramettes", quantite: 2, prixUnitaire: 3_000 }] },
        ctx.userId,
      ),
    );
    const lignes = JSON.stringify([{ rubrique: "Bureau", designation: "Ramettes A4", quantite: 3, prixUnitaire: 3_000 }]);
    expect(await geste((tx) => modifierLigneDans(tx, t("bons_commande_interne"), ctx, id, formulaire({ lignes })))).toMatchObject({ ok: true });
    const ligne = await lireLigne(t("bons_commande_interne"), ctx.organizationId, id);
    expect(ligne?.lignes).toEqual(JSON.parse(lignes));
    expect(await geste((tx) => modifierLigneDans(tx, t("bons_commande_interne"), ctx, id, formulaire({ lignes: "{}" })))).toMatchObject({ ok: false });
  });

  it("désactive puis réactive une fiche", async () => {
    const { id } = await nouveauTiers("Garage Koumassi");
    expect(await geste((tx) => basculerActifDans(tx, t("tiers"), ctx, id))).toEqual({ ok: true, message: "Ligne désactivée." });
    expect((await lireLigne(t("tiers"), ctx.organizationId, id))?.actif).toBe(false);
    expect(await geste((tx) => basculerActifDans(tx, t("tiers"), ctx, id))).toEqual({ ok: true, message: "Ligne réactivée." });
  });

  it("met à la corbeille, restaure, puis efface pour de bon ce que rien ne désigne", async () => {
    const { id } = await nouveauTiers("Taxi de passage");
    await geste((tx) => mettreALaCorbeilleDans(tx, t("tiers"), ctx, id));
    expect((await listerLignes(t("tiers"), ctx.organizationId, {})).lignes.some((l) => l.id === id)).toBe(false);
    expect((await listerLignes(t("tiers"), ctx.organizationId, { corbeille: true })).lignes.some((l) => l.id === id)).toBe(true);

    await geste((tx) => restaurerLigneDans(tx, t("tiers"), ctx, id));
    expect((await lireLigne(t("tiers"), ctx.organizationId, id))?.deleted_at).toBeNull();

    expect(await geste((tx) => effacerLigneDans(tx, t("tiers"), ctx, id))).toMatchObject({ ok: false, message: expect.stringMatching(/corbeille/) });
    await geste((tx) => mettreALaCorbeilleDans(tx, t("tiers"), ctx, id));
    expect(await geste((tx) => effacerLigneDans(tx, t("tiers"), ctx, id))).toEqual({ ok: true, message: "Ligne effacée définitivement." });
    expect(await lireLigne(t("tiers"), ctx.organizationId, id)).toBeNull();
    const traces = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entityId, id));
    expect(traces.map((x) => x.action)).toEqual(expect.arrayContaining(["donnees.supprimer", "donnees.restaurer", "donnees.effacer"]));
  });

  it("n'efface pas ce qu'une autre ligne désigne, ni une pièce numérotée", async () => {
    await geste((tx) => mettreALaCorbeilleDans(tx, t("comptes_tresorerie"), ctx, caisse));
    expect(await geste((tx) => effacerLigneDans(tx, t("comptes_tresorerie"), ctx, caisse))).toMatchObject({ ok: false, message: expect.stringMatching(/référence/) });
    await geste((tx) => restaurerLigneDans(tx, t("comptes_tresorerie"), ctx, caisse));

    const { id } = await db.transaction((tx) => demanderBonDans(tx, ctx.organizationId, { caisseId: caisse, nature: "divers", montant: 1_000, beneficiaire: "Yao Serge", motif: "Essai" }, ctx.userId));
    await geste((tx) => mettreALaCorbeilleDans(tx, t("bons_caisse"), ctx, id));
    expect(await geste((tx) => effacerLigneDans(tx, t("bons_caisse"), ctx, id))).toMatchObject({ ok: false, message: expect.stringMatching(/numéro/) });
  });

  it("laisse en lecture seule une ligne comptabilisée", async () => {
    const { id } = await db.transaction((tx) => demanderBonDans(tx, ctx.organizationId, { caisseId: caisse, nature: "divers", montant: 2_000, beneficiaire: "Yao Serge", motif: "Décaissé" }, ctx.userId));
    await db.transaction((tx) => deciderBonDans(tx, ctx.organizationId, id, { approuve: true }, { userId: ctx.userId, estProprietaire: true }));
    await decaisserBonPour(ctx.organizationId, id, null, ctx.userId);
    expect(await geste((tx) => modifierLigneDans(tx, t("bons_caisse"), ctx, id, formulaire({ montant: "1" })))).toMatchObject({ ok: false, message: expect.stringMatching(/contre-passation/) });
    expect(await geste((tx) => mettreALaCorbeilleDans(tx, t("bons_caisse"), ctx, id))).toMatchObject({ ok: false });
    const [b] = await db.select().from(bonsCaisse).where(eq(bonsCaisse.id, id));
    expect(b).toMatchObject({ montant: 2_000, deletedAt: null });
  });

  it("ne touche pas la ligne d'une autre entreprise", async () => {
    const { id } = await db.transaction((tx) => creerTiersDans(tx, autre, { nom: "Hors champ", estClient: true }));
    await expect(geste((tx) => mettreALaCorbeilleDans(tx, t("tiers"), ctx, id))).rejects.toThrow(/introuvable/);
  });
});
