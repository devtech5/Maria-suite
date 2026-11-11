import "server-only";

import { and, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { employees } from "@/modules/personnes/schema";

import {
  NATURES_CONGE,
  chevauche,
  feriesProposes,
  heureValide,
  instantLocal,
  joursDecomptes,
  jourLocal,
  regleConges,
  type NatureConge,
} from "./calcul";
import {
  centiemesDeMinutes,
  formatNumeroPermission,
  minutesEntre,
  permissionsSeChevauchent,
  refusPermission,
  type GenrePermission,
  type MotifPermission,
  type TraitementPermission,
} from "./permissions";
import { oublierContextePresence } from "./pointage";
import { ajustementsConge, conges, demandesPermission, joursFeries, presences, reglagesPresence } from "./schema";

async function journaliser(tx: Transaction | typeof db, organizationId: string, userId: string, action: string, entityType: string, entityId: string, apres: unknown) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType, entityId, after: apres });
}

// --------------------------------------------------------------- réglages

export interface Reglages {
  pointageAuto: boolean;
  heureArrivee: string;
  heureDepart: string;
  toleranceMinutes: number;
  joursTravailles: number[];
  congesCentiemesParMois: number;
  decompte: "ouvrables" | "ouvres";
  /** Attesté par un responsable ; sinon la règle du pays, à vérifier. */
  verifie: boolean;
  verifieLe: Date | null;
  source: string;
  fuseau: string;
  pays: string;
}

