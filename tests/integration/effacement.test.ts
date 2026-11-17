import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { effacerDonnees, planEffacement, TABLES_GARDEES } from "@/db/effacement";
import { installerEntreprise, PROPRIETAIRE, type Requete } from "@/db/installation";

let client: PGlite;
let requete: Requete;

beforeEach(async () => {
  client = new PGlite();
  await client.waitReady;
  await migrate(drizzle(client), { migrationsFolder: resolve("./drizzle") });
  requete = async (texte, valeurs) => (await client.query<Record<string, string>>(texte, valeurs)).rows;
  await installerEntreprise(requete, { email: PROPRIETAIRE, nom: "Administrateur", motDePasse: "provisoire-2026" });
});

afterEach(() => client.close());

const compter = async (table: string) => Number((await requete(`select count(*)::int as n from "${table}"`))[0].n);

/** Des saisies d'essai : un salarié, son congé, un compteur de pièces, une ligne d'audit. */
async function saisirDesEssais() {
  const [{ org }] = await requete(`select id as org from organizations`);
  const [{ moi }] = await requete(`select id as moi from users`);
  const salarie = "0190f000-0000-7000-8000-0000000000a1";
  await requete(`insert into employees (id, organization_id, matricule, nom, poste, debut) values ($1, $2, 'ESSAI-1', 'Salarié d''essai', 'Testeur', '2026-01-05')`, [salarie, org]);
  await requete(
    `insert into conges (id, organization_id, employee_id, numero, debut, fin, jours_centiemes, demande_par_user_id)
     values ('0190f000-0000-7000-8000-0000000000a2', $1, $2, 'CONG-2026-00001', '2026-02-02', '2026-02-06', 500, $3)`,
    [org, salarie, moi],
  );
  await requete(
    `insert into document_sequences (id, organization_id, key, scope, period_key, next_value) values ('0190f000-0000-7000-8000-0000000000a3', $1, 'conge', '', '2026', 2)`,
    [org],
  );
}

describe("effacement des données d'essai", () => {
  it("dresse l'état des lieux sans rien toucher", async () => {
    await saisirDesEssais();
    const plan = await planEffacement(requete);
    expect(plan.organisation.nom).toBe("MARIA GROUP SARL");
    const lignes = Object.fromEntries(plan.effacees.map((t) => [t.table, t.lignes]));
    expect(lignes).toMatchObject({ employees: 1, conges: 1, document_sequences: 1 });
    for (const table of TABLES_GARDEES) expect(plan.effacees.map((t) => t.table)).not.toContain(table);
    expect(await compter("employees")).toBe(1);
  });

  it("efface les saisies, garde l'entreprise, les comptes, les rôles et les référentiels", async () => {
    await saisirDesEssais();
    const avant = Object.fromEntries(await Promise.all(["organizations", "users", "memberships", "roles", "postes", "services", "organization_modules"].map(async (t) => [t, await compter(t)])));

    await effacerDonnees(requete, await planEffacement(requete));

    for (const t of ["employees", "conges", "document_sequences", "audit_logs"]) expect(await compter(t)).toBe(0);
    for (const [t, n] of Object.entries(avant)) expect(await compter(t)).toBe(n);
    expect(avant.users).toBeGreaterThan(0);
    expect(avant.postes).toBeGreaterThan(0);
    // Le propriétaire se connecte toujours.
    const [compte] = await requete(`select m.is_owner from users u join memberships m on m.user_id = u.id where u.email = $1`, [PROPRIETAIRE]);
    expect(String(compte.is_owner)).toBe("true");
  });

  it("refuse une base qui porte plusieurs entreprises", async () => {
    await requete(`insert into organizations (name, slug, country_code, currency, timezone) values ('AUTRE SARL', 'autre', 'CI', 'XOF', 'Africa/Abidjan')`);
    await expect(planEffacement(requete)).rejects.toThrow(/2 entreprises/);
  });
});
