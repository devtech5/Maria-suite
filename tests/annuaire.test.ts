import { describe, expect, it } from "vitest";

import { resoudreDroits } from "@/lib/droits/catalogue";
import {
  adresseProValide,
  adressesAReprendre,
  appartientAuService,
  correspond,
  emailPersonnelVisible,
  filtrerAdresses,
  filtrerAnnuaire,
  formaterNumero,
  fusionnerNumeros,
  grouperParService,
  memeNumero,
  motifRefusAffectation,
  numeroValide,
  numerosVisibles,
  statutAffectation,
  type LigneAdresse,
  type LigneAnnuaire,
  type NumeroAffiche,
} from "@/modules/contacts/regles";

const compta = { id: "s-compta", libelle: "Administration et finances" };
const rh = { id: "s-rh", libelle: "Ressources humaines" };

describe("adresses professionnelles", () => {
  it("normalise et accepte une adresse du domaine de l'entreprise", () => {
    expect(adresseProValide("  Awa.Kone@Maria-Groupe.com ")).toEqual({ ok: true, adresse: "awa.kone@maria-groupe.com" });
  });

  it("refuse un autre domaine, un sous-domaine et une forme invalide", () => {
    for (const mauvaise of ["awa@gmail.com", "awa@maria-groupe.com.ci", "awa@faux-maria-groupe.com", "awa@mail.maria-groupe.com", "awa", ""]) {
      expect(adresseProValide(mauvaise).ok, mauvaise).toBe(false);
    }
  });

  it("reprend les adresses des fiches, sans doublon ni adresse déjà listée ni adresse étrangère", () => {
    const reprises = adressesAReprendre(
      [
        { employeeId: "a", emailProfessionnel: "awa@maria-groupe.com" },
        { employeeId: "b", emailProfessionnel: "AWA@maria-groupe.com" },
        { employeeId: "c", emailProfessionnel: "yao@maria-groupe.com" },
        { employeeId: "d", emailProfessionnel: "marc@autre.com" },
        { employeeId: "e", emailProfessionnel: null },
      ],
      ["yao@maria-groupe.com"],
    );
    expect(reprises).toEqual([{ employeeId: "a", adresse: "awa@maria-groupe.com" }]);
  });
});

describe("numéros de téléphone", () => {
  it("met un numéro ivoirien au format international et l'affiche par paires", () => {
    const n = numeroValide("07 07 12 34 56");
    expect(n).toEqual({ ok: true, numero: "2250707123456" });
    expect(formaterNumero("2250707123456")).toBe("+225 07 07 12 34 56");
    expect(formaterNumero("33612345678")).toBe("+33612345678");
  });

  it("refuse un numéro incomplet", () => {
    expect(numeroValide("0707").ok).toBe(false);
    expect(numeroValide("abc").ok).toBe(false);
  });

  it("reconnaît le même abonné sous deux écritures", () => {
    expect(memeNumero("07 07 12 34 56", "+225 0707123456")).toBe(true);
    expect(memeNumero("07 07 12 34 56", "07 07 12 34 57")).toBe(false);
    expect(memeNumero("", "")).toBe(false);
  });

  it("ne laisse sortir les numéros personnels qu'à qui tient l'annuaire", () => {
    const numeros: NumeroAffiche[] = [
      { numero: "2250707000001", nature: "mobile", usage: "professionnel", origine: "annuaire" },
      { numero: "2250505000002", nature: "whatsapp", usage: "personnel", origine: "annuaire" },
    ];
    expect(numerosVisibles(numeros, false).map((n) => n.numero)).toEqual(["2250707000001"]);
    expect(numerosVisibles(numeros, true)).toHaveLength(2);
  });

  it("ajoute le numéro de la fiche comme numéro personnel, sans doublon avec l'annuaire", () => {
    const annuaire: NumeroAffiche[] = [{ numero: "2250707123456", nature: "mobile", usage: "professionnel", origine: "annuaire" }];
    expect(fusionnerNumeros(annuaire, "07 07 12 34 56")).toHaveLength(1);
    const fusion = fusionnerNumeros(annuaire, "05 05 00 00 02");
    expect(fusion).toHaveLength(2);
    expect(fusion[1]).toMatchObject({ numero: "2250505000002", usage: "personnel", origine: "fiche" });
    expect(fusionnerNumeros([], "  ")).toEqual([]);
  });
});