/** Les réglages de l'entreprise, ou ceux du pays tant qu'elle n'en a pas posé. */
export async function reglagesDe(organizationId: string): Promise<Reglages> {
  const [org] = await db.select({ pays: organizations.countryCode, fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  const pays = org?.pays ?? "CI";
  const regle = regleConges(pays);
  const [r] = await db.select().from(reglagesPresence).where(eq(reglagesPresence.organizationId, organizationId));
  return {
    pointageAuto: r?.pointageAuto ?? true,
    heureArrivee: r?.heureArrivee ?? "08:00",
    heureDepart: r?.heureDepart ?? "17:00",
    toleranceMinutes: r?.toleranceMinutes ?? 15,
    joursTravailles: r?.joursTravailles ?? [1, 2, 3, 4, 5],
    congesCentiemesParMois: r?.congesCentiemesParMois ?? regle.centiemesParMois,
    decompte: (r?.decompte as Reglages["decompte"]) ?? regle.decompte,
    verifie: Boolean(r?.verifieLe),
    verifieLe: r?.verifieLe ?? null,
    source: regle.source,
    fuseau: org?.fuseau ?? "Africa/Abidjan",
    pays,
  };
}

export interface SaisieReglages {
  pointageAuto: boolean;
  heureArrivee: string;
  heureDepart: string;
  toleranceMinutes: number;
  joursTravailles: number[];
  congesCentiemesParMois: number;
  decompte: "ouvrables" | "ouvres";
}

export async function enregistrerReglagesPour(organizationId: string, userId: string, s: SaisieReglages, atteste: boolean): Promise<void> {
  if (!heureValide(s.heureArrivee) || !heureValide(s.heureDepart)) throw new Error("Heure au format HH:MM, par exemple 08:00.");
  if (s.heureDepart <= s.heureArrivee) throw new Error("L'heure de départ doit suivre l'heure d'arrivée.");
  const jours = [...new Set(s.joursTravailles)].filter((j) => j >= 1 && j <= 7).sort();
  if (jours.length === 0) throw new Error("Cochez au moins un jour travaillé.");
  const ligne = {
    pointageAuto: s.pointageAuto,
    heureArrivee: s.heureArrivee,
    heureDepart: s.heureDepart,
    toleranceMinutes: s.toleranceMinutes,
    joursTravailles: jours,
    congesCentiemesParMois: s.congesCentiemesParMois,
    decompte: s.decompte,
    verifieLe: atteste ? new Date() : null,
    verifieParUserId: atteste ? userId : null,
  };
  await db
    .insert(reglagesPresence)
    .values({ id: newId(), organizationId, ...ligne })
    .onConflictDoUpdate({ target: reglagesPresence.organizationId, set: { ...ligne, updatedAt: new Date() } });
  oublierContextePresence(organizationId);
  await journaliser(db, organizationId, userId, "presence.reglages", "reglages_presence", organizationId, { ...ligne, verifieLe: undefined });
}

// ------------------------------------------------------------------ fériés

export async function feriesEntre(organizationId: string, debut: string, fin: string): Promise<Map<string, string>> {
  const lignes = await db
    .select({ jour: joursFeries.jour, libelle: joursFeries.libelle })
    .from(joursFeries)
    .where(and(eq(joursFeries.organizationId, organizationId), gte(joursFeries.jour, debut), lte(joursFeries.jour, fin)));
  return new Map(lignes.map((l) => [l.jour, l.libelle]));
}

export async function ajouterFeriePour(organizationId: string, userId: string, jour: string, libelle: string): Promise<void> {
  await db
    .insert(joursFeries)
    .values({ id: newId(), organizationId, jour, libelle: libelle.trim() })
    .onConflictDoUpdate({ target: [joursFeries.organizationId, joursFeries.jour], set: { libelle: libelle.trim(), updatedAt: new Date() } });
  await journaliser(db, organizationId, userId, "presence.ferie", "jour_ferie", organizationId, { ajoute: jour, libelle });
}

export async function retirerFeriePour(organizationId: string, userId: string, id: string): Promise<void> {
  const [l] = await db.delete(joursFeries).where(and(eq(joursFeries.id, id), eq(joursFeries.organizationId, organizationId))).returning({ jour: joursFeries.jour });
  if (!l) throw new Error("Jour férié introuvable.");
  await journaliser(db, organizationId, userId, "presence.ferie", "jour_ferie", id, { retire: l.jour });
}

/** Ajoute les fériés connus du pays pour l'année, sans toucher à ceux déjà posés. */
export async function proposerFeriesPour(organizationId: string, userId: string, annee: number): Promise<number> {
  const { pays } = await reglagesDe(organizationId);
  const proposes = feriesProposes(pays, annee);
  if (proposes.length === 0) return 0;
  const poses = await db
    .insert(joursFeries)
    .values(proposes.map((f) => ({ id: newId(), organizationId, jour: f.jour, libelle: f.libelle })))
    .onConflictDoNothing()
    .returning({ id: joursFeries.id });
  if (poses.length) await journaliser(db, organizationId, userId, "presence.ferie", "jour_ferie", organizationId, { proposes: annee, ajoutes: poses.length });
  return poses.length;
}

// --------------------------------------------------------------- pointage

async function salarieDe(tx: Transaction | typeof db, organizationId: string, employeeId: string) {
  const [s] = await tx
    .select({ id: employees.id, nom: employees.nom, userId: employees.userId, debut: employees.debut, fin: employees.fin, actif: employees.actif })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)));
  if (!s) throw new Error("Salarié introuvable.");
  return s;
}

export interface SaisiePointage {
  employeeId: string;
  jour: string;
  arrivee: string;
  depart: string | null;
  motif: string;
}

