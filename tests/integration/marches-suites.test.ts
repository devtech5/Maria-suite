import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles } from "@/db/schema";
import { newId } from "@/lib/ids";
import { lignesPiece, piecesCommerciales } from "@/modules/facturation/schema";
import { ajouterAvenantPour, changerStatutSoumissionPour, creerConventionPour, creerSoumissionPour, modifierSoumissionPour, resilierConventionPour } from "@/modules/marches/creation";
import { conventions, soumissions } from "@/modules/marches/schema";
import { creerProjetDepuisMarchePour, preparerDevisDepuisMarchePour, suitesDe } from "@/modules/marches/suites";
import { projets } from "@/modules/projets/schema";
import { creerTiersDans } from "@/modules/tiers/creation";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;
let mairie: string;

/** Une soumission menée jusqu'au marché gagné. */
async function marcheGagne(intitule: string, montant: number, clientId: string | null = mairie): Promise<string> {
  const { id } = await creerSoumissionPour(org, user, { intitule, autorite: "Mairie de Cocody", clientId, type: "public", reference: "DAO 2026/014", lots: "Lot 2" });
  await modifierSoumissionPour(org, user, id, { montantPropose: montant });
  await changerStatutSoumissionPour(org, user, id, "en_preparation");
  await changerStatutSoumissionPour(org, user, id, "deposee", { forcer: true });
  await changerStatutSoumissionPour(org, user, id, "gagnee");
  return id;
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId: org, key: "direction", name: "Direction" });
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId: user, roleId, status: "actif" });
  ({ id: mairie } = await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Mairie de Cocody", estClient: true }, user)));
});
afterAll(async () => fermer());

describe("un marché gagné ouvre son projet et son devis", () => {
  it("le projet reprend client, objet et montant ; le devis s'y rattache", async () => {
    const id = await marcheGagne("Réhabilitation de l'école EPP Riviera", 45_000_000);

    const projet = await creerProjetDepuisMarchePour(org, { nature: "soumission", id }, user);
    const [p] = await db.select().from(projets).where(eq(projets.id, projet.id));
    expect(p).toMatchObject({ nom: "Réhabilitation de l'école EPP Riviera", clientId: mairie, prixVente: 45_000_000, responsableUserId: user });
    expect(p.description).toContain("DAO 2026/014");

    const devis = await preparerDevisDepuisMarchePour(org, { nature: "soumission", id }, user);
    const [d] = await db.select().from(piecesCommerciales).where(eq(piecesCommerciales.id, devis.id));
    expect(d).toMatchObject({ nature: "devis", statut: "brouillon", clientId: mairie, clientNom: "Mairie de Cocody", projetId: projet.id, totalHt: 45_000_000 });
    const lignes = await db.select().from(lignesPiece).where(eq(lignesPiece.pieceId, devis.id));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ designation: "Réhabilitation de l'école EPP Riviera", quantite: 1000, prixUnitaireHt: 45_000_000 });

    const [s] = await db.select().from(soumissions).where(eq(soumissions.id, id));
    expect(s).toMatchObject({ projetId: projet.id, devisId: devis.id });
    const suites = await suitesDe(org, s);
    expect(suites).toMatchObject({ projet: { code: projet.code }, devis: { id: devis.id, statut: "brouillon" } });

    // Deux clics ne font pas deux projets ni deux devis.
    await expect(creerProjetDepuisMarchePour(org, { nature: "soumission", id }, user)).rejects.toThrow(/déjà son projet/);
    await expect(preparerDevisDepuisMarchePour(org, { nature: "soumission", id }, user)).rejects.toThrow(/déjà son devis/);
  });

  it("le devis préparé d'abord rejoint le projet ouvert ensuite", async () => {
    const id = await marcheGagne("Fourniture de mobilier scolaire", 8_000_000);
    const devis = await preparerDevisDepuisMarchePour(org, { nature: "soumission", id }, user);
    const projet = await creerProjetDepuisMarchePour(org, { nature: "soumission", id }, user);
    const [d] = await db.select({ projetId: piecesCommerciales.projetId }).from(piecesCommerciales).where(eq(piecesCommerciales.id, devis.id));
    expect(d.projetId).toBe(projet.id);
  });

  it("refuse un marché pas encore gagné, et le devis sans fiche client", async () => {
    const { id: enCours } = await creerSoumissionPour(org, user, { intitule: "Entretien des espaces verts", autorite: "Port autonome", type: "public" });
    await expect(creerProjetDepuisMarchePour(org, { nature: "soumission", id: enCours }, user)).rejects.toThrow(/pas gagnée/);

    const sansClient = await marcheGagne("Gardiennage du siège", 3_600_000, null);
    await expect(preparerDevisDepuisMarchePour(org, { nature: "soumission", id: sansClient }, user)).rejects.toThrow(/fiche client/);
    // Le projet, lui, peut naître sans client.
    const projet = await creerProjetDepuisMarchePour(org, { nature: "soumission", id: sansClient }, user);
    expect(projet.code).toMatch(/^PRJ-/);
  });
});

describe("une convention signée ouvre son projet et son devis", () => {
  it("reprend partenaire, période et montant, avenants compris", async () => {
    const { id } = await creerConventionPour(
      org,
      user,
      { intitule: "Maintenance du parc informatique", sens: "client", partenaire: "Mairie de Cocody", tiersId: mairie, objet: "Visites mensuelles", montant: 6_000_000, debut: "2026-01-01", fin: "2026-12-31" },
      null,
    );
    await ajouterAvenantPour(org, user, id, { objet: "Prolongation et révision", signeLe: "2026-06-01", nouvelleFin: "2027-06-30", nouveauMontant: 7_200_000 }, null);

    const projet = await creerProjetDepuisMarchePour(org, { nature: "convention", id }, user);
    const [p] = await db.select().from(projets).where(eq(projets.id, projet.id));
    expect(p).toMatchObject({ nom: "Maintenance du parc informatique", clientId: mairie, prixVente: 7_200_000, debut: "2026-01-01", fin: "2027-06-30" });

    const devis = await preparerDevisDepuisMarchePour(org, { nature: "convention", id }, user);
    const [d] = await db.select().from(piecesCommerciales).where(eq(piecesCommerciales.id, devis.id));
    expect(d).toMatchObject({ clientId: mairie, totalHt: 7_200_000, projetId: projet.id });
    const [c] = await db.select().from(conventions).where(eq(conventions.id, id));
    expect(c).toMatchObject({ projetId: projet.id, devisId: devis.id });
  });

  it("refuse une convention fournisseur ou résiliée", async () => {
    const { id: fournisseur } = await creerConventionPour(org, user, { intitule: "Climatisation", sens: "fournisseur", partenaire: "Froid Service", debut: "2026-01-01" }, null);
    await expect(creerProjetDepuisMarchePour(org, { nature: "convention", id: fournisseur }, user)).rejects.toThrow(/fournisseur/);

    const { id: resiliee } = await creerConventionPour(org, user, { intitule: "Nettoyage", sens: "client", partenaire: "Mairie de Cocody", tiersId: mairie, montant: 1_000_000, debut: "2026-01-01" }, null);
    await resilierConventionPour(org, user, resiliee, "2026-03-01", "Fin anticipée");
    await expect(preparerDevisDepuisMarchePour(org, { nature: "convention", id: resiliee }, user)).rejects.toThrow(/résiliée/);
  });
});
