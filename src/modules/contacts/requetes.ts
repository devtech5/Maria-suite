import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { tracerPour } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { employees, services } from "@/modules/personnes/schema";

import {
  adresseProValide,
  adressesAReprendre,
  appartientAuService,
  emailPersonnelVisible,
  fusionnerNumeros,
  LONGUEUR_MAX_LIBELLE,
  motifRefusAffectation,
  natureValide,
  numerosVisibles,
  numeroValide,
  statutAffectation,
  usageValide,
  type CollaborateurRef,
  type LigneAdresse,
  type LigneAnnuaire,
  type NatureNumero,
  type NumeroAffiche,
  type ServiceRef,
  type UsageNumero,
} from "./regles";
import { adressesPro, numerosCollaborateurs } from "./schema";

/**
 * Contacts, côté base. Chaque fonction prend l'entreprise en premier argument
 * et filtre dessus ; les actions (`./actions.ts`) vérifient les droits avant
 * d'appeler. Les numéros personnels sont retirés ICI quand l'appelant n'a pas
 * le droit de les lire.
 */

const enBase = (erreur: unknown, contrainte: string) => erreur instanceof Error && `${erreur.message} ${String((erreur as { cause?: unknown }).cause ?? "")}`.includes(contrainte);

// ---------------------------------------------------------------- lectures

export interface ServiceAffectable extends ServiceRef {
  code: string;
  actif: boolean;
}

/** Tous les services (retirés compris : une adresse peut leur rester rattachée), dans leur ordre. */
export async function servicesDe(organizationId: string): Promise<ServiceAffectable[]> {
  return db
    .select({ id: services.id, libelle: services.libelle, code: services.code, actif: services.actif })
    .from(services)
    .where(and(eq(services.organizationId, organizationId), isNull(services.deletedAt)))
    .orderBy(asc(services.ordre), asc(services.libelle));
}

export interface CollaborateurAffectable extends CollaborateurRef {
  nom: string;
  matricule: string;
  poste: string;
  emailProfessionnel: string | null;
  emailPersonnel: string | null;
  telephone: string | null;
}

/** Les collaborateurs en poste. */
export async function collaborateursDe(organizationId: string): Promise<CollaborateurAffectable[]> {
  return db
    .select({
      id: employees.id,
      nom: employees.nom,
      matricule: employees.matricule,
      poste: employees.poste,
      service: employees.service,
      emailProfessionnel: employees.emailProfessionnel,
      emailPersonnel: employees.email,
      telephone: employees.telephone,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt)))
    .orderBy(asc(employees.nom));
}

/** Les adresses professionnelles avec leur service, leur titulaire et leur état d'affectation. */
export async function adressesDe(organizationId: string): Promise<LigneAdresse[]> {
  const [lignes, tousServices, tousCollaborateurs] = await Promise.all([
    db
      .select()
      .from(adressesPro)
      .where(and(eq(adressesPro.organizationId, organizationId), isNull(adressesPro.deletedAt)))
      .orderBy(asc(adressesPro.adresse)),
    servicesDe(organizationId),
    collaborateursDe(organizationId),
  ]);
  const parService = new Map(tousServices.map((s) => [s.id, s]));
  const parCollab = new Map(tousCollaborateurs.map((c) => [c.id, c]));
  return lignes.map((l) => {
    const service = l.serviceId ? parService.get(l.serviceId) : undefined;
    const titulaire = l.employeeId ? parCollab.get(l.employeeId) : undefined;
    return {
      id: l.id,
      adresse: l.adresse,
      libelle: l.libelle,
      actif: l.actif,
      serviceId: l.serviceId,
      serviceLibelle: service?.libelle ?? null,
      employeeId: l.employeeId,
      titulaire: titulaire?.nom ?? null,
      statut: statutAffectation(l, service, titulaire),
    };
  });
}

