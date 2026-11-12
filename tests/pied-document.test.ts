import { describe, expect, it } from "vitest";

import { lignesPied, type EntreePied } from "@/lib/pied-document";

const MARIA: EntreePied = {
  nom: "MARIA GROUP SARL",
  formeJuridique: "SARL",
  rccm: "N° CI-TDI-01-2026-B12-00406",
  registre: "RCCM",
  identifiantFiscal: null,
  sigleFiscal: "NCC",
  capital: "10 000 000 FCFA",
  regimeFiscal: null,
  mentions: "Siège social : Yamoussoukro, quartier Kami CAFOP",
  adresse: "Cocody Angré 7e tranche, cour des comptes",
  ville: null,
  telephone: "+225 27 22 63 98 / 07 04 61 74 74",
  email: "hello@maria-groupe.com",
  siteWeb: "www.maria-groupe.com",
};

describe("pied de page du papier à en-tête", () => {
  it("met identifiants et coordonnées sur deux lignes, comme le papier", () => {
    expect(lignesPied(MARIA)).toEqual([
      "MARIA GROUP - RCCM N° CI-TDI-01-2026-B12-00406 · Capital : 10 000 000 FCFA · Siège social : Yamoussoukro, quartier Kami CAFOP",
      "Bureaux : Cocody Angré 7e tranche, cour des comptes · Tél. : +225 27 22 63 98 / 07 04 61 74 74 · hello@maria-groupe.com · www.maria-groupe.com",
    ]);
  });

  it("ajoute le NCC une fois saisi, jamais un « [N°] » en attendant", () => {
    expect(lignesPied(MARIA)[0]).not.toMatch(/NCC|\[/);
    expect(lignesPied({ ...MARIA, identifiantFiscal: "1234567 A" })[0]).toContain("RCCM N° CI-TDI-01-2026-B12-00406 · NCC 1234567 A · Capital");
  });

  it("range plusieurs mentions libres à la suite, sur la même ligne", () => {
    expect(lignesPied({ ...MARIA, mentions: "Siège social : Yamoussoukro\nCompte BICICI 123" })[0]).toMatch(/Siège social : Yamoussoukro · Compte BICICI 123$/);
  });

  it("n'imprime que ce qui existe", () => {
    expect(lignesPied({ ...MARIA, rccm: null, capital: null, mentions: null, adresse: null, telephone: null, email: null, siteWeb: null })).toEqual([]);
    expect(lignesPied({ ...MARIA, rccm: null, capital: null, mentions: null })).toEqual([expect.stringMatching(/^Bureaux/)]);
  });
});
