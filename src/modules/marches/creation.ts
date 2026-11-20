import "server-only";

import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { cheminDe, deposer, supprimer } from "@/lib/stockage";
import { envoyerMessage } from "@/modules/communication/envoi";
import { tiers } from "@/modules/tiers/schema";

import {
  PIECES_DOSSIER_DEFAUT,
  SUITES_SOUMISSION,
  etatConvention,
  noterOffres,
  soumissionEnDanger,
  type EtatConvention,
  type StatutSoumission,
} from "./calcul";
import {
  avenants,
  consultations,
  conventions,
  offres,
  piecesSoumission,
  soumissions,
  type Avenant,
  type Consultation,
  type Convention,
  type Offre,
  type PieceSoumission,
  type Soumission,
} from "./schema";

async function journaliser(tx: Transaction | typeof db, organizationId: string, userId: string, action: string, entityType: string, entityId: string, apres: unknown) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType, entityId, after: apres });
}

async function numeroter(tx: Transaction, organizationId: string, cle: string, prefixe: string): Promise<string> {
  const annee = String(new Date().getFullYear());
  return prochainNumero(tx, organizationId, { cle, prefix: `${prefixe}-${annee}-`, padding: 5, periode: annee });
}

// ------------------------------------------------------------------ fichiers

export interface FichierRecu {
  nom: string;
  typeMime: string;
  contenu: ArrayBuffer;
}

const TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** Dépose un fichier de marché. Rend ses colonnes, prêtes à poser sur la ligne. */
async function deposerFichier(organizationId: string, f: FichierRecu): Promise<{ chemin: string; nomFichier: string; typeMime: string }> {
  const ext = TYPES[f.typeMime];
  if (!ext) throw new Error(`« ${f.nom} » : format non accepté. PDF, photo, Word ou Excel.`);
  if (f.contenu.byteLength > 10 * 1024 * 1024) throw new Error(`« ${f.nom} » dépasse 10 Mo.`);
  const chemin = cheminDe(organizationId, newId(), ext);
  const depot = await deposer({ chemin, contenu: f.contenu, typeMime: f.typeMime });
  if (!depot.ok) throw new Error(depot.raison);
  return { chemin, nomFichier: f.nom.slice(0, 200), typeMime: f.typeMime };
}

/** Clé du fichier d'une ligne de marché, si elle est bien de l'entreprise. */
export async function cheminFichier(organizationId: string, nature: "piece" | "offre" | "convention" | "avenant", id: string): Promise<string | null> {
  const table = { piece: piecesSoumission, offre: offres, convention: conventions, avenant: avenants }[nature];
  const [l] = await db
    .select({ chemin: table.chemin })
    .from(table)
    .where(and(eq(table.id, id), eq(table.organizationId, organizationId), isNull(table.deletedAt)));
  return l?.chemin ?? null;
}

// --------------------------------------------------------------- soumissions

export interface NouvelleSoumission {
  reference?: string | null;
  intitule: string;
  autorite: string;
  clientId?: string | null;
  type: "public" | "prive" | "bailleur";
  lots?: string | null;
  budgetEstime?: number | null;
  caution?: number | null;
  dateLimite?: Date | null;
  notes?: string | null;
}

/** Ouvre une soumission avec son dossier administratif type. */
export async function creerSoumissionPour(organizationId: string, userId: string, s: NouvelleSoumission): Promise<{ id: string; numero: string }> {
  if (s.intitule.trim().length < 3) throw new Error("Indiquez l'objet du marché.");
  if (s.autorite.trim().length < 2) throw new Error("Indiquez l'autorité contractante.");
  return db.transaction(async (tx) => {
    const numero = await numeroter(tx, organizationId, "soumission", "AO");
    const id = newId();
    await tx.insert(soumissions).values({
      id,
      organizationId,
      numero,
      reference: s.reference ?? null,
      intitule: s.intitule.trim(),
      autorite: s.autorite.trim(),
      clientId: s.clientId ?? null,
      type: s.type,
      lots: s.lots ?? null,
      budgetEstime: s.budgetEstime ?? null,
      caution: s.caution ?? null,
      dateLimite: s.dateLimite ?? null,
      notes: s.notes ?? null,
      statut: "veille",
      responsableId: userId,
      userId,
    });
    await tx.insert(piecesSoumission).values(PIECES_DOSSIER_DEFAUT.map((libelle, rang) => ({ id: newId(), organizationId, soumissionId: id, libelle, rang })));
    await journaliser(tx, organizationId, userId, "soumission.creer", "soumission", id, { numero, intitule: s.intitule });
    return { id, numero };
  });
}

