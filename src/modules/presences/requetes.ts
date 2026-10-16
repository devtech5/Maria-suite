import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";
import { employees } from "@/modules/personnes/schema";

import { NATURES_CONGE, ajouterJours, calculerSolde, etatDuJour, heureLocale, joursEntre, type EtatJour, type NatureConge, type Solde } from "./calcul";
import { feriesEntre, type Reglages } from "./creation";
import { ajustementsConge, conges, joursFeries, presences } from "./schema";

export interface PresenceDuJour {
  id: string;
  nom: string;
  poste: string | null;
  employeeId: string | null;
  userId: string | null;
  arrivee: string;
  derniere: string;
  depart: string | null;
  source: "automatique" | "manuel";
  motif: string | null;
}

/** Qui est venu ce jour-là, salariés et comptes sans fiche confondus. */
export async function presencesDuJour(organizationId: string, jour: string, fuseau: string): Promise<PresenceDuJour[]> {
  const lignes = await db
    .select({
      id: presences.id,
      employeeId: presences.employeeId,
      userId: presences.userId,
      nomSalarie: employees.nom,
      poste: employees.poste,
      nomCompte: users.fullName,
      arrivee: presences.arrivee,
      derniere: presences.derniereActivite,
      depart: presences.depart,
      source: presences.source,
      motif: presences.motif,
    })
    .from(presences)
    .leftJoin(employees, eq(employees.id, presences.employeeId))
    .leftJoin(users, eq(users.id, presences.userId))
    .where(and(eq(presences.organizationId, organizationId), eq(presences.jour, jour)))
    .orderBy(asc(presences.arrivee));
  return lignes.map((l) => ({
    id: l.id,
    nom: l.nomSalarie ?? l.nomCompte ?? "Compte inconnu",
    poste: l.poste,
    employeeId: l.employeeId,
    userId: l.userId,
    arrivee: heureLocale(l.arrivee, fuseau),
    derniere: heureLocale(l.derniere, fuseau),
    depart: l.depart ? heureLocale(l.depart, fuseau) : null,
    source: l.source,
    motif: l.motif,
  }));
}

export async function maPresence(organizationId: string, userId: string, jour: string, fuseau: string): Promise<{ arrivee: string; derniere: string; depart: string | null } | null> {
  const [l] = await db
    .select({ arrivee: presences.arrivee, derniere: presences.derniereActivite, depart: presences.depart })
    .from(presences)
    .where(and(eq(presences.organizationId, organizationId), eq(presences.userId, userId), eq(presences.jour, jour)));
  return l ? { arrivee: heureLocale(l.arrivee, fuseau), derniere: heureLocale(l.derniere, fuseau), depart: l.depart ? heureLocale(l.depart, fuseau) : null } : null;
}

export interface SalarieActif {
  id: string;
  nom: string;
  poste: string;
  matricule: string;
  debut: string;
  fin: string | null;
  userId: string | null;
}

/** Salariés dont le contrat couvre au moins un jour de la période. */
export async function salariesSur(organizationId: string, debut: string, fin: string): Promise<SalarieActif[]> {
  return db
    .select({ id: employees.id, nom: employees.nom, poste: employees.poste, matricule: employees.matricule, debut: employees.debut, fin: employees.fin, userId: employees.userId })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt), lte(employees.debut, fin), or(isNull(employees.fin), gte(employees.fin, debut))))
    .orderBy(asc(employees.nom));
}

/** Congés accordés couvrant la période : employé → jour → nature. */
async function congesAccordesSur(organizationId: string, debut: string, fin: string): Promise<Map<string, Map<string, NatureConge>>> {
  const lignes = await db
    .select({ employeeId: conges.employeeId, debut: conges.debut, fin: conges.fin, nature: conges.nature })
    .from(conges)
    .where(and(eq(conges.organizationId, organizationId), eq(conges.statut, "approuve"), lte(conges.debut, fin), gte(conges.fin, debut)));
  const parSalarie = new Map<string, Map<string, NatureConge>>();
  for (const c of lignes) {
    const jours = parSalarie.get(c.employeeId) ?? new Map<string, NatureConge>();
    for (const j of joursEntre(c.debut < debut ? debut : c.debut, c.fin > fin ? fin : c.fin)) jours.set(j, c.nature);
    parSalarie.set(c.employeeId, jours);
  }
  return parSalarie;
}

export interface LigneRegistre {
  salarie: SalarieActif;
  jours: EtatJour[];
  presents: number;
  retards: number;
  absences: number;
  conges: number;
}

