import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { creerActifDans, creerEcheanceDans } from "@/modules/actifs/creation";
import { actifs } from "@/modules/actifs/schema";
import { employees } from "@/modules/personnes/schema";
import { tiers } from "@/modules/tiers/schema";

import { adresseIpValide, normaliserMac, type CleCategorie } from "./calcul";
import { equipementsInformatiques, licencesAttribuees, licencesLogicielles } from "./schema";

export interface DetailsEquipement {
  categorie: CleCategorie;
  marque?: string | null;
  modele?: string | null;
  numeroSerie?: string | null;
  systeme?: string | null;
  processeur?: string | null;
  memoireGo?: number | null;
  stockageGo?: number | null;
  nomReseau?: string | null;
  adresseIp?: string | null;
  adresseMac?: string | null;
  accessoires?: string | null;
}

export interface NouvelEquipement extends DetailsEquipement {
  designation?: string | null;
  utilisateurId?: string | null;
  site?: string | null;
  dateAcquisition?: string | null;
  valeurAcquisition?: number;
  /** Fin de garantie constructeur : posée en échéance, elle prévient avant de payer une réparation couverte. */
  garantieFin?: string | null;
}

function nettoyer(d: DetailsEquipement) {
  const ip = d.adresseIp?.trim() || null;
  if (ip && !adresseIpValide(ip)) throw new Error(`Adresse IP invalide : ${ip}.`);
  const macSaisie = d.adresseMac?.trim() || null;
  const mac = macSaisie ? normaliserMac(macSaisie) : null;
  if (macSaisie && !mac) throw new Error(`Adresse MAC invalide : ${macSaisie}.`);
  return {
    categorie: d.categorie,
    marque: d.marque ?? null,
    modele: d.modele ?? null,
    numeroSerie: d.numeroSerie?.trim().toUpperCase() || null,
    systeme: d.systeme ?? null,
    processeur: d.processeur ?? null,
    memoireGo: d.memoireGo ?? null,
    stockageGo: d.stockageGo ?? null,
    nomReseau: d.nomReseau?.trim().toUpperCase() || null,
    adresseIp: ip,
    adresseMac: mac,
    accessoires: d.accessoires ?? null,
  };
}

async function verifierUtilisateur(tx: Transaction, organizationId: string, id: string | null | undefined) {
  if (!id) return;
  const [ok] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, id), eq(employees.organizationId, organizationId)));
  if (!ok) throw new Error("Utilisateur introuvable.");
}

/** Ouvre un équipement : sa fiche d'actif (sans compteur), sa fiche technique, sa garantie. */
export async function creerEquipementDans(
  tx: Transaction,
  organizationId: string,
  saisie: NouvelEquipement,
  userId?: string,
): Promise<{ id: string; code: string }> {
  const details = nettoyer(saisie);
  await verifierUtilisateur(tx, organizationId, saisie.utilisateurId);
  const designation =
    saisie.designation?.trim() || [saisie.marque, saisie.modele].filter(Boolean).join(" ").trim() || "Équipement informatique";

  const { id, code } = await creerActifDans(
    tx,
    organizationId,
    {
      designation,
      type: "informatique",
      employeId: saisie.utilisateurId ?? null,
      site: saisie.site ?? null,
      dateAcquisition: saisie.dateAcquisition ?? null,
      valeurAcquisition: saisie.valeurAcquisition ?? 0,
      // Un ordinateur s'entretient au calendrier : pas de compteur.
      uniteCompteur: null,
    },
    userId,
  );
  await tx.insert(equipementsInformatiques).values({ actifId: id, organizationId, ...details });
  if (saisie.garantieFin) {
    await creerEcheanceDans(tx, organizationId, { actifId: id, nature: "garantie", echeanceLe: saisie.garantieFin, libelle: `Garantie ${designation}` }, userId);
  }
  return { id, code };
}

export async function creerEquipementPour(organizationId: string, saisie: NouvelEquipement, userId?: string) {
  return db.transaction((tx) => creerEquipementDans(tx, organizationId, saisie, userId));
}

/** Complète la fiche technique et l'utilisateur — y compris d'un poste ouvert avant ce module. */
export async function completerEquipementPour(
  organizationId: string,
  userId: string,
  actifId: string,
  saisie: DetailsEquipement & { utilisateurId?: string | null },
): Promise<void> {
  const details = nettoyer(saisie);
  await db.transaction(async (tx) => {
    const [actif] = await tx.select({ type: actifs.type }).from(actifs).where(and(eq(actifs.id, actifId), eq(actifs.organizationId, organizationId)));
    if (!actif) throw new Error("Équipement introuvable.");
    if (actif.type !== "informatique") throw new Error("Cet actif n'est pas un équipement informatique.");
    await verifierUtilisateur(tx, organizationId, saisie.utilisateurId);

    await tx
      .insert(equipementsInformatiques)
      .values({ actifId, organizationId, ...details })
      .onConflictDoUpdate({
        target: equipementsInformatiques.actifId,
        set: { ...details, updatedAt: new Date(), version: sql`${equipementsInformatiques.version} + 1` },
      });

    if (saisie.utilisateurId !== undefined) {
      await tx
        .update(actifs)
        .set({
          employeId: saisie.utilisateurId,
          ...(saisie.utilisateurId ? { intervenantId: null } : {}),
          updatedAt: new Date(),
          version: sql`${actifs.version} + 1`,
        })
        .where(eq(actifs.id, actifId));
    }

    await tx.insert(auditLogs).values({
      id: newId(),
      organizationId,
      userId,
      action: "equipement.modifier",
      entityType: "actif",
      entityId: actifId,
      after: { numeroSerie: details.numeroSerie, utilisateur: saisie.utilisateurId ?? null },
    });
  });
}

