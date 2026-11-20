import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { auditLogs, organizations, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { creerCommandeDans } from "@/modules/achats/creation";
import { articles, famillesArticle } from "@/modules/catalogue/schema";
import { enregistrerBrouillonDans } from "@/modules/facturation/creation";
import { jourLocal } from "@/modules/presences/calcul";
import { projets } from "@/modules/projets/schema";
import { tiers } from "@/modules/tiers/schema";

import {
  LIBELLES_UNITE,
  PREFIXE_NOTE,
  calculerNote,
  materiauxDe,
  refusArticle,
  uniteCle,
  type ArticleChiffrage,
  type Calcul,
  type Materiau,
  type TypeNote,
} from "./notes";
import { normaliserReglages, type ReglagesCalculs } from "./regles";
import { calculsArticles, notesCalcul, notesCalculSuites, reglagesCalculs, type NoteCalcul } from "./schema";

export interface EtatReglages {
  valeurs: ReglagesCalculs;
  /** Attestés par un responsable ; sinon les valeurs restent « à vérifier ». */
  verifie: boolean;
  verifieLe: Date | null;
  /** Une ligne existe : l'entreprise a déjà réglé quelque chose. */
  personnalises: boolean;
  /** Fuseau de l'entreprise, pour dater l'attestation. */
  fuseau: string;
}

/** Lue une fois par requête : la coque du module et la page la demandent toutes deux. */
export const reglagesCalculsDe = cache(async (organizationId: string): Promise<EtatReglages> => {
  const [r] = await db
    .select({ valeurs: reglagesCalculs.valeurs, verifieLe: reglagesCalculs.verifieLe })
    .from(reglagesCalculs)
    .where(and(eq(reglagesCalculs.organizationId, organizationId), isNull(reglagesCalculs.deletedAt)))
    .limit(1);
  const [o] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return {
    valeurs: normaliserReglages(r?.valeurs),
    verifie: Boolean(r?.verifieLe),
    verifieLe: r?.verifieLe ?? null,
    personnalises: Boolean(r),
    fuseau: o?.fuseau ?? "Africa/Abidjan",
  };
});

/**
 * Enregistre les ratios, déjà vérifiés par `verifierReglages`. L'attestation
 * se donne à chaque enregistrement : changer un ratio sans la cocher le
 * remet « à vérifier ».
 */
export async function enregistrerReglagesCalculsPour(organizationId: string, userId: string, valeurs: ReglagesCalculs, atteste: boolean): Promise<void> {
  const ligne = {
    valeurs,
    verifieLe: atteste ? new Date() : null,
    verifieParUserId: atteste ? userId : null,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(reglagesCalculs)
      .values({ id: newId(), organizationId, ...ligne })
      .onConflictDoUpdate({ target: reglagesCalculs.organizationId, set: { ...ligne, deletedAt: null, updatedAt: new Date(), version: sql`${reglagesCalculs.version} + 1` } });
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "calculs.reglages",
      entityType: "reglages_calculs",
      entityId: organizationId,
      after: { valeurs, atteste },
    });
  });
}

// ------------------------------------------------------------ notes de calcul

async function fuseauDe(tx: Transaction | typeof db, organizationId: string): Promise<string> {
  const [o] = await tx.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return o?.fuseau ?? "Africa/Abidjan";
}

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entityId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "note_calcul", entityId, after: apres });
}

export interface OptionProjetCalcul {
  id: string;
  code: string;
  nom: string;
}

/** Projets qui reçoivent encore des notes : ni terminés ni annulés. */
export async function projetsPourNotes(organizationId: string): Promise<OptionProjetCalcul[]> {
  return db
    .select({ id: projets.id, code: projets.code, nom: projets.nom })
    .from(projets)
    .where(and(eq(projets.organizationId, organizationId), inArray(projets.statut, ["preparation", "en_cours", "suspendu"]), isNull(projets.deletedAt)))
    .orderBy(asc(projets.code));
}

