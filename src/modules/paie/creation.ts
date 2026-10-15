import "server-only";

import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { employees } from "@/modules/personnes/schema";
import { feriesEntre, reglagesDe } from "@/modules/presences/creation";
import { soldesConges } from "@/modules/presences/requetes";
import { conges } from "@/modules/presences/schema";
import { exigerProvision } from "@/modules/tresorerie/creation";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import {
  BAREME_PAR_DEFAUT,
  absencesDuMois,
  bornesMois,
  calculerBulletinPaie,
  ecriturePaie,
  ecriturePaiementSalaire,
  ecritureVersement,
  finDeMois,
  moisValide,
  refusBareme,
  retenueAbsence,
  totaliser,
  type BaremePaie,
  type ContexteAbsences,
  type ElementsVariables,
} from "./calcul";
import { bulletinsPaie, parametresPaie, periodesPaie } from "./schema";

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: action.split(".")[0], entityId: entiteId, after: apres });
}

// -------------------------------------------------------------------- barème

export async function baremeDe(organizationId: string): Promise<{ bareme: BaremePaie; verifie: boolean; verifieLe: Date | null; verifieParUserId: string | null }> {
  const [p] = await db.select().from(parametresPaie).where(eq(parametresPaie.organizationId, organizationId));
  if (!p) return { bareme: BAREME_PAR_DEFAUT, verifie: false, verifieLe: null, verifieParUserId: null };
  return { bareme: p.bareme, verifie: Boolean(p.verifieLe), verifieLe: p.verifieLe, verifieParUserId: p.verifieParUserId };
}

/**
 * Enregistre le barème. Le modifier efface l'attestation de vérification,
 * sauf si celui qui le modifie l'atteste à nouveau : un taux changé n'a été
 * vérifié par personne.
 */
export async function enregistrerBaremeDans(tx: Transaction, organizationId: string, bareme: BaremePaie, atteste: boolean, userId: string): Promise<void> {
  const refus = refusBareme(bareme);
  if (refus) throw new Error(refus);
  const triees = { ...bareme, tranchesImpot: [...bareme.tranchesImpot].sort((a, b) => a.seuil - b.seuil) };
  const verification = atteste ? { verifieParUserId: userId, verifieLe: new Date() } : { verifieParUserId: null, verifieLe: null };
  const [existant] = await tx.select({ id: parametresPaie.id }).from(parametresPaie).where(eq(parametresPaie.organizationId, organizationId));
  if (existant) {
    await tx
      .update(parametresPaie)
      .set({ bareme: triees, ...verification, updatedAt: new Date(), version: sql`${parametresPaie.version} + 1` })
      .where(eq(parametresPaie.id, existant.id));
  } else {
    await tx.insert(parametresPaie).values({ id: newId(), organizationId, bareme: triees, ...verification });
  }
  await journaliser(tx, organizationId, userId, "bareme_paie.modifier", organizationId, { bareme: triees, atteste });
}

// ------------------------------------------------------------------ absences

/**
 * Ce que Présences sait du mois : décompte des jours, congés accordés, soldes
 * en fin de mois. Lu AVANT la transaction de paie, qui le reçoit tout fait.
 */
export async function contexteAbsences(organizationId: string, mois: string): Promise<ContexteAbsences> {
  const { debut, fin } = bornesMois(mois);
  const [reglages, feries, accordes] = await Promise.all([
    reglagesDe(organizationId),
    feriesEntre(organizationId, debut, fin),
    db
      .select({ employeeId: conges.employeeId, nature: conges.nature, debut: conges.debut, fin: conges.fin, debutDemi: conges.debutDemi, finDemi: conges.finDemi })
      .from(conges)
      .where(
        and(
          eq(conges.organizationId, organizationId),
          eq(conges.statut, "approuve"),
          inArray(conges.nature, ["paye", "sans_solde"]),
          lte(conges.debut, fin),
          gte(conges.fin, debut),
        ),
      ),
  ]);
  const soldes = await soldesConges(organizationId, reglages, fin);
  return {
    options: { decompte: reglages.decompte, joursTravailles: reglages.joursTravailles, feries: new Set(feries.keys()) },
    conges: accordes.map((c) => ({ ...c, nature: c.nature as "paye" | "sans_solde" })),
    soldes: new Map(soldes.map((s) => [s.salarie.id, s.solde])),
  };
}

