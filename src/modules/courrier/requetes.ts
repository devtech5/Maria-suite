import "server-only";

import { randomBytes } from "node:crypto";

import { aliasedTable, and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { entityCodes, memberships, services, users } from "@/db/schema";
import { tracerPour } from "@/lib/audit";
import { utilisateursAyantDroit } from "@/lib/droits/destinataires";
import { newId } from "@/lib/ids";
import { urlAbsolue } from "@/lib/liens-publics";
import { moduleOuvert } from "@/lib/modules/garde";
import { prochainNumero } from "@/lib/sequences";
import { cheminDe, deposer, supprimer, urlSignee } from "@/lib/stockage";
import { notifier } from "@/modules/communication/notifications";
import { aujourdhuiPour } from "@/modules/reglement/requetes";

import {
  formatNumero,
  lireCanal,
  natureValide,
  passagePermis,
  refusImputation,
  refusSaisie,
  relanceDue,
  statutInitial,
  type SaisiePli,
  type Sens,
  type StatutPli,
} from "./regles";
import { plis, type Pli } from "./schema";

/**
 * Courrier et colis, côté base. Chaque fonction prend l'entreprise en
 * premier argument et filtre dessus ; les actions vérifient les droits.
 */

export { aujourdhuiPour };

const imputes = aliasedTable(users, "imputes");

export interface LignePli {
  id: string;
  sens: Sens;
  numero: string;
  statut: StatutPli;
  nature: string;
  canal: string;
  objet: string;
  correspondant: string;
  reference: string | null;
  dateDocument: string | null;
  confidentiel: boolean;
  enregistreLe: Date;
  enregistrePar: string | null;
  imputeUserId: string | null;
  imputeNom: string | null;
  imputeServiceId: string | null;
  imputeService: string | null;
  instructions: string | null;
  delaiReponse: string | null;
  imputePar: string | null;
  imputeLe: Date | null;
  accuseLe: Date | null;
  traiteLe: Date | null;
  noteTraitement: string | null;
  reponsePliId: string | null;
  transporteur: string | null;
  numeroSuivi: string | null;
  expedieLe: Date | null;
  remisLe: Date | null;
  dechargeNom: string | null;
  scan: boolean;
  decharge: boolean;
  derniereRelanceLe: Date | null;
}

const colonnes = {
  id: plis.id,
  sens: plis.sens,
  numero: plis.numero,
  statut: plis.statut,
  nature: plis.nature,
  canal: plis.canal,
  objet: plis.objet,
  correspondant: plis.correspondant,
  reference: plis.reference,
  dateDocument: plis.dateDocument,
  confidentiel: plis.confidentiel,
  enregistreLe: plis.enregistreLe,
  enregistrePar: plis.enregistrePar,
  imputeUserId: plis.imputeUserId,
  imputeNom: imputes.fullName,
  imputeServiceId: plis.imputeServiceId,
  imputeService: services.libelle,
  instructions: plis.instructions,
  delaiReponse: plis.delaiReponse,
  imputePar: plis.imputePar,
  imputeLe: plis.imputeLe,
  accuseLe: plis.accuseLe,
  traiteLe: plis.traiteLe,
  noteTraitement: plis.noteTraitement,
  reponsePliId: plis.reponsePliId,
  transporteur: plis.transporteur,
  numeroSuivi: plis.numeroSuivi,
  expedieLe: plis.expedieLe,
  remisLe: plis.remisLe,
  dechargeNom: plis.dechargeNom,
  scan: sql<boolean>`${plis.scan} is not null`,
  decharge: sql<boolean>`${plis.decharge} is not null`,
  derniereRelanceLe: plis.derniereRelanceLe,
};

function requete() {
  return db.select(colonnes).from(plis).leftJoin(imputes, eq(imputes.id, plis.imputeUserId)).leftJoin(services, eq(services.id, plis.imputeServiceId));
}

export interface FiltrePlis {
  sens?: Sens;
  statuts?: StatutPli[];
  imputeA?: string;
  recherche?: string;
  du?: Date;
  au?: Date;
  limite?: number;
}

export async function plisDe(organizationId: string, f: FiltrePlis = {}): Promise<LignePli[]> {
  const conditions: (SQL | undefined)[] = [
    eq(plis.organizationId, organizationId),
    isNull(plis.deletedAt),
    f.sens ? eq(plis.sens, f.sens) : undefined,
    f.statuts?.length ? inArray(plis.statut, f.statuts) : undefined,
    f.imputeA ? eq(plis.imputeUserId, f.imputeA) : undefined,
    f.du ? sql`${plis.enregistreLe} >= ${f.du.toISOString()}` : undefined,
    f.au ? sql`${plis.enregistreLe} < ${f.au.toISOString()}` : undefined,
  ];
  const mots = (f.recherche ?? "").trim();
  if (mots) {
    const motif = `%${mots.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(plis.numero, motif), ilike(plis.objet, motif), ilike(plis.correspondant, motif), ilike(plis.reference, motif), ilike(plis.numeroSuivi, motif)));
  }
  const lignes = await requete()
    .where(and(...conditions))
    .orderBy(desc(plis.enregistreLe))
    .limit(f.limite ?? 300);
  return lignes as LignePli[];
}

export async function pliDe(organizationId: string, id: string): Promise<LignePli | null> {
  const [l] = await requete().where(and(eq(plis.organizationId, organizationId), eq(plis.id, id), isNull(plis.deletedAt)));
  return (l as LignePli) ?? null;
}

async function brut(organizationId: string, id: string): Promise<Pli> {
  const [p] = await db.select().from(plis).where(and(eq(plis.organizationId, organizationId), eq(plis.id, id), isNull(plis.deletedAt)));
  if (!p) throw new Error("Courrier introuvable.");
  return p;
}

/** Le jeton du QR de l'étiquette, posé dans `entity_codes`. */
export async function jetonEtiquette(organizationId: string, pliId: string): Promise<string | null> {
  const [c] = await db
    .select({ token: entityCodes.token })
    .from(entityCodes)
    .where(and(eq(entityCodes.organizationId, organizationId), eq(entityCodes.entityType, "pli"), eq(entityCodes.entityId, pliId), eq(entityCodes.isActive, true)));
  return c?.token ?? null;
}

/** Retrouve un pli par le QR de son étiquette. */
export async function pliParJeton(organizationId: string, token: string): Promise<string | null> {
  const [c] = await db
    .select({ id: entityCodes.entityId })
    .from(entityCodes)
    .where(and(eq(entityCodes.organizationId, organizationId), eq(entityCodes.entityType, "pli"), eq(entityCodes.token, token), eq(entityCodes.isActive, true)));
  return c?.id ?? null;
}

/**
 * Enregistre un pli : numéro du registre et code de l'étiquette dans la même
 * transaction. Un pli arrivé est signalé à qui l'impute.
 */
/**
 * Les entités de livraison déjà enregistrées : Glovo, un coursier de quartier…
 * Pas de table à part — elles se lisent sur les plis qui les portent, et
 * s'ajoutent d'elles-mêmes au premier pli : « ajouter » une entité, c'est
 * enregistrer un courrier qu'elle a livré.
 */
export async function entitesDeLivraison(organizationId: string): Promise<string[]> {
  const lignes = await db
    .selectDistinct({ nom: plis.transporteur })
    .from(plis)
    .where(and(eq(plis.organizationId, organizationId), eq(plis.canal, "entite"), isNull(plis.deletedAt), sql`${plis.transporteur} is not null`))
    .orderBy(asc(plis.transporteur));
  return lignes.map((l) => l.nom).filter((n): n is string => Boolean(n));
}

export async function enregistrerPliPour(
  organizationId: string,
  userId: string,
  sens: Sens,
  saisie: SaisiePli,
  options: { confidentiel?: boolean; courrierId?: string | null } = {},
  maintenant = new Date(),
): Promise<{ id: string; numero: string }> {
  const lu = lireCanal(saisie.canal, saisie.entite ?? "", await entitesDeLivraison(organizationId));
  if ("erreur" in lu) throw new Error(lu.erreur);
  const saisieLue: SaisiePli = { ...saisie, canal: lu.canal };
  const refus = refusSaisie(saisieLue, sens);
  if (refus) throw new Error(refus);
  if (!natureValide(saisie.nature)) throw new Error("Nature ou canal inconnu.");

  const id = newId();
  const token = randomBytes(12).toString("base64url");
  const numero = await db.transaction(async (tx) => {
    const n = await prochainNumero(tx, organizationId, formatNumero(sens, maintenant.getUTCFullYear()));
    await tx.insert(plis).values({
      id,
      organizationId,
      sens,
      numero: n,
      statut: statutInitial(sens),
      nature: saisie.nature,
      canal: lu.canal,
      transporteur: lu.transporteur,
      objet: saisie.objet.trim(),
      correspondant: saisie.correspondant.trim(),
      reference: saisie.reference.trim() || null,
      dateDocument: saisie.dateDocument || null,
      confidentiel: options.confidentiel ?? false,
      courrierId: options.courrierId ?? null,
      enregistreLe: maintenant,
      enregistrePar: userId,
    });
    await tx.insert(entityCodes).values({
      id: newId(),
      organizationId,
      entityType: "pli",
      entityId: id,
      kind: "qrcode",
      token,
      value: urlAbsolue(`/courrier/code/${token}`),
      targetUrl: urlAbsolue(`/courrier/code/${token}`),
      isPrimary: true,
      label: n,
    });
    return n;
  });
  await tracerPour(organizationId, userId, { action: `courrier.${sens}`, entite: "pli", entiteId: id, apres: { numero } });
  if (sens === "arrivee") {
    const destinataires = (await utilisateursAyantDroit(organizationId, "courrier.imputer")).filter((u) => u !== userId);
    await notifier(organizationId, destinataires, {
      categorie: "courrier",
      titre: `📨 Courrier à imputer : ${numero}`,
      corps: options.confidentiel ? `De ${saisie.correspondant.trim()} · confidentiel` : `De ${saisie.correspondant.trim()} · ${saisie.objet.trim()}`,
      lien: `/courrier/${id}`,
    });
  }
  return { id, numero };
}

async function changer(organizationId: string, id: string, de: StatutPli, champs: Partial<typeof plis.$inferInsert>) {
  const faits = await db
    .update(plis)
    .set({ ...champs, updatedAt: new Date(), version: sql`${plis.version} + 1` })
    .where(and(eq(plis.organizationId, organizationId), eq(plis.id, id), eq(plis.statut, de)))
    .returning({ id: plis.id });
  if (faits.length === 0) throw new Error("Le courrier vient de changer : rechargez la page.");
}

function exiger(p: Pli, vers: StatutPli) {
  if (!passagePermis(p.statut as StatutPli, vers)) throw new Error(`Ce courrier est « ${p.statut} » : ce geste n'est plus possible.`);
}

/** Impute (ou réimpute) un pli arrivé : personne, service, instructions, délai. */
export async function imputerPour(
  organizationId: string,
  userId: string,
  id: string,
  i: { userId: string | null; serviceId: string | null; instructions: string; delaiReponse: string },
): Promise<LignePli> {
  const p = await brut(organizationId, id);
  exiger(p, "impute");
  const refus = refusImputation(i, await aujourdhuiPour(organizationId));
  if (refus) throw new Error(refus);
  const [membre] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, i.userId as string), eq(memberships.status, "actif")));
  if (!membre) throw new Error("La personne choisie n'est pas un membre actif de l'entreprise.");
  if (i.serviceId) {
    const [s] = await db.select({ id: services.id }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.id, i.serviceId)));
    if (!s) throw new Error("Service introuvable.");
  }
  const reimputation = p.imputeUserId !== null;
  await changer(organizationId, id, p.statut as StatutPli, {
    statut: "impute",
    imputeUserId: i.userId,
    imputeServiceId: i.serviceId,
    instructions: i.instructions.trim() || null,
    delaiReponse: i.delaiReponse || null,
    imputePar: userId,
    imputeLe: new Date(),
    accuseLe: null,
    derniereRelanceLe: null,
  });
  await tracerPour(organizationId, userId, { action: reimputation ? "courrier.reimputer" : "courrier.imputer", entite: "pli", entiteId: id, apres: { a: i.userId, delai: i.delaiReponse || null } });
  const l = (await pliDe(organizationId, id)) as LignePli;
  await notifier(organizationId, [i.userId as string], {
    categorie: "courrier",
    titre: `📨 Courrier imputé : ${l.numero}`,
    corps: `${p.confidentiel ? "Confidentiel" : l.objet}${l.delaiReponse ? ` · réponse attendue le ${l.delaiReponse.split("-").reverse().join("/")}` : ""}`,
    lien: `/courrier/${id}`,
  });
  return l;
}