export interface NouvelleLicence {
  logiciel: string;
  editeur?: string | null;
  type: "abonnement" | "perpetuelle";
  cle?: string | null;
  postes: number;
  expireLe?: string | null;
  cout?: number;
  /** Fournisseur choisi parmi les tiers : son nom se recopie, il ne se tape pas. */
  fournisseurId?: string | null;
  /** Nom saisi, pour un revendeur sans fiche. Ignoré quand `fournisseurId` est donné. */
  fournisseur?: string | null;
  notes?: string | null;
}

export async function creerLicencePour(organizationId: string, userId: string, saisie: NouvelleLicence): Promise<string> {
  if (!saisie.logiciel.trim()) throw new Error("Nommez le logiciel.");
  if (saisie.type === "abonnement" && !saisie.expireLe) throw new Error("Un abonnement a une date de fin : indiquez-la.");
  let fournisseur = saisie.fournisseur?.trim() || null;
  if (saisie.fournisseurId) {
    const [fiche] = await db
      .select({ nom: tiers.nom })
      .from(tiers)
      .where(
        and(
          eq(tiers.id, saisie.fournisseurId),
          eq(tiers.organizationId, organizationId),
          eq(tiers.estFournisseur, true),
          eq(tiers.actif, true),
        ),
      );
    if (!fiche) throw new Error("Ce fournisseur n'existe pas, ou plus.");
    fournisseur = fiche.nom;
  }
  const id = newId();
  await db.insert(licencesLogicielles).values({
    id,
    organizationId,
    logiciel: saisie.logiciel.trim(),
    editeur: saisie.editeur ?? null,
    type: saisie.type,
    cle: saisie.cle ?? null,
    postes: saisie.postes,
    expireLe: saisie.expireLe ?? null,
    cout: saisie.cout ?? 0,
    fournisseurId: saisie.fournisseurId ?? null,
    fournisseur,
    notes: saisie.notes ?? null,
    userId,
  });
  // La clé n'entre pas au journal : il se lit sans le droit sur les licences.
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "licence.creer",
    entityType: "licence",
    entityId: id,
    after: { logiciel: saisie.logiciel, postes: saisie.postes, expireLe: saisie.expireLe ?? null },
  });
  return id;
}

/** Retire une licence (résiliée, non renouvelée). Ses attributions tombent avec elle. */
export async function retirerLicencePour(organizationId: string, userId: string, licenceId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [retiree] = await tx
      .update(licencesLogicielles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(licencesLogicielles.id, licenceId), eq(licencesLogicielles.organizationId, organizationId), isNull(licencesLogicielles.deletedAt)))
      .returning({ logiciel: licencesLogicielles.logiciel });
    if (!retiree) throw new Error("Licence introuvable.");
    await tx.delete(licencesAttribuees).where(eq(licencesAttribuees.licenceId, licenceId));
    await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "licence.retirer", entityType: "licence", entityId: licenceId, after: { logiciel: retiree.logiciel } });
  });
}

/**
 * Installe une licence sur un équipement. Le dépassement n'est PAS refusé :
 * l'installation a eu lieu, le cacher fausserait l'inventaire. Il est signalé,
 * et c'est à l'entreprise d'acheter le poste manquant ou de désinstaller.
 */
export async function attribuerLicencePour(organizationId: string, userId: string, licenceId: string, actifId: string): Promise<{ depassement: boolean }> {
  return db.transaction(async (tx) => {
    const [licence] = await tx
      .select({ postes: licencesLogicielles.postes, logiciel: licencesLogicielles.logiciel })
      .from(licencesLogicielles)
      .where(and(eq(licencesLogicielles.id, licenceId), eq(licencesLogicielles.organizationId, organizationId), isNull(licencesLogicielles.deletedAt)));
    if (!licence) throw new Error("Licence introuvable.");
    const [actif] = await tx.select({ type: actifs.type }).from(actifs).where(and(eq(actifs.id, actifId), eq(actifs.organizationId, organizationId)));
    if (!actif || actif.type !== "informatique") throw new Error("Équipement introuvable.");

    await tx.insert(licencesAttribuees).values({ id: newId(), organizationId, licenceId, actifId, userId }).onConflictDoNothing();
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(licencesAttribuees)
      .where(eq(licencesAttribuees.licenceId, licenceId));
    await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "licence.attribuer", entityType: "licence", entityId: licenceId, after: { logiciel: licence.logiciel, actifId } });
    return { depassement: n > licence.postes };
  });
}

export async function desattribuerLicencePour(organizationId: string, userId: string, licenceId: string, actifId: string): Promise<void> {
  const supprimees = await db
    .delete(licencesAttribuees)
    .where(and(eq(licencesAttribuees.organizationId, organizationId), eq(licencesAttribuees.licenceId, licenceId), eq(licencesAttribuees.actifId, actifId)))
    .returning({ id: licencesAttribuees.id });
  if (supprimees.length === 0) throw new Error("Cette licence n'est pas installée sur ce poste.");
  await db.insert(auditLogs).values({ id: newId(), organizationId, userId, action: "licence.desattribuer", entityType: "licence", entityId: licenceId, after: { actifId } });
}
