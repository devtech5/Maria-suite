import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { echeances, relevesCompteur } from "@/modules/actifs/schema";
import { creerActifPour } from "@/modules/actifs/creation";
import { completerVehiculePour, creerVehiculePour, enregistrerPleinPour, retirerPleinPour } from "@/modules/parc-auto/creation";
import { listerVehicules } from "@/modules/parc-auto/requetes";
import { pleinsCarburant } from "@/modules/parc-auto/schema";
import { attribuerLicencePour, completerEquipementPour, creerEquipementPour, creerLicencePour, desattribuerLicencePour } from "@/modules/parc-informatique/creation";
import { listerEquipements, listerLicences } from "@/modules/parc-informatique/requetes";
import { licencesAttribuees } from "@/modules/parc-informatique/schema";
import { creerSalariePour } from "@/modules/personnes/creation";

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

describe("parc automobile en base", () => {
  it("véhicule, échéances, pleins, compteur et consommation", async () => {
    const { id: chauffeur } = await creerSalariePour(org, { nom: "Konan", poste: "Chauffeur", debut: "2026-01-01", salaireBase: 0 });
    const { id, code } = await creerVehiculePour(
      org,
      { immatriculation: "1234 fx 01", marque: "Toyota", modele: "Hilux", energie: "gasoil", reservoirLitres: 80, conducteurId: chauffeur, kilometrage: 50_000, assuranceLe: "2026-12-31", visiteLe: "2026-10-20" },
      user,
    );
    expect(code).toBe("VEH-001");
    const poses = await db.select({ nature: echeances.nature }).from(echeances).where(eq(echeances.actifId, id));
    expect(poses.map((e) => e.nature).sort()).toEqual(["assurance", "visite"]);

    // Le relevé d'ouverture est daté de la création. Les pleins ci-dessous sont
    // en octobre 2026 : sans ce recul, une fois l'horloge passée le 1er octobre,
    // le relevé d'ouverture est le plus récent et le compteur ne bouge plus.
    await db.update(relevesCompteur).set({ releveLe: new Date("2026-09-30T12:00:00Z") }).where(eq(relevesCompteur.actifId, id));

    // Même immatriculation, saisie autrement : refusée.
    await expect(creerVehiculePour(org, { immatriculation: "1234-FX-01" })).rejects.toThrow();

    await enregistrerPleinPour(org, { actifId: id, faitLe: new Date("2026-10-01T12:00:00Z"), volume: 60_000, montant: 49_500, kilometrage: 50_100 }, user);
    await enregistrerPleinPour(org, { actifId: id, faitLe: new Date("2026-10-04T12:00:00Z"), volume: 10_000, montant: 8_250, complet: false }, user);
    await enregistrerPleinPour(org, { actifId: id, faitLe: new Date("2026-10-08T12:00:00Z"), volume: 35_000, montant: 28_875, kilometrage: 50_600 }, user);

    // Un volume qui dépasse le réservoir est une faute de frappe.
    await expect(enregistrerPleinPour(org, { actifId: id, volume: 425_000, montant: 1 }, user)).rejects.toThrow(/réservoir/);

    const [v] = await listerVehicules(org, new Date("2026-10-10T12:00:00Z"));
    expect(v.compteur).toBe(50_600);
    expect(v.affecteA).toBe("Konan");
    expect(v.consommation).toEqual({ mlPour100: 9000, distance: 500, volume: 45_000 });
    expect(v.carburantTotal).toBe(86_625);
    expect(v.coutAuKm).toBe(173);
    expect(v.prochaine?.nature).toBe("visite");

    // Les relevés de la pompe sont des relevés du compteur.
    const releves = await db.select().from(relevesCompteur).where(eq(relevesCompteur.actifId, id));
    expect(releves.map((r) => r.valeur).sort()).toEqual([50_000, 50_100, 50_600]);

    // Retirer un plein le sort du carnet, pas le relevé constaté.
    const [{ id: pleinId }] = await db
      .select({ id: pleinsCarburant.id })
      .from(pleinsCarburant)
      .where(and(eq(pleinsCarburant.actifId, id), eq(pleinsCarburant.complet, false)));
    await retirerPleinPour(org, user, pleinId);
    const [apres] = await listerVehicules(org);
    expect(apres.carburantTotal).toBe(78_375);
  });

  it("un véhicule ouvert depuis Actifs se complète ensuite", async () => {
    const { id } = await creerActifPour(org, { designation: "Camionnette", type: "vehicule" });
    let v = (await listerVehicules(org)).find((x) => x.id === id);
    expect(v?.fiche).toBeNull();
    await completerVehiculePour(org, user, id, { immatriculation: "5678 GH 01", marque: "Renault" });
    v = (await listerVehicules(org)).find((x) => x.id === id);
    expect(v?.fiche?.immatriculation).toBe("5678 GH 01");
  });
});

