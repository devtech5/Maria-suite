import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, memberships, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";
import { prochainNumero } from "@/lib/sequences";
import { listerPieces } from "@/modules/facturation/requetes";
import { employees } from "@/modules/personnes/schema";
import { tiers } from "@/modules/tiers/schema";

import { normaliserDestinataire, remplir } from "./calcul";
import { envoyerMessage } from "./envoi";
import { notifier } from "./notifications";
import { campagnes, type Campagne } from "./schema";

export type CanalCampagne = "email" | "whatsapp" | "application";

export interface FiltreCampagne {
  /** Clients : `tous`, `impayes` (une facture en retard), `particuliers`, `entreprises`. */
  cible?: string | null;
  ville?: string | null;
  secteur?: string | null;
}

export interface NouvelleCampagne {
  titre: string;
  public: "personnel" | "clients";
  canaux: CanalCampagne[];
  filtre: FiltreCampagne;
  objet?: string | null;
  corps: string;
}

/** Une personne visée, avec ce qu'on sait d'elle sur chaque canal. */
export interface Destinataire {
  nom: string;
  email: string | null;
  telephone: string | null;
  tiersId?: string;
  employeId?: string;
  /** Compte de l'application, pour une notification dans la cloche. */
  userId?: string;
}

/** Plafond par message groupé : au-delà, l'envoi tiendrait la requête trop longtemps. */
export const PLAFOND_DESTINATAIRES = 500;

/**
 * Qui reçoit : le personnel en poste (salariés, et comptes de l'application
 * pour la cloche) ou les clients répondant au filtre.
 */
export async function destinataires(organizationId: string, publicVise: "personnel" | "clients", filtre: FiltreCampagne): Promise<Destinataire[]> {
  if (publicVise === "personnel") {
    const [salaries, comptes] = await Promise.all([
      db
        .select({ id: employees.id, nom: employees.nom, email: employees.email, telephone: employees.telephone, userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt))),
      db
        .select({ userId: memberships.userId, nom: users.fullName })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"))),
    ]);
    const liste: Destinataire[] = salaries.map((s) => ({ nom: s.nom, email: s.email, telephone: s.telephone, employeId: s.id, userId: s.userId ?? undefined }));
    // Un compte sans fiche de salarié — l'associé, le comptable externe —
    // reçoit quand même la notification dans l'application.
    const relies = new Set(liste.map((d) => d.userId).filter(Boolean));
    for (const c of comptes) if (!relies.has(c.userId)) liste.push({ nom: c.nom, email: null, telephone: null, userId: c.userId });
    return liste;
  }

  const conditions = [eq(tiers.organizationId, organizationId), eq(tiers.estClient, true), isNull(tiers.deletedAt)];
  if (filtre.cible === "particuliers") conditions.push(eq(tiers.nature, "particulier"));
  if (filtre.cible === "entreprises") conditions.push(eq(tiers.nature, "entreprise"));
  if (filtre.ville?.trim()) conditions.push(sql`lower(${tiers.ville}) = lower(${filtre.ville.trim()})`);
  if (filtre.secteur?.trim()) conditions.push(sql`lower(${tiers.secteur}) = lower(${filtre.secteur.trim()})`);
  let clients = await db
    .select({ id: tiers.id, nom: tiers.nom, email: tiers.email, telephone: tiers.telephone })
    .from(tiers)
    .where(and(...conditions));

  if (filtre.cible === "impayes") {
    const enRetard = new Set((await listerPieces(organizationId)).filter((p) => p.enRetard).map((p) => p.clientId));
    clients = clients.filter((c) => enRetard.has(c.id));
  }
  return clients.map((c) => ({ nom: c.nom, email: c.email, telephone: c.telephone, tiersId: c.id }));
}

export interface Apercu {
  total: number;
  parCanal: Record<CanalCampagne, { joignables: number; sansAdresse: number }>;
}

/** Combien seront joints, canal par canal, avant d'envoyer quoi que ce soit. */
export function apercu(liste: readonly Destinataire[]): Apercu {
  const compter = (adresse: (d: Destinataire) => string | null | undefined) => {
    const joignables = liste.filter((d) => Boolean(adresse(d))).length;
    return { joignables, sansAdresse: liste.length - joignables };
  };
  return {
    total: liste.length,
    parCanal: {
      email: compter((d) => (d.email ? normaliserDestinataire("email", d.email) : null)),
      whatsapp: compter((d) => (d.telephone ? normaliserDestinataire("whatsapp", d.telephone) : null)),
      application: compter((d) => d.userId),
    },
  };
}

