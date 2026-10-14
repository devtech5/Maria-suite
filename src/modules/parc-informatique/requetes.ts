import "server-only";

import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { listerActifs, listerEcheances, type ActifSuivi, type LigneEcheance } from "@/modules/actifs/requetes";
import { tiers } from "@/modules/tiers/schema";

import { etatLicence, type EtatLicence } from "./calcul";
import { equipementsInformatiques, licencesAttribuees, licencesLogicielles, type EquipementInformatique, type LicenceLogicielle } from "./schema";

export interface EquipementSuivi extends ActifSuivi {
  fiche: EquipementInformatique | null;
  /** Garantie en cours : l'échéance de garantie non honorée, s'il y en a une. */
  garantie: LigneEcheance | null;
  licences: number;
}

/** Les équipements informatiques, leur fiche technique et leur garantie. */
export async function listerEquipements(organizationId: string, aujourdhui = new Date()): Promise<EquipementSuivi[]> {
  const [tous, fiches, echeances, attributions] = await Promise.all([
    listerActifs(organizationId),
    db.select().from(equipementsInformatiques).where(eq(equipementsInformatiques.organizationId, organizationId)),
    listerEcheances(organizationId, aujourdhui),
    db
      .select({ actifId: licencesAttribuees.actifId })
      .from(licencesAttribuees)
      .innerJoin(licencesLogicielles, eq(licencesLogicielles.id, licencesAttribuees.licenceId))
      .where(and(eq(licencesAttribuees.organizationId, organizationId), isNull(licencesLogicielles.deletedAt))),
  ]);
  const fichePar = new Map(fiches.map((f) => [f.actifId, f]));
  const licencesPar = new Map<string, number>();
  for (const a of attributions) licencesPar.set(a.actifId, (licencesPar.get(a.actifId) ?? 0) + 1);

  return tous
    .filter((a) => a.type === "informatique" && a.proprietaire === null)
    .map((a) => ({
      ...a,
      fiche: fichePar.get(a.id) ?? null,
      garantie: echeances.find((e) => e.actifId === a.id && e.nature === "garantie") ?? null,
      licences: licencesPar.get(a.id) ?? 0,
    }));
}

export async function equipementDe(organizationId: string, actifId: string) {
  return (await listerEquipements(organizationId)).find((e) => e.id === actifId) ?? null;
}

export interface LicenceSuivie extends LicenceLogicielle {
  /** Nom de la fiche fournisseur, à jour ; à défaut le nom saisi. */
  fournisseurNom: string | null;
  utilises: number;
  postesInstalles: { actifId: string; code: string; designation: string }[];
  etat: EtatLicence;
  jours: number | null;
}

/** Licences en vigueur, avec leurs postes et leur état de conformité. */
export async function listerLicences(organizationId: string, aujourdhui = new Date().toISOString().slice(0, 10)): Promise<LicenceSuivie[]> {
  const [licences, attributions, tous] = await Promise.all([
    db
      .select({
        ...getTableColumns(licencesLogicielles),
        fournisseurNom: sql<string | null>`coalesce(${tiers.nom}, ${licencesLogicielles.fournisseur})`,
      })
      .from(licencesLogicielles)
      .leftJoin(tiers, eq(tiers.id, licencesLogicielles.fournisseurId))
      .where(and(eq(licencesLogicielles.organizationId, organizationId), isNull(licencesLogicielles.deletedAt)))
      .orderBy(asc(licencesLogicielles.logiciel)),
    db.select().from(licencesAttribuees).where(eq(licencesAttribuees.organizationId, organizationId)),
    listerActifs(organizationId),
  ]);
  const actifsPar = new Map(tous.map((a) => [a.id, a]));
  return licences.map((l) => {
    const postesInstalles = attributions
      .filter((a) => a.licenceId === l.id)
      .map((a) => ({ actifId: a.actifId, code: actifsPar.get(a.actifId)?.code ?? "?", designation: actifsPar.get(a.actifId)?.designation ?? "" }));
    const { etat, jours } = etatLicence({ postes: l.postes, utilises: postesInstalles.length, expireLe: l.expireLe }, aujourdhui);
    return { ...l, utilises: postesInstalles.length, postesInstalles, etat, jours };
  });
}

export interface EtatLicences {
  depassees: number;
  expirees: number;
  bientot: number;
}

/** Pour le tableau de bord : licences en défaut. */
export async function etatLicences(organizationId: string): Promise<EtatLicences> {
  const licences = await listerLicences(organizationId);
  return {
    depassees: licences.filter((l) => l.etat === "depassee").length,
    expirees: licences.filter((l) => l.etat === "expiree").length,
    bientot: licences.filter((l) => l.etat === "expire_bientot").length,
  };
}

/** Fournisseurs actifs, pour rattacher une licence à sa fiche plutôt que retaper le nom. */
export async function fournisseursProposes(organizationId: string): Promise<{ id: string; nom: string }[]> {
  return db
    .select({ id: tiers.id, nom: tiers.nom })
    .from(tiers)
    .where(and(eq(tiers.organizationId, organizationId), eq(tiers.estFournisseur, true), eq(tiers.actif, true)))
    .orderBy(asc(tiers.nom));
}