/** L'imputé accuse réception. */
export async function accuserPour(organizationId: string, userId: string, id: string): Promise<void> {
  const p = await brut(organizationId, id);
  if (p.imputeUserId !== userId) throw new Error("Ce courrier ne vous est pas imputé.");
  exiger(p, "recu");
  await changer(organizationId, id, p.statut as StatutPli, { statut: "recu", accuseLe: new Date() });
  await tracerPour(organizationId, userId, { action: "courrier.accuser", entite: "pli", entiteId: id });
}

/** Traite un pli arrivé : réponse faite (le pli parti qui répond) ou classé, avec une note. */
export async function traiterPour(organizationId: string, userId: string, id: string, t: { note: string; reponsePliId: string | null }): Promise<void> {
  const p = await brut(organizationId, id);
  exiger(p, "traite");
  if (t.reponsePliId) {
    const r = await brut(organizationId, t.reponsePliId);
    if (r.sens !== "depart") throw new Error("La réponse doit être un pli parti.");
  }
  await changer(organizationId, id, p.statut as StatutPli, {
    statut: "traite",
    traiteLe: new Date(),
    traitePar: userId,
    noteTraitement: t.note.trim().slice(0, 1000) || null,
    reponsePliId: t.reponsePliId,
    accuseLe: p.accuseLe ?? new Date(),
  });
  await tracerPour(organizationId, userId, { action: "courrier.traiter", entite: "pli", entiteId: id });
  if (p.imputePar && p.imputePar !== userId) {
    await notifier(organizationId, [p.imputePar], { categorie: "courrier", titre: `✅ Courrier traité : ${p.numero}`, corps: t.note.trim().slice(0, 200) || null, lien: `/courrier/${id}` });
  }
}