describe("adresse e-mail personnelle", () => {
  it("ne sort que pour qui tient l'annuaire, nette et en minuscules", () => {
    expect(emailPersonnelVisible("  Awa.Kone@Gmail.com ", true)).toBe("awa.kone@gmail.com");
    expect(emailPersonnelVisible("awa.kone@gmail.com", false)).toBeNull();
    expect(emailPersonnelVisible("   ", true)).toBeNull();
    expect(emailPersonnelVisible(null, true)).toBeNull();
  });

  it("se retrouve à la recherche quand elle est présente", () => {
    const l: LigneAnnuaire = { id: "1", nom: "Koné Awa", matricule: "S1", poste: "Comptable", service: null, emails: [], numeros: [], emailPersonnel: "awa.privee@gmail.com" };
    expect(filtrerAnnuaire([l], { q: "privee@gmail" })).toHaveLength(1);
    expect(filtrerAnnuaire([{ ...l, emailPersonnel: null }], { q: "privee@gmail" })).toHaveLength(0);
  });
});

describe("affectation par service puis par personne", () => {
  const awa = { id: "awa", service: "administration et finances" };
  const yao = { id: "yao", service: "Ressources humaines" };

  it("compare le service de la fiche au libellé sans tenir compte de la casse ni des espaces", () => {
    expect(appartientAuService({ service: "  Administration   et Finances " }, compta)).toBe(true);
    expect(appartientAuService(yao, compta)).toBe(false);
    expect(appartientAuService({ service: null }, compta)).toBe(false);
  });

  it("n'admet une personne que dans le service choisi", () => {
    expect(motifRefusAffectation({ serviceId: compta.id, employeeId: awa.id }, compta, awa)).toBeNull();
    expect(motifRefusAffectation({ serviceId: compta.id, employeeId: yao.id }, compta, yao)).toMatch(/ne fait pas partie du service/);
  });

  it("exige le service avant la personne, et accepte une adresse commune ou libre", () => {
    expect(motifRefusAffectation({ serviceId: null, employeeId: awa.id }, undefined, awa)).toMatch(/d'abord le service/);
    expect(motifRefusAffectation({ serviceId: compta.id, employeeId: null }, compta, undefined)).toBeNull();
    expect(motifRefusAffectation({ serviceId: null, employeeId: null }, undefined, undefined)).toBeNull();
    expect(motifRefusAffectation({ serviceId: "inconnu", employeeId: null }, undefined, undefined)).toBe("Service introuvable.");
  });

  it("repère une adresse à revoir quand le titulaire a changé de service", () => {
    expect(statutAffectation({ serviceId: null, employeeId: null }, undefined, undefined)).toBe("libre");
    expect(statutAffectation({ serviceId: compta.id, employeeId: null }, compta, undefined)).toBe("service");
    expect(statutAffectation({ serviceId: compta.id, employeeId: "awa" }, compta, awa)).toBe("titulaire");
    expect(statutAffectation({ serviceId: compta.id, employeeId: "yao" }, compta, yao)).toBe("a_revoir");
  });

  it("range les adresses par service, les libres à la fin", () => {
    const lignes = [
      { id: "1", serviceId: rh.id },
      { id: "2", serviceId: compta.id },
      { id: "3", serviceId: null },
      { id: "4", serviceId: compta.id },
    ];
    const groupes = grouperParService(lignes, [compta, rh]);
    expect(groupes.map((g) => [g.service?.libelle ?? null, g.lignes.map((l) => l.id)])).toEqual([
      [compta.libelle, ["2", "4"]],
      [rh.libelle, ["1"]],
      [null, ["3"]],
    ]);
    expect(grouperParService([{ id: "z", serviceId: rh.id }], [compta])).toEqual([{ service: null, lignes: [{ id: "z", serviceId: rh.id }] }]);
  });
});

describe("recherche", () => {
  it("ignore accents, casse et ordre des mots", () => {
    expect(correspond("Koné Awa — Comptable", "kone comptable")).toBe(true);
    expect(correspond("Koné Awa — Comptable", "COMPTABLE awa")).toBe(true);
    expect(correspond("Koné Awa — Comptable", "yao")).toBe(false);
    expect(correspond("Koné Awa", "   ")).toBe(true);
  });

  const equipe: LigneAnnuaire[] = [
    { id: "1", nom: "Koné Awa", matricule: "S0001", poste: "Comptable", service: "Administration et finances", emails: ["awa.kone@maria-groupe.com"], numeros: [{ numero: "2250707123456" }] },
    { id: "2", nom: "Yao Marc", matricule: "S0002", poste: "Chargé RH", service: "Ressources humaines", emails: [], numeros: [{ numero: "2250505000002" }] },
    { id: "3", nom: "Traoré Ali", matricule: "S0003", poste: "Gardien", service: null, emails: [], numeros: [] },
  ];

  it("trouve un collaborateur par son nom, son poste, son adresse ou un bout de numéro", () => {
    const ids = (q: string) => filtrerAnnuaire(equipe, { q }).map((l) => l.id);
    expect(ids("kone")).toEqual(["1"]);
    expect(ids("gardien")).toEqual(["3"]);
    expect(ids("awa.kone@maria")).toEqual(["1"]);
    expect(ids("0707123456")).toEqual(["1"]);
    expect(ids("07 07 12")).toEqual(["1"]);
    expect(ids("05 05 00")).toEqual(["2"]);
    // Des chiffres cherchent un numéro, pas un matricule ni une adresse.
    expect(ids("0001")).toEqual([]);
    expect(ids("+225 07 07")).toEqual(["1"]);
    expect(ids("S0002")).toEqual(["2"]);
    expect(ids("")).toEqual(["1", "2", "3"]);
  });

  it("filtre par service, et rien ne sort d'un service inconnu", () => {
    expect(filtrerAnnuaire(equipe, { service: "ressources humaines" }).map((l) => l.id)).toEqual(["2"]);
    expect(filtrerAnnuaire(equipe, { service: "Mines et géologie" })).toEqual([]);
    expect(filtrerAnnuaire(equipe, { service: "Ressources humaines", q: "kone" })).toEqual([]);
  });

  const adresses: LigneAdresse[] = [
    { id: "a", adresse: "direction@maria-groupe.com", libelle: "Direction", actif: true, serviceId: null, serviceLibelle: null, employeeId: null, titulaire: null, statut: "libre" },
    { id: "b", adresse: "compta@maria-groupe.com", libelle: null, actif: true, serviceId: compta.id, serviceLibelle: compta.libelle, employeeId: null, titulaire: null, statut: "service" },
    { id: "c", adresse: "awa.kone@maria-groupe.com", libelle: null, actif: true, serviceId: compta.id, serviceLibelle: compta.libelle, employeeId: "awa", titulaire: "Koné Awa", statut: "titulaire" },
    { id: "d", adresse: "yao@maria-groupe.com", libelle: null, actif: true, serviceId: compta.id, serviceLibelle: compta.libelle, employeeId: "yao", titulaire: "Yao Marc", statut: "a_revoir" },
    { id: "e", adresse: "ancienne@maria-groupe.com", libelle: null, actif: false, serviceId: null, serviceLibelle: null, employeeId: null, titulaire: null, statut: "libre" },
  ];

  it("filtre les adresses par état d'affectation, les fermées à part", () => {
    const ids = (f: Parameters<typeof filtrerAdresses>[1]) => filtrerAdresses(adresses, f).map((l) => l.id);
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
    expect(ids({ etat: "libres" })).toEqual(["a"]);
    expect(ids({ etat: "service_seul" })).toEqual(["b"]);
    expect(ids({ etat: "a_revoir" })).toEqual(["d"]);
    expect(ids({ etat: "fermees" })).toEqual(["e"]);
  });

  it("filtre les adresses par service et par texte (adresse, titulaire, libellé)", () => {
    const ids = (f: Parameters<typeof filtrerAdresses>[1]) => filtrerAdresses(adresses, f).map((l) => l.id);
    expect(ids({ serviceId: compta.id })).toEqual(["b", "c", "d"]);
    expect(ids({ serviceId: compta.id, q: "kone" })).toEqual(["c"]);
    expect(ids({ q: "direction" })).toEqual(["a"]);
    expect(ids({ q: "finances" })).toEqual(["b", "c", "d"]);
    expect(ids({ q: "introuvable" })).toEqual([]);
  });
});

describe("droits de l'annuaire", () => {
  it("sépare lire et tenir l'annuaire : un rôle de personnel lit sans gérer", () => {
    for (const cleRole of ["secretaire", "commercial", "comptable", "magasinier"]) {
      const droits = resoudreDroits({ cleRole, estProprietaire: false });
      expect(droits.has("contacts.consulter"), cleRole).toBe(true);
      expect(droits.has("contacts.gerer"), cleRole).toBe(false);
    }
  });

  it("donne tout au propriétaire et au gérant, rien à un rôle sans accord", () => {
    expect(resoudreDroits({ cleRole: "gerant", estProprietaire: false }).has("contacts.gerer")).toBe(true);
    expect(resoudreDroits({ cleRole: null, estProprietaire: true }).has("contacts.gerer")).toBe(true);
    const vide = resoudreDroits({ cleRole: "role-maison", estProprietaire: false });
    expect(vide.has("contacts.consulter")).toBe(false);
    expect(vide.has("contacts.gerer")).toBe(false);
  });
});
