import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs, memberships, roles, users } from "@/db/schema";
import {
  archiverPour,
  creerDossierPour,
  desactiverArchivePour,
  modifierArchivePour,
  reactiverArchivePour,
  supprimerArchivePour,
} from "@/modules/archives/creation";
import { archivesDuDossier, mesArchives, toutesArchives } from "@/modules/archives/requetes";
import { archives } from "@/modules/archives/schema";
import { newId } from "@/lib/ids";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

process.env.STOCKAGE_LOCAL = mkdtempSync(join(tmpdir(), "maria-archives-gestion-"));

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let admin: string;
let awa: string;
let kone: string;

const AUTEUR = { auteur: true, superviseur: false };
const ADMINISTRATION = { auteur: true, superviseur: true };

async function membre(nom: string): Promise<string> {
  const id = newId();
  await db.insert(users).values({ id, fullName: nom, email: `${id}@exemple.test` });
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId: org, key: `r-${roleId}`, name: "Membre" });
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId: id, roleId, status: "actif" });
  return id;
}

const pdf = () => ({ nom: "plan.pdf", typeMime: "application/pdf", contenu: new TextEncoder().encode("%PDF-1.4 plan").buffer as ArrayBuffer });

async function deposer(userId: string, dossierId: string | null = null): Promise<string> {
  const { numeros } = await archiverPour(org, userId, { dossierId, fichiers: [pdf()] }, false);
  const [ligne] = await db
    .select({ id: archives.id })
    .from(archives)
    .where(and(eq(archives.organizationId, org), eq(archives.numero, numeros[0])));
  return ligne.id;
}

/** Recule la date de dépôt : l'archive passe le délai de correction et se scelle. */
async function sceller(archiveId: string) {
  await db.update(archives).set({ createdAt: new Date(Date.now() - 48 * 3600 * 1000) }).where(eq(archives.id, archiveId));
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: admin } = await semerEntreprise(db));
  awa = await membre("Awa Koné");
  kone = await membre("Kone Yao");
});
afterAll(async () => fermer());

describe("gérer une archive : modifier, désactiver, réactiver, supprimer", () => {
  it("l'auteur modifie titre, rubrique, description et dossier partagé ; le fichier ne change pas", async () => {
    const { id: dossier } = await creerDossierPour(org, admin, { nom: "Architecture", visibilite: "tous", depotOuvert: true, membres: [] });
    const id = await deposer(awa);
    const [avant] = await db.select().from(archives).where(eq(archives.id, id));

    await modifierArchivePour(org, awa, id, { titre: "Affiche Maria Group", dossier: "Plans", description: "Plan de construction", dossierId: dossier }, AUTEUR);

    const [apres] = await db.select().from(archives).where(eq(archives.id, id));
    expect(apres).toMatchObject({ titre: "Affiche Maria Group", dossier: "Plans", description: "Plan de construction", dossierId: dossier });
    expect(apres.empreinte).toBe(avant.empreinte);
    expect((await archivesDuDossier(org, dossier)).map((a) => a.id)).toContain(id);

    const journal = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, "archive.modifier")));
    expect(journal).toHaveLength(1);
    expect(journal[0].before).toMatchObject({ titre: "plan" });
  });

  it("un autre membre ne touche pas à l'archive d'Awa ; l'administration, si", async () => {
    const id = await deposer(awa);
    await expect(modifierArchivePour(org, kone, id, { titre: "Piratée" }, AUTEUR)).rejects.toThrow(/introuvable/);
    await expect(desactiverArchivePour(org, kone, id, null, AUTEUR)).rejects.toThrow(/introuvable/);
    await expect(supprimerArchivePour(org, kone, id, AUTEUR)).rejects.toThrow(/introuvable/);
    await modifierArchivePour(org, admin, id, { titre: "Rangée par l'administration" }, ADMINISTRATION);
  });

  it("désactiver masque l'archive des dossiers partagés ; réactiver la fait reparaître", async () => {
    const { id: dossier } = await creerDossierPour(org, admin, { nom: "Chantier", visibilite: "tous", depotOuvert: true, membres: [] });
    const id = await deposer(awa, dossier);

    await desactiverArchivePour(org, awa, id, "", AUTEUR);
    expect((await archivesDuDossier(org, dossier)).map((a) => a.id)).not.toContain(id);
    // Toujours dans l'espace de son auteur, pour être réactivée, et chez l'administration.
    const mienne = (await mesArchives(org, awa)).find((a) => a.id === id)!;
    expect(mienne.retireeLe).not.toBeNull();
    expect(mienne.motifRetrait).toBe("Désactivée par son auteur");
    expect((await toutesArchives(org)).map((a) => a.id)).toContain(id);
    await expect(desactiverArchivePour(org, awa, id, null, AUTEUR)).rejects.toThrow(/déjà désactivée/);

    await reactiverArchivePour(org, awa, id, AUTEUR);
    expect((await archivesDuDossier(org, dossier)).map((a) => a.id)).toContain(id);
    await expect(reactiverArchivePour(org, awa, id, AUTEUR)).rejects.toThrow(/déjà active/);
  });

  it("l'auteur supprime pendant le délai ; scellée, seule l'administration la supprime", async () => {
    const recente = await deposer(awa);
    await supprimerArchivePour(org, awa, recente, AUTEUR);
    expect((await mesArchives(org, awa)).map((a) => a.id)).not.toContain(recente);
    expect((await toutesArchives(org)).map((a) => a.id)).not.toContain(recente);

    const ancienne = await deposer(awa);
    await sceller(ancienne);
    await expect(supprimerArchivePour(org, awa, ancienne, AUTEUR)).rejects.toThrow(/scellée/);
    // Scellée, elle se désactive et se modifie toujours.
    await desactiverArchivePour(org, awa, ancienne, "Doublon", AUTEUR);
    await reactiverArchivePour(org, awa, ancienne, AUTEUR);
    await supprimerArchivePour(org, admin, ancienne, ADMINISTRATION);
    expect((await toutesArchives(org)).map((a) => a.id)).not.toContain(ancienne);

    const trace = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, ancienne), eq(auditLogs.action, "archive.supprimer")));
    expect(trace).toHaveLength(1);
  });
});