/** Un pli part : transporteur et numéro de suivi. */
export async function expedierPour(organizationId: string, userId: string, id: string, e: { transporteur: string; numeroSuivi: string }): Promise<void> {
  const p = await brut(organizationId, id);
  exiger(p, "expedie");
  await changer(organizationId, id, "a_expedier", {
    statut: "expedie",
    expedieLe: new Date(),
    transporteur: e.transporteur.trim().slice(0, 80) || null,
    numeroSuivi: e.numeroSuivi.trim().slice(0, 80) || null,
  });
  await tracerPour(organizationId, userId, { action: "courrier.expedier", entite: "pli", entiteId: id });
}

/** Remis au destinataire, contre décharge : qui l'a reçu. */
export async function remettrePour(organizationId: string, userId: string, id: string, r: { dechargeNom: string }): Promise<void> {
  const p = await brut(organizationId, id);
  exiger(p, "remis");
  if (r.dechargeNom.trim().length < 2) throw new Error("Indiquez qui a reçu le pli.");
  await changer(organizationId, id, "expedie", { statut: "remis", remisLe: new Date(), dechargeNom: r.dechargeNom.trim().slice(0, 120) });
  await tracerPour(organizationId, userId, { action: "courrier.remettre", entite: "pli", entiteId: id });
}