export async function modifierSoumissionPour(
  organizationId: string,
  userId: string,
  id: string,
  m: { montantPropose?: number | null; caution?: number | null; dateLimite?: Date | null; notes?: string | null; cautionRestituee?: boolean; lots?: string | null },
): Promise<void> {
  const [l] = await db
    .update(soumissions)
    .set({ ...m, updatedAt: new Date(), version: sql`${soumissions.version} + 1` })
    .where(and(isNull(soumissions.deletedAt), eq(soumissions.id, id), eq(soumissions.organizationId, organizationId)))
    .returning({ numero: soumissions.numero });
  if (!l) throw new Error("Soumission introuvable.");
  await journaliser(db, organizationId, userId, "soumission.modifier", "soumission", id, { numero: l.numero });
}

/**
 * Fait avancer une soumission. Déposer un dossier incomplet est refusé, sauf
 * à le forcer en connaissance de cause : certaines pièces se complètent sur
 * place, le jour du dépôt.
 */
export async function changerStatutSoumissionPour(
  organizationId: string,
  userId: string,
  id: string,
  vers: StatutSoumission,
  options: { motif?: string | null; forcer?: boolean } = {},
): Promise<string> {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(soumissions).where(and(eq(soumissions.id, id), eq(soumissions.organizationId, organizationId), isNull(soumissions.deletedAt)));
    if (!s) throw new Error("Soumission introuvable.");
    if (!SUITES_SOUMISSION[s.statut].includes(vers)) throw new Error(`${s.numero} ne peut pas passer de « ${s.statut} » à « ${vers} ».`);
    if (vers === "deposee") {
      const pieces = await tx.select({ fournie: piecesSoumission.fournie }).from(piecesSoumission).where(and(eq(piecesSoumission.soumissionId, id), isNull(piecesSoumission.deletedAt)));
      const manquantes = pieces.filter((p) => !p.fournie).length;
      if (manquantes > 0 && !options.forcer) throw new Error(`${manquantes} pièce${manquantes > 1 ? "s" : ""} du dossier ${manquantes > 1 ? "manquent" : "manque"} encore.`);
      if (s.montantPropose === null) throw new Error("Indiquez le montant de l'offre avant de la déposer.");
    }
    if ((vers === "perdue" || vers === "abandonnee") && !options.motif?.trim()) throw new Error("Indiquez la raison : elle sert à mieux répondre la fois suivante.");
    await tx
      .update(soumissions)
      .set({
        statut: vers,
        ...(vers === "deposee" ? { deposeeLe: new Date() } : {}),
        ...(options.motif?.trim() ? { motifResultat: options.motif.trim() } : {}),
        updatedAt: new Date(),
        version: sql`${soumissions.version} + 1`,
      })
      .where(eq(soumissions.id, id));
    await journaliser(tx, organizationId, userId, `soumission.${vers}`, "soumission", id, { numero: s.numero, motif: options.motif ?? null });
    return s.numero;
  });
}

async function pieceDe(organizationId: string, pieceId: string) {
  const [p] = await db.select().from(piecesSoumission).where(and(eq(piecesSoumission.id, pieceId), eq(piecesSoumission.organizationId, organizationId), isNull(piecesSoumission.deletedAt)));
  if (!p) throw new Error("Pièce introuvable.");
  return p;
}