/** Les numéros ajoutés à l'annuaire, par collaborateur. */
async function numerosPar(organizationId: string, employeeIds: string[]): Promise<Map<string, NumeroAffiche[]>> {
  const parCollab = new Map<string, NumeroAffiche[]>();
  if (employeeIds.length === 0) return parCollab;
  const lignes = await db
    .select()
    .from(numerosCollaborateurs)
    .where(and(eq(numerosCollaborateurs.organizationId, organizationId), isNull(numerosCollaborateurs.deletedAt), inArray(numerosCollaborateurs.employeeId, employeeIds)))
    .orderBy(asc(numerosCollaborateurs.createdAt));
  for (const l of lignes) {
    const liste = parCollab.get(l.employeeId) ?? [];
    liste.push({ id: l.id, numero: l.numero, nature: l.nature as NatureNumero, usage: l.usage as UsageNumero, origine: "annuaire" });
    parCollab.set(l.employeeId, liste);
  }
  return parCollab;
}

export interface FicheAnnuaire extends LigneAnnuaire {
  numeros: NumeroAffiche[];
  /** L'adresse e-mail personnelle de la fiche : nulle sauf pour qui tient l'annuaire. */
  emailPersonnel: string | null;
}

/**
 * L'annuaire du personnel : un collaborateur par ligne, avec ses adresses
 * professionnelles (affectées ici, ou portées par sa fiche) et ses numéros.
 * `voirPersonnels` décide si les données personnelles en sortent : numéros
 * personnels et adresse e-mail personnelle de la fiche.
 */
export async function annuaireDe(organizationId: string, voirPersonnels: boolean): Promise<FicheAnnuaire[]> {
  const collaborateurs = await collaborateursDe(organizationId);
  const [adresses, numeros] = await Promise.all([
    db
      .select({ adresse: adressesPro.adresse, employeeId: adressesPro.employeeId })
      .from(adressesPro)
      .where(and(eq(adressesPro.organizationId, organizationId), isNull(adressesPro.deletedAt), eq(adressesPro.actif, true), sql`${adressesPro.employeeId} IS NOT NULL`)),
    numerosPar(organizationId, collaborateurs.map((c) => c.id)),
  ]);
  const adressesPar = new Map<string, string[]>();
  for (const a of adresses) adressesPar.set(a.employeeId!, [...(adressesPar.get(a.employeeId!) ?? []), a.adresse]);

  return collaborateurs.map((c) => {
    const fiche = adresseProValide(c.emailProfessionnel ?? "");
    const emails = [...new Set([...(adressesPar.get(c.id) ?? []), ...(fiche.ok ? [fiche.adresse] : [])])];
    const tous = fusionnerNumeros(numeros.get(c.id) ?? [], c.telephone);
    return {
      id: c.id,
      nom: c.nom,
      matricule: c.matricule,
      poste: c.poste,
      service: c.service,
      emails,
      numeros: numerosVisibles(tous, voirPersonnels),
      emailPersonnel: emailPersonnelVisible(c.emailPersonnel, voirPersonnels),
    };
  });
}

/** Les numéros d'UN collaborateur, personnels compris : pour la fenêtre de gestion. */
export async function numerosDe(organizationId: string, employeeId: string): Promise<NumeroAffiche[]> {
  const [c] = await db
    .select({ telephone: employees.telephone })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId), isNull(employees.deletedAt)));
  if (!c) return [];
  const numeros = await numerosPar(organizationId, [employeeId]);
  return fusionnerNumeros(numeros.get(employeeId) ?? [], c.telephone);
}

// ---------------------------------------------------------------- adresses

export interface SaisieAdresse {
  id?: string;
  adresse: string;
  libelle: string;
  serviceId: string | null;
  employeeId: string | null;
}

async function verifierAffectation(organizationId: string, serviceId: string | null, employeeId: string | null) {
  const [service] = serviceId
    ? await db.select({ id: services.id, libelle: services.libelle }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.id, serviceId), isNull(services.deletedAt)))
    : [];
  const [collaborateur] = employeeId
    ? await db
        .select({ id: employees.id, service: employees.service })
        .from(employees)
        .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId), eq(employees.actif, true), isNull(employees.deletedAt)))
    : [];
  const motif = motifRefusAffectation({ serviceId, employeeId }, service, collaborateur);
  if (motif) throw new Error(motif);
}