export type PieceDePli = "scan" | "decharge";

/** Joint (ou remplace) le scan du pli ou la photo de sa décharge. */
export async function deposerPiecePour(organizationId: string, userId: string, id: string, piece: PieceDePli, fichier: { contenu: ArrayBuffer; typeMime: string }): Promise<void> {
  const p = await brut(organizationId, id);
  const extension = fichier.typeMime === "application/pdf" ? "pdf" : fichier.typeMime === "image/png" ? "png" : fichier.typeMime === "image/webp" ? "webp" : "jpg";
  const chemin = cheminDe(organizationId, newId(), extension);
  const depot = await deposer({ chemin, contenu: fichier.contenu, typeMime: fichier.typeMime });
  if (!depot.ok) throw new Error(depot.raison);
  await db
    .update(plis)
    .set(piece === "scan" ? { scan: chemin, scanType: fichier.typeMime, updatedAt: new Date() } : { decharge: chemin, updatedAt: new Date() })
    .where(and(eq(plis.organizationId, organizationId), eq(plis.id, id)));
  const ancien = piece === "scan" ? p.scan : p.decharge;
  if (ancien) await supprimer(ancien);
  await tracerPour(organizationId, userId, { action: `courrier.${piece}`, entite: "pli", entiteId: id });
}