export async function ajouterPieceDossierPour(organizationId: string, soumissionId: string, libelle: string): Promise<void> {
  if (libelle.trim().length < 2) throw new Error("Nommez la pièce.");
  const [s] = await db.select({ id: soumissions.id }).from(soumissions).where(and(eq(soumissions.id, soumissionId), eq(soumissions.organizationId, organizationId), isNull(soumissions.deletedAt)));
  if (!s) throw new Error("Soumission introuvable.");
  const [{ rang }] = await db.select({ rang: max(piecesSoumission.rang) }).from(piecesSoumission).where(eq(piecesSoumission.soumissionId, soumissionId));
  await db.insert(piecesSoumission).values({ id: newId(), organizationId, soumissionId, libelle: libelle.trim(), rang: (rang ?? 0) + 1 });
}

export async function cocherPiecePour(organizationId: string, pieceId: string, fournie: boolean): Promise<void> {
  await pieceDe(organizationId, pieceId);
  await db.update(piecesSoumission).set({ fournie, updatedAt: new Date() }).where(eq(piecesSoumission.id, pieceId));
}

/** Joint le fichier d'une pièce ; la pièce est alors fournie. L'ancien fichier part. */
export async function joindrePiecePour(organizationId: string, pieceId: string, fichier: FichierRecu): Promise<void> {
  const p = await pieceDe(organizationId, pieceId);
  const f = await deposerFichier(organizationId, fichier);
  await db.update(piecesSoumission).set({ ...f, fournie: true, updatedAt: new Date() }).where(eq(piecesSoumission.id, pieceId));
  if (p.chemin) await supprimer(p.chemin);
}

export async function retirerPieceDossierPour(organizationId: string, pieceId: string): Promise<void> {
  const p = await pieceDe(organizationId, pieceId);
  await db.delete(piecesSoumission).where(eq(piecesSoumission.id, pieceId));
  if (p.chemin) await supprimer(p.chemin);
}

export interface SoumissionSuivie extends Soumission {
  pieces: number;
  manquantes: number;
  enDanger: boolean;
}

export async function listerSoumissions(organizationId: string, maintenant = new Date()): Promise<SoumissionSuivie[]> {
  const [liste, pieces] = await Promise.all([
    db.select().from(soumissions).where(and(eq(soumissions.organizationId, organizationId), isNull(soumissions.deletedAt))).orderBy(desc(soumissions.createdAt)),
    db.select({ soumissionId: piecesSoumission.soumissionId, fournie: piecesSoumission.fournie }).from(piecesSoumission).where(and(eq(piecesSoumission.organizationId, organizationId), isNull(piecesSoumission.deletedAt))),
  ]);
  return liste.map((s) => {
    const siennes = pieces.filter((p) => p.soumissionId === s.id);
    const manquantes = siennes.filter((p) => !p.fournie).length;
    return { ...s, pieces: siennes.length, manquantes, enDanger: soumissionEnDanger({ statut: s.statut, dateLimite: s.dateLimite, manquantes }, maintenant) };
  });
}

export async function soumissionDe(organizationId: string, id: string): Promise<(SoumissionSuivie & { dossier: PieceSoumission[] }) | null> {
  const s = (await listerSoumissions(organizationId)).find((x) => x.id === id);
  if (!s) return null;
  const dossier = await db.select().from(piecesSoumission).where(and(eq(piecesSoumission.soumissionId, id), isNull(piecesSoumission.deletedAt))).orderBy(asc(piecesSoumission.rang));
  return { ...s, dossier };
}

// ------------------------------------------------------------- consultations

export interface NouvelleConsultation {
  objet: string;
  description?: string | null;
  criteres?: string | null;
  budget?: number | null;
  dateLimite?: string | null;
  poidsPrixBp: number;
}

export async function creerConsultationPour(organizationId: string, userId: string, c: NouvelleConsultation): Promise<{ id: string; numero: string }> {
  if (c.objet.trim().length < 3) throw new Error("Indiquez l'objet de la consultation.");
  return db.transaction(async (tx) => {
    const numero = await numeroter(tx, organizationId, "consultation", "CONS");
    const id = newId();
    await tx.insert(consultations).values({
      id,
      organizationId,
      numero,
      objet: c.objet.trim(),
      description: c.description ?? null,
      criteres: c.criteres ?? null,
      budget: c.budget ?? null,
      dateLimite: c.dateLimite ?? null,
      poidsPrixBp: c.poidsPrixBp,
      userId,
    });
    await journaliser(tx, organizationId, userId, "consultation.creer", "consultation", id, { numero, objet: c.objet });
    return { id, numero };
  });
}

