import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { memberships, roles, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { reunionParticipants, reunions } from "@/modules/meeting/schema";
import { missions } from "@/modules/missions/schema";
import { creerSalariePour } from "@/modules/personnes/creation";
import { employees } from "@/modules/personnes/schema";
import { etatActuel } from "@/modules/planning/calcul";
import { enregistrerCreneauDans } from "@/modules/planning/creation";
import type { Lecteur } from "@/modules/planning/deduites";
import { periodesDeduites, planningSur } from "@/modules/planning/requetes";
import { conges } from "@/modules/presences/schema";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let autreOrg: string;
let chef: string;
let awa: string;
let awaSalarie: string;

const t = (iso: string) => new Date(`${iso}:00Z`);
const ABIDJAN = "Africa/Abidjan";
// Semaine du lundi 5 octobre 2026.
const DU = t("2026-10-05T00:00");
const AU = t("2026-10-12T00:00");
const MAINTENANT = t("2026-10-06T09:00");

async function compte(organizationId: string, nom: string): Promise<string> {
  const userId = newId();
  await db.insert(users).values({ id: userId, fullName: nom, email: `${userId}@exemple.test` });
  const roleId = newId();
  await db.insert(roles).values({ id: roleId, organizationId, key: `r-${roleId}`, name: "Équipe" });
  await db.insert(memberships).values({ id: newId(), organizationId, userId, roleId, status: "actif" });
  return userId;
}

async function salarie(organizationId: string, nom: string, userId: string | null): Promise<string> {
  const { id } = await creerSalariePour(organizationId, { nom, poste: "Commerciale", debut: "2025-01-06", salaireBase: 150_000 }, chef);
  if (userId) await db.update(employees).set({ userId }).where(eq(employees.id, id));
  return id;
}

let numero = 0;
async function conge(organizationId: string, employeeId: string, debut: string, fin: string, statut: "demande" | "approuve" | "refuse" | "annule" = "approuve") {
  numero += 1;
  await db.insert(conges).values({
    id: newId(),
    organizationId,
    employeeId,
    numero: `CONG-2026-${String(numero).padStart(5, "0")}`,
    nature: "maladie",
    debut,
    fin,
    joursCentiemes: 100,
    statut,
    demandeParUserId: chef,
  });
  return `CONG-2026-${String(numero).padStart(5, "0")}`;
}

async function mission(valeurs: Partial<typeof missions.$inferInsert> & { reference: string }) {
  const id = newId();
  await db.insert(missions).values({ id, organizationId: org, nature: "livraison", titre: "Livraison", ...valeurs });
  return id;
}

async function reunion(valeurs: Partial<typeof reunions.$inferInsert> & { numero: string; debutPrevu: Date }, invites: { userId: string; rejointLe?: Date }[]) {
  const id = newId();
  await db.insert(reunions).values({ id, organizationId: org, titre: "Point commercial", organisateurUserId: chef, ...valeurs });
  for (const i of invites) {
    await db.insert(reunionParticipants).values({ id: newId(), organizationId: org, reunionId: id, userId: i.userId, inviteParUserId: chef, rejointLe: i.rejointLe ?? null });
  }
  return id;
}

const lecteur = (userId: string, ...droits: string[]): Lecteur => ({ userId, droits: new Set(droits) });
const tout = (userId: string) => lecteur(userId, "conges.demander", "conges.valider", "missions.consulter", "meeting.participer", "meeting.organiser");

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org } = await semerEntreprise(db));
  ({ organizationId: autreOrg } = await semerEntreprise(db, "Autre entreprise"));
  chef = await compte(org, "Chef");
  awa = await compte(org, "Awa Koné");
  awaSalarie = await salarie(org, "Awa Koné", awa);
});
afterAll(async () => fermer());

