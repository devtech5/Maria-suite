import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { prochainNumero } from "@/lib/sequences";
import { notifier } from "@/modules/communication/notifications";
import { jourLocal } from "@/modules/presences/calcul";

import {
  LONGUEUR_MAX_PREAMBULE,
  LONGUEUR_MAX_RESUME,
  LONGUEUR_MAX_TITRE,
  TITRE_DEFAUT,
  dateLongue,
  dateValide,
  normaliserArticles,
  refusPublication,
  relancePermise,
  suiviLectures,
  type Article,
  type Membre,
  type SuiviLectures,
} from "./regles";
import { reglementAcceptations, reglementVersions, type ReglementVersion } from "./schema";

/**
 * Règlement intérieur, côté base. Toute fonction prend l'entreprise en
 * premier argument et filtre dessus ; les actions (`./actions.ts`) vérifient
 * les droits avant d'appeler.
 */

/** Le jour d'aujourd'hui dans le fuseau de l'entreprise. */
export async function aujourdhuiPour(organizationId: string, maintenant = new Date()): Promise<string> {
  const [ligne] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  return jourLocal(maintenant, ligne?.fuseau || "Africa/Abidjan");
}

export type ResumeVersion = Pick<
  ReglementVersion,
  "id" | "numero" | "statut" | "titre" | "dateEffet" | "resume" | "publieLe" | "derniereRelanceLe" | "updatedAt"
> & { articles: number; statut: "brouillon" | "publie" };

/** Toutes les versions, la plus récente d'abord ; le brouillon en tête. */
export async function versionsDe(organizationId: string): Promise<ResumeVersion[]> {
  const lignes = await db
    .select({
      id: reglementVersions.id,
      numero: reglementVersions.numero,
      statut: reglementVersions.statut,
      titre: reglementVersions.titre,
      dateEffet: reglementVersions.dateEffet,
      resume: reglementVersions.resume,
      publieLe: reglementVersions.publieLe,
      derniereRelanceLe: reglementVersions.derniereRelanceLe,
      updatedAt: reglementVersions.updatedAt,
      articles: sql<number>`jsonb_array_length(${reglementVersions.articles})::int`,
    })
    .from(reglementVersions)
    .where(and(eq(reglementVersions.organizationId, organizationId), isNull(reglementVersions.deletedAt)))
    .orderBy(sql`${reglementVersions.numero} desc nulls first`);
  return lignes.map((l) => ({ ...l, statut: l.statut === "publie" ? "publie" : "brouillon" }));
}

export async function versionDe(organizationId: string, versionId: string): Promise<ReglementVersion | null> {
  const [ligne] = await db
    .select()
    .from(reglementVersions)
    .where(and(eq(reglementVersions.organizationId, organizationId), eq(reglementVersions.id, versionId), isNull(reglementVersions.deletedAt)));
  return ligne ?? null;
}

/** Quand ce compte a accepté cette version, ou null. */
export async function acceptationDe(organizationId: string, userId: string, versionId: string): Promise<Date | null> {
  const [ligne] = await db
    .select({ le: reglementAcceptations.accepteLe })
    .from(reglementAcceptations)
    .where(and(eq(reglementAcceptations.organizationId, organizationId), eq(reglementAcceptations.versionId, versionId), eq(reglementAcceptations.userId, userId)));
  return ligne?.le ?? null;
}

