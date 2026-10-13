import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { verify } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installerEntreprise, PROPRIETAIRE, type Requete } from "@/db/installation";

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

  it("refuse une base qui porte une autre entreprise", async () => {
    await requete(`insert into organizations (name, slug) values ('Autre', 'autre')`);
    await expect(installerEntreprise(requete, options)).rejects.toThrow(/autre entreprise/);
  });
});
