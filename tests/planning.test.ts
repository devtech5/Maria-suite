import { describe, expect, it } from "vitest";

import { PRESETS_ROLES } from "@/lib/droits/catalogue";
import { bornesMois, formaterEcheance, joursDansMois, moisAffiche, moisValide, moisVoisin, resumeHoraires, titreJour } from "@/modules/planning/affichage";
import {
  blocsDuJour,
  chevauche,
  etatActuel,
  finRapide,
  heureEnMinutes,
  lundiDe,
  minutesEnHeure,
  premierConflit,
  verifierCreneau,
  verifierPlages,
  type Creneau,
  type Plage,
} from "@/modules/planning/calcul";

// Abidjan est à UTC+0 toute l'année : l'heure locale se lit dans l'ISO.
const t = (iso: string) => new Date(`${iso}:00Z`);
const creneau = (id: string, debut: string, fin: string, statut: Creneau["statut"] = "en_mission"): Creneau => ({
  id,
  userId: "u",
  statut,
  debut: t(debut),
  fin: t(fin),
  lieu: null,
  note: null,
});
/** Bureau : du lundi au vendredi, 8 h – 12 h et 14 h – 18 h. */
const BUREAU: Plage[] = [1, 2, 3, 4, 5].flatMap((jour) => [
  { jour, debutMinutes: 480, finMinutes: 720 },
  { jour, debutMinutes: 840, finMinutes: 1080 },
]);

describe("heures", () => {
  it("se convertissent en minutes entières et retour", () => {
    expect(heureEnMinutes("08:30")).toBe(510);
    expect(heureEnMinutes("24:00")).toBe(1440);
    expect(heureEnMinutes("8h30")).toBeNull();
    expect(heureEnMinutes("25:00")).toBeNull();
    expect(minutesEnHeure(510)).toBe("08:30");
    expect(minutesEnHeure(1440)).toBe("24:00");
  });

  it("le lundi de la semaine, même un dimanche", () => {
    expect(lundiDe("2026-10-06")).toBe("2026-10-05");
    expect(lundiDe("2026-10-11")).toBe("2026-10-05");
    expect(lundiDe("2026-10-05")).toBe("2026-10-05");
  });
});

describe("validation", () => {
  it("refuse une fin avant le début, et plus d'un mois", () => {
    expect(verifierCreneau(t("2026-10-06T10:00"), t("2026-10-06T09:00"))).toMatch(/après le début/);
    expect(verifierCreneau(t("2026-10-06T10:00"), t("2026-10-06T10:00"))).toMatch(/après le début/);
    expect(verifierCreneau(t("2026-10-01T00:00"), t("2026-11-05T00:00"))).toMatch(/un mois/);
    expect(verifierCreneau(t("2026-10-06T08:00"), t("2026-10-06T12:00"))).toBeNull();
    // Arrêt maladie et congé de maternité : jusqu'à six mois (14 semaines de maternité et leurs prolongations).
    expect(verifierCreneau(t("2026-10-01T00:00"), t("2027-01-07T00:00"), "conge_maternite")).toBeNull();
    expect(verifierCreneau(t("2026-10-01T00:00"), t("2026-11-15T00:00"), "arret_maladie")).toBeNull();
    expect(verifierCreneau(t("2026-10-01T00:00"), t("2027-05-01T00:00"), "arret_maladie")).toMatch(/six mois/);
    expect(verifierCreneau(t("2026-10-01T00:00"), t("2026-11-15T00:00"), "en_mission")).toMatch(/un mois/);
  });

  it("deux créneaux bout à bout ne se chevauchent pas", () => {
    const a = creneau("a", "2026-10-06T08:00", "2026-10-06T12:00");
    expect(chevauche(a, creneau("b", "2026-10-06T12:00", "2026-10-06T14:00"))).toBe(false);
    expect(chevauche(a, creneau("b", "2026-10-06T11:59", "2026-10-06T14:00"))).toBe(true);
  });

  it("le conflit ignore le créneau qu'on modifie et rend le plus tôt", () => {
    const existants = [creneau("x", "2026-10-06T15:00", "2026-10-06T16:00"), creneau("y", "2026-10-06T09:00", "2026-10-06T10:00")];
    expect(premierConflit({ debut: t("2026-10-06T08:00"), fin: t("2026-10-06T17:00") }, existants)?.id).toBe("y");
    expect(premierConflit({ id: "y", debut: t("2026-10-06T09:30"), fin: t("2026-10-06T11:00") }, existants)).toBeUndefined();
  });

  it("les plages d'un même jour ne se chevauchent pas", () => {
    expect(verifierPlages(BUREAU)).toBeNull();
    expect(verifierPlages([...BUREAU, { jour: 2, debutMinutes: 700, finMinutes: 900 }])).toMatch(/mardi.*chevauchent/);
    expect(verifierPlages([{ jour: 8, debutMinutes: 0, finMinutes: 60 }])).toMatch(/inconnu/);
    expect(verifierPlages([{ jour: 1, debutMinutes: 600, finMinutes: 600 }])).toMatch(/lundi/);
  });
});