/** Ajoute ou modifie une adresse professionnelle. L'affectation est vérifiée : le titulaire fait partie du service. */
export async function enregistrerAdressePour(organizationId: string, userId: string, saisie: SaisieAdresse): Promise<{ id: string; adresse: string }> {
  const v = adresseProValide(saisie.adresse);
  if (!v.ok) throw new Error(v.message);
  const libelle = saisie.libelle.replace(/\s+/g, " ").trim().slice(0, LONGUEUR_MAX_LIBELLE) || null;
  await verifierAffectation(organizationId, saisie.serviceId, saisie.employeeId);
  try {
    if (saisie.id) {
      const modifiees = await db
        .update(adressesPro)
        .set({ adresse: v.adresse, libelle, serviceId: saisie.serviceId, employeeId: saisie.employeeId, updatedAt: new Date(), version: sql`${adressesPro.version} + 1` })
        .where(and(eq(adressesPro.organizationId, organizationId), eq(adressesPro.id, saisie.id), isNull(adressesPro.deletedAt)))
        .returning({ id: adressesPro.id });
      if (modifiees.length === 0) throw new Error("Adresse introuvable.");
      await tracerPour(organizationId, userId, { action: "contacts.adresse_modifier", entite: "adresse_pro", entiteId: saisie.id, apres: { adresse: v.adresse } });
      return { id: saisie.id, adresse: v.adresse };
    }
    const id = newId();
    await db.insert(adressesPro).values({ id, organizationId, adresse: v.adresse, libelle, serviceId: saisie.serviceId, employeeId: saisie.employeeId });
    await tracerPour(organizationId, userId, { action: "contacts.adresse_creer", entite: "adresse_pro", entiteId: id, apres: { adresse: v.adresse } });
    return { id, adresse: v.adresse };
  } catch (erreur) {
    if (enBase(erreur, "adresses_pro_adresse_unique")) throw new Error(`L'adresse ${v.adresse} est déjà dans l'annuaire.`);
    throw erreur;
  }
}

/**
 * Affecte une adresse : à un service, puis éventuellement à une personne de
 * ce service. Sans service, l'adresse redevient libre.
 */
export async function affecterAdressePour(organizationId: string, userId: string, adresseId: string, serviceId: string | null, employeeId: string | null): Promise<void> {
  await verifierAffectation(organizationId, serviceId, serviceId ? employeeId : null);
  const modifiees = await db
    .update(adressesPro)
    .set({ serviceId, employeeId: serviceId ? employeeId : null, updatedAt: new Date(), version: sql`${adressesPro.version} + 1` })
    .where(and(eq(adressesPro.organizationId, organizationId), eq(adressesPro.id, adresseId), isNull(adressesPro.deletedAt)))
    .returning({ id: adressesPro.id });
  if (modifiees.length === 0) throw new Error("Adresse introuvable.");
  await tracerPour(organizationId, userId, { action: "contacts.adresse_affecter", entite: "adresse_pro", entiteId: adresseId, apres: { serviceId, employeeId } });
}

/** Ferme ou rouvre une adresse : elle reste listée, mais plus proposée. */
export async function basculerAdressePour(organizationId: string, userId: string, adresseId: string, actif: boolean): Promise<void> {
  const modifiees = await db
    .update(adressesPro)
    .set({ actif, updatedAt: new Date(), version: sql`${adressesPro.version} + 1` })
    .where(and(eq(adressesPro.organizationId, organizationId), eq(adressesPro.id, adresseId), isNull(adressesPro.deletedAt)))
    .returning({ id: adressesPro.id });
  if (modifiees.length === 0) throw new Error("Adresse introuvable.");
  await tracerPour(organizationId, userId, { action: actif ? "contacts.adresse_rouvrir" : "contacts.adresse_fermer", entite: "adresse_pro", entiteId: adresseId });
}

