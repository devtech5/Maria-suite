import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { estDoublon } from "@/lib/erreurs-pg";
import { newId } from "@/lib/ids";
import { prochainNumero } from "@/lib/sequences";
import { cheminDe, deposer, lireFichier, supprimer } from "@/lib/stockage";

import { depotDossierPermis, dossierVisible, familleDe, refusEnvoi, retraitPossible, type RegleDossier } from "./calcul";
import { empreinte } from "./empreinte";
import { accesDossiersArchives, archives, dossiersArchives } from "./schema";

export interface FichierArchive {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

export interface NouvelEnvoi {
  /** Titre de l'archive. Ne sert que pour un fichier seul : un lot garde les noms de fichier. */
  titre?: string | null;
  dossier?: string | null;
  description?: string | null;
  /** Dossier partagé de destination. Nul : l'espace personnel seul. */
  dossierId?: string | null;
  fichiers: FichierArchive[];
}

async function journaliser(
  organizationId: string,
  userId: string,
  action: string,
  archiveId: string,
  apres: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action,
    entityType: "archive",
    entityId: archiveId,
    after: apres,
  });
}

/** Octets occupés par l'espace d'une personne. Les archives retirées n'y comptent plus. */
export async function espaceUtilise(organizationId: string, userId: string): Promise<number> {
  const [ligne] = await db
    .select({ total: sql<string>`coalesce(sum(${archives.tailleOctets}), 0)` })
    .from(archives)
    .where(and(eq(archives.organizationId, organizationId), eq(archives.userId, userId), isNull(archives.retireeLe)));
  return Number(ligne?.total ?? 0);
}

const sansExtension = (nom: string) => (nom.includes(".") ? nom.slice(0, nom.lastIndexOf(".")) : nom).trim() || nom;
const extensionDe = (nom: string) => (nom.includes(".") ? nom.split(".").pop()! : "");

/**
 * Archive un lot de fichiers dans l'espace de la personne.
 *
 * Tout le lot est contrôlé avant le premier dépôt. Ensuite, fichier par
 * fichier : le fichier part au dépôt, puis la fiche s'écrit avec son numéro.
 * Si la fiche échoue, le fichier est retiré — jamais de fichier sans fiche.
 *
 * L'empreinte est prise sur les octets REÇUS, avant le dépôt : c'est elle qui
 * fait foi, et non ce que le dépôt dira avoir stocké.
 */
export async function archiverPour(
  organizationId: string,
  userId: string,
  envoi: NouvelEnvoi,
  gestionnaire = false,
): Promise<{ numeros: string[] }> {
  if (envoi.dossierId) {
    const regle = await regleDossier(organizationId, envoi.dossierId);
    if (!regle) throw new Error("Dossier introuvable.");
    if (!depotDossierPermis(regle, userId, gestionnaire)) {
      throw new Error(`Le dossier « ${regle.nom} » n'accepte pas vos dépôts.`);
    }
  }

  const refus = refusEnvoi(
    envoi.fichiers.map((f) => ({ nom: f.nom, typeMime: f.typeMime, taille: f.contenu.byteLength })),
    await espaceUtilise(organizationId, userId),
  );
  if (refus) throw new Error(refus);

  const seul = envoi.fichiers.length === 1;
  const numeros: string[] = [];

  for (const fichier of envoi.fichiers) {
    const id = newId();
    const chemin = cheminDe(organizationId, id, extensionDe(fichier.nom));
    const sceau = empreinte(fichier.contenu);

    const depot = await deposer({ chemin, contenu: fichier.contenu, typeMime: fichier.typeMime });
    if (!depot.ok) throw new Error(numeros.length ? `${depot.raison} (${numeros.length} fichier(s) déjà archivé(s))` : depot.raison);

    try {
      const numero = await db.transaction(async (tx) => {
        const annee = String(new Date().getUTCFullYear());
        const attribue = await prochainNumero(tx, organizationId, {
          cle: "archive",
          prefix: `ARC-${annee}-`,
          padding: 5,
          periode: annee,
        });
        await tx.insert(archives).values({
          id,
          organizationId,
          numero: attribue,
          userId,
          titre: (seul && envoi.titre?.trim()) || sansExtension(fichier.nom),
          dossier: envoi.dossier?.trim() || null,
          dossierId: envoi.dossierId ?? null,
          description: envoi.description?.trim() || null,
          chemin,
          nomFichier: fichier.nom,
          typeMime: fichier.typeMime,
          tailleOctets: fichier.contenu.byteLength,
          empreinte: sceau,
        });
        await tx.insert(auditLogs).values({
          id: newId(),
          organizationId,
          userId,
          action: "archive.deposer",
          entityType: "archive",
          entityId: id,
          after: {
            numero: attribue,
            fichier: fichier.nom,
            taille: fichier.contenu.byteLength,
            empreinte: sceau,
            dossierId: envoi.dossierId ?? null,
          },
        });
        return attribue;
      });
      numeros.push(numero);
    } catch (erreur) {
      await supprimer(chemin);
      throw erreur;
    }
  }

  return { numeros };
}

