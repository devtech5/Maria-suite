import { describe, expect, it } from "vitest";

import {
  destinataires,
  gestesPv,
  normaliserDiffusion,
  normaliserParticipants,
  normaliserPoints,
  referencePv,
  refusSoumission,
  suiviLectures,
  type Diffusion,
} from "@/modules/pv/regles";

const A = "01a1d607-8a7c-76cc-b48a-fea2e68679d1";
const B = "01a1d607-8a7c-76cc-b48a-fea2e68679d2";
const C = "01a1d607-8a7c-76cc-b48a-fea2e68679d3";
const S1 = "01a1d607-8a7c-76cc-b48a-fea2e6867901";

const pv = (p: Partial<Parameters<typeof refusSoumission>[0]> = {}) => ({
  objet: "Réunion de chantier n° 4",
  type: "reunion" as const,
  participants: [{ nom: "Awa Koné", qualite: "Conductrice", presence: "present" as const }],
  points: [{ titre: "Avancement", texte: "Dalle coulée.", decisions: [] }],
  diffusion: { tous: true, services: [], comptes: [] } as Diffusion,
  confidentiel: false,
  ...p,
});

describe("contenu d'un PV", () => {
  it("nettoie les participants : sans nom, la ligne tombe ; présence inconnue = présent", () => {
    expect(
      normaliserParticipants([
        { nom: "  Awa   Koné ", qualite: "Conductrice", presence: "excuse", userId: A },
        { nom: "", qualite: "x" },
        { nom: "Yao", presence: "nimporte", userId: "pas-un-id" },
      ]),
    ).toEqual([
      { nom: "Awa Koné", qualite: "Conductrice", presence: "excuse", userId: A },
      { nom: "Yao", qualite: "", presence: "present", userId: null },
    ]);
    expect(normaliserParticipants("n'importe quoi")).toEqual([]);
  });

  it("garde les points utiles et leurs décisions non vides", () => {
    expect(normaliserPoints([{ titre: "Budget", texte: "  ok\r\n ", decisions: ["Valider", " ", "Relancer"] }, { titre: "", texte: "" }])).toEqual([
      { titre: "Budget", texte: "ok", decisions: ["Valider", "Relancer"] },
    ]);
  });

  it("ne garde que des identifiants dans la diffusion", () => {
    expect(normaliserDiffusion({ tous: "oui", services: [S1, "x", S1], comptes: [A] })).toEqual({ tous: false, services: [S1], comptes: [A] });
  });

  it("dit ce qui manque avant de soumettre", () => {
    expect(refusSoumission(pv())).toBeNull();
    expect(refusSoumission(pv({ objet: " " }))).toMatch(/objet/);
    expect(refusSoumission(pv({ points: [] }))).toMatch(/au moins un point/);
    expect(refusSoumission(pv({ participants: [{ nom: "Awa", qualite: "", presence: "absent" }] }))).toMatch(/participant présent/);
    expect(refusSoumission(pv({ type: "rapport", participants: [] }))).toBeNull();
    expect(refusSoumission(pv({ diffusion: { tous: false, services: [], comptes: [] } }))).toMatch(/diffuser/);
    expect(refusSoumission(pv({ confidentiel: true }))).toMatch(/confidentiel/);
  });

  it("écrit la référence avec sa version", () => {
    expect(referencePv("PV-2026-00012", 1)).toBe("PV-2026-00012");
    expect(referencePv("PV-2026-00012", 2)).toBe("PV-2026-00012 (version 2)");
    expect(referencePv(null, 1)).toMatch(/brouillon/);
  });
});

describe("cycle de validation", () => {
  const redacteur = { redacteur: true, valideur: false };
  const direction = { redacteur: false, valideur: true };
  const tiers = { redacteur: false, valideur: false };

  it("le rédacteur rédige et soumet ; la direction publie", () => {
    expect(gestesPv("brouillon", redacteur)).toEqual(["modifier", "soumettre", "supprimer"]);
    expect(gestesPv("brouillon", direction)).toEqual(["modifier", "publier", "supprimer"]);
    expect(gestesPv("a_valider", direction)).toEqual(["renvoyer", "publier"]);
    expect(gestesPv("a_valider", redacteur)).toEqual(["renvoyer"]);
    expect(gestesPv("publie", redacteur)).toEqual(["reviser"]);
  });

  it("ne laisse rien à qui n'est ni rédacteur ni direction", () => {
    expect(gestesPv("brouillon", tiers)).toEqual([]);
    expect(gestesPv("a_valider", tiers)).toEqual([]);
    expect(gestesPv("publie", tiers)).toEqual([]);
  });
});

describe("diffusion et lectures", () => {
  const comptes = [
    { userId: A, serviceId: S1 },
    { userId: B, serviceId: null },
    { userId: C, serviceId: S1 },
  ];

  it("résout tous, un service ou des personnes, sans le rédacteur ni doublon", () => {
    expect(destinataires({ tous: true, services: [], comptes: [] }, comptes, A).sort()).toEqual([B, C].sort());
    expect(destinataires({ tous: false, services: [S1], comptes: [C, B] }, comptes, B).sort()).toEqual([A, C].sort());
    // Un compte qui n'est plus actif ne reçoit rien.
    expect(destinataires({ tous: false, services: [], comptes: ["01a1d607-8a7c-76cc-b48a-fea2e68679ff"] }, comptes, A)).toEqual([]);
  });

  it("compte qui a lu", () => {
    const s = suiviLectures([
      { userId: A, nom: "Awa", luLe: new Date("2026-11-13T10:00:00Z") },
      { userId: B, nom: "Bakayoko", luLe: null },
      { userId: C, nom: "Yao", luLe: null },
    ]);
    expect([s.total, s.lus, s.pourcent]).toEqual([3, 1, 33]);
    expect(s.enAttente.map((l) => l.nom)).toEqual(["Bakayoko", "Yao"]);
  });
});