async function consultationDeTx(tx: Transaction | typeof db, organizationId: string, id: string): Promise<Consultation> {
  const [c] = await tx.select().from(consultations).where(and(eq(consultations.id, id), eq(consultations.organizationId, organizationId), isNull(consultations.deletedAt)));
  if (!c) throw new Error("Consultation introuvable.");
  return c;
}

/**
 * Invite des fournisseurs et, si un canal est choisi, leur écrit : objet,
 * critères, date limite. La consultation s'ouvre à la première invitation.
 */
export async function inviterPour(
  organizationId: string,
  userId: string,
  consultationId: string,
  tiersIds: string[],
  canal: "email" | "whatsapp" | null,
  entreprise: string,
): Promise<{ invites: number; ecrits: number; echecs: string[] }> {
  const c = await consultationDeTx(db, organizationId, consultationId);
  if (c.statut !== "brouillon" && c.statut !== "ouverte") throw new Error("Consultation fermée : plus d'invitation.");
  const candidats = tiersIds.length
    ? await db.select().from(tiers).where(and(eq(tiers.organizationId, organizationId), inArray(tiers.id, tiersIds), isNull(tiers.deletedAt)))
    : [];
  let invites = 0;
  for (const t of candidats) {
    const r = await db.insert(offres).values({ id: newId(), organizationId, consultationId, tiersId: t.id }).onConflictDoNothing().returning({ id: offres.id });
    invites += r.length;
  }
  if (c.statut === "brouillon" && candidats.length > 0) await db.update(consultations).set({ statut: "ouverte", updatedAt: new Date() }).where(eq(consultations.id, consultationId));

  let ecrits = 0;
  const echecs: string[] = [];
  if (canal) {
    for (const t of candidats) {
      const adresse = canal === "email" ? t.email : t.telephone;
      if (!adresse) {
        echecs.push(`${t.nom} : pas d'adresse`);
        continue;
      }
      const corps = [
        `Bonjour,`,
        `${entreprise} vous invite à remettre une offre pour : ${c.objet} (réf. ${c.numero}).`,
        c.description ? c.description : null,
        c.criteres ? `Critères : ${c.criteres}` : null,
        c.dateLimite ? `Date limite de remise : ${c.dateLimite.split("-").reverse().join("/")}.` : null,
        `Merci de nous adresser votre prix, votre délai et vos conditions en réponse à ce message.`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const r = await envoyerMessage(organizationId, userId, { canal, destinataire: adresse, nom: t.nom, tiersId: t.id, objet: `Consultation ${c.numero} — ${c.objet}`, corps, origine: "consultation", entreprise });
      if (r.statut === "envoye") ecrits++;
      else echecs.push(`${t.nom} : ${r.raison ?? "échec"}`);
    }
  }
  await journaliser(db, organizationId, userId, "consultation.inviter", "consultation", consultationId, { invites, canal, ecrits });
  return { invites, ecrits, echecs };
}

/** Enregistre l'offre reçue d'un invité. */
export async function enregistrerOffrePour(
  organizationId: string,
  userId: string,
  offreId: string,
  o: { montant: number; delaiJours?: number | null; noteTechnique?: number | null; commentaire?: string | null },
  fichier: FichierRecu | null,
): Promise<void> {
  const [offre] = await db.select().from(offres).where(and(eq(offres.id, offreId), eq(offres.organizationId, organizationId), isNull(offres.deletedAt)));
  if (!offre) throw new Error("Offre introuvable.");
  const c = await consultationDeTx(db, organizationId, offre.consultationId);
  if (c.statut !== "ouverte" && c.statut !== "cloturee") throw new Error("Consultation fermée.");
  if (o.montant <= 0) throw new Error("Indiquez le montant de l'offre.");
  const f = fichier ? await deposerFichier(organizationId, fichier) : null;
  await db
    .update(offres)
    .set({
      montant: o.montant,
      delaiJours: o.delaiJours ?? null,
      noteTechnique: o.noteTechnique ?? null,
      commentaire: o.commentaire ?? null,
      statut: "recue",
      recueLe: offre.recueLe ?? new Date(),
      ...(f ?? {}),
      updatedAt: new Date(),
    })
    .where(eq(offres.id, offreId));
  if (f && offre.chemin) await supprimer(offre.chemin);
  await journaliser(db, organizationId, userId, "consultation.offre", "consultation", c.id, { montant: o.montant });
}

/** Clôt la réception : plus d'offre nouvelle, place à la comparaison. */
export async function cloturerConsultationPour(organizationId: string, userId: string, id: string): Promise<void> {
  const c = await consultationDeTx(db, organizationId, id);
  if (c.statut !== "ouverte") throw new Error("Seule une consultation ouverte se clôt.");
  await db.update(consultations).set({ statut: "cloturee", updatedAt: new Date() }).where(eq(consultations.id, id));
  await journaliser(db, organizationId, userId, "consultation.cloturer", "consultation", id, { numero: c.numero });
}

/** Attribue la consultation à une offre ; les autres offres reçues sont écartées. */
export async function attribuerPour(organizationId: string, userId: string, offreId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [offre] = await tx.select().from(offres).where(and(eq(offres.id, offreId), eq(offres.organizationId, organizationId), isNull(offres.deletedAt)));
    if (!offre) throw new Error("Offre introuvable.");
    if (offre.statut !== "recue") throw new Error("On n'attribue qu'une offre reçue.");
    const c = await consultationDeTx(tx, organizationId, offre.consultationId);
    if (c.statut !== "ouverte" && c.statut !== "cloturee") throw new Error("Consultation déjà attribuée ou annulée.");
    await tx.update(offres).set({ statut: "ecartee", updatedAt: new Date() }).where(and(eq(offres.consultationId, c.id), eq(offres.statut, "recue")));
    await tx.update(offres).set({ statut: "retenue", updatedAt: new Date() }).where(eq(offres.id, offreId));
    await tx.update(consultations).set({ statut: "attribuee", attribueeLe: new Date(), updatedAt: new Date() }).where(eq(consultations.id, c.id));
    await journaliser(tx, organizationId, userId, "consultation.attribuer", "consultation", c.id, { numero: c.numero, montant: offre.montant });
    return c.numero;
  });
}

