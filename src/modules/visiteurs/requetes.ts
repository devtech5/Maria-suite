import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { prochainNumero } from "@/lib/sequences";
import { cheminDe, deposer, supprimer, urlSignee } from "@/lib/stockage";
import { moduleOuvert } from "@/lib/modules/garde";
import { notifier } from "@/modules/communication/notifications";
import { ajouterJours, instantLocal, jourLocal } from "@/modules/presences/calcul";

import { formatNumeroVisite, passagePermis, refusSaisie, typePieceValide, type CotePhoto, type SaisieVisite, type StatutVisite } from "./regles";
import { accueils, accueilsAgents, visites, type Accueil, type Visite } from "./schema";

/**
 * Visiteurs, côté base. Chaque fonction prend l'entreprise en premier
 * argument et filtre dessus ; les actions (`./actions.ts`) vérifient droits
 * et accueils avant d'appeler.
 */

/** Le jour civil de l'entreprise et ses bornes : de minuit à minuit, dans son fuseau. */
export async function journeeDe(organizationId: string, maintenant = new Date()): Promise<{ jour: string; debut: Date; fin: Date; fuseau: string }> {
  const [o] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  const fuseau = o?.fuseau || "Africa/Abidjan";
  const jour = jourLocal(maintenant, fuseau);
  return { jour, debut: instantLocal(jour, "00:00", fuseau), fin: instantLocal(ajouterJours(jour, 1), "00:00", fuseau), fuseau };
}

// --------------------------------------------------------------- accueils

export async function accueilsDe(organizationId: string, options: { actifs?: boolean } = {}): Promise<Accueil[]> {
  return db
    .select()
    .from(accueils)
    .where(and(eq(accueils.organizationId, organizationId), isNull(accueils.deletedAt), options.actifs ? eq(accueils.actif, true) : undefined))
    .orderBy(asc(accueils.nom));
}

/** Les accueils qu'un compte tient. */
export async function accueilsDeLAgent(organizationId: string, userId: string): Promise<string[]> {
  const lignes = await db
    .select({ id: accueilsAgents.accueilId })
    .from(accueilsAgents)
    .where(and(eq(accueilsAgents.organizationId, organizationId), eq(accueilsAgents.userId, userId)));
  return lignes.map((l) => l.id);
}

export async function agentsDe(organizationId: string): Promise<{ accueilId: string; userId: string; nom: string }[]> {
  return db
    .select({ accueilId: accueilsAgents.accueilId, userId: users.id, nom: users.fullName })
    .from(accueilsAgents)
    .innerJoin(users, eq(users.id, accueilsAgents.userId))
    .where(eq(accueilsAgents.organizationId, organizationId))
    .orderBy(asc(users.fullName));
}

export async function enregistrerAccueilPour(
  organizationId: string,
  userId: string,
  saisie: { id?: string; nom: string; lieu: string; pieceExigee: boolean; actif: boolean },
): Promise<string> {
  const nom = saisie.nom.trim();
  if (nom.length < 2 || nom.length > 80) throw new Error("Nommez le point d'accueil (2 à 80 caractères).");
  const lieu = saisie.lieu.trim().slice(0, 160) || null;
  try {
    if (saisie.id) {
      const modifies = await db
        .update(accueils)
        .set({ nom, lieu, pieceExigee: saisie.pieceExigee, actif: saisie.actif, updatedAt: new Date(), version: sql`${accueils.version} + 1` })
        .where(and(eq(accueils.organizationId, organizationId), eq(accueils.id, saisie.id)))
        .returning({ id: accueils.id });
      if (modifies.length === 0) throw new Error("Point d'accueil introuvable.");
      await tracerPour(organizationId, userId, { action: "accueil.modifier", entite: "accueil", entiteId: saisie.id, apres: { nom, actif: saisie.actif } });
      return saisie.id;
    }
    const id = newId();
    await db.insert(accueils).values({ id, organizationId, nom, lieu, pieceExigee: saisie.pieceExigee });
    await tracerPour(organizationId, userId, { action: "accueil.creer", entite: "accueil", entiteId: id, apres: { nom } });
    return id;
  } catch (erreur) {
    if (erreur instanceof Error && /accueils_nom_unique/.test(`${erreur.message} ${String((erreur as { cause?: unknown }).cause ?? "")}`)) {
      throw new Error(`Un point d'accueil s'appelle déjà « ${nom} ».`);
    }
    throw erreur;
  }
}