/** Pointe ou corrige à la main la journée d'un salarié. Toujours motivé, toujours tracé. */
export async function pointerManuellementPour(organizationId: string, userId: string, s: SaisiePointage): Promise<void> {
  if (!heureValide(s.arrivee) || (s.depart && !heureValide(s.depart))) throw new Error("Heure au format HH:MM.");
  if (s.depart && s.depart < s.arrivee) throw new Error("Le départ ne peut pas précéder l'arrivée.");
  if (s.motif.trim().length < 3) throw new Error("Indiquez le motif : oubli, panne, travail hors site…");
  const { fuseau } = await reglagesDe(organizationId);
  if (s.jour > jourLocal(new Date(), fuseau)) throw new Error("On ne pointe pas un jour à venir.");
  const salarie = await salarieDe(db, organizationId, s.employeeId);
  const arrivee = instantLocal(s.jour, s.arrivee, fuseau);
  const depart = s.depart ? instantLocal(s.jour, s.depart, fuseau) : null;

  await db.transaction(async (tx) => {
    const conditions = [eq(presences.employeeId, salarie.id)];
    if (salarie.userId) conditions.push(eq(presences.userId, salarie.userId));
    const [existante] = await tx
      .select({ id: presences.id, arrivee: presences.arrivee })
      .from(presences)
      .where(and(eq(presences.organizationId, organizationId), eq(presences.jour, s.jour), sql`(${sql.join(conditions, sql` OR `)})`))
      .limit(1);
    const champs = { arrivee, derniereActivite: depart ?? arrivee, depart, source: "manuel" as const, corrigeParUserId: userId, motif: s.motif.trim(), employeeId: salarie.id, updatedAt: new Date() };
    if (existante) {
      await tx.update(presences).set(champs).where(eq(presences.id, existante.id));
      await journaliser(tx, organizationId, userId, "presence.corriger", "presence", existante.id, { salarie: salarie.nom, jour: s.jour, arrivee: s.arrivee, depart: s.depart, motif: s.motif });
    } else {
      const id = newId();
      await tx.insert(presences).values({ id, organizationId, userId: salarie.userId, jour: s.jour, ...champs });
      await journaliser(tx, organizationId, userId, "presence.pointer", "presence", id, { salarie: salarie.nom, jour: s.jour, arrivee: s.arrivee, depart: s.depart, motif: s.motif });
    }
  });
}

/** Le compte pointe son propre départ. */
export async function pointerDepartPour(organizationId: string, userId: string): Promise<void> {
  const { fuseau } = await reglagesDe(organizationId);
  const jour = jourLocal(new Date(), fuseau);
  const maintenant = new Date();
  const [l] = await db
    .update(presences)
    .set({ depart: maintenant, derniereActivite: sql`greatest(${presences.derniereActivite}, ${maintenant.toISOString()}::timestamptz)`, updatedAt: maintenant })
    .where(and(eq(presences.organizationId, organizationId), eq(presences.userId, userId), eq(presences.jour, jour)))
    .returning({ id: presences.id });
  if (!l) throw new Error("Aucune arrivée pointée aujourd'hui.");
  await journaliser(db, organizationId, userId, "presence.depart", "presence", l.id, { jour });
}

// ----------------------------------------------------------------- congés

export interface SaisieConge {
  employeeId: string;
  nature: NatureConge;
  debut: string;
  fin: string;
  debutDemi: boolean;
  finDemi: boolean;
  motif: string | null;
  justificatif?: string | null;
}

async function decompterDans(organizationId: string, s: Pick<SaisieConge, "debut" | "fin" | "debutDemi" | "finDemi">): Promise<number> {
  const r = await reglagesDe(organizationId);
  const feries = await feriesEntre(organizationId, s.debut, s.fin);
  return joursDecomptes(s.debut, s.fin, { decompte: r.decompte, joursTravailles: r.joursTravailles, feries: new Set(feries.keys()) }, { debut: s.debutDemi, fin: s.finDemi });
}

/**
 * Demande de congé (statut « en attente »), ou saisie directe par un
 * responsable (`accorder`), qui l'accorde dans le même geste.
 *
 * Refusé : une période qui chevauche un autre congé en cours ou accordé, une
 * période sans aucun jour décompté, et — pour une demande, pas pour une
 * saisie — un congé payé au-delà du solde.
 */