export interface NouvelleNote {
  type: TypeNote;
  saisie: unknown;
  projetId: string;
  libelle: string;
}

/**
 * Enregistre une note : le calcul est REFAIT ici, depuis la saisie et les
 * ratios du jour ; le résultat du navigateur n'est jamais repris. Le numéro
 * s'attribue dans la même transaction.
 */
export async function enregistrerNotePour(organizationId: string, userId: string, n: NouvelleNote): Promise<{ id: string; numero: string }> {
  const libelle = n.libelle.trim();
  if (libelle.length < 2 || libelle.length > 200) throw new Error("Donnez un libellé à la note : « Dalle du RDC », « Mur de clôture nord ».");
  const etat = await reglagesCalculsDe(organizationId);
  const calcul = calculerNote(n.type, n.saisie, etat.valeurs);
  const materiaux = materiauxDe(calcul, etat.valeurs);
  return db.transaction(async (tx) => {
    const [projet] = await tx
      .select({ id: projets.id, statut: projets.statut })
      .from(projets)
      .where(and(eq(projets.id, n.projetId), eq(projets.organizationId, organizationId), isNull(projets.deletedAt)));
    if (!projet) throw new Error("Projet introuvable.");
    if (projet.statut === "termine" || projet.statut === "annule") throw new Error("Ce projet est clos : il ne reçoit plus de note.");
    const annee = jourLocal(new Date(), await fuseauDe(tx, organizationId)).slice(0, 4);
    const numero = await prochainNumero(tx, organizationId, { cle: "note_calcul", prefix: `${PREFIXE_NOTE}-${annee}-`, padding: 5, periode: annee });
    const id = newId();
    await tx.insert(notesCalcul).values({
      id,
      organizationId,
      numero,
      projetId: projet.id,
      type: calcul.type,
      libelle,
      saisie: calcul.saisie,
      resultat: calcul.resultat,
      materiaux,
      reglages: etat.valeurs,
      reglagesVerifies: etat.verifie,
      creeParUserId: userId,
    });
    await journaliser(tx, organizationId, userId, "calculs.note.creer", id, { numero, type: calcul.type, libelle });
    return { id, numero };
  });
}

/** Annule une note : le numéro reste, la note sort des listes actives. Le rédacteur, ou qui règle les calculs. */
export async function annulerNotePour(organizationId: string, userId: string, id: string, motif: string, toutes: boolean): Promise<{ numero: string }> {
  const m = motif.trim();
  if (m.length < 3) throw new Error("Indiquez le motif de l'annulation.");
  return db.transaction(async (tx) => {
    const [note] = await tx
      .select({ numero: notesCalcul.numero, auteur: notesCalcul.creeParUserId, annuleeLe: notesCalcul.annuleeLe })
      .from(notesCalcul)
      .where(and(eq(notesCalcul.id, id), eq(notesCalcul.organizationId, organizationId), isNull(notesCalcul.deletedAt)))
      .for("update");
    if (!note) throw new Error("Note introuvable.");
    if (note.annuleeLe) throw new Error("Cette note est déjà annulée.");
    if (!toutes && note.auteur !== userId) throw new Error("Seul son rédacteur, ou qui règle les calculs, annule une note.");
    await tx
      .update(notesCalcul)
      .set({ annuleeLe: new Date(), motifAnnulation: m.slice(0, 300), updatedAt: new Date(), version: sql`${notesCalcul.version} + 1` })
      .where(and(eq(notesCalcul.id, id), eq(notesCalcul.organizationId, organizationId)));
    await journaliser(tx, organizationId, userId, "calculs.note.annuler", id, { numero: note.numero, motif: m });
    return { numero: note.numero };
  });
}

export interface ResumeNote {
  id: string;
  numero: string;
  type: TypeNote;
  libelle: string;
  projetId: string;
  projetCode: string;
  projetNom: string;
  creeLe: Date;
  annulee: boolean;
}