/** Registre d'une période (un mois en pratique) : une ligne par salarié, une case par jour. */
export async function registre(
  organizationId: string,
  debut: string,
  fin: string,
  r: Reglages,
  aujourdhui: string,
  maintenant: string,
): Promise<{ jours: string[]; feries: Map<string, string>; lignes: LigneRegistre[] }> {
  const jours = joursEntre(debut, fin);
  const [salaries, feries, congesParSalarie, pointages] = await Promise.all([
    salariesSur(organizationId, debut, fin),
    feriesEntre(organizationId, debut, fin),
    congesAccordesSur(organizationId, debut, fin),
    db
      .select({ employeeId: presences.employeeId, jour: presences.jour, arrivee: presences.arrivee, derniere: presences.derniereActivite })
      .from(presences)
      .where(and(eq(presences.organizationId, organizationId), gte(presences.jour, debut), lte(presences.jour, fin))),
  ]);
  const presenceDe = new Map<string, { arrivee: string; derniere: string }>();
  for (const p of pointages) if (p.employeeId) presenceDe.set(`${p.employeeId}|${p.jour}`, { arrivee: heureLocale(p.arrivee, r.fuseau), derniere: heureLocale(p.derniere, r.fuseau) });

  const lignes = salaries.map((s) => {
    const etats = jours.map((jour) =>
      etatDuJour({
        jour,
        aujourdhui,
        maintenant,
        heureArrivee: r.heureArrivee,
        tolerance: r.toleranceMinutes,
        joursTravailles: r.joursTravailles,
        feries,
        contrat: { debut: s.debut, fin: s.fin },
        presence: presenceDe.get(`${s.id}|${jour}`),
        conge: congesParSalarie.get(s.id)?.get(jour),
      }),
    );
    return {
      salarie: s,
      jours: etats,
      presents: etats.filter((e) => e.etat === "present").length,
      retards: etats.filter((e) => e.etat === "present" && e.retard > 0).length,
      absences: etats.filter((e) => e.etat === "absent").length,
      conges: etats.filter((e) => e.etat === "conge").length,
    };
  });
  return { jours, feries, lignes };
}

// ------------------------------------------------------------------ soldes

export interface SoldeSalarie extends Solde {
  salarie: SalarieActif;
  depuis: string;
}

/** Soldes de congés payés au jour dit, pour un salarié ou pour tous. */
export async function soldesConges(organizationId: string, r: Reglages, aujourdhui: string, employeeIds?: string[]): Promise<SoldeSalarie[]> {
  let salaries = await salariesSur(organizationId, aujourdhui, aujourdhui);
  if (employeeIds) salaries = salaries.filter((s) => employeeIds.includes(s.id));
  if (salaries.length === 0) return [];
  const ids = salaries.map((s) => s.id);
  const [ajustements, payes] = await Promise.all([
    db.select().from(ajustementsConge).where(and(eq(ajustementsConge.organizationId, organizationId), inArray(ajustementsConge.employeeId, ids))),
    db
      .select({ employeeId: conges.employeeId, debut: conges.debut, statut: conges.statut, jours: conges.joursCentiemes })
      .from(conges)
      .where(and(eq(conges.organizationId, organizationId), inArray(conges.employeeId, ids), eq(conges.nature, "paye"), inArray(conges.statut, ["demande", "approuve"]))),
  ]);

  return salaries.map((s) => {
    const siens = ajustements.filter((a) => a.employeeId === s.id).sort((a, b) => a.jour.localeCompare(b.jour) || a.createdAt.getTime() - b.createdAt.getTime());
    const reprise = [...siens].reverse().find((a) => a.motif === "reprise");
    const depuis = reprise ? reprise.jour : s.debut;
    const apres = siens.filter((a) => a.motif !== "reprise" && a.jour >= depuis);
    const conge = payes.filter((c) => c.employeeId === s.id && c.debut >= depuis);
    const solde = calculerSolde({
      depuis,
      aujourdhui,
      centiemesParMois: r.congesCentiemesParMois,
      reprise: reprise?.centiemes ?? 0,
      ajustements: apres.reduce((t, a) => t + a.centiemes, 0),
      pris: conge.filter((c) => c.statut === "approuve").reduce((t, c) => t + c.jours, 0),
      enAttente: conge.filter((c) => c.statut === "demande").reduce((t, c) => t + c.jours, 0),
    });
    return { salarie: s, depuis, ...solde };
  });
}