export async function demanderCongePour(
  organizationId: string,
  userId: string,
  s: SaisieConge,
  options: { accorder: boolean; soldeApresDemandes?: number },
): Promise<{ id: string; numero: string; jours: number; salarie: string }> {
  if (s.fin < s.debut) throw new Error("La fin précède le début.");
  if (!(s.nature in NATURES_CONGE)) throw new Error("Nature de congé inconnue.");
  const salarie = await salarieDe(db, organizationId, s.employeeId);
  if (!salarie.actif) throw new Error(`${salarie.nom} n'est plus en poste.`);
  if (s.debut < salarie.debut) throw new Error("Le congé commence avant l'embauche.");
  if (salarie.fin && s.fin > salarie.fin) throw new Error("Le congé déborde la fin du contrat.");

  const jours = await decompterDans(organizationId, s);
  if (jours === 0) throw new Error("Aucun jour à décompter sur cette période : jours fériés ou de repos seulement.");
  if (!options.accorder && NATURES_CONGE[s.nature].decompteSolde && options.soldeApresDemandes !== undefined && jours > options.soldeApresDemandes) {
    throw new Error(`Solde insuffisant : ${(options.soldeApresDemandes / 100).toLocaleString("fr-FR")} jour(s) disponible(s), ${(jours / 100).toLocaleString("fr-FR")} demandé(s).`);
  }

  return db.transaction(async (tx) => {
    const autres = await tx
      .select({ numero: conges.numero, debut: conges.debut, fin: conges.fin })
      .from(conges)
      .where(and(eq(conges.organizationId, organizationId), eq(conges.employeeId, salarie.id), inArray(conges.statut, ["demande", "approuve"]), lte(conges.debut, s.fin), gte(conges.fin, s.debut)));
    const conflit = autres.find((a) => chevauche(a, s));
    if (conflit) throw new Error(`Cette période chevauche le congé ${conflit.numero}.`);

    const annee = s.debut.slice(0, 4);
    const numero = await prochainNumero(tx, organizationId, { cle: "conge", prefix: `CONG-${annee}-`, padding: 5, periode: annee });
    const id = newId();
    await tx.insert(conges).values({
      id,
      organizationId,
      employeeId: salarie.id,
      numero,
      nature: s.nature,
      debut: s.debut,
      fin: s.fin,
      debutDemi: s.debutDemi,
      finDemi: s.finDemi,
      joursCentiemes: jours,
      motif: s.motif,
      justificatif: s.justificatif ?? null,
      statut: options.accorder ? "approuve" : "demande",
      demandeParUserId: userId,
      decideParUserId: options.accorder ? userId : null,
      decideLe: options.accorder ? new Date() : null,
    });
    await journaliser(tx, organizationId, userId, options.accorder ? "conge.saisir" : "conge.demander", "conge", id, { numero, salarie: salarie.nom, nature: s.nature, debut: s.debut, fin: s.fin, jours });
    return { id, numero, jours, salarie: salarie.nom };
  });
}

/** Accorde ou refuse une demande. Les jours sont recomptés et figés à ce moment. */
export async function deciderCongePour(
  organizationId: string,
  userId: string,
  id: string,
  decision: "approuve" | "refuse",
  commentaire: string | null,
): Promise<{ numero: string; demandeur: string | null; salarieUserId: string | null; nom: string }> {
  if (decision === "refuse" && !commentaire?.trim()) throw new Error("Dites pourquoi la demande est refusée : le salarié le lira.");
  // Le recompte lit réglages et fériés : il se fait AVANT la transaction, qui
  // ne doit tenir son verrou que le temps d'écrire.
  const [lu] = await db
    .select({ debut: conges.debut, fin: conges.fin, debutDemi: conges.debutDemi, finDemi: conges.finDemi })
    .from(conges)
    .where(and(eq(conges.id, id), eq(conges.organizationId, organizationId)));
  if (!lu) throw new Error("Demande introuvable.");
  const jours = decision === "approuve" ? await decompterDans(organizationId, lu) : undefined;

  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: conges.id, numero: conges.numero, statut: conges.statut, demandeur: conges.demandeParUserId, employeeId: conges.employeeId })
      .from(conges)
      .where(and(eq(conges.id, id), eq(conges.organizationId, organizationId)))
      .for("update");
    if (!c) throw new Error("Demande introuvable.");
    if (c.statut !== "demande") throw new Error("Cette demande a déjà été traitée.");
    await tx
      .update(conges)
      .set({ statut: decision, decideParUserId: userId, decideLe: new Date(), commentaire: commentaire?.trim() || null, ...(jours !== undefined ? { joursCentiemes: jours } : {}), updatedAt: new Date() })
      .where(eq(conges.id, c.id));
    const salarie = await salarieDe(tx, organizationId, c.employeeId);
    await journaliser(tx, organizationId, userId, `conge.${decision}`, "conge", c.id, { numero: c.numero, salarie: salarie.nom, commentaire });
    return { numero: c.numero, demandeur: c.demandeur, salarieUserId: salarie.userId, nom: salarie.nom };
  });
}

