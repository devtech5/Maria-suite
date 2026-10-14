import { describe, expect, it } from "vitest";

import {
  FRAICHEUR_MS,
  adresseFlux,
  cheminDeReunion,
  cheminFlux,
  colonnesMosaique,
  dureeLisible,
  dureeValide,
  gestesPossibles,
  lireChemin,
  present,
  rejoignable,
  secondesDePresence,
  statutApres,
} from "@/modules/meeting/calcul";

const REUNION = "01a12ab8-7c29-721f-9bf5-41383e416059";
const AWA = "01a12aa0-f282-7269-ab9a-960e6808f9b7";
const KONE = "01a12aa0-f282-7269-ab9a-960e6808f9b8";

describe("chemins des flux de réunion", () => {
  it("se relisent, et refusent ce qui n'est pas un flux de participant", () => {
    const chemin = cheminFlux(REUNION, AWA, "cam");
    expect(chemin).toBe(`m/${REUNION}/${AWA}/cam`);
    expect(lireChemin(chemin)).toEqual({ reunionId: REUNION, userId: AWA, flux: "cam" });
    expect(lireChemin(`/${cheminFlux(REUNION, AWA, "ecran")}`)?.flux).toBe("ecran");
    expect(lireChemin(`m/${REUNION}/${AWA}/micro`)).toBeNull();
    expect(lireChemin(`m/${REUNION}/../${AWA}/cam`)).toBeNull();
    expect(lireChemin(`s/${REUNION}/${AWA}/sd`)).toBeNull();
  });

  it("se distinguent des caméras du module Sécurité", () => {
    expect(cheminDeReunion(`m/${REUNION}/${AWA}/cam`)).toBe(true);
    expect(cheminDeReunion(`/m/${REUNION}/${AWA}/cam`)).toBe(true);
    expect(cheminDeReunion(`s/${REUNION}/${AWA}/sd`)).toBe(false);
  });

  it("composent l'adresse WHIP ou WHEP, jeton échappé", () => {
    expect(adresseFlux("https://video.exemple.ci/", "m/a/b/cam", "whip", "a+b/c")).toBe("https://video.exemple.ci/m/a/b/cam/whip?jeton=a%2Bb%2Fc");
  });
});

describe("cycle d'une réunion", () => {
  it("se rejoint tant qu'elle n'est pas close", () => {
    expect(rejoignable("planifiee")).toBe(true);
    expect(rejoignable("en_cours")).toBe(true);
    expect(rejoignable("terminee")).toBe(false);
    expect(rejoignable("annulee")).toBe(false);
  });

  it("se termine en cours, s'annule avant d'avoir commencé", () => {
    expect(statutApres("terminer", "en_cours")).toBe("terminee");
    expect(statutApres("terminer", "planifiee")).toBeNull();
    expect(statutApres("annuler", "planifiee")).toBe("annulee");
    expect(statutApres("annuler", "en_cours")).toBeNull();
  });

  it("ne laisse piloter que l'organisateur, ou qui organise", () => {
    const reunion = { organisateurUserId: AWA };
    expect(gestesPossibles("en_cours", reunion, { userId: AWA, organise: false })).toEqual(["terminer"]);
    expect(gestesPossibles("en_cours", reunion, { userId: KONE, organise: false })).toEqual([]);
    expect(gestesPossibles("planifiee", reunion, { userId: KONE, organise: true })).toEqual(["annuler"]);
    expect(gestesPossibles("terminee", reunion, { userId: AWA, organise: true })).toEqual([]);
  });

  it("borne la durée entre 5 minutes et 8 heures", () => {
    expect(dureeValide(60)).toBe(true);
    expect(dureeValide(4)).toBe(false);
    expect(dureeValide(481)).toBe(false);
    expect(dureeValide(30.5)).toBe(false);
  });
});

describe("présence dans la salle", () => {
  const t0 = new Date("2026-10-14T09:00:00Z");
  const apres = (ms: number) => new Date(t0.getTime() + ms);

  it("tient pour présent qui s'est signalé récemment", () => {
    expect(present(t0, apres(FRAICHEUR_MS))).toBe(true);
    expect(present(t0, apres(FRAICHEUR_MS + 1))).toBe(false);
    expect(present(null, t0)).toBe(false);
  });

  it("cumule le temps entre deux signaux, pas les absences", () => {
    expect(secondesDePresence(t0, apres(4_000))).toBe(4);
    expect(secondesDePresence(t0, apres(4_999))).toBe(4);
    expect(secondesDePresence(t0, apres(FRAICHEUR_MS + 1))).toBe(0);
    expect(secondesDePresence(null, t0)).toBe(0);
    // Horloge qui recule : rien, plutôt qu'un temps négatif.
    expect(secondesDePresence(apres(5_000), t0)).toBe(0);
  });

  it("dit une durée comme on la lit", () => {
    expect(dureeLisible(30)).toBe("moins d'une minute");
    expect(dureeLisible(12 * 60 + 59)).toBe("12 min");
    expect(dureeLisible(65 * 60)).toBe("1 h 05");
    expect(dureeLisible(120 * 60)).toBe("2 h");
  });

  it("dispose la mosaïque selon le nombre de présents", () => {
    expect([1, 2, 4, 5, 9, 10].map(colonnesMosaique)).toEqual([1, 2, 2, 3, 3, 4]);
  });
});
