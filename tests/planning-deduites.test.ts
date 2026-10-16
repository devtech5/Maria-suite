import { describe, expect, it } from "vitest";

import { semaineAffichee } from "@/modules/planning/affichage";
import { blocsDuJour, etatActuel, type Creneau, type Plage } from "@/modules/planning/calcul";
import { fusionner, periodeConge, periodeMission, periodeReunion, type CongeSource, type Lecteur, type MissionSource, type ReunionSource } from "@/modules/planning/deduites";

const t = (iso: string) => new Date(`${iso}:00Z`);
const ABIDJAN = "Africa/Abidjan";

const AWA = "00000000-0000-7000-8000-00000000a0a0";
const ACCUEIL = "00000000-0000-7000-8000-00000000acc0";

const BUREAU: Plage[] = [1, 2, 3, 4, 5].flatMap((jour) => [
  { jour, debutMinutes: 480, finMinutes: 720 },
  { jour, debutMinutes: 840, finMinutes: 1080 },
]);

const lecteur = (userId: string, ...droits: string[]): Lecteur => ({ userId, droits: new Set(droits) });

const conge = (c: Partial<CongeSource> = {}): CongeSource => ({
  id: "c1",
  numero: "CONG-2026-00012",
  userId: AWA,
  nature: "maladie",
  debut: "2026-10-06",
  fin: "2026-10-08",
  debutDemi: false,
  finDemi: false,
  ...c,
});

const mission = (m: Partial<MissionSource> = {}): MissionSource => ({
  id: "m1",
  reference: "LIV-2026-00003",
  titre: "Livraison Bouaké",
  lieu: "Bouaké",
  statut: "planifiee",
  userId: AWA,
  echeanceLe: t("2026-10-07T17:00"),
  debuteLe: null,
  clotureLe: null,
  ...m,
});

const reunion = (r: Partial<ReunionSource> = {}): ReunionSource => ({
  id: "r1",
  numero: "REU-2026-00042",
  titre: "Point commercial",
  statut: "planifiee",
  debutPrevu: t("2026-10-07T10:00"),
  dureeMinutes: 60,
  ouverteLe: null,
  termineeLe: null,
  organisateurUserId: ACCUEIL,
  userId: AWA,
  rejoint: false,
  lecteurInvite: false,
  ...r,
});

const saisi = (id: string, debut: string, fin: string, statut: Creneau["statut"] = "en_pause"): Creneau => ({ id, userId: AWA, statut, debut: t(debut), fin: t(fin), lieu: null, note: null });

describe("congé accordé", () => {
  it("couvre les jours entiers, du premier minuit au lendemain du dernier jour", () => {
    const p = periodeConge(conge(), lecteur(AWA, "conges.demander"), ABIDJAN);
    expect(p).toMatchObject({ id: "conge:c1", statut: "en_conge", debut: t("2026-10-06T00:00"), fin: t("2026-10-09T00:00") });
  });

  it("une demi-journée se coupe à midi, au départ comme au retour", () => {
    const p = periodeConge(conge({ debutDemi: true, finDemi: true }), lecteur(AWA), ABIDJAN);
    expect([p.debut, p.fin]).toEqual([t("2026-10-06T12:00"), t("2026-10-08T12:00")]);
  });

  it("un seul après-midi, même marqué aux deux bouts", () => {
    const p = periodeConge(conge({ fin: "2026-10-06", debutDemi: true, finDemi: true }), lecteur(AWA), ABIDJAN);
    expect([p.debut, p.fin]).toEqual([t("2026-10-06T12:00"), t("2026-10-07T00:00")]);
  });

  it("suit le fuseau de l'entreprise, pas celui du serveur", () => {
    const p = periodeConge(conge({ debut: "2026-07-06", fin: "2026-07-06" }), lecteur(AWA), "Europe/Paris");
    expect([p.debut, p.fin]).toEqual([t("2026-07-05T22:00"), t("2026-07-06T22:00")]);
  });

  it("l'intéressé et qui accorde les congés lisent la nature et le lien ; l'accueil, la référence seule", () => {
    expect(periodeConge(conge(), lecteur(AWA, "conges.demander"), ABIDJAN).origine).toEqual({ source: "conge", reference: "CONG-2026-00012", titre: "Maladie", lien: "/presences/conges" });
    expect(periodeConge(conge(), lecteur(ACCUEIL, "conges.valider"), ABIDJAN).origine?.lien).toBe("/presences/conges");
    expect(periodeConge(conge(), lecteur(ACCUEIL, "conges.demander", "planning.equipe.consulter"), ABIDJAN).origine).toEqual({ source: "conge", reference: "CONG-2026-00012", titre: null, lien: null });
  });
});