export async function listerNotes(organizationId: string, projetId?: string | null): Promise<ResumeNote[]> {
  const lignes = await db
    .select({
      id: notesCalcul.id,
      numero: notesCalcul.numero,
      type: notesCalcul.type,
      libelle: notesCalcul.libelle,
      projetId: notesCalcul.projetId,
      projetCode: projets.code,
      projetNom: projets.nom,
      creeLe: notesCalcul.createdAt,
      annuleeLe: notesCalcul.annuleeLe,
    })
    .from(notesCalcul)
    .innerJoin(projets, eq(projets.id, notesCalcul.projetId))
    .where(and(eq(notesCalcul.organizationId, organizationId), isNull(notesCalcul.deletedAt), projetId ? eq(notesCalcul.projetId, projetId) : undefined))
    .orderBy(desc(notesCalcul.createdAt))
    .limit(500);
  return lignes.map(({ annuleeLe, ...l }) => ({ ...l, type: l.type as TypeNote, annulee: annuleeLe !== null }));
}

export interface SuiteNote {
  id: string;
  nature: "devis" | "commande";
  pieceId: string;
  libelle: string;
  creeLe: Date;
}

export interface DetailNote {
  note: NoteCalcul;
  calcul: Calcul;
  reglages: ReglagesCalculs;
  materiaux: Materiau[];
  projet: { id: string; code: string; nom: string; clientId: string | null; clientNom: string | null };
  auteur: string | null;
  suites: SuiteNote[];
}

export async function noteDe(organizationId: string, id: string): Promise<DetailNote | null> {
  const [l] = await db
    .select({ note: notesCalcul, projet: { id: projets.id, code: projets.code, nom: projets.nom, clientId: projets.clientId }, clientNom: tiers.nom, auteur: users.fullName })
    .from(notesCalcul)
    .innerJoin(projets, eq(projets.id, notesCalcul.projetId))
    .leftJoin(tiers, eq(tiers.id, projets.clientId))
    .leftJoin(users, eq(users.id, notesCalcul.creeParUserId))
    .where(and(eq(notesCalcul.id, id), eq(notesCalcul.organizationId, organizationId), isNull(notesCalcul.deletedAt)));
  if (!l) return null;
  const suites = await db
    .select({ id: notesCalculSuites.id, nature: notesCalculSuites.nature, pieceId: notesCalculSuites.pieceId, libelle: notesCalculSuites.libelle, creeLe: notesCalculSuites.createdAt })
    .from(notesCalculSuites)
    .where(and(eq(notesCalculSuites.organizationId, organizationId), eq(notesCalculSuites.noteId, id), isNull(notesCalculSuites.deletedAt)))
    .orderBy(asc(notesCalculSuites.createdAt));
  const reglages = normaliserReglages(l.note.reglages);
  return {
    note: l.note,
    // Figés à l'enregistrement : relus tels quels, jamais recalculés.
    calcul: { type: l.note.type, saisie: l.note.saisie, resultat: l.note.resultat } as Calcul,
    reglages,
    materiaux: l.note.materiaux as Materiau[],
    projet: { ...l.projet, clientNom: l.clientNom },
    auteur: l.auteur,
    suites: suites.map((s) => ({ ...s, nature: s.nature as SuiteNote["nature"] })),
  };
}

// -------------------------------------------------------- correspondances

/** Articles qui peuvent porter un matériau : actifs, marchandises. */
export async function articlesPourCalculs(organizationId: string): Promise<(ArticleChiffrage & { reference: string })[]> {
  return db
    .select({ id: articles.id, reference: articles.reference, designation: articles.designation, unite: articles.unite, prixVente: articles.prixVente, prixAchat: articles.prixAchat })
    .from(articles)
    .where(and(eq(articles.organizationId, organizationId), eq(articles.actif, true), eq(articles.type, "marchandise"), isNull(articles.deletedAt)))
    .orderBy(asc(articles.designation))
    .limit(2000);
}