describe("statut actuel", () => {
  const mardi = (h: string) => t(`2026-10-06T${h}`);

  it("un créneau en cours l'emporte sur les horaires", () => {
    const e = etatActuel(mardi("10:00"), [creneau("m", "2026-10-06T09:00", "2026-10-06T11:30")], BUREAU);
    expect(e).toMatchObject({ statut: "en_mission", source: "creneau", joignable: false });
    expect(e.jusqua).toEqual(mardi("11:30"));
  });

  it("dans une plage sans créneau : disponible jusqu'à la fin de la plage", () => {
    const e = etatActuel(mardi("09:00"), [], BUREAU);
    expect(e).toMatchObject({ statut: "disponible", source: "horaires", joignable: true });
    expect(e.jusqua).toEqual(mardi("12:00"));
  });

  it("un créneau à venir écourte la disponibilité", () => {
    const e = etatActuel(mardi("09:00"), [creneau("r", "2026-10-06T10:00", "2026-10-06T11:00", "en_reunion")], BUREAU);
    expect(e.jusqua).toEqual(mardi("10:00"));
  });

  it("entre deux plages : hors horaires, reprise à 14 h", () => {
    const e = etatActuel(mardi("12:30"), [], BUREAU);
    expect(e).toMatchObject({ statut: "hors_horaires", joignable: false });
    expect(e.jusqua).toEqual(mardi("14:00"));
  });

  it("le vendredi soir, la reprise est le lundi", () => {
    const e = etatActuel(t("2026-10-09T19:00"), [], BUREAU);
    expect(e.jusqua).toEqual(t("2026-10-12T08:00"));
  });

  it("sans horaires ni créneau : non renseigné, jamais « disponible » par défaut", () => {
    expect(etatActuel(mardi("09:00"), [], [])).toMatchObject({ statut: "non_renseigne", joignable: false, jusqua: null });
  });
});

describe("semaine", () => {
  it("coupe un créneau à minuit et signale qu'il continue", () => {
    const c = creneau("d", "2026-10-06T20:00", "2026-10-07T10:00", "en_deplacement");
    expect(blocsDuJour("2026-10-06", [c])).toEqual([expect.objectContaining({ debutMinutes: 1200, finMinutes: 1440, depuisAvant: false, continueApres: true })]);
    expect(blocsDuJour("2026-10-07", [c])).toEqual([expect.objectContaining({ debutMinutes: 0, finMinutes: 600, depuisAvant: true, continueApres: false })]);
    expect(blocsDuJour("2026-10-08", [c])).toEqual([]);
  });
  it("tronque les secondes comme l'heure affichée : 12:43:40 se lit 12:43", () => {
    const c = { ...creneau("s", "2026-10-07T12:43", "2026-10-07T13:43", "en_reunion"), debut: new Date("2026-10-07T12:43:40Z"), fin: new Date("2026-10-07T13:43:40Z") };
    const [bloc] = blocsDuJour("2026-10-07", [c]);
    expect([minutesEnHeure(bloc.debutMinutes), minutesEnHeure(bloc.finMinutes)]).toEqual(["12:43", "13:43"]);
  });

  it("résume les horaires d'un jour, et le repos", () => {
    expect(resumeHoraires(BUREAU, "2026-10-06")).toBe("08:00–12:00, 14:00–18:00");
    expect(resumeHoraires(BUREAU, "2026-10-11")).toBeNull();
    expect(titreJour("2026-10-06")).toBe("mar. 06/10");
  });

  it("l'échéance s'écrit court le jour même, avec le jour sinon", () => {
    expect(formaterEcheance(t("2026-10-06T18:00"), t("2026-10-06T09:00"), "Africa/Abidjan")).toBe("18:00");
    expect(formaterEcheance(t("2026-10-07T08:00"), t("2026-10-06T09:00"), "Africa/Abidjan")).toBe("mer. 07/10 à 08:00");
  });
});

