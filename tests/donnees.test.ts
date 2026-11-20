import { describe, expect, it } from "vitest";

import { CATALOGUE, GROUPE_AUTRES, GROUPES_DONNEES } from "@/modules/donnees/catalogue";
import {
  accesColonne,
  colonnesResume,
  libelle,
  lireSaisie,
  memeValeur,
  refusSuppressionDefinitive,
  supprimable,
  verrouLigne,
  type ColonneDecrite,
  type TableDecrite,
} from "@/modules/donnees/regles";

const colonne = (c: Partial<ColonneDecrite> & Pick<ColonneDecrite, "nom" | "genre">): ColonneDecrite => ({
  choix: null,
  obligatoire: false,
  reference: null,
  typeEnum: null,
  cle: false,
  ...c,
});

const table = (nom: string): TableDecrite => {
  const t = CATALOGUE.get(nom);
  if (!t) throw new Error(`table ${nom} absente du catalogue`);
  return t;
};

describe("catalogue des données", () => {
  it("range chaque table de l'entreprise sous un module", () => {
    expect(CATALOGUE.size).toBeGreaterThan(150);
    expect(GROUPES_DONNEES.find((g) => g.libelle === GROUPE_AUTRES)).toBeUndefined();
    const rangees = GROUPES_DONNEES.flatMap((g) => g.tables);
    expect(new Set(rangees).size).toBe(CATALOGUE.size);
  });

  it("ne contient que des tables de l'entreprise, sans les sessions", () => {
    for (const t of CATALOGUE.values()) expect(t.colonnes.some((c) => c.nom === "organization_id"), t.nom).toBe(true);
    expect(CATALOGUE.has("sessions")).toBe(false);
    expect(CATALOGUE.has("users")).toBe(false);
  });

  it("ne laisse lire aucun secret", () => {
    const courriel = table("comptes_courriel");
    expect(accesColonne(courriel.nom, courriel.colonnes.find((c) => c.nom === "mot_de_passe_chiffre")!)).toBe("masquee");
    // « chiffre_affaires » est un montant, pas un secret.
    const impots = table("impots_benefices");
    expect(accesColonne(impots.nom, impots.colonnes.find((c) => c.nom === "chiffre_affaires")!)).toBe("modifiable");
  });

  it("connaît la clé, les énumérations et les liens de chaque table", () => {
    const bons = table("bons_caisse");
    expect(bons.cle).toBe("id");
    expect(bons.colonnes.find((c) => c.nom === "statut")).toMatchObject({ genre: "choix", typeEnum: "statut_bon_caisse" });
    expect(bons.colonnes.find((c) => c.nom === "caisse_id")?.reference).toBe("comptes_tresorerie");
    expect(table("comptes_tresorerie").referencee).toContainEqual({ table: "bons_caisse", colonne: "caisse_id" });
    // Une fiche véhicule prolonge un actif : sa clé n'est pas « id ».
    expect(table("vehicules").cle).not.toBeNull();
  });
});

describe("accès aux colonnes", () => {
  it("garde en lecture seule le système, les clés et les tables gérées ailleurs", () => {
    expect(accesColonne("tiers", colonne({ nom: "numero", genre: "texte" }))).toBe("lecture");
    expect(accesColonne("tiers", colonne({ nom: "organization_id", genre: "uuid" }))).toBe("lecture");
    expect(accesColonne("tiers", colonne({ nom: "caisse_id", genre: "uuid", reference: "comptes_tresorerie" }))).toBe("lecture");
    expect(accesColonne("tiers", colonne({ nom: "approuve_le", genre: "horodatage" }))).toBe("lecture");
    expect(accesColonne("ecritures", colonne({ nom: "libelle", genre: "texte" }))).toBe("lecture");
    // Droits et modules se règlent dans « Utilisateurs » : la console ne fait que les lire.
    for (const nom of ["acces_modules_roles", "organization_modules", "memberships", "roles"]) expect(supprimable(table(nom)), nom).toBe(false);
    expect(accesColonne("tiers", colonne({ nom: "nom", genre: "texte" }))).toBe("modifiable");
    expect(accesColonne("sessions", colonne({ nom: "token_hash", genre: "texte" }))).toBe("masquee");
  });
});