/**
 * Annule un congé. Le salarié annule le sien tant qu'il n'a pas commencé ;
 * un responsable annule n'importe lequel, même entamé (retour anticipé).
 */
export async function annulerCongePour(organizationId: string, userId: string, id: string, responsable: boolean, aujourdhui: string): Promise<{ numero: string }> {
  const [c] = await db
    .select({ id: conges.id, numero: conges.numero, statut: conges.statut, debut: conges.debut, employeeId: conges.employeeId })
    .from(conges)
    .where(and(eq(conges.id, id), eq(conges.organizationId, organizationId)));
  if (!c) throw new Error("Congé introuvable.");
  if (c.statut === "annule" || c.statut === "refuse") throw new Error("Ce congé n'est plus en cours.");
  if (!responsable) {
    const salarie = await salarieDe(db, organizationId, c.employeeId);
    if (salarie.userId !== userId) throw new Error("Vous ne pouvez annuler que vos propres congés.");
    if (c.debut <= aujourdhui) throw new Error("Ce congé a commencé : demandez à votre responsable de l'annuler.");
  }
  await db.update(conges).set({ statut: "annule", updatedAt: new Date() }).where(and(eq(conges.id, c.id), ne(conges.statut, "annule")));
  await journaliser(db, organizationId, userId, "conge.annule", "conge", c.id, { numero: c.numero });
  return { numero: c.numero };
}

export interface SaisieAjustement {
  employeeId: string;
  jour: string;
  motif: "reprise" | "majoration" | "correction";
  centiemes: number;
  note: string | null;
}

export async function ajusterSoldePour(organizationId: string, userId: string, s: SaisieAjustement): Promise<void> {
  const salarie = await salarieDe(db, organizationId, s.employeeId);
  if (s.motif !== "reprise" && s.centiemes === 0) throw new Error("Un ajustement de zéro jour ne change rien.");
  if (s.motif === "correction" && !s.note?.trim()) throw new Error("Expliquez la correction.");
  const id = newId();
  await db.insert(ajustementsConge).values({ id, organizationId, employeeId: salarie.id, jour: s.jour, motif: s.motif, centiemes: s.centiemes, note: s.note, creeParUserId: userId });
  await journaliser(db, organizationId, userId, "conge.ajuster", "ajustement_conge", id, { salarie: salarie.nom, ...s });
}

/** Fiche salarié active rattachée à un compte, s'il y en a une. */
export async function salarieDuCompte(organizationId: string, userId: string): Promise<{ id: string; nom: string } | null> {
  const [s] = await db
    .select({ id: employees.id, nom: employees.nom })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.userId, userId), eq(employees.actif, true), isNull(employees.deletedAt)))
    .limit(1);
  return s ?? null;
}

// ----------------------------------------------------- permissions et absences

export interface SaisiePermission {
  employeeId: string;
  genre: GenrePermission;
  debut: string;
  fin: string;
  heureDebut: string | null;
  heureFin: string | null;
  motif: MotifPermission;
  precision: string | null;
  justificatif?: string | null;
}

/** Durée d'une journée de travail, d'après les horaires de l'entreprise. */
function minutesJournee(r: Reglages): number {
  return Math.max(0, minutesEntre(r.heureArrivee, r.heureDepart));
}

/** Ce que la décision retire du solde : rien, sauf « déduite des congés ». */
function centiemesADeduire(
  traitement: TraitementPermission,
  p: { genre: string; minutes: number; joursCentiemes: number },
  r: Reglages,
): number {
  if (traitement !== "deduite_conges") return 0;
  return p.genre === "heures" ? centiemesDeMinutes(p.minutes, minutesJournee(r)) : p.joursCentiemes;
}

