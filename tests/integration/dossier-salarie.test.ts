import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { auditLogs } from "@/db/schema";
import { creerSalariePour } from "@/modules/personnes/creation";
import {
  ajouterPiecePour,
  changerPhotoPour,
  collegues,
  etatDossiers,
  modifierEtatProfessionnelPour,
  ouvrirPiecePour,
  piecesDuSalarie,
  retirerPiecePour,
} from "@/modules/personnes/dossier";
import { employees, piecesEmploye } from "@/modules/personnes/schema";

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

describe("dossier du salarié en base", () => {
  it("pièces, remplacement, alerte d'expiration et retrait", async () => {
    const { id } = await creerSalariePour(org, { nom: "Awa Koné", poste: "Chauffeuse", debut: "2026-01-05", salaireBase: 150_000 }, user);

    await ajouterPiecePour(org, user, id, { nature: "permis", numero: "CI-123", precision: "B, C", delivreeLe: "2016-05-01", expireLe: "2026-10-20" }, null);
    await ajouterPiecePour(org, user, id, { nature: "cni", numero: "C0011", delivreeLe: "2015-01-01", expireLe: "2025-01-01" }, null);
    const { id: neuve } = await ajouterPiecePour(org, user, id, { nature: "cni", numero: "C0099", delivreeLe: "2025-01-02", expireLe: "2035-01-02" }, null);

    // Le permis expire dans 14 jours ; l'ancienne CNI, remplacée, ne compte plus.
    expect(await etatDossiers(org, "2026-10-06")).toEqual({ expirees: 0, bientot: 1, salaries: 1 });
    expect(await etatDossiers(org, "2026-10-21")).toEqual({ expirees: 1, bientot: 0, salaries: 1 });

    // Un CV sans fichier n'a pas de sens ; une fin de validité avant la délivrance non plus.
    await expect(ajouterPiecePour(org, user, id, { nature: "cv" }, null)).rejects.toThrow(/joignez/);
    await expect(
      ajouterPiecePour(org, user, id, { nature: "passeport", delivreeLe: "2026-01-01", expireLe: "2025-01-01" }, null),
    ).rejects.toThrow(/précède/);

    // Un champ que la nature ne porte pas est ignoré : pas d'expiration sur un RIB.
    const { id: rib } = await ajouterPiecePour(org, user, id, { nature: "rib", numero: "CI93 0001", organisme: "SGCI", expireLe: "2027-01-01" }, null);
    const [ligneRib] = await db.select().from(piecesEmploye).where(eq(piecesEmploye.id, rib));
    expect(ligneRib.expireLe).toBeNull();

    // Pas de fichier : rien à ouvrir.
    expect(await ouvrirPiecePour(org, user, neuve)).toBeNull();

    // Le retrait sort la pièce du dossier et laisse la trace.
    await retirerPiecePour(org, user, rib);
    expect((await piecesDuSalarie(org, id)).map((p) => p.nature).sort()).toEqual(["cni", "cni", "permis"]);
    await expect(retirerPiecePour(org, user, rib)).rejects.toThrow(/introuvable/);

    const traces = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, org), eq(auditLogs.entityId, id)));
    expect(traces.map((t) => t.action)).toEqual(expect.arrayContaining(["piece_employe.ajouter", "piece_employe.retirer"]));
  });

  it("un salarié d'une autre entreprise est hors d'atteinte", async () => {
    const autre = await semerEntreprise(db, "Voisine");
    const { id } = await creerSalariePour(autre.organizationId, { nom: "Yao", poste: "Vendeur", debut: "2026-01-01", salaireBase: 0 });
    await expect(ajouterPiecePour(org, user, id, { nature: "cmu", numero: "1" }, null)).rejects.toThrow(/introuvable/);
    await expect(changerPhotoPour(org, user, id, "data:image/jpeg;base64,AAAA")).rejects.toThrow(/introuvable/);
  });

  it("un matricule imposé ne fait plus échouer l'embauche suivante", async () => {
    const { organizationId } = await semerEntreprise(db, "Reprise");
    await creerSalariePour(organizationId, { nom: "Repris 1", poste: "A", debut: "2025-03-01", salaireBase: 0, matricule: "MG-2503-001" });
    // Rang 2 imposé sur un autre mois : il reste pris pour toute embauche.
    await creerSalariePour(organizationId, { nom: "Repris 2", poste: "A", debut: "2025-11-01", salaireBase: 0, matricule: "MG-2511-002" });
    const { matricule } = await creerSalariePour(organizationId, { nom: "Nouveau", poste: "A", debut: "2026-01-01", salaireBase: 0 });
    expect(matricule).toBe("MG-2601-003");
  });

  it("le matricule dit le mois d'entrée puis le rang dans l'effectif", async () => {
    const { organizationId } = await semerEntreprise(db, "Effectif");
    const a = await creerSalariePour(organizationId, { nom: "Premier", poste: "A", debut: "2026-01-05", salaireBase: 0 });
    const b = await creerSalariePour(organizationId, { nom: "Deuxième", poste: "A", debut: "2025-11-20", salaireBase: 0 });
    expect([a.matricule, b.matricule]).toEqual(["MG-2601-001", "MG-2511-002"]);
  });

  it("la base refuse une photo qui n'est pas une image", async () => {
    const { id } = await creerSalariePour(org, { nom: "Test Photo", poste: "Caissier", debut: "2026-01-01", salaireBase: 0 });
    await expect(db.update(employees).set({ photo: "javascript:alert(1)" }).where(eq(employees.id, id))).rejects.toThrow();
    await changerPhotoPour(org, user, id, "data:image/jpeg;base64,AAAA");
    const [s] = await db.select({ photo: employees.photo }).from(employees).where(eq(employees.id, id));
    expect(s.photo).toBe("data:image/jpeg;base64,AAAA");
  });

  it("état professionnel : supérieur, boucle refusée, essai après l'entrée", async () => {
    const { organizationId: o } = await semerEntreprise(db, "Hiérarchie");
    const { id: chef } = await creerSalariePour(o, { nom: "Kouassi Yao", poste: "Directeur", debut: "2024-01-02", salaireBase: 0 });
    const { id: adjoint } = await creerSalariePour(o, { nom: "Adama Traoré", poste: "Chef de service", debut: "2025-03-01", salaireBase: 0 });
    const etat = { emailProfessionnel: "adama.traore@maria-groupe.com", poste: "Chef de service", service: "Logistique", superieurId: chef, finPeriodeEssai: "2025-05-31" };

    await modifierEtatProfessionnelPour(o, user, adjoint, etat);
    const [ligne] = await db.select().from(employees).where(eq(employees.id, adjoint));
    expect(ligne).toMatchObject({ superieurId: chef, service: "Logistique", emailProfessionnel: "adama.traore@maria-groupe.com", finPeriodeEssai: "2025-05-31" });
    expect(ligne.version).toBe(2);

    // Le chef sous son adjoint : la chaîne bouclerait.
    await expect(
      modifierEtatProfessionnelPour(o, user, chef, { ...etat, poste: "Directeur", superieurId: adjoint, finPeriodeEssai: null }),
    ).rejects.toThrow(/supérieur de son propre supérieur/);
    // Ni soi-même, ni un essai qui finit avant l'entrée, ni un salarié d'ailleurs.
    await expect(modifierEtatProfessionnelPour(o, user, adjoint, { ...etat, superieurId: adjoint })).rejects.toThrow(/propre supérieur/);
    await expect(modifierEtatProfessionnelPour(o, user, adjoint, { ...etat, finPeriodeEssai: "2025-02-28" })).rejects.toThrow(/avant l'entrée/);
    const { id: etranger } = await creerSalariePour(org, { nom: "Hors", poste: "A", debut: "2026-01-01", salaireBase: 0 });
    await expect(modifierEtatProfessionnelPour(o, user, adjoint, { ...etat, superieurId: etranger })).rejects.toThrow(/inconnu/);

    // La base tient la règle même sans passer par le module.
    await expect(db.update(employees).set({ superieurId: chef }).where(eq(employees.id, chef))).rejects.toThrow();

    expect((await collegues(o, adjoint)).map((c) => c.nom)).toEqual(["Kouassi Yao"]);
  });
});