// ------------------------------------------------------------------ périodes

async function periodeVerrouillee(tx: Transaction, organizationId: string, id: string) {
  const [p] = await tx.select().from(periodesPaie).where(and(eq(periodesPaie.id, id), eq(periodesPaie.organizationId, organizationId))).for("update");
  if (!p) throw new Error("Période de paie introuvable.");
  return p;
}

/**
 * Prépare la paie d'un mois : un bulletin par salarié sous contrat pendant le
 * mois, calculé sur son salaire de base moins les jours non dus (entrée ou
 * sortie en cours de mois, congé sans solde). Relancée, elle ajoute les
 * nouveaux salariés et recalcule les bulletins déjà là avec le barème et les
 * congés du jour, sans toucher aux éléments variables saisis.
 */
export async function preparerPeriodeDans(
  tx: Transaction,
  organizationId: string,
  mois: string,
  bareme: BaremePaie,
  absences: ContexteAbsences,
  userId: string,
): Promise<{ id: string; bulletins: number }> {
  if (!moisValide(mois)) throw new Error("Mois invalide.");
  let [periode] = await tx.select().from(periodesPaie).where(and(eq(periodesPaie.organizationId, organizationId), eq(periodesPaie.mois, mois))).for("update");
  if (periode?.statut === "validee") throw new Error(`La paie de ce mois est déjà validée.`);
  if (!periode) {
    const id = newId();
    await tx.insert(periodesPaie).values({ id, organizationId, mois });
    [periode] = await tx.select().from(periodesPaie).where(eq(periodesPaie.id, id));
  }

  const bornes = bornesMois(mois);
  const salaries = await tx
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.actif, true),
        isNull(employees.deletedAt),
        lte(employees.debut, bornes.fin),
        or(isNull(employees.fin), gte(employees.fin, bornes.debut)),
      ),
    )
    .orderBy(asc(employees.matricule));
  const existants = await tx.select().from(bulletinsPaie).where(eq(bulletinsPaie.periodeId, periode.id));
  const parSalarie = new Map(existants.map((b) => [b.employeId, b]));

  for (const s of salaries) {
    const deja = parSalarie.get(s.id);
    const a = absencesDuMois(mois, s, absences);
    const joursAbsenceSaisis = Math.min(deja?.joursAbsenceSaisis ?? 0, a.joursMois - a.joursHorsContrat - a.joursSansSolde);
    const elements: ElementsVariables = {
      salaireBase: s.salaireBase,
      retenueAbsence: retenueAbsence(s.salaireBase, a.joursHorsContrat + a.joursSansSolde + joursAbsenceSaisis, a.joursMois),
      primesImposables: deja?.primesImposables ?? 0,
      indemnitesNonImposables: deja?.indemnitesNonImposables ?? 0,
      retenuesDiverses: deja?.retenuesDiverses ?? 0,
    };
    const c = calculerBulletinPaie(elements, bareme);
    const valeurs = {
      matricule: s.matricule,
      nom: s.nom,
      poste: s.poste,
      numeroCnps: s.numeroCnps,
      ...elements,
      joursMois: a.joursMois,
      joursHorsContrat: a.joursHorsContrat,
      joursSansSolde: a.joursSansSolde,
      joursAbsenceSaisis,
      congesPris: a.congesPris,
      soldeConges: a.soldeConges,
      brut: c.brut,
      cnpsSalarie: c.cnpsSalarie,
      baseImposable: c.baseImposable,
      impot: c.impot,
      net: c.net,
      cnpsPatronal: c.cnpsPatronal,
      prestationsFamiliales: c.prestationsFamiliales,
      accidentTravail: c.accidentTravail,
      coutTotal: c.coutTotal,
    };
    if (deja) {
      await tx.update(bulletinsPaie).set({ ...valeurs, updatedAt: new Date(), version: sql`${bulletinsPaie.version} + 1` }).where(eq(bulletinsPaie.id, deja.id));
    } else {
      await tx.insert(bulletinsPaie).values({ id: newId(), organizationId, periodeId: periode.id, employeId: s.id, ...valeurs });
    }
  }
  await journaliser(tx, organizationId, userId, "paie.preparer", periode.id, { mois, salaries: salaries.length });
  return { id: periode.id, bulletins: salaries.length };
}