/** Retire l'adresse de l'annuaire (suppression logique : elle peut se répliquer). */
export async function retirerAdressePour(organizationId: string, userId: string, adresseId: string): Promise<void> {
  const maintenant = new Date();
  const retirees = await db
    .update(adressesPro)
    .set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${adressesPro.version} + 1` })
    .where(and(eq(adressesPro.organizationId, organizationId), eq(adressesPro.id, adresseId), isNull(adressesPro.deletedAt)))
    .returning({ id: adressesPro.id });
  if (retirees.length === 0) throw new Error("Adresse introuvable.");
  await tracerPour(organizationId, userId, { action: "contacts.adresse_retirer", entite: "adresse_pro", entiteId: adresseId });
}

/**
 * Inscrit à l'annuaire les adresses professionnelles que portent les fiches
 * des collaborateurs et qu'il ne liste pas encore : affectées au service et à
 * la personne de la fiche. Rend le nombre d'adresses reprises.
 */
export async function reprendreFichesPour(organizationId: string, userId: string): Promise<number> {
  const [collaborateurs, existantes, tousServices] = await Promise.all([
    collaborateursDe(organizationId),
    db.select({ adresse: adressesPro.adresse }).from(adressesPro).where(and(eq(adressesPro.organizationId, organizationId), isNull(adressesPro.deletedAt))),
    servicesDe(organizationId),
  ]);
  const reprises = adressesAReprendre(
    collaborateurs.map((c) => ({ employeeId: c.id, emailProfessionnel: c.emailProfessionnel })),
    existantes.map((e) => e.adresse),
  );
  if (reprises.length === 0) return 0;
  const parCollab = new Map(collaborateurs.map((c) => [c.id, c]));
  const valeurs = reprises.map((r) => {
    const c = parCollab.get(r.employeeId)!;
    const service = tousServices.find((s) => appartientAuService(c, s));
    return { id: newId(), organizationId, adresse: r.adresse, libelle: null, serviceId: service?.id ?? null, employeeId: service ? c.id : null };
  });
  await db.insert(adressesPro).values(valeurs).onConflictDoNothing();
  await tracerPour(organizationId, userId, { action: "contacts.fiches_reprendre", entite: "adresse_pro", apres: { nombre: valeurs.length } });
  return valeurs.length;
}

// ----------------------------------------------------------------- numéros

export async function ajouterNumeroPour(
  organizationId: string,
  userId: string,
  employeeId: string,
  saisie: { numero: string; nature: string; usage: string },
): Promise<string> {
  const n = numeroValide(saisie.numero);
  if (!n.ok) throw new Error(n.message);
  if (!natureValide(saisie.nature)) throw new Error("Choisissez la nature du numéro : mobile, fixe ou WhatsApp.");
  if (!usageValide(saisie.usage)) throw new Error("Dites si le numéro est professionnel ou personnel.");
  const [c] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId), isNull(employees.deletedAt)));
  if (!c) throw new Error("Collaborateur introuvable.");
  const id = newId();
  try {
    await db.insert(numerosCollaborateurs).values({ id, organizationId, employeeId, numero: n.numero, nature: saisie.nature, usage: saisie.usage });
  } catch (erreur) {
    if (enBase(erreur, "numeros_collaborateurs_unique")) throw new Error("Ce numéro est déjà dans l'annuaire de ce collaborateur.");
    throw erreur;
  }
  await tracerPour(organizationId, userId, { action: "contacts.numero_ajouter", entite: "numero_collaborateur", entiteId: id, apres: { employeeId, usage: saisie.usage } });
  return id;
}

export async function retirerNumeroPour(organizationId: string, userId: string, numeroId: string): Promise<void> {
  const maintenant = new Date();
  const retires = await db
    .update(numerosCollaborateurs)
    .set({ deletedAt: maintenant, updatedAt: maintenant, version: sql`${numerosCollaborateurs.version} + 1` })
    .where(and(eq(numerosCollaborateurs.organizationId, organizationId), eq(numerosCollaborateurs.id, numeroId), isNull(numerosCollaborateurs.deletedAt)))
    .returning({ id: numerosCollaborateurs.id });
  if (retires.length === 0) throw new Error("Numéro introuvable.");
  await tracerPour(organizationId, userId, { action: "contacts.numero_retirer", entite: "numero_collaborateur", entiteId: numeroId });
}