/** Les comptes actifs de l'entreprise : ceux à qui le règlement s'impose. */
export async function membresActifs(organizationId: string): Promise<Membre[]> {
  return db
    .select({ userId: users.id, nom: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"), eq(users.status, "actif")))
    .orderBy(asc(users.fullName));
}

export async function suiviDe(organizationId: string, versionId: string): Promise<SuiviLectures> {
  const [membres, lectures] = await Promise.all([
    membresActifs(organizationId),
    db
      .select({ userId: reglementAcceptations.userId, accepteLe: reglementAcceptations.accepteLe })
      .from(reglementAcceptations)
      .where(and(eq(reglementAcceptations.organizationId, organizationId), eq(reglementAcceptations.versionId, versionId))),
  ]);
  return suiviLectures(membres, lectures);
}

// ------------------------------------------------------------- rédaction

/**
 * Ouvre la rédaction d'une nouvelle version, à partir de la dernière publiée.
 * S'il existe déjà un brouillon, c'est lui qu'on reprend : un seul à la fois.
 */
export async function creerBrouillonPour(organizationId: string, userId: string): Promise<string> {
  const [existant] = await db
    .select({ id: reglementVersions.id })
    .from(reglementVersions)
    .where(and(eq(reglementVersions.organizationId, organizationId), eq(reglementVersions.statut, "brouillon"), isNull(reglementVersions.deletedAt)));
  if (existant) return existant.id;

  const [precedente] = await db
    .select({ titre: reglementVersions.titre, preambule: reglementVersions.preambule, articles: reglementVersions.articles })
    .from(reglementVersions)
    .where(and(eq(reglementVersions.organizationId, organizationId), eq(reglementVersions.statut, "publie"), isNull(reglementVersions.deletedAt)))
    .orderBy(desc(reglementVersions.numero))
    .limit(1);

  const id = newId();
  const posees = await db
    .insert(reglementVersions)
    .values({
      id,
      organizationId,
      titre: precedente?.titre ?? TITRE_DEFAUT,
      preambule: precedente?.preambule ?? null,
      articles: precedente?.articles ?? [],
      creePar: userId,
    })
    .onConflictDoNothing()
    .returning({ id: reglementVersions.id });
  if (posees.length === 0) {
    // Un autre onglet vient d'ouvrir le brouillon : c'est le même travail.
    return creerBrouillonPour(organizationId, userId);
  }
  await tracerPour(organizationId, userId, { action: "reglement.brouillon", entite: "reglement_version", entiteId: id });
  return id;
}

export interface SaisieBrouillon {
  titre: string;
  preambule: string;
  resume: string;
  dateEffet: string;
  articles: unknown;
}

function nettoyer(saisie: SaisieBrouillon): { titre: string; preambule: string | null; resume: string | null; dateEffet: string | null; articles: Article[] } {
  const titre = saisie.titre.trim() || TITRE_DEFAUT;
  if (titre.length > LONGUEUR_MAX_TITRE) throw new Error(`Le titre dépasse ${LONGUEUR_MAX_TITRE} caractères.`);
  const preambule = saisie.preambule.replace(/\r\n?/g, "\n").trim();
  if (preambule.length > LONGUEUR_MAX_PREAMBULE) throw new Error(`Le préambule dépasse ${LONGUEUR_MAX_PREAMBULE.toLocaleString("fr-FR")} caractères.`);
  const resume = saisie.resume.trim();
  if (resume.length > LONGUEUR_MAX_RESUME) throw new Error(`Le résumé des changements dépasse ${LONGUEUR_MAX_RESUME} caractères.`);
  const dateEffet = saisie.dateEffet.trim();
  if (dateEffet && !dateValide(dateEffet)) throw new Error("La date d'effet est illisible.");
  return { titre, preambule: preambule || null, resume: resume || null, dateEffet: dateEffet || null, articles: normaliserArticles(saisie.articles) };
}

async function brouillonDe(organizationId: string, versionId: string): Promise<ReglementVersion> {
  const version = await versionDe(organizationId, versionId);
  if (!version) throw new Error("Version introuvable.");
  if (version.statut !== "brouillon") throw new Error("Cette version est publiée : elle ne se modifie plus. Rédigez-en une nouvelle.");
  return version;
}

export async function enregistrerBrouillonPour(organizationId: string, userId: string, versionId: string, saisie: SaisieBrouillon): Promise<{ articles: number }> {
  await brouillonDe(organizationId, versionId);
  const propre = nettoyer(saisie);
  const modifiees = await db
    .update(reglementVersions)
    .set({ ...propre, updatedAt: new Date(), version: sql`${reglementVersions.version} + 1` })
    .where(and(eq(reglementVersions.organizationId, organizationId), eq(reglementVersions.id, versionId), eq(reglementVersions.statut, "brouillon")))
    .returning({ id: reglementVersions.id });
  if (modifiees.length === 0) throw new Error("Cette version vient d'être publiée : elle ne se modifie plus.");
  await tracerPour(organizationId, userId, { action: "reglement.rediger", entite: "reglement_version", entiteId: versionId, apres: { articles: propre.articles.length } });
  return { articles: propre.articles.length };
}

export async function supprimerBrouillonPour(organizationId: string, userId: string, versionId: string): Promise<void> {
  await brouillonDe(organizationId, versionId);
  await db
    .update(reglementVersions)
    .set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${reglementVersions.version} + 1` })
    .where(and(eq(reglementVersions.organizationId, organizationId), eq(reglementVersions.id, versionId), eq(reglementVersions.statut, "brouillon")));
  await tracerPour(organizationId, userId, { action: "reglement.brouillon_supprime", entite: "reglement_version", entiteId: versionId });
}

/**
 * Publie le brouillon : numéro attribué dans la transaction, texte figé. Tout
 * le monde en est prévenu dans la cloche.
 */
export async function publierPour(
  organizationId: string,
  userId: string,
  versionId: string,
  maintenant = new Date(),
): Promise<{ numero: number; dateEffet: string }> {
  const aujourdhui = await aujourdhuiPour(organizationId, maintenant);
  const publiee = await db.transaction(async (tx) => {
    const [brouillon] = await tx
      .select()
      .from(reglementVersions)
      .where(and(eq(reglementVersions.organizationId, organizationId), eq(reglementVersions.id, versionId), isNull(reglementVersions.deletedAt)))
      .for("update");
    if (!brouillon) throw new Error("Version introuvable.");
    if (brouillon.statut !== "brouillon") throw new Error("Cette version est déjà publiée.");
    const refus = refusPublication({ articles: brouillon.articles, dateEffet: brouillon.dateEffet }, aujourdhui);
    if (refus) throw new Error(refus);

    const numero = Number(await prochainNumero(tx, organizationId, { cle: "reglement", padding: 1 }));
    await tx
      .update(reglementVersions)
      .set({ statut: "publie", numero, publieLe: maintenant, publiePar: userId, updatedAt: maintenant, version: sql`${reglementVersions.version} + 1` })
      .where(eq(reglementVersions.id, versionId));
    return { numero, dateEffet: brouillon.dateEffet as string, titre: brouillon.titre };
  });

  await tracerPour(organizationId, userId, { action: "reglement.publier", entite: "reglement_version", entiteId: versionId, apres: { numero: publiee.numero, dateEffet: publiee.dateEffet } });
  const membres = await membresActifs(organizationId);
  const immediate = publiee.dateEffet <= aujourdhui;
  await notifier(
    organizationId,
    membres.map((m) => m.userId),
    {
      categorie: "reglement",
      titre: `${publiee.titre} : version ${publiee.numero} publiée`,
      corps: immediate
        ? "En vigueur dès aujourd'hui. Lisez-la et acceptez-la pour continuer à utiliser Maria Suite."
        : `En vigueur le ${dateLongue(publiee.dateEffet)}. Vous pouvez la lire et l'accepter dès maintenant.`,
      lien: "/reglement",
    },
  );
  return { numero: publiee.numero, dateEffet: publiee.dateEffet };
}