/** Ce qui se saisit sur un bulletin en préparation. */
export interface SaisieElements {
  primesImposables: number;
  indemnitesNonImposables: number;
  retenuesDiverses: number;
  /** Absences non rémunérées constatées, en centièmes de jour. */
  joursAbsenceSaisis: number;
}

/** Éléments variables d'un bulletin en préparation : primes, indemnités, retenues, absences. */
export async function modifierElementsDans(
  tx: Transaction,
  organizationId: string,
  bulletinId: string,
  saisie: SaisieElements,
  bareme: BaremePaie,
  userId: string,
): Promise<{ nom: string; net: number }> {
  const [b] = await tx.select().from(bulletinsPaie).where(and(eq(bulletinsPaie.id, bulletinId), eq(bulletinsPaie.organizationId, organizationId))).for("update");
  if (!b) throw new Error("Bulletin introuvable.");
  const periode = await periodeVerrouillee(tx, organizationId, b.periodeId);
  if (periode.statut === "validee") throw new Error("La paie de ce mois est validée : ses bulletins ne se modifient plus.");
  const { joursAbsenceSaisis, ...montants } = saisie;
  if (!Number.isInteger(joursAbsenceSaisis) || joursAbsenceSaisis < 0 || joursAbsenceSaisis % 50 !== 0) throw new Error("Les absences se comptent en jours ou demi-journées.");
  if (joursAbsenceSaisis > 0 && b.joursMois === 0) throw new Error("Recalculez d'abord la paie du mois : ce bulletin ne connaît pas encore ses jours.");
  const nonPayes = b.joursHorsContrat + b.joursSansSolde + joursAbsenceSaisis;
  if (nonPayes > b.joursMois) throw new Error("Plus de jours d'absence que de jours dans le mois.");
  const elements = { ...montants, retenueAbsence: retenueAbsence(b.salaireBase, nonPayes, b.joursMois) };
  const c = calculerBulletinPaie({ salaireBase: b.salaireBase, ...elements }, bareme);
  await tx
    .update(bulletinsPaie)
    .set({
      ...elements,
      joursAbsenceSaisis,
      brut: c.brut,
      cnpsSalarie: c.cnpsSalarie,
      baseImposable: c.baseImposable,
      impot: c.impot,
      net: c.net,
      cnpsPatronal: c.cnpsPatronal,
      prestationsFamiliales: c.prestationsFamiliales,
      accidentTravail: c.accidentTravail,
      coutTotal: c.coutTotal,
      updatedAt: new Date(),
      version: sql`${bulletinsPaie.version} + 1`,
    })
    .where(eq(bulletinsPaie.id, b.id));
  await journaliser(tx, organizationId, userId, "paie.elements", b.id, { salarie: b.nom, ...elements, joursAbsenceSaisis, net: c.net });
  return { nom: b.nom, net: c.net };
}

/** Retire un salarié de la paie du mois (absent tout le mois, sorti avant le début). */
export async function retirerBulletinDans(tx: Transaction, organizationId: string, bulletinId: string, userId: string): Promise<{ nom: string }> {
  const [b] = await tx.select().from(bulletinsPaie).where(and(eq(bulletinsPaie.id, bulletinId), eq(bulletinsPaie.organizationId, organizationId))).for("update");
  if (!b) throw new Error("Bulletin introuvable.");
  const periode = await periodeVerrouillee(tx, organizationId, b.periodeId);
  if (periode.statut === "validee") throw new Error("La paie de ce mois est validée.");
  await tx.delete(bulletinsPaie).where(eq(bulletinsPaie.id, b.id));
  await journaliser(tx, organizationId, userId, "paie.retirer", b.id, { salarie: b.nom, mois: periode.mois });
  return { nom: b.nom };
}