describe("statut rapide", () => {
  it("une durée s'ajoute à maintenant", () => {
    expect(finRapide("2h", t("2026-10-06T09:10"), BUREAU)).toEqual(t("2026-10-06T11:10"));
  });

  it("« jusqu'à ce soir » s'arrête à la fin de la dernière plage, ou à minuit après", () => {
    expect(finRapide("journee", t("2026-10-06T09:00"), BUREAU)).toEqual(t("2026-10-06T18:00"));
    expect(finRapide("journee", t("2026-10-06T19:00"), BUREAU)).toEqual(t("2026-10-07T00:00"));
    expect(finRapide("journee", t("2026-10-11T10:00"), BUREAU)).toEqual(t("2026-10-12T00:00"));
  });
});

describe("droits", () => {
  it("la secrétaire voit l'équipe sans pouvoir la modifier", () => {
    const secretaire = PRESETS_ROLES.find((p) => p.cle === "secretaire")!.droits as readonly string[];
    expect(secretaire).toContain("planning.equipe.consulter");
    expect(secretaire).toContain("planning.utiliser");
    expect(secretaire).not.toContain("planning.gerer");
  });

  it("chaque rôle préréglé tient son propre planning", () => {
    for (const p of PRESETS_ROLES) expect(p.droits as readonly string[]).toContain("planning.utiliser");
  });
});

describe("mois", () => {
  it("compte les jours du mois, février bissextile compris", () => {
    expect(joursDansMois("2026-11")).toBe(30);
    expect(joursDansMois("2026-12")).toBe(31);
    expect(joursDansMois("2026-02")).toBe(28);
    expect(joursDansMois("2028-02")).toBe(29);
  });

  it("passe d'une année à l'autre", () => {
    expect(moisVoisin("2026-12", 1)).toBe("2027-01");
    expect(moisVoisin("2027-01", -1)).toBe("2026-12");
    expect(moisVoisin("2026-11", 0)).toBe("2026-11");
  });

  it("refuse un mois illisible", () => {
    expect(moisValide("2026-11")).toBe("2026-11");
    expect(moisValide("2026-13")).toBeNull();
    expect(moisValide("2026-1")).toBeNull();
    expect(moisValide(undefined)).toBeNull();
  });

  it("montre le mois du 1er au dernier jour, en semaines du lundi au dimanche", () => {
    // Novembre 2026 commence un dimanche et finit un lundi.
    const semaines = moisAffiche("2026-11", "2026-11-10", [], [], "Africa/Abidjan");
    const jours = semaines.flat().filter((j) => j !== null);
    expect(semaines.every((s) => s.length === 7)).toBe(true);
    expect(jours).toHaveLength(30);
    expect(jours[0]!.jour).toBe("2026-11-01");
    expect(jours.at(-1)!.jour).toBe("2026-11-30");
    expect(semaines[0].slice(0, 6).every((j) => j === null)).toBe(true);
    expect(semaines[0][6]!.numero).toBe(1);
    expect(semaines.at(-1)![0]!.numero).toBe(30);
    expect(jours.find((j) => j!.aujourdhui)!.jour).toBe("2026-11-10");
    expect(jours.find((j) => j!.jour === "2026-11-14")!.finDeSemaine).toBe(true);
  });

  it("borne le mois à minuit, du 1er au 1er suivant", () => {
    const { du, au } = bornesMois("2026-12", "Africa/Abidjan");
    expect(du.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(au.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