export async function annulerConsultationPour(organizationId: string, userId: string, id: string): Promise<void> {
  const c = await consultationDeTx(db, organizationId, id);
  if (c.statut === "attribuee" || c.statut === "annulee") throw new Error("Consultation déjà close.");
  await db.update(consultations).set({ statut: "annulee", updatedAt: new Date() }).where(eq(consultations.id, id));
  await journaliser(db, organizationId, userId, "consultation.annuler", "consultation", id, { numero: c.numero });
}

export interface OffreAffichee extends Offre {
  fournisseur: string;
  email: string | null;
  telephone: string | null;
  note: number | null;
  rang: number | null;
}

export interface ConsultationSuivie extends Consultation {
  invitees: number;
  recues: number;
  retenue: string | null;
}

export async function listerConsultations(organizationId: string): Promise<ConsultationSuivie[]> {
  const [liste, toutes] = await Promise.all([
    db.select().from(consultations).where(and(eq(consultations.organizationId, organizationId), isNull(consultations.deletedAt))).orderBy(desc(consultations.createdAt)),
    db.select({ o: offres, nom: tiers.nom }).from(offres).innerJoin(tiers, eq(tiers.id, offres.tiersId)).where(and(eq(offres.organizationId, organizationId), isNull(offres.deletedAt))),
  ]);
  return liste.map((c) => {
    const siennes = toutes.filter((x) => x.o.consultationId === c.id);
    return {
      ...c,
      invitees: siennes.length,
      recues: siennes.filter((x) => x.o.statut !== "invitee").length,
      retenue: siennes.find((x) => x.o.statut === "retenue")?.nom ?? null,
    };
  });
}