/** URL signée du scan ou de la décharge, deux minutes ; chaque ouverture est tracée. */
export async function urlPiecePour(organizationId: string, userId: string, id: string, piece: PieceDePli): Promise<string | null> {
  const p = await brut(organizationId, id);
  const chemin = piece === "scan" ? p.scan : p.decharge;
  if (!chemin) return null;
  await tracerPour(organizationId, userId, { action: `courrier.${piece}_ouvrir`, entite: "pli", entiteId: id });
  return urlSignee(chemin, 120);
}

/** Les comptes actifs et les services, pour imputer. */
export async function destinatairesPossibles(organizationId: string): Promise<{ personnes: { id: string; nom: string }[]; services: { id: string; libelle: string; code: string }[] }> {
  const [personnes, liste] = await Promise.all([
    db
      .select({ id: users.id, nom: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), eq(users.status, "actif")))
      .orderBy(asc(users.fullName)),
    db
      .select({ id: services.id, libelle: services.libelle, code: services.code })
      .from(services)
      .where(and(eq(services.organizationId, organizationId), eq(services.actif, true), isNull(services.deletedAt)))
      .orderBy(asc(services.libelle)),
  ]);
  return { personnes, services: liste };
}

/**
 * Relance les courriers imputés en retard : l'imputé et qui a imputé, au
 * plus une fois par jour et par courrier. Rend le nombre de relances.
 */
export async function relancerRetardsPour(organizationId: string, maintenant = new Date()): Promise<number> {
  const aujourdhui = await aujourdhuiPour(organizationId, maintenant);
  const candidats = await db
    .select()
    .from(plis)
    .where(
      and(
        eq(plis.organizationId, organizationId),
        isNull(plis.deletedAt),
        inArray(plis.statut, ["impute", "recu"]),
        sql`${plis.delaiReponse} < ${aujourdhui}::date`,
      ),
    )
    .limit(500);
  let relances = 0;
  for (const p of candidats) {
    if (!relanceDue({ statut: p.statut as StatutPli, delaiReponse: p.delaiReponse, derniereRelanceLe: p.derniereRelanceLe }, aujourdhui, maintenant)) continue;
    await db.update(plis).set({ derniereRelanceLe: maintenant }).where(eq(plis.id, p.id));
    const qui = [p.imputeUserId, p.imputePar].filter((u): u is string => Boolean(u));
    await notifier(organizationId, qui, {
      categorie: "courrier",
      titre: `⏰ Courrier sans réponse : ${p.numero}`,
      corps: `${p.confidentiel ? "Confidentiel" : p.objet} · réponse attendue le ${(p.delaiReponse as string).split("-").reverse().join("/")}`,
      lien: `/courrier/${p.id}`,
    });
    relances++;
  }
  return relances;
}

const PAS_RELANCE_MS = 60 * 60_000;
const verifiees = new Map<string, number>();

/** Relances APRÈS la réponse, au plus une vérification par heure et par processus. */
export function relancerApresReponse(organizationId: string | null): void {
  if (!organizationId || !moduleOuvert("courrier")) return;
  const maintenant = Date.now();
  if (maintenant - (verifiees.get(organizationId) ?? 0) < PAS_RELANCE_MS) return;
  verifiees.set(organizationId, maintenant);
  after(() =>
    relancerRetardsPour(organizationId).catch((erreur) => {
      console.error("Relances du courrier", erreur);
    }),
  );
}