export async function affecterAgentPour(organizationId: string, userId: string, accueilId: string, agentId: string, affecter: boolean): Promise<void> {
  const [accueil] = await db.select({ id: accueils.id }).from(accueils).where(and(eq(accueils.organizationId, organizationId), eq(accueils.id, accueilId)));
  if (!accueil) throw new Error("Point d'accueil introuvable.");
  if (affecter) {
    const [membre] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, agentId), eq(memberships.status, "actif")));
    if (!membre) throw new Error("Ce compte n'est pas un membre actif de l'entreprise.");
    await db.insert(accueilsAgents).values({ id: newId(), organizationId, accueilId, userId: agentId }).onConflictDoNothing();
  } else {
    await db.delete(accueilsAgents).where(and(eq(accueilsAgents.organizationId, organizationId), eq(accueilsAgents.accueilId, accueilId), eq(accueilsAgents.userId, agentId)));
  }
  await tracerPour(organizationId, userId, { action: affecter ? "accueil.agent_ajouter" : "accueil.agent_retirer", entite: "accueil", entiteId: accueilId, apres: { agentId } });
}

// --------------------------------------------------------------- visites

export interface LigneVisite {
  id: string;
  numero: string;
  statut: StatutVisite;
  accueilId: string;
  accueil: string;
  nom: string;
  telephone: string | null;
  societe: string | null;
  motif: string;
  typePiece: string | null;
  numeroPiece: string | null;
  visiteUserId: string | null;
  visiteNom: string | null;
  visiteLibelle: string | null;
  attenduLe: Date | null;
  arriveeLe: Date | null;
  sortieLe: Date | null;
  jetonBadge: string;
  photos: { recto: boolean; verso: boolean; visiteur: boolean };
  photosEffaceesLe: Date | null;
}

const visite = {
  id: visites.id,
  numero: visites.numero,
  statut: visites.statut,
  accueilId: visites.accueilId,
  accueil: accueils.nom,
  nom: visites.nom,
  telephone: visites.telephone,
  societe: visites.societe,
  motif: visites.motif,
  typePiece: visites.typePiece,
  numeroPiece: visites.numeroPiece,
  visiteUserId: visites.visiteUserId,
  visiteNom: users.fullName,
  visiteLibelle: visites.visiteLibelle,
  attenduLe: visites.attenduLe,
  arriveeLe: visites.arriveeLe,
  sortieLe: visites.sortieLe,
  jetonBadge: visites.jetonBadge,
  photoRecto: visites.photoRecto,
  photoVerso: visites.photoVerso,
  photoVisiteur: visites.photoVisiteur,
  photosEffaceesLe: visites.photosEffaceesLe,
};

type Brute = { [K in keyof typeof visite]: unknown } & Record<string, unknown>;

function ligne(b: Brute): LigneVisite {
  const { photoRecto, photoVerso, photoVisiteur, ...reste } = b;
  return { ...(reste as unknown as Omit<LigneVisite, "photos">), photos: { recto: Boolean(photoRecto), verso: Boolean(photoVerso), visiteur: Boolean(photoVisiteur) } };
}

export interface FiltreVisites {
  /** Accueils lisibles ; nul = tous (supervision). */
  accueilIds: string[] | null;
  statuts?: StatutVisite[];
  /** Arrivée, ou heure attendue, dans [du, au[. */
  du?: Date;
  au?: Date;
  recherche?: string;
  limite?: number;
}