export async function consultationDe(organizationId: string, id: string): Promise<{ consultation: Consultation; offres: OffreAffichee[] } | null> {
  const [c] = await db.select().from(consultations).where(and(eq(consultations.id, id), eq(consultations.organizationId, organizationId), isNull(consultations.deletedAt)));
  if (!c) return null;
  const lignes = await db
    .select({ o: offres, nom: tiers.nom, email: tiers.email, telephone: tiers.telephone })
    .from(offres)
    .innerJoin(tiers, eq(tiers.id, offres.tiersId))
    .where(and(eq(offres.consultationId, id), isNull(offres.deletedAt)));
  const notes = noterOffres(
    lignes.map((l) => ({ id: l.o.id, montant: l.o.statut === "invitee" ? null : l.o.montant, noteTechnique: l.o.noteTechnique })),
    c.poidsPrixBp,
  );
  const classees = [...notes.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const liste = lignes
    .map((l) => ({ ...l.o, fournisseur: l.nom, email: l.email, telephone: l.telephone, note: notes.get(l.o.id) ?? null, rang: classees.includes(l.o.id) ? classees.indexOf(l.o.id) + 1 : null }))
    .sort((a, b) => (a.rang ?? 999) - (b.rang ?? 999) || a.fournisseur.localeCompare(b.fournisseur, "fr"));
  return { consultation: c, offres: liste };
}

// --------------------------------------------------------------- conventions

export interface NouvelleConvention {
  intitule: string;
  sens: "client" | "fournisseur" | "partenariat";
  partenaire: string;
  tiersId?: string | null;
  objet?: string | null;
  montant?: number | null;
  debut: string;
  fin?: string | null;
  reconductionTacite?: boolean;
  preavisJours?: number;
  notes?: string | null;
}

export async function creerConventionPour(organizationId: string, userId: string, c: NouvelleConvention, fichier: FichierRecu | null): Promise<{ id: string; numero: string }> {
  if (c.intitule.trim().length < 3) throw new Error("Indiquez l'intitulé de la convention.");
  if (c.fin && c.fin < c.debut) throw new Error("La fin précède le début.");
  if (c.tiersId) {
    const [t] = await db.select({ id: tiers.id }).from(tiers).where(and(eq(tiers.id, c.tiersId), eq(tiers.organizationId, organizationId), isNull(tiers.deletedAt)));
    if (!t) throw new Error("Tiers introuvable.");
  }
  const f = fichier ? await deposerFichier(organizationId, fichier) : null;
  try {
    return await db.transaction(async (tx) => {
      const numero = await numeroter(tx, organizationId, "convention", "CONV");
      const id = newId();
      await tx.insert(conventions).values({
        id,
        organizationId,
        numero,
        intitule: c.intitule.trim(),
        sens: c.sens,
        partenaire: c.partenaire.trim(),
        tiersId: c.tiersId ?? null,
        objet: c.objet ?? null,
        montant: c.montant ?? null,
        debut: c.debut,
        fin: c.fin ?? null,
        reconductionTacite: c.reconductionTacite ?? false,
        preavisJours: c.preavisJours ?? 30,
        notes: c.notes ?? null,
        ...(f ?? {}),
        userId,
      });
      await journaliser(tx, organizationId, userId, "convention.creer", "convention", id, { numero, intitule: c.intitule, partenaire: c.partenaire });
      return { id, numero };
    });
  } catch (erreur) {
    if (f) await supprimer(f.chemin);
    throw erreur;
  }
}

export async function joindreConventionPour(organizationId: string, userId: string, id: string, fichier: FichierRecu): Promise<void> {
  const [c] = await db.select({ chemin: conventions.chemin }).from(conventions).where(and(eq(conventions.id, id), eq(conventions.organizationId, organizationId), isNull(conventions.deletedAt)));
  if (!c) throw new Error("Convention introuvable.");
  const f = await deposerFichier(organizationId, fichier);
  await db.update(conventions).set({ ...f, updatedAt: new Date() }).where(eq(conventions.id, id));
  if (c.chemin) await supprimer(c.chemin);
  await journaliser(db, organizationId, userId, "convention.joindre", "convention", id, { fichier: f.nomFichier });
}

export async function ajouterAvenantPour(
  organizationId: string,
  userId: string,
  conventionId: string,
  a: { objet: string; signeLe: string; nouvelleFin?: string | null; nouveauMontant?: number | null },
  fichier: FichierRecu | null,
): Promise<number> {
  if (a.objet.trim().length < 3) throw new Error("Indiquez l'objet de l'avenant.");
  const [c] = await db.select().from(conventions).where(and(eq(conventions.id, conventionId), eq(conventions.organizationId, organizationId), isNull(conventions.deletedAt)));
  if (!c) throw new Error("Convention introuvable.");
  if (c.resilieeLe) throw new Error("Convention résiliée : plus d'avenant.");
  if (a.nouvelleFin && a.nouvelleFin < c.debut) throw new Error("La nouvelle fin précède le début de la convention.");
  const f = fichier ? await deposerFichier(organizationId, fichier) : null;
  try {
    return await db.transaction(async (tx) => {
      const [{ rang }] = await tx.select({ rang: max(avenants.rang) }).from(avenants).where(eq(avenants.conventionId, conventionId));
      const suivant = (rang ?? 0) + 1;
      await tx.insert(avenants).values({
        id: newId(),
        organizationId,
        conventionId,
        rang: suivant,
        objet: a.objet.trim(),
        signeLe: a.signeLe,
        nouvelleFin: a.nouvelleFin ?? null,
        nouveauMontant: a.nouveauMontant ?? null,
        ...(f ?? {}),
        userId,
      });
      await journaliser(tx, organizationId, userId, "convention.avenant", "convention", conventionId, { numero: c.numero, rang: suivant, objet: a.objet });
      return suivant;
    });
  } catch (erreur) {
    if (f) await supprimer(f.chemin);
    throw erreur;
  }
}

export async function resilierConventionPour(organizationId: string, userId: string, id: string, date: string, motif: string): Promise<void> {
  if (motif.trim().length < 3) throw new Error("Indiquez le motif de la résiliation.");
  const [c] = await db
    .update(conventions)
    .set({ resilieeLe: date, motifResiliation: motif.trim(), updatedAt: new Date(), version: sql`${conventions.version} + 1` })
    .where(and(isNull(conventions.deletedAt), eq(conventions.id, id), eq(conventions.organizationId, organizationId), isNull(conventions.resilieeLe)))
    .returning({ numero: conventions.numero });
  if (!c) throw new Error("Convention introuvable ou déjà résiliée.");
  await journaliser(db, organizationId, userId, "convention.resilier", "convention", id, { numero: c.numero, date, motif });
}

export interface ConventionSuivie extends Convention {
  etat: EtatConvention;
  finEffective: string | null;
  jours: number | null;
  montantEffectif: number | null;
  avenants: Avenant[];
}

export async function listerConventions(organizationId: string, aujourdhui = new Date().toISOString().slice(0, 10)): Promise<ConventionSuivie[]> {
  const [liste, tous] = await Promise.all([
    db.select().from(conventions).where(and(eq(conventions.organizationId, organizationId), isNull(conventions.deletedAt))).orderBy(desc(conventions.debut)),
    db.select().from(avenants).where(and(eq(avenants.organizationId, organizationId), isNull(avenants.deletedAt))).orderBy(asc(avenants.rang)),
  ]);
  return liste.map((c) => {
    const siens = tous.filter((a) => a.conventionId === c.id);
    const e = etatConvention(c, siens.map((a) => a.nouvelleFin), aujourdhui);
    const dernierMontant = [...siens].reverse().find((a) => a.nouveauMontant !== null)?.nouveauMontant;
    return { ...c, etat: e.etat, finEffective: e.fin, jours: e.jours, montantEffectif: dernierMontant ?? c.montant, avenants: siens };
  });
}

export interface EtatMarches {
  soumissionsEnDanger: number;
  conventionsARenouveler: number;
  conventionsExpireesRecemment: number;
}

/** Pour le tableau de bord. */
export async function etatMarches(organizationId: string): Promise<EtatMarches> {
  const [s, c] = await Promise.all([listerSoumissions(organizationId), listerConventions(organizationId)]);
  return {
    soumissionsEnDanger: s.filter((x) => x.enDanger).length,
    conventionsARenouveler: c.filter((x) => x.etat === "a_renouveler").length,
    conventionsExpireesRecemment: c.filter((x) => x.etat === "expiree" && x.jours !== null && x.jours >= -30).length,
  };
}
