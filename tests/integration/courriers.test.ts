import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs } from "@/db/schema";
import {
  courrierDe,
  creerCourrierDans,
  listerCourriers,
  modifierCourrierDans,
  supprimerCourrierDans,
  type SaisieCourrier,
} from "@/modules/documents/courriers";
import { courriers } from "@/modules/documents/schema";
import { jourLocal } from "@/modules/presences/calcul";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

const saisie: SaisieCourrier = {
  lieu: "Abidjan",
  dateCourrier: "2026-10-16",
  destinataire: "Monsieur le Directeur\nSOCOCE",
  objet: "Demande de partenariat",
  corps: "Madame, Monsieur,\nNous avons l'honneur…",
  signataire: "Michaël Kadio",
  fonction: "Gérant",
};

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

describe("courriers", () => {
  const annee = jourLocal(new Date()).slice(0, 4);

  it("numérote à la suite, sans doublon, même en parallèle", async () => {
    const crees = await Promise.all(
      [1, 2, 3].map(() => db.transaction((tx) => creerCourrierDans(tx, org, saisie, user))),
    );
    const numeros = crees.map((c) => c.numero).sort();
    expect(numeros).toEqual([`COUR-${annee}-00001`, `COUR-${annee}-00002`, `COUR-${annee}-00003`]);
  });

  it("corrige sans changer le numéro, et trace l'avant et l'après", async () => {
    const { id, numero } = await db.transaction((tx) => creerCourrierDans(tx, org, saisie, user));
    const modifie = await db.transaction((tx) =>
      modifierCourrierDans(tx, org, id, { ...saisie, objet: "Relance partenariat" }, user),
    );
    expect(modifie).toEqual({ numero });

    const ligne = await courrierDe(org, id);
    expect(ligne).toMatchObject({ numero, objet: "Relance partenariat", version: 2 });

    const [trace] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, "courrier.modifier")));
    expect(trace.before).toEqual({ objet: "Demande de partenariat" });
    expect(trace.after).toEqual({ objet: "Relance partenariat" });
  });

  it("retire logiquement : le numéro reste pris, la liste l'oublie", async () => {
    const { id, numero } = await db.transaction((tx) => creerCourrierDans(tx, org, saisie, user));
    expect(await db.transaction((tx) => supprimerCourrierDans(tx, org, id, user))).toBe(true);

    expect(await courrierDe(org, id)).toBeNull();
    expect((await listerCourriers(org)).some((c) => c.id === id)).toBe(false);
    const [ligne] = await db.select().from(courriers).where(eq(courriers.id, id));
    expect(ligne.deletedAt).not.toBeNull();

    const { numero: suivant } = await db.transaction((tx) => creerCourrierDans(tx, org, saisie, user));
    expect(suivant).not.toBe(numero);
    expect(await db.transaction((tx) => modifierCourrierDans(tx, org, id, saisie, user))).toBeNull();
  });

  it("n'ouvre pas le courrier d'une autre entreprise", async () => {
    const { organizationId: autre } = await semerEntreprise(db, "Autre");
    const { id } = await db.transaction((tx) => creerCourrierDans(tx, org, saisie, user));
    expect(await courrierDe(autre, id)).toBeNull();
    expect(await db.transaction((tx) => supprimerCourrierDans(tx, autre, id))).toBe(false);
    expect(await courrierDe(org, id)).not.toBeNull();
  });
});
