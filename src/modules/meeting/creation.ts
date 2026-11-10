import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { auditLogs, memberships } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";

import {
  FRAICHEUR_MS,
  dureeValide,
  gestesLien,
  lienOuvertA,
  messageSalle,
  pilote,
  reactionConnue,
  rejoignable,
  secondesDePresence,
  statutApres,
  type Acteur,
  type Geste,
  type GesteLien,
  type Statut,
} from "./calcul";
import { reunionMessages, reunionParticipants, reunions } from "./schema";

async function journaliser(
  tx: Transaction,
  organizationId: string,
  userId: string,
  action: string,
  reunionId: string,
  apres: Record<string, unknown>,
  avant?: Record<string, unknown>,
) {
  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action,
    entityType: "reunion",
    entityId: reunionId,
    before: avant ?? null,
    after: apres,
  });
}

/** Les invités doivent être des membres actifs de l'entreprise. */
async function verifierMembres(tx: Transaction, organizationId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const actifs = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        inArray(memberships.userId, userIds),
        eq(memberships.status, "actif"),
      ),
    );
  if (actifs.length !== new Set(userIds).size) throw new Error("Un des invités n'a pas d'accès actif à l'entreprise.");
}

async function reunionVerrouillee(tx: Transaction, organizationId: string, reunionId: string) {
  const [reunion] = await tx
    .select()
    .from(reunions)
    .where(and(eq(reunions.id, reunionId), eq(reunions.organizationId, organizationId), isNull(reunions.deletedAt)))
    .for("update");
  if (!reunion) throw new Error("Réunion introuvable.");
  return reunion;
}

async function participantDe(tx: Transaction, reunionId: string, userId: string) {
  const [ligne] = await tx
    .select()
    .from(reunionParticipants)
    .where(and(eq(reunionParticipants.reunionId, reunionId), eq(reunionParticipants.userId, userId)));
  return ligne ?? null;
}

export interface NouvelleReunion {
  titre: string;
  ordreDuJour?: string | null;
  debutPrevu: Date;
  dureeMinutes: number;
  /** Invités. L'organisateur y est ajouté de lui-même. */
  participants: string[];
}

/** Programme une réunion, ou l'ouvre sur-le-champ avec un début à maintenant. */
export async function creerReunionDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleReunion,
  acteur: Acteur,
): Promise<{ id: string; numero: string; invites: string[] }> {
  if (!acteur.organise) throw new Error("Votre rôle ne permet pas d'organiser une réunion.");
  if (!dureeValide(donnees.dureeMinutes)) throw new Error("Durée invalide : entre 5 minutes et 8 heures.");
  const invites = [...new Set(donnees.participants)].filter((u) => u !== acteur.userId);
  await verifierMembres(tx, organizationId, invites);

  const annee = String(donnees.debutPrevu.getUTCFullYear());
  const numero = await prochainNumero(tx, organizationId, { cle: "reunion", prefix: `REU-${annee}-`, padding: 5, periode: annee });
  const id = newId();
  await tx.insert(reunions).values({
    id,
    organizationId,
    numero,
    titre: donnees.titre.trim(),
    ordreDuJour: donnees.ordreDuJour?.trim() || null,
    debutPrevu: donnees.debutPrevu,
    dureeMinutes: donnees.dureeMinutes,
    organisateurUserId: acteur.userId,
  });
  await tx.insert(reunionParticipants).values(
    [acteur.userId, ...invites].map((userId) => ({
      id: newId(),
      organizationId,
      reunionId: id,
      userId,
      inviteParUserId: acteur.userId,
    })),
  );
  await journaliser(tx, organizationId, acteur.userId, "reunion.programmer", id, {
    numero,
    titre: donnees.titre,
    debutPrevu: donnees.debutPrevu.toISOString(),
    dureeMinutes: donnees.dureeMinutes,
    invites,
  });
  return { id, numero, invites };
}