/**
 * Retrait par l'auteur, dans le délai de correction.
 *
 * Le fichier reste dans le dépôt et la fiche en base : l'administrateur légal
 * continue de les voir, avec la date et le motif du retrait.
 */
export async function retirerArchivePour(
  organizationId: string,
  userId: string,
  archiveId: string,
  motif: string,
): Promise<{ numero: string }> {
  const [archive] = await db
    .select({ numero: archives.numero, deposeLe: archives.createdAt, retireeLe: archives.retireeLe })
    .from(archives)
    .where(and(eq(archives.id, archiveId), eq(archives.organizationId, organizationId), eq(archives.userId, userId)));

  if (!archive) throw new Error("Archive introuvable dans votre espace.");
  if (archive.retireeLe) throw new Error(`${archive.numero} est déjà retirée.`);
  if (!retraitPossible(archive.deposeLe)) {
    throw new Error(`${archive.numero} est scellée : le délai de retrait est passé.`);
  }

  await db
    .update(archives)
    .set({ retireeLe: new Date(), motifRetrait: motif, updatedAt: new Date(), version: sql`${archives.version} + 1` })
    .where(and(eq(archives.id, archiveId), eq(archives.organizationId, organizationId)));
  await journaliser(organizationId, userId, "archive.retirer", archiveId, { numero: archive.numero, motif });

  return { numero: archive.numero };
}

/** Une archive, lue pour l'ouvrir ou la vérifier. */
async function archiveDe(organizationId: string, archiveId: string) {
  const [archive] = await db
    .select({
      numero: archives.numero,
      userId: archives.userId,
      chemin: archives.chemin,
      empreinte: archives.empreinte,
      retireeLe: archives.retireeLe,
      dossierId: archives.dossierId,
    })
    .from(archives)
    .where(and(eq(archives.id, archiveId), eq(archives.organizationId, organizationId)));
  return archive ?? null;
}

/**
 * Autorise l'ouverture et la journalise.
 *
 * L'auteur ouvre ce qu'il n'a pas retiré ; un membre ouvre ce que contient un
 * dossier partagé qui lui est visible ; l'administrateur légal ouvre tout.
 * Chaque ouverture laisse une ligne : l'auteur voit qu'on a consulté son
 * archive, l'administrateur répond de ses consultations.
 */
export async function autoriserOuverture(
  organizationId: string,
  userId: string,
  archiveId: string,
  droits: { consulter: boolean; gestionnaire: boolean; superviseur: boolean },
): Promise<string | null> {
  const archive = await archiveDe(organizationId, archiveId);
  if (!archive) return null;

  const sienne = droits.consulter && archive.userId === userId && !archive.retireeLe;
  let partagee = false;
  if (!sienne && !droits.superviseur && archive.dossierId && !archive.retireeLe) {
    const regle = await regleDossier(organizationId, archive.dossierId);
    partagee = regle !== null && dossierVisible(regle, userId, droits.gestionnaire);
  }
  if (!sienne && !partagee && !droits.superviseur) return null;

  await journaliser(organizationId, userId, "archive.ouvrir", archiveId, {
    numero: archive.numero,
    parAdministrateur: archive.userId !== userId,
  });
  return archive.chemin;
}