describe("références d'actifs", () => {
  it("un code imposé par la reprise ne fait pas échouer la fiche suivante", async () => {
    const { organizationId } = await semerEntreprise(db, "Reprise du parc");
    await creerActifPour(organizationId, { designation: "Repris", type: "informatique", code: "INF-001" });
    const { code } = await creerEquipementPour(organizationId, { categorie: "portable" });
    expect(code).toBe("INF-002");
  });
});

describe("parc informatique en base", () => {
  it("équipement, garantie, licences et dépassement de postes", async () => {
    const { id: poste1 } = await creerEquipementPour(
      org,
      { categorie: "portable", marque: "HP", modele: "ProBook", numeroSerie: "5cg123", adresseMac: "aa-bb-cc-dd-ee-ff", garantieFin: "2027-06-30" },
      user,
    );
    const { id: poste2 } = await creerEquipementPour(org, { categorie: "fixe", marque: "Dell" }, user);

    // Numéro de série unique, adresses contrôlées.
    await expect(creerEquipementPour(org, { categorie: "portable", numeroSerie: "5CG123" })).rejects.toThrow();
    await expect(completerEquipementPour(org, user, poste2, { categorie: "fixe", adresseIp: "300.1.1.1" })).rejects.toThrow(/IP invalide/);

    const [e1] = (await listerEquipements(org)).filter((e) => e.id === poste1);
    expect(e1.fiche?.numeroSerie).toBe("5CG123");
    expect(e1.fiche?.adresseMac).toBe("AA:BB:CC:DD:EE:FF");
    expect(e1.garantie?.echeanceLe).toBe("2027-06-30");

    await expect(creerLicencePour(org, user, { logiciel: "Office", type: "abonnement", postes: 1 })).rejects.toThrow(/date de fin/);
    const licence = await creerLicencePour(org, user, { logiciel: "Microsoft 365", type: "abonnement", postes: 1, expireLe: "2027-01-31" });

    expect(await attribuerLicencePour(org, user, licence, poste1)).toEqual({ depassement: false });
    // Deuxième installation sur le même poste : sans effet.
    expect(await attribuerLicencePour(org, user, licence, poste1)).toEqual({ depassement: false });
    expect(await attribuerLicencePour(org, user, licence, poste2)).toEqual({ depassement: true });

    let [l] = await listerLicences(org, "2026-10-06");
    expect(l.utilises).toBe(2);
    expect(l.etat).toBe("depassee");

    await desattribuerLicencePour(org, user, licence, poste2);
    [l] = await listerLicences(org, "2026-10-06");
    expect(l.etat).toBe("conforme");

    const lignes = await db.select().from(echeances).where(and(eq(echeances.actifId, poste1), eq(echeances.nature, "garantie")));
    expect(lignes).toHaveLength(1);
  });

  it("ne compte plus une licence retirée d'un poste par la corbeille, et la repose", async () => {
    const { id: poste } = await creerEquipementPour(org, { categorie: "portable", marque: "Lenovo" }, user);
    const licence = await creerLicencePour(org, user, { logiciel: "Antivirus", type: "abonnement", postes: 1, expireLe: "2027-01-31" });
    await attribuerLicencePour(org, user, licence, poste);
    await db.update(licencesAttribuees).set({ deletedAt: new Date() }).where(and(eq(licencesAttribuees.licenceId, licence), eq(licencesAttribuees.actifId, poste)));

    const vue = async () => (await listerLicences(org, "2026-10-06")).find((l) => l.id === licence)!;
    expect((await vue()).utilises).toBe(0);
    expect((await listerEquipements(org)).find((e) => e.id === poste)?.licences).toBe(0);

    expect(await attribuerLicencePour(org, user, licence, poste)).toEqual({ depassement: false });
    expect((await vue()).utilises).toBe(1);
  });
});