/** Ajoute des invités à une réunion qui n'est pas close. Rend ceux qui ne l'étaient pas encore. */
export async function inviterDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  userIds: string[],
  acteur: Acteur,
): Promise<{ numero: string; titre: string; nouveaux: string[] }> {
  const reunion = await reunionVerrouillee(tx, organizationId, reunionId);
  if (!pilote(reunion, acteur)) throw new Error("Seul l'organisateur invite à cette réunion.");
  if (!rejoignable(reunion.statut)) throw new Error(`${reunion.numero} est close : on n'y invite plus.`);
  const demandes = [...new Set(userIds)];
  await verifierMembres(tx, organizationId, demandes);

  const nouveaux = await tx
    .insert(reunionParticipants)
    .values(demandes.map((userId) => ({ id: newId(), organizationId, reunionId, userId, inviteParUserId: acteur.userId })))
    .onConflictDoNothing({ target: [reunionParticipants.reunionId, reunionParticipants.userId] })
    .returning({ userId: reunionParticipants.userId });
  const ids = nouveaux.map((n) => n.userId);
  if (ids.length > 0) await journaliser(tx, organizationId, acteur.userId, "reunion.inviter", reunionId, { numero: reunion.numero, invites: ids });
  return { numero: reunion.numero, titre: reunion.titre, nouveaux: ids };
}

/**
 * Entre dans la salle. La première arrivée ouvre la réunion. Un invité y
 * entre ; qui pilote la réunion sans y être invité s'y ajoute en entrant.
 */
export async function rejoindreDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  acteur: Acteur,
  maintenant = new Date(),
): Promise<{ numero: string; ouverte: boolean }> {
  const reunion = await reunionVerrouillee(tx, organizationId, reunionId);
  if (!rejoignable(reunion.statut)) {
    throw new Error(`${reunion.numero} est ${reunion.statut === "terminee" ? "terminée" : "annulée"}.`);
  }

  if (!lienOuvertA(reunion.lienActif, reunion, acteur)) {
    throw new Error(`Le lien de ${reunion.numero} est désactivé : l'organisateur a fermé l'entrée de la salle.`);
  }

  let place = await participantDe(tx, reunionId, acteur.userId);
  if (!place) {
    if (!pilote(reunion, acteur)) throw new Error("Vous n'êtes pas invité à cette réunion.");
    await tx.insert(reunionParticipants).values({ id: newId(), organizationId, reunionId, userId: acteur.userId, inviteParUserId: acteur.userId });
    place = await participantDe(tx, reunionId, acteur.userId);
  }

  const ouverte = reunion.statut === "planifiee";
  if (ouverte) {
    await tx
      .update(reunions)
      .set({ statut: "en_cours", ouverteLe: maintenant, updatedAt: maintenant, version: sql`${reunions.version} + 1` })
      .where(eq(reunions.id, reunionId));
    await journaliser(tx, organizationId, acteur.userId, "reunion.ouvrir", reunionId, { numero: reunion.numero }, { statut: reunion.statut });
  }

  await tx
    .update(reunionParticipants)
    .set({
      rejointLe: place!.rejointLe ?? maintenant,
      secondesPresence: place!.secondesPresence + secondesDePresence(place!.vuLe, maintenant),
      vuLe: maintenant,
      updatedAt: maintenant,
      version: sql`${reunionParticipants.version} + 1`,
    })
    .where(eq(reunionParticipants.id, place!.id));
  if (!place!.rejointLe) await journaliser(tx, organizationId, acteur.userId, "reunion.rejoindre", reunionId, { numero: reunion.numero });

  return { numero: reunion.numero, ouverte };
}

export interface EtatMedias {
  micro: boolean;
  camera: boolean;
  ecran: boolean;
  /** Main levée. Absente : inchangée. */
  main?: boolean;
}

/**
 * Signal de présence depuis la salle : « je suis là, micro coupé, écran
 * partagé ». Cumule le temps passé depuis le signal précédent. Rend le statut
 * de la réunion — terminée, la salle se vide d'elle-même.
 */