// ---------------------------------------------------------------- demandes

export interface LigneConge {
  id: string;
  numero: string;
  employeeId: string;
  nom: string;
  nature: NatureConge;
  libelleNature: string;
  debut: string;
  fin: string;
  debutDemi: boolean;
  finDemi: boolean;
  jours: number;
  motif: string | null;
  statut: "demande" | "approuve" | "refuse" | "annule";
  commentaire: string | null;
  salarieUserId: string | null;
  aJustificatif: boolean;
  creeLe: Date;
}

/** Libellé de la nature, en base : « payé » ou « maternité » se cherchent comme l'écran les affiche. */
const libelleNatureSql = sql`(case ${conges.nature}::text ${sql.join(
  Object.entries(NATURES_CONGE).map(([cle, n]) => sql`when ${cle} then ${n.libelle}`),
  sql` `,
)} end)`;

export async function listerConges(
  organizationId: string,
  filtre: { employeeId?: string; statuts?: LigneConge["statut"][]; limite?: number; filtres?: FiltresListe } = {},
): Promise<LigneConge[]> {
  const conditions = [eq(conges.organizationId, organizationId)];
  if (filtre.employeeId) conditions.push(eq(conges.employeeId, filtre.employeeId));
  if (filtre.statuts?.length) conditions.push(inArray(conges.statut, filtre.statuts));
  if (filtre.filtres) {
    // Filtrés en base, pas après coup : l'historique s'arrête aux cent derniers.
    // Un congé répond à la période s'il la chevauche : du 28 au 3, il compte
    // dans « au 1er » comme dans « du 2 ».
    const { q, periode } = filtre.filtres;
    const recherche = and(
      motsDans([conges.numero, employees.nom, employees.matricule, libelleNatureSql, conges.motif, conges.commentaire], motsRecherche(q)),
      dansPeriodeSql(conges.fin, { du: periode.du, au: null }),
      dansPeriodeSql(conges.debut, { du: null, au: periode.au }),
    );
    if (recherche) conditions.push(recherche);
  }
  const lignes = await db
    .select({
      id: conges.id,
      numero: conges.numero,
      employeeId: conges.employeeId,
      nom: employees.nom,
      nature: conges.nature,
      debut: conges.debut,
      fin: conges.fin,
      debutDemi: conges.debutDemi,
      finDemi: conges.finDemi,
      jours: conges.joursCentiemes,
      motif: conges.motif,
      statut: conges.statut,
      commentaire: conges.commentaire,
      salarieUserId: employees.userId,
      justificatif: conges.justificatif,
      creeLe: conges.createdAt,
    })
    .from(conges)
    .innerJoin(employees, eq(employees.id, conges.employeeId))
    .where(and(...conditions))
    .orderBy(desc(conges.debut))
    .limit(filtre.limite ?? 200);
  return lignes.map(({ justificatif, ...l }) => ({ ...l, aJustificatif: Boolean(justificatif), libelleNature: NATURES_CONGE[l.nature].libelle }));
}

/** Les absences des sept prochains jours : qui manquera cette semaine. */
export async function absencesAVenir(organizationId: string, aujourdhui: string): Promise<LigneConge[]> {
  const fin = ajouterJours(aujourdhui, 7);
  return (await listerConges(organizationId, { statuts: ["approuve"] })).filter((c) => c.debut <= fin && c.fin >= aujourdhui);
}

export async function listerFeries(organizationId: string, annee: number) {
  return db
    .select()
    .from(joursFeries)
    .where(and(eq(joursFeries.organizationId, organizationId), gte(joursFeries.jour, `${annee}-01-01`), lte(joursFeries.jour, `${annee}-12-31`)))
    .orderBy(asc(joursFeries.jour));
}

export interface EtatPresences {
  demandesEnAttente: number;
  presentsAujourdhui: number;
  salaries: number;
}

/** Pour le tableau de bord. */
export async function etatPresences(organizationId: string, aujourdhui: string): Promise<EtatPresences> {
  const [demandes, presents, salaries] = await Promise.all([
    db.select({ id: conges.id }).from(conges).where(and(eq(conges.organizationId, organizationId), eq(conges.statut, "demande"))),
    db.select({ id: presences.id }).from(presences).where(and(eq(presences.organizationId, organizationId), eq(presences.jour, aujourdhui))),
    salariesSur(organizationId, aujourdhui, aujourdhui),
  ]);
  return { demandesEnAttente: demandes.length, presentsAujourdhui: presents.length, salaries: salaries.length };
}