export async function visitesDe(organizationId: string, filtre: FiltreVisites): Promise<LigneVisite[]> {
  if (filtre.accueilIds && filtre.accueilIds.length === 0) return [];
  const quand = sql`coalesce(${visites.arriveeLe}, ${visites.attenduLe}, ${visites.createdAt})`;
  const conditions: (SQL | undefined)[] = [
    eq(visites.organizationId, organizationId),
    isNull(visites.deletedAt),
    filtre.accueilIds ? inArray(visites.accueilId, filtre.accueilIds) : undefined,
    filtre.statuts?.length ? inArray(visites.statut, filtre.statuts) : undefined,
    filtre.du ? sql`${quand} >= ${filtre.du.toISOString()}` : undefined,
    filtre.au ? sql`${quand} < ${filtre.au.toISOString()}` : undefined,
  ];
  const mots = (filtre.recherche ?? "").trim();
  if (mots) {
    const motif = `%${mots.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(visites.nom, motif), ilike(visites.numero, motif), ilike(visites.societe, motif), ilike(visites.motif, motif), ilike(visites.numeroPiece, motif)));
  }
  const lignes = await db
    .select(visite)
    .from(visites)
    .innerJoin(accueils, eq(accueils.id, visites.accueilId))
    .leftJoin(users, eq(users.id, visites.visiteUserId))
    .where(and(...conditions))
    .orderBy(desc(quand))
    .limit(filtre.limite ?? 300);
  return lignes.map((l) => ligne(l as Brute));
}

export async function visiteDe(organizationId: string, visiteId: string): Promise<(LigneVisite & { brute: Visite }) | null> {
  const [l] = await db
    .select({ ...visite, brute: visites })
    .from(visites)
    .innerJoin(accueils, eq(accueils.id, visites.accueilId))
    .leftJoin(users, eq(users.id, visites.visiteUserId))
    .where(and(eq(visites.organizationId, organizationId), eq(visites.id, visiteId), isNull(visites.deletedAt)));
  return l ? { ...ligne(l as Brute), brute: l.brute } : null;
}

/** Retrouve la visite d'un badge scanné. */
export async function visiteParJeton(organizationId: string, jeton: string): Promise<string | null> {
  const [l] = await db
    .select({ id: visites.id })
    .from(visites)
    .where(and(eq(visites.organizationId, organizationId), eq(visites.jetonBadge, jeton), isNull(visites.deletedAt)));
  return l?.id ?? null;
}

function jetonBadge(): string {
  return randomBytes(12).toString("base64url");
}

export interface NouvelleVisite {
  accueilId: string;
  saisie: SaisieVisite;
  visiteUserId: string | null;
  visiteLibelle: string;
  /** Rendez-vous annoncé : l'heure attendue. Absent : le visiteur est là. */
  attenduLe?: Date | null;
}

/**
 * Crée une visite : présente (arrivée sans rendez-vous) ou attendue
 * (rendez-vous annoncé). Le numéro s'attribue dans la transaction.
 */
export async function creerVisitePour(organizationId: string, userId: string, v: NouvelleVisite, maintenant = new Date()): Promise<{ id: string; numero: string }> {
  const [accueil] = await db
    .select()
    .from(accueils)
    .where(and(eq(accueils.organizationId, organizationId), eq(accueils.id, v.accueilId), eq(accueils.actif, true), isNull(accueils.deletedAt)));
  if (!accueil) throw new Error("Point d'accueil introuvable ou fermé.");
  const attendue = Boolean(v.attenduLe);
  const refus = refusSaisie(v.saisie, { pieceExigee: !attendue && accueil.pieceExigee });
  if (refus) throw new Error(refus);
  if (v.visiteUserId) await verifierMembre(organizationId, v.visiteUserId);

  const id = newId();
  const numero = await db.transaction(async (tx) => {
    const n = await prochainNumero(tx, organizationId, formatNumeroVisite(maintenant.getUTCFullYear()));
    await tx.insert(visites).values({
      id,
      organizationId,
      accueilId: accueil.id,
      numero: n,
      statut: attendue ? "attendue" : "presente",
      nom: v.saisie.nom.trim(),
      telephone: v.saisie.telephone.trim() || null,
      societe: v.saisie.societe.trim() || null,
      motif: v.saisie.motif.trim(),
      typePiece: typePieceValide(v.saisie.typePiece) ? v.saisie.typePiece : null,
      numeroPiece: v.saisie.numeroPiece.trim() || null,
      visiteUserId: v.visiteUserId,
      visiteLibelle: v.visiteLibelle.trim().slice(0, 120) || null,
      attenduLe: v.attenduLe ?? null,
      arriveeLe: attendue ? null : maintenant,
      jetonBadge: jetonBadge(),
      annoncePar: attendue ? userId : null,
      arriveePar: attendue ? null : userId,
    });
    return n;
  });
  await tracerPour(organizationId, userId, { action: attendue ? "visite.annoncer" : "visite.arrivee", entite: "visite", entiteId: id, apres: { numero, accueil: accueil.nom } });
  if (!attendue) await prevenirArrivee(organizationId, id);
  return { id, numero };
}

async function verifierMembre(organizationId: string, userId: string) {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId), eq(memberships.status, "actif")));
  if (!m) throw new Error("La personne visitée n'est pas un membre actif de l'entreprise.");
}

/** Prévient la personne visitée que son visiteur est à l'accueil. */
async function prevenirArrivee(organizationId: string, visiteId: string) {
  const v = await visiteDe(organizationId, visiteId);
  if (!v?.visiteUserId) return;
  await notifier(organizationId, [v.visiteUserId], {
    categorie: "visiteur",
    titre: `🛎️ ${v.nom}${v.societe ? ` (${v.societe})` : ""} est arrivé à l'accueil`,
    corps: `${v.accueil} · ${v.motif}`,
    lien: `/visiteurs/${v.id}`,
  });
}

