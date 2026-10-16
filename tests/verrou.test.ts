import { describe, expect, it } from "vitest";

import {
  DECONNEXION_INACTIVITE_MINUTES,
  DELAIS_VERROUILLAGE,
  DELAI_VERROUILLAGE_DEFAUT,
  MARGE_SERVEUR_MINUTES,
  delaiValide,
  inactiviteEcoulee,
  sessionEchue,
  sessionVerrouillee,
} from "@/lib/auth/verrou";

const MINUTE = 60_000;
const maintenant = new Date("2026-10-06T10:00:00Z");
const ilYa = (minutes: number) => new Date(maintenant.getTime() - minutes * MINUTE);

describe("verrouillage d'une session inactive", () => {
  it("un verrou inscrit l'emporte sur une activité récente", () => {
    expect(sessionVerrouillee({ verrouilleeLe: ilYa(1), derniereActivite: maintenant, delaiMinutes: 10, maintenant })).toBe(true);
  });

  it("le serveur attend le délai ET sa marge avant de juger la session éteinte", () => {
    const etat = (minutes: number) =>
      sessionVerrouillee({ verrouilleeLe: null, derniereActivite: ilYa(minutes), delaiMinutes: 10, maintenant });
    // Le navigateur ne signale qu'une fois par minute : à 11 minutes, la
    // personne a pu travailler jusqu'à la dixième sans que le serveur le sache.
    expect(etat(10)).toBe(false);
    expect(etat(10 + MARGE_SERVEUR_MINUTES)).toBe(false);
    expect(etat(10 + MARGE_SERVEUR_MINUTES + 0.1)).toBe(true);
    expect(etat(180)).toBe(true);
  });

  it("le délai de l'entreprise s'applique", () => {
    const derniereActivite = ilYa(20);
    expect(sessionVerrouillee({ verrouilleeLe: null, derniereActivite, delaiMinutes: 30, maintenant })).toBe(false);
    expect(sessionVerrouillee({ verrouilleeLe: null, derniereActivite, delaiMinutes: 15, maintenant })).toBe(true);
  });

  it("le navigateur voile à l'heure exacte, pas une seconde plus tôt", () => {
    const t = maintenant.getTime();
    expect(inactiviteEcoulee(t - 10 * MINUTE + 1, t, 10)).toBe(false);
    expect(inactiviteEcoulee(t - 10 * MINUTE, t, 10)).toBe(true);
  });

  it("seuls les délais proposés s'enregistrent", () => {
    for (const d of DELAIS_VERROUILLAGE) expect(delaiValide(d)).toBe(true);
    expect(delaiValide(0)).toBe(false);
    expect(delaiValide(7)).toBe(false);
    expect(delaiValide(-10)).toBe(false);
    expect(delaiValide(30)).toBe(false);
  });

  it("le verrou tombe à quinze minutes par défaut, toujours avant la déconnexion", () => {
    expect(DELAI_VERROUILLAGE_DEFAUT).toBe(15);
    expect(delaiValide(DELAI_VERROUILLAGE_DEFAUT)).toBe(true);
    for (const d of DELAIS_VERROUILLAGE) expect(d).toBeLessThan(DECONNEXION_INACTIVITE_MINUTES);
  });
});

describe("déconnexion après inactivité", () => {
  const echue = (minutes: number, maintenueIlYa: number | null = null) =>
    sessionEchue({
      derniereActivite: ilYa(minutes),
      maintenueLe: maintenueIlYa === null ? null : ilYa(maintenueIlYa),
      maintenant,
    });

  it("la session prend fin après trente minutes sans activité, marge du serveur comprise", () => {
    expect(DECONNEXION_INACTIVITE_MINUTES).toBe(30);
    expect(echue(29)).toBe(false);
    expect(echue(30 + MARGE_SERVEUR_MINUTES)).toBe(false);
    expect(echue(30 + MARGE_SERVEUR_MINUTES + 0.1)).toBe(true);
    expect(echue(24 * 60)).toBe(true);
  });

  it("une caisse ou une salle affichée la maintient, un vieux maintien non", () => {
    expect(echue(120, 1)).toBe(false);
    expect(echue(120, 60)).toBe(true);
    // Le maintien ne recule jamais une activité plus récente.
    expect(echue(5, 120)).toBe(false);
  });
});