/** Article associé à chaque clé de matériau. */
export async function correspondancesDe(organizationId: string): Promise<Record<string, string>> {
  const lignes = await db
    .select({ cle: calculsArticles.cle, articleId: calculsArticles.articleId })
    .from(calculsArticles)
    .where(and(eq(calculsArticles.organizationId, organizationId), isNull(calculsArticles.deletedAt)));
  return Object.fromEntries(lignes.map((l) => [l.cle, l.articleId]));
}

const CLE = /^[a-z0-9_]{2,40}$/;

/** Associe (ou dissocie, `articleId` nul) un matériau et un article de l'entreprise. */
export async function enregistrerCorrespondancePour(organizationId: string, userId: string, cle: string, articleId: string | null): Promise<void> {
  if (!CLE.test(cle)) throw new Error("Matériau inconnu.");
  await db.transaction(async (tx) => {
    if (!articleId) {
      await tx.delete(calculsArticles).where(and(eq(calculsArticles.organizationId, organizationId), eq(calculsArticles.cle, cle)));
    } else {
      const [a] = await tx
        .select({ id: articles.id, unite: articles.unite, designation: articles.designation })
        .from(articles)
        .where(and(eq(articles.id, articleId), eq(articles.organizationId, organizationId), eq(articles.actif, true), isNull(articles.deletedAt)));
      if (!a) throw new Error("Article introuvable.");
      if (a.unite !== uniteCle(cle)) throw new Error(`« ${a.designation} » se compte en ${a.unite} ; ce matériau se commande en ${LIBELLES_UNITE[uniteCle(cle)]}.`);
      await tx
        .insert(calculsArticles)
        .values({ id: newId(), organizationId, cle, articleId: a.id })
        .onConflictDoUpdate({ target: [calculsArticles.organizationId, calculsArticles.cle], set: { articleId: a.id, deletedAt: null, updatedAt: new Date(), version: sql`${calculsArticles.version} + 1` } });
    }
    await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "calculs.correspondance", entityType: "calculs_articles", entityId: organizationId, after: { cle, articleId } });
  });
}

// ------------------------------------------------------------ suites

export interface LigneVersPiece {
  cle: string;
  articleId: string;
}

/** La note, encore active, et les lignes demandées rapprochées de ses matériaux et des articles. */
async function lignesDeLaNote(tx: Transaction, organizationId: string, noteId: string, demandees: LigneVersPiece[]) {
  const [note] = await tx
    .select()
    .from(notesCalcul)
    .where(and(eq(notesCalcul.id, noteId), eq(notesCalcul.organizationId, organizationId), isNull(notesCalcul.deletedAt)))
    .for("update");
  if (!note) throw new Error("Note introuvable.");
  if (note.annuleeLe) throw new Error("Cette note est annulée.");
  if (demandees.length === 0) throw new Error("Choisissez au moins un matériau.");
  const cles = new Set(demandees.map((d) => d.cle));
  if (cles.size !== demandees.length) throw new Error("Un matériau figure deux fois.");
  const materiaux = new Map((note.materiaux as Materiau[]).map((m) => [m.cle, m]));
  const refs = await tx
    .select({
      id: articles.id,
      designation: articles.designation,
      unite: articles.unite,
      prixVente: articles.prixVente,
      prixAchat: articles.prixAchat,
      tauxArticle: articles.tauxTva,
      tauxFamille: famillesArticle.tauxTva,
      compteArticle: articles.compteAchat,
      compteFamille: famillesArticle.compteAchat,
    })
    .from(articles)
    .leftJoin(famillesArticle, eq(famillesArticle.id, articles.familleId))
    .where(and(eq(articles.organizationId, organizationId), eq(articles.actif, true), isNull(articles.deletedAt), inArray(articles.id, demandees.map((d) => d.articleId))));
  const parId = new Map(refs.map((a) => [a.id, a]));
  const lignes = demandees.map((d) => {
    const m = materiaux.get(d.cle);
    if (!m) throw new Error("Ce matériau n'est pas sur la note.");
    const a = parId.get(d.articleId) ?? null;
    const refus = refusArticle(m, a);
    if (refus || !a) throw new Error(refus ?? "Article introuvable.");
    return { materiau: m, article: a };
  });
  return { note, lignes };
}