// ------------------------------------------------------------- lecture

/**
 * « J'ai lu et j'accepte ». Une seule acceptation par version et par compte :
 * la première fait foi, une seconde ne la déplace pas.
 */
export async function accepterPour(
  organizationId: string,
  userId: string,
  versionId: string,
  contexte: { adresseIp?: string | null; appareil?: string | null } = {},
): Promise<{ numero: number }> {
  const version = await versionDe(organizationId, versionId);
  if (!version || version.statut !== "publie" || version.numero === null) throw new Error("Cette version du règlement n'est pas publiée.");
  const posees = await db
    .insert(reglementAcceptations)
    .values({
      id: newId(),
      organizationId,
      versionId,
      userId,
      adresseIp: contexte.adresseIp?.slice(0, 64) ?? null,
      appareil: contexte.appareil?.slice(0, 300) ?? null,
    })
    .onConflictDoNothing({ target: [reglementAcceptations.versionId, reglementAcceptations.userId] })
    .returning({ id: reglementAcceptations.id });
  if (posees.length > 0) {
    await tracerPour(organizationId, userId, { action: "reglement.accepter", entite: "reglement_version", entiteId: versionId, apres: { numero: version.numero } });
  }
  return { numero: version.numero };
}

/** Relance dans la cloche ceux qui n'ont pas encore accepté. Rend le nombre de relancés. */
export async function relancerPour(organizationId: string, userId: string, versionId: string, maintenant = new Date()): Promise<number> {
  const version = await versionDe(organizationId, versionId);
  if (!version || version.statut !== "publie" || !version.dateEffet) throw new Error("Seule une version publiée se relance.");
  if (!relancePermise(version.derniereRelanceLe, maintenant)) throw new Error("Une relance est déjà partie il y a moins d'une heure.");
  const { enAttente } = await suiviDe(organizationId, versionId);
  if (enAttente.length === 0) return 0;

  await db
    .update(reglementVersions)
    .set({ derniereRelanceLe: maintenant, updatedAt: maintenant, version: sql`${reglementVersions.version} + 1` })
    .where(and(eq(reglementVersions.organizationId, organizationId), eq(reglementVersions.id, versionId)));
  const destinataires = enAttente.map((m) => m.userId).filter((u) => u !== userId);
  await notifier(organizationId, destinataires, {
    categorie: "reglement",
    titre: `Rappel : ${version.titre} à lire et accepter`,
    corps: `Version ${version.numero}, en vigueur le ${dateLongue(version.dateEffet)}. Les ressources humaines attendent votre acceptation.`,
    lien: "/reglement",
  });
  await tracerPour(organizationId, userId, { action: "reglement.relancer", entite: "reglement_version", entiteId: versionId, apres: { relances: destinataires.length } });
  return destinataires.length;
}