/**
 * Demande de permission ou d'absence ; saisie par un responsable
 * (`accorder` avec son traitement), elle est accordée dans le même geste.
 *
 * Refusé : un jour non travaillé, une plage qui croise un congé ou une autre
 * permission en cours ou accordée.
 */
export async function demanderPermissionPour(
  organizationId: string,
  userId: string,
  s: SaisiePermission,
  options: { aujourdhui: string; accorder: TraitementPermission | null },
): Promise<{ id: string; numero: string; salarie: string; minutes: number; jours: number }> {
  const heureDebut = s.genre === "heures" ? s.heureDebut : null;
  const heureFin = s.genre === "heures" ? s.heureFin : null;
  const fin = s.genre === "heures" ? s.debut : s.fin;
  const refus = refusPermission({ genre: s.genre, debut: s.debut, fin, heureDebut, heureFin }, options.aujourdhui, options.accorder !== null);
  if (refus) throw new Error(refus);

  const salarie = await salarieDe(db, organizationId, s.employeeId);
  if (!salarie.actif) throw new Error(`${salarie.nom} n'est plus en poste.`);
  if (s.debut < salarie.debut) throw new Error("La date précède l'embauche.");
  if (salarie.fin && fin > salarie.fin) throw new Error("La date déborde la fin du contrat.");

  const r = await reglagesDe(organizationId);
  const jours = await decompterDans(organizationId, { debut: s.debut, fin, debutDemi: false, finDemi: false });
  if (jours === 0) throw new Error(s.genre === "heures" ? "Ce jour n'est pas travaillé : aucune permission à demander." : "Aucun jour travaillé sur cette période : jours fériés ou de repos seulement.");
  const minutes = s.genre === "heures" ? minutesEntre(heureDebut!, heureFin!) : 0;
  const joursCentiemes = s.genre === "journees" ? jours : 0;
  const plage = { debut: s.debut, fin, heureDebut, heureFin };

  return db.transaction(async (tx) => {
    const congesCroises = await tx
      .select({ numero: conges.numero })
      .from(conges)
      .where(and(eq(conges.organizationId, organizationId), eq(conges.employeeId, salarie.id), inArray(conges.statut, ["demande", "approuve"]), lte(conges.debut, fin), gte(conges.fin, s.debut)));
    if (congesCroises[0]) throw new Error(`Cette période est déjà couverte par le congé ${congesCroises[0].numero}.`);

    const autres = await tx
      .select({ numero: demandesPermission.numero, debut: demandesPermission.debut, fin: demandesPermission.fin, heureDebut: demandesPermission.heureDebut, heureFin: demandesPermission.heureFin })
      .from(demandesPermission)
      .where(
        and(
          eq(demandesPermission.organizationId, organizationId),
          eq(demandesPermission.employeeId, salarie.id),
          inArray(demandesPermission.statut, ["demande", "approuve"]),
          lte(demandesPermission.debut, fin),
          gte(demandesPermission.fin, s.debut),
        ),
      );
    const conflit = autres.find((a) => permissionsSeChevauchent(a, plage));
    if (conflit) throw new Error(`Cette plage croise la demande ${conflit.numero}.`);

    const numero = await prochainNumero(tx, organizationId, formatNumeroPermission(s.debut.slice(0, 4)));
    const id = newId();
    const accorde = options.accorder;
    await tx.insert(demandesPermission).values({
      id,
      organizationId,
      employeeId: salarie.id,
      numero,
      genre: s.genre,
      debut: s.debut,
      fin,
      heureDebut,
      heureFin,
      minutes,
      joursCentiemes,
      motif: s.motif,
      precision: s.precision,
      justificatif: s.justificatif ?? null,
      statut: accorde ? "approuve" : "demande",
      traitement: accorde,
      centiemesDeduits: accorde ? centiemesADeduire(accorde, { genre: s.genre, minutes, joursCentiemes }, r) : 0,
      demandeParUserId: userId,
      decideParUserId: accorde ? userId : null,
      decideLe: accorde ? new Date() : null,
    });
    await journaliser(tx, organizationId, userId, accorde ? "permission.saisir" : "permission.demander", "demande_permission", id, {
      numero,
      salarie: salarie.nom,
      genre: s.genre,
      debut: s.debut,
      fin,
      heureDebut,
      heureFin,
      motif: s.motif,
      traitement: accorde,
    });
    return { id, numero, salarie: salarie.nom, minutes, jours: joursCentiemes };
  });
}