export async function creerDevisDepuisNotePour(organizationId: string, userId: string, noteId: string, demandees: LigneVersPiece[]): Promise<{ id: string; client: string }> {
  return db.transaction(async (tx) => {
    const { note, lignes } = await lignesDeLaNote(tx, organizationId, noteId, demandees);
    const [projet] = await tx
      .select({ clientId: projets.clientId, clientNom: tiers.nom })
      .from(projets)
      .leftJoin(tiers, eq(tiers.id, projets.clientId))
      .where(and(eq(projets.id, note.projetId), eq(projets.organizationId, organizationId)));
    if (!projet?.clientId) throw new Error("Le projet n'a pas de client : renseignez-le sur la fiche du projet avant de faire un devis.");
    const { id } = await enregistrerBrouillonDans(
      tx,
      organizationId,
      {
        nature: "devis",
        clientId: projet.clientId,
        projetId: note.projetId,
        datePiece: jourLocal(new Date(), await fuseauDe(tx, organizationId)),
        notes: `D'après la note de calcul ${note.numero} — ${note.libelle}.`,
        lignes: lignes.map(({ materiau, article }) => ({ articleId: article.id, designation: article.designation, quantite: materiau.quantite, prixUnitaireHt: article.prixVente })),
      },
      userId,
    );
    const client = projet.clientNom ?? "client";
    await tx.insert(notesCalculSuites).values({ id: newId(), organizationId, noteId, nature: "devis", pieceId: id, libelle: `Devis pour ${client}`, creeParUserId: userId });
    await journaliser(tx, organizationId, userId, "calculs.note.devis", noteId, { numero: note.numero, devis: id, lignes: lignes.length });
    return { id, client };
  });
}

export async function creerCommandeDepuisNotePour(
  organizationId: string,
  userId: string,
  noteId: string,
  fournisseurId: string,
  demandees: LigneVersPiece[],
): Promise<{ id: string; numero: string }> {
  return db.transaction(async (tx) => {
    const { note, lignes } = await lignesDeLaNote(tx, organizationId, noteId, demandees);
    const r = await creerCommandeDans(
      tx,
      organizationId,
      {
        fournisseurId,
        dateCommande: jourLocal(new Date(), await fuseauDe(tx, organizationId)),
        notes: `D'après la note de calcul ${note.numero} — ${note.libelle}.`,
        lignes: lignes.map(({ materiau, article }) => ({
          articleId: article.id,
          designation: article.designation,
          quantite: materiau.quantite,
          prixUnitaireHt: article.prixAchat,
          tauxTva: article.tauxArticle ?? article.tauxFamille ?? 1800,
          compteAchat: article.compteArticle ?? article.compteFamille ?? "601",
        })),
      },
      userId,
    );
    await tx.insert(notesCalculSuites).values({ id: newId(), organizationId, noteId, nature: "commande", pieceId: r.id, libelle: r.numero, creeParUserId: userId });
    await journaliser(tx, organizationId, userId, "calculs.note.commande", noteId, { numero: note.numero, commande: r.numero, lignes: lignes.length });
    return r;
  });
}

/** Fournisseurs actifs, pour la commande. */
export async function fournisseursPourCalculs(organizationId: string): Promise<{ id: string; nom: string }[]> {
  return db
    .select({ id: tiers.id, nom: tiers.nom })
    .from(tiers)
    .where(and(eq(tiers.organizationId, organizationId), eq(tiers.estFournisseur, true), eq(tiers.actif, true), isNull(tiers.deletedAt)))
    .orderBy(asc(tiers.nom));
}

/** Ce que chaque page de calcul transmet à son calculateur. */
export async function contexteCalculs(organizationId: string): Promise<{ reglages: ReglagesCalculs; projets: OptionProjetCalcul[] }> {
  const [etat, liste] = await Promise.all([reglagesCalculsDe(organizationId), projetsPourNotes(organizationId)]);
  return { reglages: etat.valeurs, projets: liste };
}