export async function signalerDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  userId: string,
  medias: EtatMedias,
  maintenant = new Date(),
): Promise<{ statut: Statut }> {
  const [reunion] = await tx
    .select({ statut: reunions.statut, supprimee: reunions.deletedAt })
    .from(reunions)
    .where(and(eq(reunions.id, reunionId), eq(reunions.organizationId, organizationId)));
  if (!reunion) throw new Error("Réunion introuvable.");
  // Supprimée pendant qu'on y était : la salle se ferme comme une réunion terminée.
  if (reunion.supprimee) return { statut: "terminee" };
  if (reunion.statut !== "en_cours") return { statut: reunion.statut };

  const place = await participantDe(tx, reunionId, userId);
  if (!place) throw new Error("Vous n'êtes pas invité à cette réunion.");
  await tx
    .update(reunionParticipants)
    .set({
      secondesPresence: place.secondesPresence + secondesDePresence(place.vuLe, maintenant),
      vuLe: maintenant,
      micro: medias.micro,
      camera: medias.camera,
      ecran: medias.ecran,
      ...(medias.main === undefined ? {} : { mainLevee: medias.main }),
      updatedAt: maintenant,
    })
    .where(eq(reunionParticipants.id, place.id));
  return { statut: reunion.statut };
}

/** Une place dans une salle ouverte, ou une erreur lisible. */
async function placeEnSalle(tx: Transaction, organizationId: string, reunionId: string, userId: string) {
  const [reunion] = await tx
    .select({ statut: reunions.statut, numero: reunions.numero })
    .from(reunions)
    .where(and(eq(reunions.id, reunionId), eq(reunions.organizationId, organizationId), isNull(reunions.deletedAt)));
  if (!reunion) throw new Error("Réunion introuvable.");
  if (reunion.statut !== "en_cours") throw new Error(`${reunion.numero} n'est pas en cours.`);
  const place = await participantDe(tx, reunionId, userId);
  if (!place) throw new Error("Vous n'êtes pas invité à cette réunion.");
  return place;
}

/** Une réaction (👍, 👏…) : elle flotte quelques secondes sur la tuile de son auteur. */
export async function reagirDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  userId: string,
  reaction: string,
  maintenant = new Date(),
): Promise<void> {
  if (!reactionConnue(reaction)) throw new Error("Réaction inconnue.");
  const place = await placeEnSalle(tx, organizationId, reunionId, userId);
  await tx
    .update(reunionParticipants)
    .set({ reaction, reactionLe: maintenant, updatedAt: maintenant })
    .where(eq(reunionParticipants.id, place.id));
}

/** Un message dans la discussion de la salle. */
export async function ecrireEnSalleDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  userId: string,
  saisie: string,
): Promise<{ id: string }> {
  const corps = messageSalle(saisie);
  if (!corps) throw new Error("Message vide ou trop long : 2 000 caractères au plus.");
  await placeEnSalle(tx, organizationId, reunionId, userId);
  const id = newId();
  await tx.insert(reunionMessages).values({ id, organizationId, reunionId, userId, corps });
  return { id };
}

/** Quitte la salle : le temps passé est compté, les autres cessent de lire ses flux. */
export async function quitterDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  userId: string,
  maintenant = new Date(),
): Promise<void> {
  const place = await participantDe(tx, reunionId, userId);
  if (!place || place.organizationId !== organizationId) return;
  await tx
    .update(reunionParticipants)
    .set({
      secondesPresence: place.secondesPresence + secondesDePresence(place.vuLe, maintenant),
      vuLe: null,
      micro: false,
      camera: false,
      ecran: false,
      mainLevee: false,
      updatedAt: maintenant,
    })
    .where(eq(reunionParticipants.id, place.id));
}

/**
 * Termine ou annule une réunion. Terminer vide la salle : le temps de chacun
 * est arrêté au moment du geste, et les navigateurs encore présents le
 * constatent à leur signal suivant.
 */
