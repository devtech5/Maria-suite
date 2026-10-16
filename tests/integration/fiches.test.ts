import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs } from "@/db/schema";
import { appliquerGestePour } from "@/lib/fiches/geste";
import { FICHES } from "@/lib/fiches/registre";
import { newId } from "@/lib/ids";
import { actifs, echeances } from "@/modules/actifs/schema";
import { creerVehiculePour, enregistrerPleinPour } from "@/modules/parc-auto/creation";
import { vehicules } from "@/modules/parc-auto/schema";
import { creerPrestatairePour } from "@/modules/prestataires/creation";
import { creerTiersPour } from "@/modules/tiers/creation";
import { contactsTiers, tiers } from "@/modules/tiers/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;
let autre: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  ({ organizationId: autre } = await semerEntreprise(db, "Voisine"));
});
afterAll(async () => fermer());

const ligneTiers = async (id: string) => (await db.select().from(tiers).where(eq(tiers.id, id)))[0];

describe("registre des fiches", () => {
  it("ne vise que des tables qui portent les colonnes du circuit", async () => {
    for (const [type, def] of Object.entries(FICHES)) {
      const tables: [string, string[]][] = [
        [def.table, ["id", def.libelle, ...(def.actif ? ["actif"] : [])]],
        ...("filles" in def ? def.filles.map((f): [string, string[]] => [f.table, [f.cle, f.colonne]]) : []),
      ];
      for (const [table, propres] of tables) {
        const colonnes = (
          await db.execute<{ c: string }>(sql`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = ${table}`)
        ).map((l) => l.c);
        for (const colonne of ["organization_id", "version", "updated_at", "deleted_at", ...propres]) {
          expect(colonnes, `${type} → ${table}.${colonne}`).toContain(colonne);
        }
      }
    }
  });
});

describe("mettre en off, réactiver, supprimer", () => {
  it("met en off et réactive, en incrémentant la version et en traçant", async () => {
    const { id } = await creerTiersPour(org, { nom: "Quincaillerie Adjamé", estFournisseur: true });
    const version = (await ligneTiers(id)).version;

    expect((await appliquerGestePour(org, user, "tiers", id, "desactiver")).ok).toBe(true);
    expect((await ligneTiers(id)).actif).toBe(false);
    expect((await ligneTiers(id)).version).toBe(version + 1);

    expect((await appliquerGestePour(org, user, "tiers", id, "reactiver")).ok).toBe(true);
    expect((await ligneTiers(id)).actif).toBe(true);

    const traces = await db.select({ action: auditLogs.action, userId: auditLogs.userId }).from(auditLogs).where(and(eq(auditLogs.organizationId, org), eq(auditLogs.entityId, id)));
    expect(traces.map((t) => t.action)).toEqual(expect.arrayContaining(["tiers.desactiver", "tiers.reactiver"]));
    expect(traces.every((t) => t.userId === user || t.userId === null)).toBe(true);
  });

  it("supprime logiquement une fiche inutilisée, avec ses extensions", async () => {
    const { id } = await creerTiersPour(org, { nom: "Saisi par erreur" });
    const contact = newId();
    await db.insert(contactsTiers).values({ id: contact, organizationId: org, tiersId: id, nom: "Awa" });

    const r = await appliquerGestePour(org, user, "tiers", id, "supprimer");
    expect(r).toEqual({ ok: true, message: "Fiche supprimée." });
    const apres = await ligneTiers(id);
    expect(apres.deletedAt).not.toBeNull();
    expect(apres.actif).toBe(false);
    const [c] = await db.select().from(contactsTiers).where(eq(contactsTiers.id, contact));
    expect(c.deletedAt).not.toBeNull();

    // Une seconde fois : la fiche n'existe plus pour personne.
    expect((await appliquerGestePour(org, user, "tiers", id, "supprimer")).ok).toBe(false);
  });

  it("refuse de supprimer une fiche qui sert, et dit où", async () => {
    const { tiersId } = await creerPrestatairePour(org, user, { nom: "Électricité Koffi", metiers: ["electricien"] });
    const r = await appliquerGestePour(org, user, "tiers", tiersId, "supprimer");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("prestataires");
    expect((await ligneTiers(tiersId)).deletedAt).toBeNull();
  });

  it("compte les usages des extensions comme ceux de la fiche", async () => {
    // Échéances et kilométrage de départ, posés d'office, ne bloquent pas.
    const neuf = await creerVehiculePour(org, { immatriculation: "4321 AB 01", kilometrage: 12_000, assuranceLe: "2026-12-31" }, user);
    expect((await appliquerGestePour(org, user, "actif", neuf.id, "supprimer")).ok).toBe(true);
    const [v] = await db.select({ supprime: vehicules.deletedAt }).from(vehicules).where(eq(vehicules.actifId, neuf.id));
    expect(v.supprime).not.toBeNull();
    const restantes = await db.select().from(echeances).where(and(eq(echeances.actifId, neuf.id), isNull(echeances.deletedAt)));
    expect(restantes).toEqual([]);

    const roule = await creerVehiculePour(org, { immatriculation: "5555 CD 01", reservoirLitres: 60 }, user);
    await enregistrerPleinPour(org, { actifId: roule.id, faitLe: new Date("2026-10-01T12:00:00Z"), volume: 20_000, montant: 16_500 }, user);
    const r = await appliquerGestePour(org, user, "actif", roule.id, "supprimer");
    expect(r.ok).toBe(false);
    const [a] = await db.select({ supprime: actifs.deletedAt }).from(actifs).where(eq(actifs.id, roule.id));
    expect(a.supprime).toBeNull();

    // Un actif garde son propre statut : pas de mise en off par ce circuit.
    expect((await appliquerGestePour(org, user, "actif", roule.id, "desactiver")).ok).toBe(false);
  });

  it("ne touche jamais la fiche d'une autre entreprise", async () => {
    const { id } = await creerTiersPour(org, { nom: "Client protégé" });
    expect((await appliquerGestePour(autre, user, "tiers", id, "desactiver")).ok).toBe(false);
    expect((await appliquerGestePour(autre, user, "tiers", id, "supprimer")).ok).toBe(false);
    const apres = await ligneTiers(id);
    expect(apres.actif).toBe(true);
    expect(apres.deletedAt).toBeNull();
  });
});