export async function creerCampagnePour(organizationId: string, userId: string, saisie: NouvelleCampagne): Promise<string> {
  if (saisie.public === "clients" && saisie.canaux.includes("application")) {
    throw new Error("Les clients n'ont pas de compte : la notification dans l'application est réservée au personnel.");
  }
  const id = newId();
  await db.insert(campagnes).values({
    id,
    organizationId,
    titre: saisie.titre,
    public: saisie.public,
    canaux: saisie.canaux,
    filtre: { cible: saisie.filtre.cible ?? null, ville: saisie.filtre.ville ?? null, secteur: saisie.filtre.secteur ?? null },
    objet: saisie.objet ?? null,
    corps: saisie.corps,
    userId,
  });
  return id;
}

/**
 * Envoie un message groupé : une ligne d'envoi par destinataire et par canal,
 * une notification par compte pour la cloche. Le compte rendu — envoyés,
 * échecs, retenus — se fige sur la campagne, qui ne se renvoie pas.
 *
 * La campagne passe à `envoyee` AVANT les envois, par une mise à jour
 * conditionnelle : deux clics rapprochés n'envoient pas deux fois.
 */
export async function envoyerCampagnePour(organizationId: string, userId: string, campagneId: string, entreprise: string): Promise<Campagne> {
  const [campagne] = await db
    .update(campagnes)
    .set({ statut: "envoyee", envoyeeLe: new Date(), updatedAt: new Date() })
    .where(and(eq(campagnes.id, campagneId), eq(campagnes.organizationId, organizationId), eq(campagnes.statut, "brouillon")))
    .returning();
  if (!campagne) throw new Error("Message introuvable ou déjà envoyé.");

  const annee = String(new Date().getFullYear());
  const numero = await db.transaction((tx) => prochainNumero(tx, organizationId, { cle: "campagne", prefix: `MSG-${annee}-`, padding: 5, periode: annee }));
  const liste = (await destinataires(organizationId, campagne.public, campagne.filtre as FiltreCampagne)).slice(0, PLAFOND_DESTINATAIRES);

  let envoyes = 0;
  let echecs = 0;
  let ignores = 0;
  const canaux = campagne.canaux as CanalCampagne[];

  if (canaux.includes("application")) {
    for (const d of liste) {
      if (!d.userId) continue;
      await notifier(organizationId, [d.userId], {
        categorie: "campagne",
        titre: campagne.objet?.trim() || campagne.titre,
        corps: remplir(campagne.corps, { nom: d.nom, entreprise }).slice(0, 300),
        lien: "/notifications",
      });
      envoyes++;
    }
  }

  for (const canal of canaux) {
    if (canal === "application") continue;
    for (const d of liste) {
      const adresse = canal === "email" ? d.email : d.telephone;
      if (!adresse) {
        ignores++;
        continue;
      }
      const r = await envoyerMessage(organizationId, userId, {
        canal,
        destinataire: adresse,
        nom: d.nom,
        tiersId: d.tiersId,
        employeId: d.employeId,
        objet: campagne.objet,
        corps: remplir(campagne.corps, { nom: d.nom, entreprise }),
        origine: "campagne",
        campagneId: campagne.id,
        entreprise,
      });
      if (r.statut === "envoye") envoyes++;
      else if (r.statut === "echec") echecs++;
      else ignores++;
    }
  }

  const [fini] = await db
    .update(campagnes)
    .set({ numero, destinataires: liste.length, envoyes, echecs, ignores, updatedAt: new Date(), version: sql`${campagnes.version} + 1` })
    .where(eq(campagnes.id, campagne.id))
    .returning();
  await db.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "campagne.envoyer",
    entityType: "campagne",
    entityId: campagne.id,
    after: { numero, titre: campagne.titre, public: campagne.public, canaux, destinataires: liste.length, envoyes, echecs, ignores },
  });
  return fini;
}

export async function supprimerBrouillonPour(organizationId: string, campagneId: string): Promise<void> {
  const supprimees = await db
    .delete(campagnes)
    .where(and(eq(campagnes.id, campagneId), eq(campagnes.organizationId, organizationId), eq(campagnes.statut, "brouillon")))
    .returning({ id: campagnes.id });
  if (supprimees.length === 0) throw new Error("Seul un brouillon se supprime.");
}

export async function listerCampagnes(organizationId: string, filtres?: FiltresListe): Promise<Campagne[]> {
  return db
    .select()
    .from(campagnes)
    .where(
      and(
        eq(campagnes.organizationId, organizationId),
        // Filtrés en base : la liste s'arrête aux cent derniers. Un brouillon
        // n'a pas de date d'envoi : il ne répond qu'à une période vide.
        filtres && motsDans([campagnes.numero, campagnes.titre, campagnes.objet, campagnes.corps], motsRecherche(filtres.q)),
        filtres && dansPeriodeSql(campagnes.envoyeeLe, filtres.periode),
      ),
    )
    .orderBy(desc(campagnes.createdAt))
    .limit(100);
}