/** Passe une visite d'un statut à un autre : arrivée, sortie, annulation. */
export async function changerStatutPour(
  organizationId: string,
  userId: string,
  visiteId: string,
  vers: StatutVisite,
  complement: { saisie?: SaisieVisite } = {},
  maintenant = new Date(),
): Promise<LigneVisite> {
  const v = await visiteDe(organizationId, visiteId);
  if (!v) throw new Error("Visite introuvable.");
  if (!passagePermis(v.statut, vers)) throw new Error(`Cette visite est « ${v.statut} » : impossible de la passer à « ${vers} ».`);

  const changement: Partial<typeof visites.$inferInsert> = { statut: vers, updatedAt: maintenant };
  if (vers === "presente") {
    const [accueil] = await db.select({ pieceExigee: accueils.pieceExigee }).from(accueils).where(eq(accueils.id, v.accueilId));
    if (complement.saisie) {
      const refus = refusSaisie(complement.saisie, { pieceExigee: accueil?.pieceExigee ?? true });
      if (refus) throw new Error(refus);
      Object.assign(changement, {
        nom: complement.saisie.nom.trim(),
        telephone: complement.saisie.telephone.trim() || null,
        societe: complement.saisie.societe.trim() || null,
        motif: complement.saisie.motif.trim(),
        typePiece: typePieceValide(complement.saisie.typePiece) ? complement.saisie.typePiece : null,
        numeroPiece: complement.saisie.numeroPiece.trim() || null,
      });
    } else if ((accueil?.pieceExigee ?? true) && !v.numeroPiece) {
      throw new Error("Relevez la pièce d'identité du visiteur avant de l'enregistrer présent.");
    }
    Object.assign(changement, { arriveeLe: maintenant, arriveePar: userId });
  }
  if (vers === "sortie") Object.assign(changement, { sortieLe: maintenant, sortiePar: userId });

  const faits = await db
    .update(visites)
    .set({ ...changement, version: sql`${visites.version} + 1` })
    .where(and(eq(visites.organizationId, organizationId), eq(visites.id, visiteId), eq(visites.statut, v.statut)))
    .returning({ id: visites.id });
  if (faits.length === 0) throw new Error("La visite vient de changer : rechargez la page.");
  await tracerPour(organizationId, userId, { action: `visite.${vers}`, entite: "visite", entiteId: visiteId, apres: { numero: v.numero } });
  if (vers === "presente") await prevenirArrivee(organizationId, visiteId);
  return (await visiteDe(organizationId, visiteId)) as LigneVisite;
}

// --------------------------------------------------------------- photos

const COLONNE: Record<CotePhoto, "photoRecto" | "photoVerso" | "photoVisiteur"> = { recto: "photoRecto", verso: "photoVerso", visiteur: "photoVisiteur" };

/** Dépose (ou remplace) une photo d'une visite. */
export async function deposerPhotoPour(
  organizationId: string,
  userId: string,
  visiteId: string,
  cote: CotePhoto,
  fichier: { contenu: ArrayBuffer; typeMime: string },
): Promise<void> {
  const v = await visiteDe(organizationId, visiteId);
  if (!v) throw new Error("Visite introuvable.");
  if (v.photosEffaceesLe) throw new Error("Les photos de cette visite ont été effacées : la durée de conservation est passée.");
  const extension = fichier.typeMime === "image/png" ? "png" : fichier.typeMime === "image/webp" ? "webp" : "jpg";
  // Le dépôt n'accepte que `<entreprise>/<identifiant>.<ext>` : un nom neuf par photo, la visite le retient.
  const chemin = cheminDe(organizationId, newId(), extension);
  const depot = await deposer({ chemin, contenu: fichier.contenu, typeMime: fichier.typeMime });
  if (!depot.ok) throw new Error(depot.raison);
  const ancien = v.brute[COLONNE[cote]];
  await db
    .update(visites)
    .set({ [COLONNE[cote]]: chemin, updatedAt: new Date(), version: sql`${visites.version} + 1` })
    .where(and(eq(visites.organizationId, organizationId), eq(visites.id, visiteId)));
  if (ancien) await supprimer(ancien);
  await tracerPour(organizationId, userId, { action: "visite.photo", entite: "visite", entiteId: visiteId, apres: { cote } });
}