/**
 * Les vignettes d'un espace : les images que CETTE personne a elle-même
 * déposées, et elles seules. Regarder son propre fichier n'est pas une
 * consultation à signaler ; l'archive d'un autre, en revanche, ne s'affiche
 * qu'ouverte — et l'ouverture est journalisée (`autoriserOuverture`).
 */
export async function vignettesPropres(organizationId: string, userId: string, ids: readonly string[]): Promise<{ id: string; chemin: string }[]> {
  if (ids.length === 0) return [];
  const lignes = await db
    .select({ id: archives.id, chemin: archives.chemin, typeMime: archives.typeMime })
    .from(archives)
    .where(
      and(
        eq(archives.organizationId, organizationId),
        eq(archives.userId, userId),
        inArray(archives.id, [...ids]),
        isNull(archives.retireeLe),
      ),
    );
  // HEIC : le navigateur ne l'affiche pas, l'icône du format suffit.
  return lignes.filter((l) => familleDe(l.typeMime) === "image" && l.typeMime !== "image/heic").map(({ id, chemin }) => ({ id, chemin }));
}

export type ResultatVerification =
  | { etat: "conforme"; numero: string }
  | { etat: "altere"; numero: string; attendue: string; trouvee: string }
  | { etat: "absent"; numero: string };

/**
 * Relit le fichier dans le dépôt et compare son empreinte à celle du dépôt.
 * Le résultat est journalisé, conforme ou non : une vérification est une preuve.
 */
export async function verifierArchivePour(
  organizationId: string,
  userId: string,
  archiveId: string,
): Promise<ResultatVerification> {
  const archive = await archiveDe(organizationId, archiveId);
  if (!archive) throw new Error("Archive introuvable.");

  const contenu = await lireFichier(archive.chemin);
  const resultat: ResultatVerification = !contenu
    ? { etat: "absent", numero: archive.numero }
    : empreinte(contenu) === archive.empreinte
      ? { etat: "conforme", numero: archive.numero }
      : { etat: "altere", numero: archive.numero, attendue: archive.empreinte, trouvee: empreinte(contenu) };

  await journaliser(organizationId, userId, "archive.verifier", archiveId, { numero: archive.numero, etat: resultat.etat });
  return resultat;
}

// ------------------------------------------------------------ dossiers partagés

/** Règle de visibilité d'un dossier, membres désignés compris. */
export async function regleDossier(
  organizationId: string,
  dossierId: string,
): Promise<(RegleDossier & { nom: string }) | null> {
  const [dossier] = await db
    .select({ nom: dossiersArchives.nom, visibilite: dossiersArchives.visibilite, depotOuvert: dossiersArchives.depotOuvert })
    .from(dossiersArchives)
    .where(
      and(
        eq(dossiersArchives.id, dossierId),
        eq(dossiersArchives.organizationId, organizationId),
        isNull(dossiersArchives.deletedAt),
      ),
    );
  if (!dossier) return null;
  const designes = await db
    .select({ userId: accesDossiersArchives.userId })
    .from(accesDossiersArchives)
    .where(and(eq(accesDossiersArchives.dossierId, dossierId), eq(accesDossiersArchives.organizationId, organizationId)));
  return { ...dossier, designes: designes.map((d) => d.userId) };
}

export interface DefinitionDossier {
  nom: string;
  description?: string | null;
  visibilite: "tous" | "selection";
  depotOuvert: boolean;
  /** Membres désignés. Ignorés quand le dossier est visible de tous. */
  membres: string[];
}

/** Ne garde que les membres actifs de l'entreprise : un identifiant inventé ne désigne personne. */
async function membresValides(organizationId: string, demandes: string[]): Promise<string[]> {
  if (demandes.length === 0) return [];
  const lignes = await db.execute<{ user_id: string }>(sql`
    select user_id from memberships
    where organization_id = ${organizationId} and status = 'actif'
  `);
  const actifs = new Set(lignes.map((l) => l.user_id));
  return [...new Set(demandes)].filter((id) => actifs.has(id));
}