describe("mission confiée", () => {
  const maintenant = t("2026-10-06T09:00");

  it("planifiée : la journée de l'échéance, jusqu'à l'échéance", () => {
    const p = periodeMission(mission(), lecteur(AWA, "missions.consulter"), maintenant, ABIDJAN);
    expect(p).toMatchObject({ id: "mission:m1", statut: "en_mission", debut: t("2026-10-07T00:00"), fin: t("2026-10-07T17:00"), lieu: "Bouaké" });
    expect(p?.origine).toEqual({ source: "mission", reference: "LIV-2026-00003", titre: "Livraison Bouaké", lien: "/missions/suivi?mission=m1" });
  });

  it("une échéance à minuit pile ferme la veille", () => {
    const p = periodeMission(mission({ echeanceLe: t("2026-10-08T00:00") }), lecteur(AWA), maintenant, ABIDJAN);
    expect([p?.debut, p?.fin]).toEqual([t("2026-10-07T00:00"), t("2026-10-08T00:00")]);
  });

  it("planifiée sans échéance, ou annulée : rien à placer", () => {
    expect(periodeMission(mission({ echeanceLe: null }), lecteur(AWA), maintenant, ABIDJAN)).toBeNull();
    expect(periodeMission(mission({ statut: "annulee" }), lecteur(AWA), maintenant, ABIDJAN)).toBeNull();
  });

  it("commencée : de la première étape à l'échéance", () => {
    const p = periodeMission(mission({ statut: "en_cours", debuteLe: t("2026-10-06T08:15") }), lecteur(AWA), maintenant, ABIDJAN);
    expect([p?.debut, p?.fin]).toEqual([t("2026-10-06T08:15"), t("2026-10-07T17:00")]);
  });

  it("commencée et en retard : la personne est dehors jusqu'au soir", () => {
    const p = periodeMission(mission({ statut: "en_cours", debuteLe: t("2026-10-05T08:00"), echeanceLe: t("2026-10-05T17:00") }), lecteur(AWA), maintenant, ABIDJAN);
    expect([p?.debut, p?.fin]).toEqual([t("2026-10-05T08:00"), t("2026-10-07T00:00")]);
  });

  it("close : du départ à la clôture, pour l'historique", () => {
    const p = periodeMission(mission({ statut: "terminee", debuteLe: t("2026-10-05T08:00"), clotureLe: t("2026-10-05T15:30") }), lecteur(AWA), maintenant, ABIDJAN);
    expect([p?.debut, p?.fin]).toEqual([t("2026-10-05T08:00"), t("2026-10-05T15:30")]);
  });

  it("sans le droit de voir les missions : ni titre ni lien, le lieu reste", () => {
    const p = periodeMission(mission(), lecteur(ACCUEIL, "planning.equipe.consulter"), maintenant, ABIDJAN);
    expect(p).toMatchObject({ lieu: "Bouaké", origine: { reference: "LIV-2026-00003", titre: null, lien: null } });
  });
});

describe("réunion programmée", () => {
  it("planifiée : son heure et sa durée prévues", () => {
    const p = periodeReunion(reunion(), lecteur(AWA), t("2026-10-06T09:00"));
    expect(p).toMatchObject({ id: "reunion:r1", statut: "en_reunion", debut: t("2026-10-07T10:00"), fin: t("2026-10-07T11:00") });
  });

  it("ouverte en avance, elle part de l'ouverture", () => {
    const p = periodeReunion(reunion({ statut: "en_cours", ouverteLe: t("2026-10-07T09:55") }), lecteur(AWA), t("2026-10-07T10:10"));
    expect([p?.debut, p?.fin]).toEqual([t("2026-10-07T09:55"), t("2026-10-07T11:00")]);
  });

  it("ouverte et débordant : prolongée tant qu'elle n'est pas terminée", () => {
    const p = periodeReunion(reunion({ statut: "en_cours", ouverteLe: t("2026-10-07T10:00") }), lecteur(AWA), t("2026-10-07T11:20"));
    expect(p?.fin).toEqual(t("2026-10-07T11:35"));
  });

  it("terminée : seulement pour qui est venu, de l'ouverture à la fin réelle", () => {
    const close = { statut: "terminee" as const, ouverteLe: t("2026-10-07T10:02"), termineeLe: t("2026-10-07T10:48") };
    expect(periodeReunion(reunion({ ...close, rejoint: false }), lecteur(AWA), t("2026-10-08T09:00"))).toBeNull();
    const p = periodeReunion(reunion({ ...close, rejoint: true }), lecteur(AWA), t("2026-10-08T09:00"));
    expect([p?.debut, p?.fin]).toEqual([t("2026-10-07T10:02"), t("2026-10-07T10:48")]);
  });

  it("annulée : rien", () => {
    expect(periodeReunion(reunion({ statut: "annulee" }), lecteur(AWA), t("2026-10-06T09:00"))).toBeNull();
  });

  it("le titre et le lien suivent la règle de l'écran de la réunion", () => {
    const maintenant = t("2026-10-06T09:00");
    expect(periodeReunion(reunion({ lecteurInvite: true }), lecteur(AWA, "meeting.participer"), maintenant)?.origine).toEqual({ source: "reunion", reference: "REU-2026-00042", titre: "Point commercial", lien: "/meeting/r1" });
    expect(periodeReunion(reunion(), lecteur(ACCUEIL, "meeting.participer"), maintenant)?.origine?.lien).toBe("/meeting/r1");
    expect(periodeReunion(reunion(), lecteur("autre", "meeting.participer", "meeting.organiser"), maintenant)?.origine?.lien).toBe("/meeting/r1");
    expect(periodeReunion(reunion(), lecteur("autre", "meeting.participer"), maintenant)?.origine).toMatchObject({ titre: null, lien: null });
    expect(periodeReunion(reunion({ lecteurInvite: true }), lecteur(AWA), maintenant)?.origine?.lien).toBeNull();
  });
});