/**
 * Valide la paie du mois : barème vérifié exigé, bulletins recalculés une
 * dernière fois, numérotés, figés, et l'écriture de paie passée au journal
 * des opérations diverses. Irréversible : une erreur se corrige le mois suivant
 * par un rappel, comme sur un bulletin papier.
 */
export async function validerPeriodeDans(tx: Transaction, organizationId: string, periodeId: string, bareme: BaremePaie, userId: string): Promise<{ mois: string; ecriture: string; bulletins: number }> {
  const periode = await periodeVerrouillee(tx, organizationId, periodeId);
  if (periode.statut === "validee") throw new Error("Cette paie est déjà validée.");
  const bulletins = await tx.select().from(bulletinsPaie).where(eq(bulletinsPaie.periodeId, periodeId)).orderBy(asc(bulletinsPaie.matricule));
  if (bulletins.length === 0) throw new Error("Aucun bulletin dans cette paie.");

  const calcules = bulletins.map((b) => ({ b, c: calculerBulletinPaie(b, bareme) }));
  const totaux = totaliser(calcules.map(({ b, c }) => ({ ...c, indemnitesNonImposables: b.indemnitesNonImposables, retenuesDiverses: b.retenuesDiverses })));
  const date = finDeMois(periode.mois);
  const ecriture = await enregistrerEcritureDans(tx, ecriturePaie({ mois: periode.mois, date, totaux, salaries: bulletins.length }), {
    organizationId,
    userId,
    origine: "paie",
    pieceId: periodeId,
    exercice: date.slice(0, 4),
    dateIso: date,
  });

  const [annee, m] = periode.mois.split("-");
  for (const { b, c } of calcules) {
    const numero = await prochainNumero(tx, organizationId, { cle: "bulletin", prefix: `BUL-${annee}-${m}-`, padding: 4, periode: periode.mois });
    await tx
      .update(bulletinsPaie)
      .set({
        numero,
        brut: c.brut,
        cnpsSalarie: c.cnpsSalarie,
        baseImposable: c.baseImposable,
        impot: c.impot,
        net: c.net,
        cnpsPatronal: c.cnpsPatronal,
        prestationsFamiliales: c.prestationsFamiliales,
        accidentTravail: c.accidentTravail,
        coutTotal: c.coutTotal,
        updatedAt: new Date(),
        version: sql`${bulletinsPaie.version} + 1`,
      })
      .where(eq(bulletinsPaie.id, b.id));
  }
  await tx
    .update(periodesPaie)
    .set({
      statut: "validee",
      baremeApplique: bareme,
      totalBrut: totaux.brut,
      totalNet: totaux.net,
      totalCnps: totaux.totalCnps,
      totalImpot: totaux.impot,
      totalPatronal: totaux.chargesPatronales,
      ecriture,
      valideeLe: new Date(),
      valideeParUserId: userId,
      updatedAt: new Date(),
      version: sql`${periodesPaie.version} + 1`,
    })
    .where(eq(periodesPaie.id, periodeId));
  await journaliser(tx, organizationId, userId, "paie.valider", periodeId, { mois: periode.mois, ecriture, bulletins: bulletins.length, net: totaux.net });
  return { mois: periode.mois, ecriture, bulletins: bulletins.length };
}

async function compteTresorerie(tx: Transaction, organizationId: string, id: string) {
  const [c] = await tx.select().from(comptesTresorerie).where(and(eq(comptesTresorerie.id, id), eq(comptesTresorerie.organizationId, organizationId))).for("update");
  if (!c || !c.actif) throw new Error("Compte de trésorerie introuvable ou fermé.");
  return { ref: { numero: c.compte, libelle: c.nom, nature: c.nature, nom: c.nom }, journal: (c.nature === "banque" ? "BQ" : "CA") as "BQ" | "CA", id: c.id };
}

/**
 * Paie les salaires d'une paie validée : une écriture par salarié, depuis le
 * compte choisi. Les bulletins déjà payés sont laissés de côté.
 */