export async function creerDossierPour(
  organizationId: string,
  userId: string,
  definition: DefinitionDossier,
): Promise<{ id: string }> {
  const membres = definition.visibilite === "selection" ? await membresValides(organizationId, definition.membres) : [];
  const id = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(dossiersArchives).values({
        id,
        organizationId,
        nom: definition.nom.trim(),
        description: definition.description?.trim() || null,
        visibilite: definition.visibilite,
        depotOuvert: definition.depotOuvert,
        creeParUserId: userId,
      });
      if (membres.length) {
        await tx.insert(accesDossiersArchives).values(membres.map((m) => ({ dossierId: id, organizationId, userId: m })));
      }
      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId,
        userId,
        action: "archive_dossier.creer",
        entityType: "archive_dossier",
        entityId: id,
        after: { nom: definition.nom, visibilite: definition.visibilite, depotOuvert: definition.depotOuvert, membres },
      });
    });
  } catch (erreur) {
    if (estDoublon(erreur)) throw new Error(`Un dossier « ${definition.nom.trim()} » existe déjà.`);
    throw erreur;
  }
  return { id };
}

/**
 * Change le nom, la visibilité ou le dépôt d'un dossier.
 *
 * Les désignations se remplacent d'un bloc : l'écran envoie la liste complète
 * des membres cochés. Le journal garde l'avant et l'après — qui a ouvert ou
 * fermé un dossier à qui, et quand.
 */
export async function modifierDossierPour(
  organizationId: string,
  userId: string,
  dossierId: string,
  definition: DefinitionDossier,
): Promise<void> {
  const avant = await regleDossier(organizationId, dossierId);
  if (!avant) throw new Error("Dossier introuvable.");
  const membres = definition.visibilite === "selection" ? await membresValides(organizationId, definition.membres) : [];

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(dossiersArchives)
        .set({
          nom: definition.nom.trim(),
          description: definition.description?.trim() || null,
          visibilite: definition.visibilite,
          depotOuvert: definition.depotOuvert,
          updatedAt: new Date(),
          version: sql`${dossiersArchives.version} + 1`,
        })
        .where(and(eq(dossiersArchives.id, dossierId), eq(dossiersArchives.organizationId, organizationId)));
      await tx
        .delete(accesDossiersArchives)
        .where(and(eq(accesDossiersArchives.dossierId, dossierId), eq(accesDossiersArchives.organizationId, organizationId)));
      if (membres.length) {
        await tx.insert(accesDossiersArchives).values(membres.map((m) => ({ dossierId, organizationId, userId: m })));
      }
      await tx.insert(auditLogs).values({
        id: newId(),
        organizationId,
        userId,
        action: "archive_dossier.modifier",
        entityType: "archive_dossier",
        entityId: dossierId,
        before: { nom: avant.nom, visibilite: avant.visibilite, depotOuvert: avant.depotOuvert, membres: avant.designes },
        after: { nom: definition.nom, visibilite: definition.visibilite, depotOuvert: definition.depotOuvert, membres },
      });
    });
  } catch (erreur) {
    if (estDoublon(erreur)) throw new Error(`Un dossier « ${definition.nom.trim()} » existe déjà.`);
    throw erreur;
  }
}

/** Supprime un dossier vide. Un dossier qui contient des archives ne se supprime pas : il se masque. */
export async function supprimerDossierPour(organizationId: string, userId: string, dossierId: string): Promise<string> {
  const regle = await regleDossier(organizationId, dossierId);
  if (!regle) throw new Error("Dossier introuvable.");
  const [contenu] = await db
    .select({ n: sql<string>`count(*)` })
    .from(archives)
    .where(and(eq(archives.organizationId, organizationId), eq(archives.dossierId, dossierId)));
  if (Number(contenu?.n ?? 0) > 0) {
    throw new Error(`« ${regle.nom} » contient des archives : masquez-le plutôt que de le supprimer.`);
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(dossiersArchives)
      .where(and(eq(dossiersArchives.id, dossierId), eq(dossiersArchives.organizationId, organizationId)));
    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "archive_dossier.supprimer",
      entityType: "archive_dossier",
      entityId: dossierId,
      before: { nom: regle.nom },
    });
  });
  return regle.nom;
}
