import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { utilisateursAyantDroit } from "@/lib/droits/destinataires";
import { newId } from "@/lib/ids";
import { signerLien, verifierLien } from "@/lib/liens-publics";
import { desinscrire, envoyerMessage } from "@/modules/communication/envoi";
import { marquerLues, nombreNonLues, notifier, notifierDetenteurs } from "@/modules/communication/notifications";
import { creerCampagnePour, destinataires, envoyerCampagnePour } from "@/modules/communication/campagnes";
import { envois } from "@/modules/communication/schema";
import { creerTiersDans } from "@/modules/tiers/creation";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let proprietaire: string;
let secretaire: string;
let comptable: string;

async function membre(cleRole: string, estProprietaire = false): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: cleRole, email: `${userId}@exemple.test` });
  let [role] = await db.select().from(roles).where(and(eq(roles.organizationId, org), eq(roles.key, cleRole)));
  if (!role) {
    const id = newId();
    await db.insert(roles).values({ id, organizationId: org, key: cleRole, name: cleRole });
    [role] = await db.select().from(roles).where(eq(roles.id, id));
  }
  await db.insert(memberships).values({ id: newId(), organizationId: org, userId, roleId: role.id, isOwner: estProprietaire, status: "actif" });
  return userId;
}

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  proprietaire = await membre("proprietaire", true);
  secretaire = await membre("secretaire");
  comptable = await membre("comptable");
});
afterAll(async () => fermer());

describe("destinataires d'une notification", () => {
  it("seuls ceux qui détiennent le droit sont prévenus", async () => {
    const approbateurs = await utilisateursAyantDroit(org, "tresorerie.bon.approuver");
    expect(approbateurs).toContain(proprietaire);
    expect(approbateurs).not.toContain(secretaire);
    // Le comptable tient la trésorerie, il n'en approuve pas les dépenses.
    expect(approbateurs).not.toContain(comptable);
    expect(await utilisateursAyantDroit(org, "messagerie.utiliser")).toEqual(expect.arrayContaining([proprietaire, secretaire, comptable]));
  });

  it("l'auteur ne se notifie pas sa propre demande ; lire efface le compteur", async () => {
    await notifierDetenteurs(org, "tresorerie.bon.approuver", { categorie: "bon", titre: "Bon à approuver" }, proprietaire);
    expect(await nombreNonLues(org, proprietaire)).toBe(0);

    await notifier(org, [secretaire, secretaire], { categorie: "tache", titre: "Nouvelle tâche" });
    expect(await nombreNonLues(org, secretaire)).toBe(1);
    await marquerLues(org, secretaire);
    expect(await nombreNonLues(org, secretaire)).toBe(0);
  });
});

describe("envois vers l'extérieur", () => {
  it("trace l'échec quand aucun fournisseur n'est branché, et retient un désinscrit", async () => {
    const r = await envoyerMessage(org, proprietaire, { canal: "email", destinataire: "Client@Exemple.ci", corps: "Votre facture", origine: "facture", entreprise: "Essai" });
    expect(r.statut).toBe("echec");
    const [ligne] = await db.select().from(envois).where(eq(envois.id, r.id));
    expect(ligne.destinataire).toBe("client@exemple.ci");
    expect(ligne.raison).toMatch(/fournisseur/);

    await desinscrire(org, "email", "client@exemple.ci", "lien");
    const retenu = await envoyerMessage(org, proprietaire, { canal: "email", destinataire: "client@exemple.ci", corps: "Promo", origine: "campagne", entreprise: "Essai" });
    expect(retenu.statut).toBe("ignore");

    const invalide = await envoyerMessage(org, null, { canal: "whatsapp", destinataire: "12 34", corps: "x", origine: "essai", entreprise: "Essai" });
    expect(invalide).toMatchObject({ statut: "ignore", raison: "Numéro de téléphone invalide." });
  });
});

describe("messages groupés", () => {
  it("personnel dans l'application, clients par e-mail ; un envoi ne part qu'une fois", async () => {
    const avant = await nombreNonLues(org, secretaire);
    const interne = await creerCampagnePour(org, proprietaire, { titre: "Fermeture", public: "personnel", canaux: ["application"], filtre: {}, corps: "Fermé le 15 août" });
    const c1 = await envoyerCampagnePour(org, proprietaire, interne, "Essai");
    expect(c1.numero).toMatch(/^MSG-/);
    expect(c1.envoyes).toBe(3);
    expect(await nombreNonLues(org, secretaire)).toBe(avant + 1);
    await expect(envoyerCampagnePour(org, proprietaire, interne, "Essai")).rejects.toThrow(/déjà envoyé/);

    await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Client avec e-mail", email: "a@exemple.ci", ville: "Bouaké" }));
    await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Client sans adresse", ville: "Bouaké" }));
    await db.transaction((tx) => creerTiersDans(tx, org, { nom: "Client d'ailleurs", email: "b@exemple.ci", ville: "Abidjan" }));
    expect((await destinataires(org, "clients", { ville: "bouaké" })).map((d) => d.nom).sort()).toEqual(["Client avec e-mail", "Client sans adresse"]);

    await expect(creerCampagnePour(org, proprietaire, { titre: "x", public: "clients", canaux: ["application"], filtre: {}, corps: "x" })).rejects.toThrow(/réservée au personnel/);
    const externe = await creerCampagnePour(org, proprietaire, { titre: "Promo", public: "clients", canaux: ["email"], filtre: { ville: "Bouaké" }, objet: "Promo", corps: "Bonjour {nom}" });
    const c2 = await envoyerCampagnePour(org, proprietaire, externe, "Essai");
    // Sans fournisseur d'e-mails : un échec tracé, un retenu faute d'adresse.
    expect({ destinataires: c2.destinataires, envoyes: c2.envoyes, echecs: c2.echecs, ignores: c2.ignores }).toEqual({ destinataires: 2, envoyes: 0, echecs: 1, ignores: 1 });
    const [ligne] = await db.select().from(envois).where(eq(envois.campagneId, externe));
    expect(ligne.corps).toBe("Bonjour Client avec e-mail");
  });
});

describe("liens publics signés", () => {
  it("un lien intact s'ouvre, un lien modifié ou périmé non", () => {
    const jeton = signerLien(["piece", org, "abc"], 60);
    expect(verifierLien(jeton)).toEqual(["piece", org, "abc"]);

    const [charge, signature] = jeton.split(".");
    const autre = Buffer.from(Buffer.from(charge, "base64url").toString().replace("abc", "abd")).toString("base64url");
    expect(verifierLien(`${autre}.${signature}`)).toBeNull();

    const ancien = signerLien(["piece", org, "abc"], 1, Date.now() - 3 * 86_400_000);
    expect(verifierLien(ancien)).toBeNull();
  });
});