/** URL signée d'une photo, demandée au clic ; chaque ouverture est tracée. */
export async function urlPhotoPour(organizationId: string, userId: string, visiteId: string, cote: CotePhoto): Promise<string | null> {
  const v = await visiteDe(organizationId, visiteId);
  const chemin = v?.brute[COLONNE[cote]];
  if (!chemin) return null;
  await tracerPour(organizationId, userId, { action: "visite.photo_ouvrir", entite: "visite", entiteId: visiteId, apres: { cote } });
  return urlSignee(chemin, 120);
}

/**
 * Efface les photos des visites de plus de trois mois (loi 2013-450) : les
 * fichiers d'abord, puis les chemins. Le registre reste. Rend le nombre de
 * visites purgées.
 */
export async function purgerPhotosPour(organizationId: string, maintenant = new Date()): Promise<number> {
  const echues = await db
    .select({ id: visites.id, recto: visites.photoRecto, verso: visites.photoVerso, visiteur: visites.photoVisiteur })
    .from(visites)
    .where(
      and(
        eq(visites.organizationId, organizationId),
        isNull(visites.photosEffaceesLe),
        or(isNotNull(visites.photoRecto), isNotNull(visites.photoVerso), isNotNull(visites.photoVisiteur)),
        sql`coalesce(${visites.arriveeLe}, ${visites.attenduLe}, ${visites.createdAt}) + interval '3 months' <= ${maintenant.toISOString()}::timestamptz`,
      ),
    )
    .limit(500);
  for (const e of echues) {
    for (const chemin of [e.recto, e.verso, e.visiteur]) if (chemin) await supprimer(chemin);
    await db
      .update(visites)
      .set({ photoRecto: null, photoVerso: null, photoVisiteur: null, photosEffaceesLe: maintenant, updatedAt: maintenant, version: sql`${visites.version} + 1` })
      .where(eq(visites.id, e.id));
  }
  if (echues.length > 0) await tracerPour(organizationId, null, { action: "visite.photos_effacees", entite: "visite", apres: { visites: echues.length } });
  return echues.length;
}

/** Au plus une purge par entreprise et par heure, par processus. */
const PAS_PURGE_MS = 60 * 60_000;
const purgees = new Map<string, number>();

/** Purge APRÈS la réponse : aucune tâche planifiée, l'écran ne l'attend pas. */
export function purgerApresReponse(organizationId: string | null): void {
  if (!organizationId || !moduleOuvert("visiteurs")) return;
  const maintenant = Date.now();
  if (maintenant - (purgees.get(organizationId) ?? 0) < PAS_PURGE_MS) return;
  purgees.set(organizationId, maintenant);
  after(() =>
    purgerPhotosPour(organizationId).catch((erreur) => {
      console.error("Purge des photos de visiteurs", erreur);
    }),
  );
}

/** Les comptes actifs, pour choisir la personne visitée. */
export async function personnesVisitables(organizationId: string): Promise<{ id: string; nom: string }[]> {
  return db
    .select({ id: users.id, nom: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), eq(users.status, "actif")))
    .orderBy(asc(users.fullName));
}

/** Visites présentes : la liste d'évacuation. */
export function presents(organizationId: string, accueilIds: string[] | null): Promise<LigneVisite[]> {
  return visitesDe(organizationId, { accueilIds, statuts: ["presente"], limite: 1000 });
}

/** Rendez-vous à venir (ou du jour) annoncés par un compte. */
export async function rendezVousDe(organizationId: string, annoncePar: string | null, depuis: Date): Promise<LigneVisite[]> {
  const lignes = await db
    .select(visite)
    .from(visites)
    .innerJoin(accueils, eq(accueils.id, visites.accueilId))
    .leftJoin(users, eq(users.id, visites.visiteUserId))
    .where(
      and(
        eq(visites.organizationId, organizationId),
        isNull(visites.deletedAt),
        isNotNull(visites.attenduLe),
        gte(visites.attenduLe, depuis),
        annoncePar ? or(eq(visites.annoncePar, annoncePar), eq(visites.visiteUserId, annoncePar)) : undefined,
      ),
    )
    .orderBy(asc(visites.attenduLe))
    .limit(200);
  return lignes.map((l) => ligne(l as Brute));
}