describe("fusion avec les créneaux saisis", () => {
  const lect = lecteur(AWA, "missions.consulter", "meeting.participer", "conges.demander");
  const journeeMission = periodeMission(mission({ statut: "en_cours", debuteLe: t("2026-10-07T08:00") }), lect, t("2026-10-07T09:00"), ABIDJAN);
  const point = periodeReunion(reunion({ lecteurInvite: true }), lect, t("2026-10-07T09:00"));

  it("une réunion pendant une mission : c'est la réunion qui dit où l'on est", () => {
    const tout = fusionner([], [journeeMission, point]);
    expect(etatActuel(t("2026-10-07T10:30"), tout, BUREAU)).toMatchObject({ statut: "en_reunion", source: "deduite", jusqua: t("2026-10-07T11:00") });
    expect(etatActuel(t("2026-10-07T11:30"), tout, BUREAU)).toMatchObject({ statut: "en_mission", source: "deduite", jusqua: t("2026-10-07T17:00") });
  });

  it("une pause posée pendant la mission l'emporte, puis la mission reprend", () => {
    const tout = fusionner([saisi("p", "2026-10-07T12:00", "2026-10-07T13:00")], [journeeMission]);
    expect(etatActuel(t("2026-10-07T12:15"), tout, BUREAU)).toMatchObject({ statut: "en_pause", source: "creneau" });
    expect(etatActuel(t("2026-10-07T13:15"), tout, BUREAU)).toMatchObject({ statut: "en_mission", source: "deduite" });
  });

  it("à début et fin égaux, le créneau saisi passe avant la période déduite", () => {
    const doublon = saisi("s", "2026-10-07T10:00", "2026-10-07T11:00", "en_reunion");
    const tout = fusionner([doublon], [point]);
    expect(etatActuel(t("2026-10-07T10:30"), tout, BUREAU)).toMatchObject({ source: "creneau", creneau: { id: "s" } });
    expect(tout.map((c) => c.id)).toEqual(["s", "reunion:r1"]);
  });

  it("un congé de la semaine annonce le retour, pas la fin des horaires", () => {
    const tout = fusionner([], [periodeConge(conge(), lect, ABIDJAN)]);
    const e = etatActuel(t("2026-10-07T09:00"), tout, BUREAU);
    expect(e).toMatchObject({ statut: "en_conge", joignable: false, source: "deduite", jusqua: t("2026-10-09T00:00") });
    expect(e.creneau?.origine?.reference).toBe("CONG-2026-00012");
  });

  it("une réunion à venir écourte la disponibilité comme un créneau", () => {
    expect(etatActuel(t("2026-10-07T09:00"), fusionner([], [point]), BUREAU).jusqua).toEqual(t("2026-10-07T10:00"));
  });

  it("écarte ce qui est hors de la fenêtre et les pièces sans période", () => {
    const tout = fusionner([saisi("avant", "2026-09-29T09:00", "2026-09-29T10:00")], [null, point, journeeMission], { du: t("2026-10-05T00:00"), au: t("2026-10-12T00:00") });
    expect(tout.map((c) => c.id)).toEqual(["mission:m1", "reunion:r1"]);
  });

  it("la semaine range les deux sources, chacune avec son origine", () => {
    const tout = fusionner([saisi("p", "2026-10-07T12:00", "2026-10-07T13:00")], [journeeMission, point]);
    const blocs = blocsDuJour("2026-10-07", tout);
    expect(blocs.map((b) => [b.id, b.origine?.source ?? "saisi"])).toEqual([
      ["mission:m1", "mission"],
      ["reunion:r1", "reunion"],
      ["p", "saisi"],
    ]);
    const conges = semaineAffichee("2026-10-05", "2026-10-07", fusionner([], [periodeConge(conge(), lect, ABIDJAN)]), BUREAU, ABIDJAN);
    expect(conges.map((j) => j.blocs.length)).toEqual([0, 1, 1, 1, 0, 0, 0]);
    expect(conges[1].blocs[0]).toMatchObject({ debutMinutes: 0, finMinutes: 1440, continueApres: true, origine: { lien: "/presences/conges" } });
  });
});