describe("périodes déduites, lues en base", () => {
  it("un congé accordé apparaît ; une demande, un refus ou une annulation, non", async () => {
    const accorde = await conge(org, awaSalarie, "2026-10-08", "2026-10-09");
    await conge(org, awaSalarie, "2026-10-05", "2026-10-05", "demande");
    await conge(org, awaSalarie, "2026-10-06", "2026-10-06", "refuse");
    await conge(org, awaSalarie, "2026-10-07", "2026-10-07", "annule");
    // Hors de la semaine.
    await conge(org, awaSalarie, "2026-10-19", "2026-10-20");

    const periodes = (await periodesDeduites(org, DU, AU, [awa], tout(awa), ABIDJAN, MAINTENANT)).filter((p) => p.origine?.source === "conge");
    expect(periodes).toHaveLength(1);
    expect(periodes[0]).toMatchObject({ userId: awa, statut: "en_conge", debut: t("2026-10-08T00:00"), fin: t("2026-10-10T00:00"), origine: { reference: accorde, titre: "Maladie" } });
  });

  it("une mission confiée au salarié s'inscrit au planning de son compte", async () => {
    const id = await mission({ reference: "LIV-2026-00001", titre: "Livraison Bouaké", lieu: "Bouaké", employeId: awaSalarie, echeanceLe: t("2026-10-07T17:00") });
    await mission({ reference: "LIV-2026-00002", employeId: awaSalarie, echeanceLe: t("2026-10-07T17:00"), statut: "annulee", motif: "Client absent" });
    await mission({ reference: "LIV-2026-00003", employeId: awaSalarie, echeanceLe: null });
    await mission({ reference: "LIV-2026-00004", employeId: awaSalarie, echeanceLe: t("2026-10-21T17:00") });

    const periodes = (await periodesDeduites(org, DU, AU, [awa], tout(awa), ABIDJAN, MAINTENANT)).filter((p) => p.origine?.source === "mission");
    expect(periodes.map((p) => p.origine?.reference)).toEqual(["LIV-2026-00001"]);
    expect(periodes[0]).toMatchObject({ id: `mission:${id}`, lieu: "Bouaké", debut: t("2026-10-07T00:00"), fin: t("2026-10-07T17:00"), origine: { lien: `/missions/suivi?mission=${id}` } });
  });

  it("une mission commencée la semaine dernière et pas finie tient encore ce soir", async () => {
    await mission({ reference: "CHA-2026-00001", nature: "chantier", employeId: awaSalarie, statut: "en_cours", debuteLe: t("2026-10-02T08:00"), echeanceLe: t("2026-10-03T17:00") });
    const p = (await periodesDeduites(org, DU, AU, [awa], tout(awa), ABIDJAN, MAINTENANT)).find((x) => x.origine?.reference === "CHA-2026-00001");
    expect(p).toMatchObject({ debut: t("2026-10-02T08:00"), fin: t("2026-10-07T00:00") });
  });

  it("une réunion programmée apparaît pour chaque invité ; terminée, seulement pour qui est venu", async () => {
    const kone = await compte(org, "Koné");
    const point = await reunion({ numero: "REU-2026-00001", debutPrevu: t("2026-10-06T10:00"), dureeMinutes: 45 }, [{ userId: awa }, { userId: kone }, { userId: chef }]);
    await reunion({ numero: "REU-2026-00002", debutPrevu: t("2026-10-05T15:00"), statut: "terminee", ouverteLe: t("2026-10-05T15:00"), termineeLe: t("2026-10-05T15:40") }, [
      { userId: awa, rejointLe: t("2026-10-05T15:01") },
      { userId: kone },
    ]);
    await reunion({ numero: "REU-2026-00003", debutPrevu: t("2026-10-06T15:00"), statut: "annulee", annuleeLe: t("2026-10-05T12:00"), motifAnnulation: "Reportée" }, [{ userId: awa }]);

    const periodes = (await periodesDeduites(org, DU, AU, [awa, kone], tout(chef), ABIDJAN, MAINTENANT)).filter((p) => p.origine?.source === "reunion");
    const de = (u: string) => periodes.filter((p) => p.userId === u).map((p) => p.origine?.reference);
    expect(de(awa)).toEqual(["REU-2026-00002", "REU-2026-00001"]);
    expect(de(kone)).toEqual(["REU-2026-00001"]);
    expect(periodes.find((p) => p.id === `reunion:${point}` && p.userId === awa)).toMatchObject({ debut: t("2026-10-06T10:00"), fin: t("2026-10-06T10:45"), origine: { titre: "Point commercial", lien: `/meeting/${point}` } });
  });

  it("le titre et le lien d'une réunion suivent l'invitation de celui qui lit", async () => {
    const accueil = await compte(org, "Accueil");
    const lu = (await periodesDeduites(org, DU, AU, [awa], lecteur(accueil, "meeting.participer"), ABIDJAN, MAINTENANT)).filter((p) => p.origine?.source === "reunion");
    expect(lu.map((p) => p.origine)).toEqual([
      { source: "reunion", reference: "REU-2026-00002", titre: null, lien: null },
      { source: "reunion", reference: "REU-2026-00001", titre: null, lien: null },
    ]);
    const pourAwa = (await periodesDeduites(org, DU, AU, [awa], lecteur(awa, "meeting.participer"), ABIDJAN, MAINTENANT)).filter((p) => p.origine?.source === "reunion");
    expect(pourAwa.every((p) => p.origine?.lien?.startsWith("/meeting/"))).toBe(true);
  });

  it("l'accueil voit l'absence, pas la nature du congé ni la mission", async () => {
    const accueil = lecteur(newId(), "planning.equipe.consulter");
    const periodes = await periodesDeduites(org, DU, AU, [awa], accueil, ABIDJAN, MAINTENANT);
    expect(periodes.length).toBeGreaterThan(0);
    expect(periodes.every((p) => p.origine?.titre === null && p.origine.lien === null)).toBe(true);
  });

  it("rien ne passe d'une entreprise à l'autre, même pour un même compte", async () => {
    const ailleurs = await salarie(autreOrg, "Awa Koné", awa);
    await conge(autreOrg, ailleurs, "2026-10-05", "2026-10-09");
    const id = newId();
    await db.insert(missions).values({ id, organizationId: autreOrg, reference: "LIV-2026-00001", nature: "livraison", titre: "Ailleurs", employeId: ailleurs, echeanceLe: t("2026-10-06T17:00") });

    const ici = await periodesDeduites(org, DU, AU, [awa], tout(awa), ABIDJAN, MAINTENANT);
    expect(ici.some((p) => p.id === `mission:${id}`)).toBe(false);
    expect(ici.filter((p) => p.origine?.source === "conge").map((p) => p.debut)).toEqual([t("2026-10-08T00:00")]);
    const labas = await periodesDeduites(autreOrg, DU, AU, [awa], tout(awa), ABIDJAN, MAINTENANT);
    expect(labas.map((p) => p.origine?.source).sort()).toEqual(["conge", "mission"]);
  });

  it("un salarié sans compte ne tient pas de planning", async () => {
    const sansCompte = await salarie(org, "Yao (sans compte)", null);
    await mission({ reference: "LIV-2026-00010", employeId: sansCompte, echeanceLe: t("2026-10-07T17:00") });
    const periodes = await periodesDeduites(org, DU, AU, [awa], tout(awa), ABIDJAN, MAINTENANT);
    expect(periodes.some((p) => p.origine?.reference === "LIV-2026-00010")).toBe(false);
  });

  it("créneaux saisis et périodes déduites se lisent ensemble ; le plus récent dit le statut", async () => {
    await db.transaction((tx) =>
      enregistrerCreneauDans(tx, org, { userId: awa, statut: "en_course", debut: t("2026-10-06T10:15"), fin: t("2026-10-06T10:30"), lieu: "Banque" }, { userId: awa, gere: false }),
    );
    const semaine = await planningSur(org, DU, AU, [awa], tout(awa), ABIDJAN, MAINTENANT);
    expect(semaine.filter((c) => !c.origine).map((c) => c.statut)).toEqual(["en_course"]);
    expect(semaine.map((c) => c.debut.getTime())).toEqual([...semaine.map((c) => c.debut.getTime())].sort((a, b) => a - b));

    expect(etatActuel(t("2026-10-06T10:05"), semaine, [])).toMatchObject({ statut: "en_reunion", source: "deduite" });
    expect(etatActuel(t("2026-10-06T10:20"), semaine, [])).toMatchObject({ statut: "en_course", source: "creneau" });
    expect(etatActuel(t("2026-10-06T10:35"), semaine, [])).toMatchObject({ statut: "en_reunion", jusqua: t("2026-10-06T10:45") });
  });
});