export async function payerSalairesDans(
  tx: Transaction,
  organizationId: string,
  periodeId: string,
  v: { compteTresorerieId: string; date: string; bulletinIds?: string[] | null },
  userId: string,
): Promise<{ payes: number; montant: number }> {
  const periode = await periodeVerrouillee(tx, organizationId, periodeId);
  if (periode.statut !== "validee") throw new Error("Validez la paie avant de payer les salaires.");
  const compte = await compteTresorerie(tx, organizationId, v.compteTresorerieId);
  const tous = await tx.select().from(bulletinsPaie).where(and(eq(bulletinsPaie.periodeId, periodeId), isNull(bulletinsPaie.payeLe))).for("update");
  const choisis = v.bulletinIds?.length ? tous.filter((b) => v.bulletinIds!.includes(b.id)) : tous;
  const aPayer = choisis.filter((b) => b.net > 0);
  if (aPayer.length === 0) throw new Error("Aucun salaire à payer.");
  const montant = aPayer.reduce((s, b) => s + b.net, 0);
  await exigerProvision(tx, organizationId, compte.ref, montant);

  for (const b of aPayer) {
    const ecriture = await enregistrerEcritureDans(
      tx,
      ecriturePaiementSalaire({ piece: `${b.numero}-P`, date: v.date, salarie: `${b.nom} (${b.matricule})`, montant: b.net, tresorerie: { ...compte.ref, journal: compte.journal } }),
      { organizationId, userId, origine: "paie", pieceId: b.id, exercice: v.date.slice(0, 4), dateIso: v.date },
    );
    await tx
      .update(bulletinsPaie)
      .set({ payeLe: v.date, paiementEcriture: ecriture, compteTresorerieId: compte.id, updatedAt: new Date(), version: sql`${bulletinsPaie.version} + 1` })
      .where(eq(bulletinsPaie.id, b.id));
  }
  await journaliser(tx, organizationId, userId, "paie.payer", periodeId, { mois: periode.mois, salaries: aPayer.length, montant, compte: compte.ref.nom });
  return { payes: aPayer.length, montant };
}

/** Verse à la CNPS ou au Trésor ce que la paie du mois leur doit. */
export async function verserDans(
  tx: Transaction,
  organizationId: string,
  periodeId: string,
  organisme: "cnps" | "impot",
  v: { compteTresorerieId: string; date: string },
  userId: string,
): Promise<{ montant: number; ecriture: string }> {
  const periode = await periodeVerrouillee(tx, organizationId, periodeId);
  if (periode.statut !== "validee") throw new Error("Validez la paie avant de la déclarer.");
  if (organisme === "cnps" ? periode.cnpsVerseeLe : periode.impotVerseLe) throw new Error("Ce versement est déjà enregistré.");
  const montant = organisme === "cnps" ? periode.totalCnps : periode.totalImpot;
  const compte = await compteTresorerie(tx, organizationId, v.compteTresorerieId);
  await exigerProvision(tx, organizationId, compte.ref, montant);
  const ecriture = await enregistrerEcritureDans(
    tx,
    ecritureVersement({ organisme, piece: `${organisme === "cnps" ? "CNPS" : "ITS"}-${periode.mois}`, date: v.date, mois: periode.mois, montant, tresorerie: { ...compte.ref, journal: compte.journal } }),
    { organizationId, userId, origine: "paie", pieceId: periodeId, exercice: v.date.slice(0, 4), dateIso: v.date },
  );
  await tx
    .update(periodesPaie)
    .set(
      organisme === "cnps"
        ? { cnpsVerseeLe: v.date, cnpsEcriture: ecriture, updatedAt: new Date() }
        : { impotVerseLe: v.date, impotEcriture: ecriture, updatedAt: new Date() },
    )
    .where(eq(periodesPaie.id, periodeId));
  await journaliser(tx, organizationId, userId, organisme === "cnps" ? "paie.verser_cnps" : "paie.verser_impot", periodeId, { mois: periode.mois, montant, ecriture });
  return { montant, ecriture };
}

