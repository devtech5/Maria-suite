import { describe, expect, it } from "vitest";

import { presetRole, resoudreDroits } from "@/lib/droits/catalogue";
import {
  depotDossierPermis,
  dossierVisible,
  ENVOI_MAX_OCTETS,
  extensionDe,
  familleDe,
  libelleFormat,
  TYPES_ARCHIVABLES,
  heuresAvantScellement,
  partQuota,
  QUOTA_OCTETS,
  refusEnvoi,
  resumeDepot,
  resumeDepotCourt,
  resumeVisibilite,
  resumeVisibiliteCourt,
  retraitPossible,
  tailleLisible,
} from "@/modules/archives/calcul";
import { empreinte } from "@/modules/archives/empreinte";

const pdf = (taille: number, nom = "contrat.pdf") => ({ nom, typeMime: "application/pdf", taille });

describe("empreinte", () => {
  it("rend le SHA-256 de référence", () => {
    expect(empreinte(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("change au moindre octet", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(empreinte(a)).not.toBe(empreinte(b));
    expect(empreinte(a.buffer)).toBe(empreinte(new Uint8Array([1, 2, 3])));
  });
});

describe("délai de retrait", () => {
  const depot = new Date("2026-10-04T08:00:00Z");

  it("reste ouvert 24 h, puis l'archive est scellée", () => {
    expect(retraitPossible(depot, new Date("2026-10-05T07:59:59Z"))).toBe(true);
    expect(retraitPossible(depot, new Date("2026-10-05T08:00:00Z"))).toBe(false);
  });

  it("compte les heures restantes, arrondies au-dessus", () => {
    expect(heuresAvantScellement(depot, new Date("2026-10-04T08:00:00Z"))).toBe(24);
    expect(heuresAvantScellement(depot, new Date("2026-10-05T07:30:00Z"))).toBe(1);
    expect(heuresAvantScellement(depot, new Date("2026-10-06T08:00:00Z"))).toBe(0);
  });
});

describe("contrôle d'un envoi", () => {
  it("accepte un lot conforme", () => {
    expect(refusEnvoi([pdf(1_000), { nom: "releve.csv", typeMime: "text/csv", taille: 500 }], 0)).toBeNull();
  });

  it("refuse un envoi vide, trop nombreux ou trop lourd", () => {
    expect(refusEnvoi([], 0)).toMatch(/au moins un fichier/);
    expect(refusEnvoi(Array.from({ length: 11 }, () => pdf(10)), 0)).toMatch(/10 fichiers au plus/);
    expect(refusEnvoi([pdf(ENVOI_MAX_OCTETS), pdf(1)], 0)).toMatch(/trop lourd/);
  });

  it("refuse un format hors liste, même renommé", () => {
    expect(refusEnvoi([{ nom: "facture.pdf.exe", typeMime: "application/x-msdownload", taille: 10 }], 0)).toMatch(
      /format non accepté/,
    );
  });

  it("refuse ce qui dépasse le quota de la personne", () => {
    expect(refusEnvoi([pdf(2_000)], QUOTA_OCTETS - 1_000)).toMatch(/Espace insuffisant/);
    expect(refusEnvoi([pdf(1_000)], QUOTA_OCTETS - 1_000)).toBeNull();
  });
});

describe("présentation", () => {
  it("range les formats par famille", () => {
    expect(familleDe("application/pdf")).toBe("pdf");
    expect(familleDe("text/csv")).toBe("tableur");
    expect(familleDe("application/inconnu")).toBe("autre");
  });

  it("nomme chaque format accepté en clair", () => {
    expect(libelleFormat("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("Word");
    expect(libelleFormat("image/jpeg")).toBe("Image JPEG");
    expect(libelleFormat("application/inconnu")).toBe("Fichier");
    // Aucun format accepté ne retombe sur le libellé générique de sa famille.
    for (const type of Object.keys(TYPES_ARCHIVABLES)) expect(libelleFormat(type)).not.toBe("Fichier");
  });

  it("résume la visibilité d'un dossier en deux mots", () => {
    expect(resumeVisibiliteCourt({ visibilite: "tous", designes: [] })).toBe("Tous");
    expect(resumeVisibiliteCourt({ visibilite: "selection", designes: [] })).toBe("Masqué");
    expect(resumeVisibiliteCourt({ visibilite: "selection", designes: ["a", "b"] })).toBe("2 membres");
  });

  it("lit l'extension du nom de fichier", () => {
    expect(extensionDe("Contrat signé.v2.pdf")).toBe("PDF");
    expect(extensionDe("releve.xlsx")).toBe("XLSX");
    expect(extensionDe("sans-extension")).toBe("");
    expect(extensionDe(".cache")).toBe("");
  });

  it("donne une taille et une part de quota lisibles", () => {
    expect(tailleLisible(2_048)).toBe("2 Ko");
    expect(tailleLisible(1_572_864)).toBe("1,5 Mo");
    expect(tailleLisible(QUOTA_OCTETS)).toBe("500 Mo");
    expect(partQuota(QUOTA_OCTETS / 4)).toBe(25);
    expect(partQuota(QUOTA_OCTETS * 2)).toBe(100);
  });
});

describe("droits d'archivage", () => {
  it("laisse chacun archiver, et réserve la supervision au propriétaire et au gérant", () => {
    const magasinier = resoudreDroits({ cleRole: "magasinier", estProprietaire: false });
    expect(magasinier.has("archives.deposer")).toBe(true);
    expect(magasinier.has("archives.superviser")).toBe(false);

    expect(presetRole("gerant")?.droits).toContain("archives.superviser");
    expect(resoudreDroits({ cleRole: "comptable", estProprietaire: false }).has("archives.superviser")).toBe(false);
    expect(resoudreDroits({ cleRole: null, estProprietaire: true }).has("archives.superviser")).toBe(true);
  });
});

describe("dossiers partagés", () => {
  const awa = "awa";
  const kone = "kone";
  const choisis = { visibilite: "selection" as const, depotOuvert: false, designes: [awa] };

  it("ne montre un dossier « sélection » qu'aux membres désignés", () => {
    expect(dossierVisible(choisis, awa, false)).toBe(true);
    expect(dossierVisible(choisis, kone, false)).toBe(false);
  });

  it("montre un dossier « tous » à chacun, et tout dossier à qui les gère", () => {
    expect(dossierVisible({ ...choisis, visibilite: "tous" }, kone, false)).toBe(true);
    expect(dossierVisible({ ...choisis, designes: [] }, kone, true)).toBe(true);
  });

  it("masque à tous un dossier sans désigné", () => {
    const masque = { ...choisis, designes: [] };
    expect(dossierVisible(masque, awa, false)).toBe(false);
    expect(resumeVisibilite(masque)).toMatch(/^Masqué/);
  });

  it("n'ouvre le dépôt qu'à qui voit le dossier, et seulement s'il est ouvert", () => {
    expect(depotDossierPermis(choisis, awa, false)).toBe(false);
    expect(depotDossierPermis({ ...choisis, depotOuvert: true }, awa, false)).toBe(true);
    expect(depotDossierPermis({ ...choisis, depotOuvert: true }, kone, false)).toBe(false);
    expect(depotDossierPermis(choisis, kone, true)).toBe(true);
  });

  it("confie la gestion des dossiers au gérant comme au propriétaire, pas au magasinier", () => {
    expect(presetRole("gerant")?.droits).toContain("archives.dossier.gerer");
    expect(resoudreDroits({ cleRole: null, estProprietaire: true }).has("archives.dossier.gerer")).toBe(true);
    expect(resoudreDroits({ cleRole: "magasinier", estProprietaire: false }).has("archives.dossier.gerer")).toBe(false);
  });
});

describe("dépôt accordé membre par membre", () => {
  const awa = "awa";
  const kone = "kone";
  const yao = "yao";
  /** Dossier visible de tous : on accorde de voir à beaucoup, de déposer à quelques-uns. */
  const ouvertATous = { visibilite: "tous" as const, depotOuvert: false, designes: [awa], deposants: [awa] };

  it("laisse déposer le déposant nommé, et lui seul, même si tout le monde voit le dossier", () => {
    expect(depotDossierPermis(ouvertATous, awa, false)).toBe(true);
    expect(depotDossierPermis(ouvertATous, kone, false)).toBe(false);
    expect(dossierVisible(ouvertATous, kone, false)).toBe(true);
  });

  it("garde le dépôt au gestionnaire quoi qu'il arrive", () => {
    expect(depotDossierPermis({ ...ouvertATous, deposants: [] }, yao, true)).toBe(true);
  });

  it("n'ouvre pas le dépôt à qui ne voit pas, même s'il est « déposant » d'un dossier masqué à lui", () => {
    const choisis = { visibilite: "selection" as const, depotOuvert: false, designes: [awa], deposants: [awa] };
    expect(depotDossierPermis(choisis, kone, false)).toBe(false);
  });

  it("l'ouverture à tous ceux qui voient l'emporte sur la liste des déposants", () => {
    const tous = { visibilite: "selection" as const, depotOuvert: true, designes: [awa, kone], deposants: [] };
    expect(depotDossierPermis(tous, kone, false)).toBe(true);
    expect(depotDossierPermis(tous, yao, false)).toBe(false);
  });

  it("dit en clair qui dépose", () => {
    expect(resumeDepot({ depotOuvert: true, deposants: [] })).toMatch(/peuvent y déposer/);
    expect(resumeDepot({ depotOuvert: false, deposants: [awa, kone] })).toMatch(/2 membres/);
    expect(resumeDepot({ depotOuvert: false, deposants: [awa] })).toMatch(/1 membre —/);
    expect(resumeDepot({ depotOuvert: false, deposants: [] })).toBe("Lecture seule pour les membres");
    expect(resumeDepotCourt({ depotOuvert: false, deposants: [awa, kone] })).toBe("Dépôt : 2 membres");
    expect(resumeDepotCourt({ depotOuvert: false })).toBe("Lecture seule");
  });
});

