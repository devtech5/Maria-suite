import { describe, expect, it } from "vitest";

import {
  ADRESSE_PROPRIETAIRE,
  DUREE_VERROU_MINUTES,
  ECHECS_AVANT_VERROU,
  apresEchec,
  estVerrouille,
  motDePasseProvisoire,
  motifRefusMotDePasse,
  adresseAutorisee,
  normaliserEmail,
} from "@/lib/auth/identifiants";

describe("adresseAutorisee", () => {
  it("admet le propriétaire, seule adresse Gmail", () => {
    expect(adresseAutorisee(ADRESSE_PROPRIETAIRE)).toBe(true);
    expect(adresseAutorisee("  Michael.Kadio05@Gmail.com ")).toBe(true);
    expect(adresseAutorisee("awa@gmail.com")).toBe(false);
  });

  it("admet le domaine maria-groupe.com, quelle que soit la casse", () => {
    expect(adresseAutorisee("awa.kone@maria-groupe.com")).toBe(true);
    expect(adresseAutorisee("Awa.Kone@MARIA-GROUPE.COM")).toBe(true);
  });

  it("refuse les domaines qui s'en approchent", () => {
    expect(adresseAutorisee("awa@maria-group.com")).toBe(false);
    expect(adresseAutorisee("awa@compta.maria-groupe.com")).toBe(false);
    expect(adresseAutorisee("awa@maria-groupe.com.ci")).toBe(false);
    expect(adresseAutorisee("awa@faux-maria-groupe.com")).toBe(false);
    expect(adresseAutorisee("awa@boutique.ci")).toBe(false);
  });

  it("refuse l'informe et le vide", () => {
    expect(adresseAutorisee("@maria-groupe.com")).toBe(false);
    expect(adresseAutorisee("a@b@maria-groupe.com")).toBe(false);
    expect(adresseAutorisee("maria-groupe.com")).toBe(false);
    expect(adresseAutorisee("")).toBe(false);
    expect(adresseAutorisee(null)).toBe(false);
  });
});

describe("normaliserEmail", () => {
  it("ramène une adresse en minuscules, sans espace", () => {
    expect(normaliserEmail("  Awa.Kone@Boutique.CI ")).toBe("awa.kone@boutique.ci");
  });

  it("refuse l'évidemment faux", () => {
    expect(normaliserEmail("awa")).toBeNull();
    expect(normaliserEmail("awa@boutique")).toBeNull();
    expect(normaliserEmail("awa kone@boutique.ci")).toBeNull();
    expect(normaliserEmail("@boutique.ci")).toBeNull();
    expect(normaliserEmail("")).toBeNull();
  });
});

describe("motifRefusMotDePasse", () => {
  it("accepte une phrase longue sans caractère spécial", () => {
    expect(motifRefusMotDePasse("le riz de yopougon")).toBeNull();
  });

  it("refuse trop court, trop long, répété ou trop courant", () => {
    expect(motifRefusMotDePasse("court")).toMatch(/au moins 8/);
    expect(motifRefusMotDePasse("x".repeat(129))).toMatch(/dépasser/);
    expect(motifRefusMotDePasse("aaaaaaaaaa")).toMatch(/répété/);
    expect(motifRefusMotDePasse("Azertyuiop")).toMatch(/plus utilisés/);
  });

  it("refuse un mot de passe qui reprend l'adresse", () => {
    expect(
      motifRefusMotDePasse("kouadio2026", { email: "kouadio@boutique.ci" }),
    ).toMatch(/adresse/);
  });
});

describe("verrou après échecs", () => {
  const t0 = new Date("2026-10-03T10:00:00Z");

  it("compte les échecs sans verrouiller avant le seuil", () => {
    let echecs = 0;
    for (let i = 1; i < ECHECS_AVANT_VERROU; i += 1) {
      const etat = apresEchec(echecs, t0);
      expect(etat.lockedUntil).toBeNull();
      echecs = etat.failedLogins;
    }
    expect(echecs).toBe(ECHECS_AVANT_VERROU - 1);
  });

  it("verrouille au seuil, pour la durée prévue, et remet le compteur à zéro", () => {
    const etat = apresEchec(ECHECS_AVANT_VERROU - 1, t0);
    expect(etat.failedLogins).toBe(0);
    expect(etat.lockedUntil?.getTime()).toBe(
      t0.getTime() + DUREE_VERROU_MINUTES * 60 * 1000,
    );
    expect(estVerrouille(etat.lockedUntil, t0)).toBe(true);
    expect(
      estVerrouille(etat.lockedUntil, new Date(t0.getTime() + 16 * 60 * 1000)),
    ).toBe(false);
  });

  it("n'est pas verrouillé sans date", () => {
    expect(estVerrouille(null)).toBe(false);
  });
});

describe("motDePasseProvisoire", () => {
  it("forme quatre groupes de quatre, sans caractère ambigu", () => {
    let graine = 7;
    const mdp = motDePasseProvisoire((max) => (graine = (graine * 31 + 11) % 997) % max);
    expect(mdp).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(mdp).not.toMatch(/[01ilo]/);
  });

  it("passe lui-même la règle des mots de passe", () => {
    const mdp = motDePasseProvisoire((max) => Math.floor(Math.random() * max));
    expect(motifRefusMotDePasse(mdp)).toBeNull();
  });
});