/** Accorde (avec son traitement) ou refuse (avec son motif) une demande. */
export async function deciderPermissionPour(
  organizationId: string,
  userId: string,
  id: string,
  decision: "approuve" | "refuse",
  traitement: TraitementPermission | null,
  commentaire: string | null,
): Promise<{ numero: string; demandeur: string; salarieUserId: string | null; nom: string }> {
  if (decision === "refuse" && !commentaire?.trim()) throw new Error("Dites pourquoi la demande est refusée : le salarié le lira.");
  if (decision === "approuve" && !traitement) throw new Error("Choisissez comment ce temps est traité : payé, à récupérer, déduit des congés ou non payé.");
  const r = await reglagesDe(organizationId);

  return db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(demandesPermission)
      .where(and(eq(demandesPermission.id, id), eq(demandesPermission.organizationId, organizationId)))
      .for("update");
    if (!p) throw new Error("Demande introuvable.");
    if (p.statut !== "demande") throw new Error("Cette demande a déjà été traitée.");
    const retenu = decision === "approuve" ? traitement : null;
    await tx
      .update(demandesPermission)
      .set({
        statut: decision,
        traitement: retenu,
        centiemesDeduits: retenu ? centiemesADeduire(retenu, p, r) : 0,
        decideParUserId: userId,
        decideLe: new Date(),
        commentaire: commentaire?.trim() || null,
        updatedAt: new Date(),
        version: sql`${demandesPermission.version} + 1`,
      })
      .where(eq(demandesPermission.id, p.id));
    const salarie = await salarieDe(tx, organizationId, p.employeeId);
    await journaliser(tx, organizationId, userId, `permission.${decision}`, "demande_permission", p.id, { numero: p.numero, salarie: salarie.nom, traitement: retenu, commentaire });
    return { numero: p.numero, demandeur: p.demandeParUserId, salarieUserId: salarie.userId, nom: salarie.nom };
  });
}

/**
 * Annule une demande. Le salarié retire la sienne tant qu'elle attend, ou
 * tant que le jour n'est pas venu ; un responsable annule n'importe laquelle.
 */
export async function annulerPermissionPour(organizationId: string, userId: string, id: string, responsable: boolean, aujourdhui: string): Promise<{ numero: string }> {
  const [p] = await db
    .select({ id: demandesPermission.id, numero: demandesPermission.numero, statut: demandesPermission.statut, debut: demandesPermission.debut, employeeId: demandesPermission.employeeId })
    .from(demandesPermission)
    .where(and(eq(demandesPermission.id, id), eq(demandesPermission.organizationId, organizationId)));
  if (!p) throw new Error("Demande introuvable.");
  if (p.statut === "annule" || p.statut === "refuse") throw new Error("Cette demande n'est plus en cours.");
  if (!responsable) {
    const salarie = await salarieDe(db, organizationId, p.employeeId);
    if (salarie.userId !== userId) throw new Error("Vous ne pouvez annuler que vos propres demandes.");
    if (p.statut === "approuve" && p.debut <= aujourdhui) throw new Error("Cette permission est entamée : demandez à votre responsable de l'annuler.");
  }
  await db
    .update(demandesPermission)
    .set({ statut: "annule", centiemesDeduits: 0, updatedAt: new Date(), version: sql`${demandesPermission.version} + 1` })
    .where(and(eq(demandesPermission.id, p.id), ne(demandesPermission.statut, "annule")));
  await journaliser(db, organizationId, userId, "permission.annule", "demande_permission", p.id, { numero: p.numero });
  return { numero: p.numero };
}
