import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { verify } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installerEntreprise, MODULES_COUPES_A_LA_NAISSANCE, PROPRIETAIRE, type Requete } from "@/db/installation";
import { POSTES_DE_DEPART } from "@/modules/personnes/postes";
import { SERVICES_DE_DEPART } from "@/modules/personnes/services";

let client: PGlite;
let requete: Requete;

beforeEach(async () => {
  client = new PGlite();
  await client.waitReady;
  await migrate(drizzle(client), { migrationsFolder: resolve("./drizzle") });
  requete = async (texte, valeurs) => (await client.query<Record<string, string>>(texte, valeurs)).rows;
});

afterEach(() => client.close());

const options = { email: PROPRIETAIRE, nom: "Administrateur", motDePasse: "provisoire-2026" };

describe("installation de MARIA GROUP SARL", () => {
  it("crée l'entreprise, ses rôles et le propriétaire, mot de passe provisoire", async () => {
    const resultat = await installerEntreprise(requete, options);
    expect(resultat).toEqual({ email: PROPRIETAIRE, motDePasse: "provisoire-2026" });

    const [compte] = await requete(
      `select u.password_hash, u.must_change_password, m.is_owner, r.key, o.name
       from users u
       join memberships m on m.user_id = u.id
       join roles r on r.id = m.role_id
       join organizations o on o.id = m.organization_id
       where u.email = $1`,
      [PROPRIETAIRE],
    );
    expect(compte).toMatchObject({ must_change_password: true, is_owner: true, key: "proprietaire", name: "MARIA GROUP SARL" });
    expect(await verify(compte.password_hash, "provisoire-2026")).toBe(true);
  });

  it("relancée, ne duplique rien et ne touche pas au mot de passe", async () => {
    await installerEntreprise(requete, options);
    const resultat = await installerEntreprise(requete, { ...options, motDePasse: "autre-mot-de-passe" });
    expect(resultat.motDePasse).toBeNull();

    const [{ entreprises }] = await requete(`select count(*)::int as entreprises from organizations`);
    const [{ comptes }] = await requete(`select count(*)::int as comptes from users`);
    expect([entreprises, comptes]).toEqual([1, 1]);

    const [{ password_hash }] = await requete(`select password_hash from users where email = $1`, [PROPRIETAIRE]);
    expect(await verify(password_hash, "provisoire-2026")).toBe(true);
  });

  it("refuse un propriétaire hors de la règle des adresses", async () => {
    await expect(installerEntreprise(requete, { ...options, email: "patron@gmail.com" })).rejects.toThrow(/refusée/);
    const [{ comptes }] = await requete(`select count(*)::int as comptes from users`);
    expect(comptes).toBe(0);
  });

  it("admet un propriétaire du domaine maria-groupe.com", async () => {
    const resultat = await installerEntreprise(requete, { ...options, email: "direction@maria-groupe.com" });
    expect(resultat.email).toBe("direction@maria-groupe.com");
  });

  it("coupe les modules hors périmètre, sans recouper ce que le propriétaire a rallumé", async () => {
    await installerEntreprise(requete, options);
    const coupes = async () =>
      (await requete(`select module_key from organization_modules where not enabled order by module_key`)).map((l) => l.module_key);
    expect(await coupes()).toEqual([...MODULES_COUPES_A_LA_NAISSANCE].sort());

    await requete(`update organization_modules set enabled = true where module_key = 'enquetes'`);
    await installerEntreprise(requete, options);
    expect(await coupes()).not.toContain("enquetes");
  });

  it("pose les postes de travail, une seule fois", async () => {
    await installerEntreprise(requete, options);
    const postes = async () => (await requete(`select libelle from postes order by ordre, libelle`)).map((l) => l.libelle);
    expect(await postes()).toEqual([...POSTES_DE_DEPART]);

    // Un poste renommé ne revient pas à la réinstallation.
    await requete(`update postes set libelle = 'Comptable principal' where libelle = 'Comptable'`);
    await installerEntreprise(requete, options);
    expect(await postes()).toContain("Comptable principal");
    expect(await postes()).not.toContain("Comptable");
    expect(await postes()).toHaveLength(POSTES_DE_DEPART.length);
  });

  it("pose les services et y range chaque poste de départ", async () => {
    await installerEntreprise(requete, options);
    await installerEntreprise(requete, options);
    const services = await requete(`select code from services order by ordre`);
    expect(services.map((l) => l.code)).toEqual(SERVICES_DE_DEPART.map((s) => s.code));

    const rattaches = await requete(
      `select p.libelle, s.code from postes p left join services s on s.id = p.service_id order by p.ordre`,
    );
    expect(rattaches).toHaveLength(POSTES_DE_DEPART.length);
    for (const ligne of rattaches) {
      expect(ligne.code, ligne.libelle).toBe(SERVICES_DE_DEPART.find((s) => s.postes.some((p) => p === ligne.libelle))?.code);
    }
  });

  it("ne crée pas le rôle d'un métier coupé, et pose les rôles transverses", async () => {
    await installerEntreprise(requete, options);
    const cles = (await requete(`select key from roles order by key`)).map((l) => l.key);
    expect(cles).toEqual(["commercial", "comptable", "gerant", "proprietaire", "secretaire"]);
    const [stock] = await requete(`select enabled from organization_modules where module_key = 'stock'`);
    expect(stock.enabled).toBe(false);
  });

  it("porte les coordonnées du papier à en-tête, sans inventer le NCC", async () => {
    await installerEntreprise(requete, options);
    const [o] = await requete(`select address, phone, email, site_web, rccm, capital_social, pied_de_page, tax_id from organizations`);
    expect(o).toMatchObject({
      address: "Cocody Angré 7e tranche, cour des comptes",
      phone: "+225 27 22 63 98 / 07 04 61 74 74",
      email: "hello@maria-groupe.com",
      site_web: "www.maria-groupe.com",
      rccm: "N° CI-TDI-01-2026-B12-00406",
      tax_id: null,
    });
    expect(Number(o.capital_social)).toBe(10_000_000);
    expect(o.pied_de_page).toBe("Siège social : Yamoussoukro, quartier Kami CAFOP");
  });

  it("la migration 0090 met à jour une entreprise déjà installée, sans toucher au NCC saisi", async () => {
    await requete(`insert into organizations (name, slug, tax_id, phone) values ('MARIA GROUP SARL', 'maria-group', 'NCC-SAISI', '000')`);
    await client.exec(readFileSync(resolve("./drizzle/0090_entreprise_coordonnees.sql"), "utf8"));
    const [o] = await requete(`select phone, tax_id, rccm, capital_social, version from organizations`);
    expect(o).toMatchObject({ phone: "+225 27 22 63 98 / 07 04 61 74 74", tax_id: "NCC-SAISI", rccm: "N° CI-TDI-01-2026-B12-00406" });
    expect(Number(o.capital_social)).toBe(10_000_000);
    expect(Number(o.version)).toBe(2);
  });

  it("la migration 0091 ne garde que le siège, et respecte un pied saisi à la main", async () => {
    await requete(`insert into organizations (name, slug) values ('MARIA GROUP SARL', 'maria-group')`);
    await client.exec(readFileSync(resolve("./drizzle/0090_entreprise_coordonnees.sql"), "utf8"));
    await client.exec(readFileSync(resolve("./drizzle/0091_pied_de_page_siege.sql"), "utf8"));
    expect((await requete(`select pied_de_page from organizations`))[0].pied_de_page).toBe("Siège social : Yamoussoukro, quartier Kami CAFOP");

    await requete(`update organizations set pied_de_page = 'Compte BICICI 123'`);
    await client.exec(readFileSync(resolve("./drizzle/0091_pied_de_page_siege.sql"), "utf8"));
    expect((await requete(`select pied_de_page from organizations`))[0].pied_de_page).toBe("Compte BICICI 123");
  });

  it("refuse une base qui porte une autre entreprise", async () => {
    await requete(`insert into organizations (name, slug) values ('Autre', 'autre')`);
    await expect(installerEntreprise(requete, options)).rejects.toThrow(/autre entreprise/);
  });
});