export async function appliquerGesteDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  geste: Geste,
  acteur: Acteur,
  motif?: string | null,
  maintenant = new Date(),
): Promise<{ numero: string }> {
  const reunion = await reunionVerrouillee(tx, organizationId, reunionId);
  if (!pilote(reunion, acteur)) throw new Error("Seul l'organisateur pilote cette réunion.");
  const vers = statutApres(geste, reunion.statut);
  if (!vers) throw new Error(`${reunion.numero} : impossible depuis l'état actuel.`);
  if (geste === "annuler" && (!motif || motif.trim().length < 3)) throw new Error("Indiquez le motif de l'annulation.");

  await tx
    .update(reunions)
    .set({
      statut: vers,
      ...(geste === "terminer" ? { termineeLe: maintenant, termineeParUserId: acteur.userId } : {}),
      ...(geste === "annuler" ? { annuleeLe: maintenant, motifAnnulation: motif!.trim() } : {}),
      updatedAt: maintenant,
      version: sql`${reunions.version} + 1`,
    })
    .where(eq(reunions.id, reunionId));

  if (geste === "terminer") {
    const limite = new Date(maintenant.getTime() - FRAICHEUR_MS).toISOString();
    const fin = maintenant.toISOString();
    await tx
      .update(reunionParticipants)
      .set({
        // Même règle que `secondesDePresence`, appliquée à toute la salle d'un coup.
        secondesPresence: sql`${reunionParticipants.secondesPresence} + case when ${reunionParticipants.vuLe} >= ${limite}::timestamptz and ${reunionParticipants.vuLe} <= ${fin}::timestamptz then floor(extract(epoch from (${fin}::timestamptz - ${reunionParticipants.vuLe})))::int else 0 end`,
        vuLe: null,
        micro: false,
        camera: false,
        ecran: false,
        mainLevee: false,
        updatedAt: maintenant,
      })
      .where(eq(reunionParticipants.reunionId, reunionId));
  }

  await journaliser(
    tx,
    organizationId,
    acteur.userId,
    `reunion.${geste}`,
    reunionId,
    { numero: reunion.numero, statut: vers, ...(geste === "annuler" ? { motif: motif!.trim() } : {}) },
    { statut: reunion.statut },
  );
  return { numero: reunion.numero };
}

/**
 * Désactive ou réactive le lien de la salle, ou supprime la réunion. Une
 * réunion en cours qu'on supprime est d'abord terminée pour tous — le temps
 * de chacun arrêté au geste — puis retirée de toutes les listes ; elle reste
 * en base, avec son journal.
 */
export async function appliquerGesteLienDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  geste: GesteLien,
  acteur: Acteur,
  maintenant = new Date(),
): Promise<{ numero: string }> {
  const reunion = await reunionVerrouillee(tx, organizationId, reunionId);
  if (!gestesLien(reunion.statut, reunion.lienActif, reunion, acteur).includes(geste)) {
    throw new Error(pilote(reunion, acteur) ? `${reunion.numero} : impossible depuis l'état actuel.` : "Seul l'organisateur pilote cette réunion.");
  }

  if (geste === "supprimer") {
    if (reunion.statut === "en_cours") await appliquerGesteDans(tx, organizationId, reunionId, "terminer", acteur, null, maintenant);
    await tx
      .update(reunions)
      .set({ deletedAt: maintenant, lienActif: false, updatedAt: maintenant, version: sql`${reunions.version} + 1` })
      .where(eq(reunions.id, reunionId));
  } else {
    await tx
      .update(reunions)
      .set({ lienActif: geste === "reactiver", updatedAt: maintenant, version: sql`${reunions.version} + 1` })
      .where(eq(reunions.id, reunionId));
  }

  await journaliser(tx, organizationId, acteur.userId, `reunion.lien.${geste}`, reunionId, { numero: reunion.numero, lienActif: geste === "reactiver" }, { lienActif: reunion.lienActif, statut: reunion.statut });
  return { numero: reunion.numero };
}

/** Compte rendu : rédigé par qui pilote, pendant la réunion ou après. */
export async function enregistrerCompteRenduDans(
  tx: Transaction,
  organizationId: string,
  reunionId: string,
  texte: string,
  acteur: Acteur,
): Promise<{ numero: string }> {
  const reunion = await reunionVerrouillee(tx, organizationId, reunionId);
  if (!pilote(reunion, acteur)) throw new Error("Seul l'organisateur rédige le compte rendu.");
  if (reunion.statut === "annulee") throw new Error(`${reunion.numero} est annulée.`);
  const propre = texte.trim() || null;
  await tx
    .update(reunions)
    .set({ compteRendu: propre, updatedAt: new Date(), version: sql`${reunions.version} + 1` })
    .where(eq(reunions.id, reunionId));
  await journaliser(tx, organizationId, acteur.userId, "reunion.compte_rendu", reunionId, { numero: reunion.numero, longueur: propre?.length ?? 0 });
  return { numero: reunion.numero };
}