describe("verrou d'une ligne", () => {
  const bons = () => table("bons_caisse");

  it("fige une ligne comptabilisée", () => {
    expect(verrouLigne(bons(), { statut: "decaisse", numero: "BC-2026-00001", ecriture: "CA-2026-00125" })).toMatch(/CA-2026-00125.*contre-passation/);
  });

  it("fige une pièce numérotée dans un statut final, même sans écriture", () => {
    expect(verrouLigne(table("pieces_commerciales"), { statut: "emise", numero: "FAC-2026-00012", ecriture_numero: null })).toMatch(/FAC-2026-00012.*figée/);
  });

  it("laisse libre une pièce encore en cours", () => {
    expect(verrouLigne(bons(), { statut: "demande", numero: "BC-2026-00002", ecriture: null })).toBeNull();
    expect(verrouLigne(table("tiers"), { nom: "Station Total" })).toBeNull();
  });

  it("garde la comptabilité en lecture seule", () => {
    expect(verrouLigne(table("ecritures"), {})).not.toBeNull();
  });
});

describe("effacement définitif", () => {
  it("n'efface qu'une ligne à la corbeille, sans numéro, que rien ne désigne", () => {
    const tiers = table("tiers");
    expect(refusSuppressionDefinitive(tiers, { deleted_at: null }, 0)).toMatch(/corbeille/);
    expect(refusSuppressionDefinitive(tiers, { deleted_at: "2026-11-19T10:00:00.000Z" }, 2)).toBe("2 lignes y font encore référence : elle reste à la corbeille.");
    expect(refusSuppressionDefinitive(tiers, { deleted_at: "2026-11-19T10:00:00.000Z" }, 0)).toBeNull();
    expect(refusSuppressionDefinitive(table("bons_caisse"), { deleted_at: "2026-11-19T10:00:00.000Z" }, 0)).toMatch(/numéro/);
  });
});

describe("lecture de la saisie", () => {
  it("lit un montant en entier, espaces compris, et refuse une virgule", () => {
    const montant = colonne({ nom: "montant", genre: "entier", obligatoire: true });
    expect(lireSaisie(montant, "150 000", 0)).toEqual({ ok: true, valeur: 150_000 });
    expect(lireSaisie(montant, "1 500 000", 0)).toEqual({ ok: true, valeur: 1_500_000 });
    expect(lireSaisie(montant, "12,5", 0)).toMatchObject({ ok: false });
    expect(lireSaisie(montant, "", 0)).toMatchObject({ ok: false, message: expect.stringMatching(/obligatoire/) });
  });

  it("vide un champ facultatif en null", () => {
    expect(lireSaisie(colonne({ nom: "telephone", genre: "texte" }), "  ", "0707")).toEqual({ ok: true, valeur: null });
  });

  it("refuse une date impossible et une valeur hors énumération", () => {
    expect(lireSaisie(colonne({ nom: "echeance", genre: "date" }), "2026-02-30", null)).toMatchObject({ ok: false });
    expect(lireSaisie(colonne({ nom: "echeance", genre: "date" }), "2026-02-28", null)).toEqual({ ok: true, valeur: "2026-02-28" });
    const statut = colonne({ nom: "statut", genre: "choix", choix: ["demande", "approuve"], obligatoire: true });
    expect(lireSaisie(statut, "approuve", "demande")).toEqual({ ok: true, valeur: "approuve" });
    expect(lireSaisie(statut, "paye", "demande")).toMatchObject({ ok: false });
  });

  it("garde la forme d'un JSON : une liste reste une liste", () => {
    const lignes = colonne({ nom: "lignes", genre: "json", obligatoire: true });
    expect(lireSaisie(lignes, '[{"a":1}]', [])).toEqual({ ok: true, valeur: [{ a: 1 }] });
    expect(lireSaisie(lignes, '{"a":1}', [])).toMatchObject({ ok: false });
    expect(lireSaisie(lignes, "[oups", [])).toMatchObject({ ok: false });
  });

  it("lit une case à cocher", () => {
    const actif = colonne({ nom: "actif", genre: "booleen", obligatoire: true });
    expect(lireSaisie(actif, "on", false)).toEqual({ ok: true, valeur: true });
    expect(lireSaisie(actif, null, true)).toEqual({ ok: true, valeur: false });
  });

  it("compare les valeurs comme la base", () => {
    expect(memeValeur(150_000, 150_000)).toBe(true);
    expect(memeValeur(null, undefined)).toBe(true);
    expect(memeValeur([{ a: 1 }], [{ a: 1 }])).toBe(true);
    expect(memeValeur("a", "b")).toBe(false);
  });
});

describe("présentation", () => {
  it("nomme tables et colonnes en clair", () => {
    expect(libelle("bons_caisse")).toBe("Bons caisse");
    expect(libelle("beneficiaire_tiers_id")).toBe("Beneficiaire tiers");
  });

  it("résume une ligne par son numéro, son statut et sa date", () => {
    const noms = colonnesResume(table("bons_caisse")).map((c) => c.nom);
    expect(noms[0]).toBe("numero");
    expect(noms).toContain("statut");
    expect(noms.at(-1)).toBe("created_at");
    expect(noms.length).toBeLessThanOrEqual(5);
  });
});
