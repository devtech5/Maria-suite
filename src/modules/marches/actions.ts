"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import { refusDroit } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { urlSignee } from "@/lib/stockage";

import type { StatutSoumission } from "./calcul";
import {
  ajouterAvenantPour,
  ajouterPieceDossierPour,
  annulerConsultationPour,
  attribuerPour,
  changerStatutSoumissionPour,
  cheminFichier,
  cloturerConsultationPour,
  cocherPiecePour,
  creerConsultationPour,
  creerConventionPour,
  creerSoumissionPour,
  enregistrerOffrePour,
  inviterPour,
  joindreConventionPour,
  joindrePiecePour,
  modifierSoumissionPour,
  resilierConventionPour,
  retirerPieceDossierPour,
  type FichierRecu,
} from "./creation";
import { creerProjetDepuisMarchePour, preparerDevisDepuisMarchePour, type OrigineMarche } from "./suites";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function texte(d: FormData, champ: string): string | null {
  const v = d.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function entier(d: FormData, champ: string): number | null {
  const v = texte(d, champ);
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, ""));
  return Number.isInteger(n) ? n : NaN;
}

async function fichier(d: FormData, champ = "fichier"): Promise<FichierRecu | null> {
  const brut = d.get(champ);
  if (!(brut instanceof File) || brut.size === 0) return null;
  return { nom: brut.name || "document", typeMime: brut.type, contenu: await brut.arrayBuffer() };
}

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Marchés", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

async function operer(droit: Parameters<typeof refusDroit>[0], travail: (ctx: { organizationId: string; userId: string }) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail({ organizationId: session.organizationId, userId: session.userId });
    if (r.ok) {
      revalidatePath("/marches", "layout");
      revalidatePath("/");
    }
    return r;
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Date-heure limite saisie « 2026-10-15T17:00 », heure d'Abidjan (UTC). */
function dateHeure(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(/T\d{2}:\d{2}$/.test(v) ? `${v}:00Z` : `${v}T17:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// --------------------------------------------------------------- soumissions

export async function creerSoumission(d: FormData): Promise<Resultat> {
  return operer("marches.soumission.gerer", async ({ organizationId, userId }) => {
    const type = texte(d, "type");
    const { id, numero } = await creerSoumissionPour(organizationId, userId, {
      reference: texte(d, "reference"),
      intitule: texte(d, "intitule") ?? "",
      autorite: texte(d, "autorite") ?? "",
      type: type === "prive" || type === "bailleur" ? type : "public",
      lots: texte(d, "lots"),
      budgetEstime: entier(d, "budgetEstime"),
      caution: entier(d, "caution"),
      dateLimite: dateHeure(texte(d, "dateLimite")),
      notes: texte(d, "notes"),
    });
    return { ok: true, message: `Soumission ${numero} ouverte, dossier type prêt.`, id };
  });
}

export async function modifierSoumission(id: string, d: FormData): Promise<Resultat> {
  return operer("marches.soumission.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Soumission inconnue." };
    const montant = entier(d, "montantPropose");
    const caution = entier(d, "caution");
    if (Number.isNaN(montant) || Number.isNaN(caution)) return { ok: false, message: "Montants en francs entiers." };
    await modifierSoumissionPour(organizationId, userId, id, {
      montantPropose: montant,
      caution,
      dateLimite: dateHeure(texte(d, "dateLimite")),
      lots: texte(d, "lots"),
      notes: texte(d, "notes"),
      cautionRestituee: d.get("cautionRestituee") === "on",
    });
    return { ok: true, message: "Soumission enregistrée." };
  });
}

export async function changerStatutSoumission(id: string, vers: StatutSoumission, motif?: string, forcer = false): Promise<Resultat> {
  return operer("marches.soumission.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Soumission inconnue." };
    const numero = await changerStatutSoumissionPour(organizationId, userId, id, vers, { motif, forcer });
    return { ok: true, message: `${numero} mise à jour.` };
  });
}

export async function ajouterPieceDossier(soumissionId: string, libelle: string): Promise<Resultat> {
  return operer("marches.soumission.gerer", async ({ organizationId }) => {
    if (!UUID.test(soumissionId)) return { ok: false, message: "Soumission inconnue." };
    await ajouterPieceDossierPour(organizationId, soumissionId, libelle.slice(0, 160));
    return { ok: true, message: "Pièce ajoutée au dossier." };
  });
}

export async function cocherPiece(pieceId: string, fournie: boolean): Promise<Resultat> {
  return operer("marches.soumission.gerer", async ({ organizationId }) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce inconnue." };
    await cocherPiecePour(organizationId, pieceId, fournie);
    return { ok: true, message: fournie ? "Pièce fournie." : "Pièce à fournir." };
  });
}

export async function joindrePiece(pieceId: string, d: FormData): Promise<Resultat> {
  return operer("marches.soumission.gerer", async ({ organizationId }) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce inconnue." };
    const f = await fichier(d);
    if (!f) return { ok: false, message: "Choisissez un fichier." };
    await joindrePiecePour(organizationId, pieceId, f);
    return { ok: true, message: "Fichier joint, pièce fournie." };
  });
}

export async function retirerPieceDossier(pieceId: string): Promise<Resultat> {
  return operer("marches.soumission.gerer", async ({ organizationId }) => {
    if (!UUID.test(pieceId)) return { ok: false, message: "Pièce inconnue." };
    await retirerPieceDossierPour(organizationId, pieceId);
    return { ok: true, message: "Pièce retirée du dossier." };
  });
}

// ------------------------------------------------------------- consultations

export async function creerConsultation(d: FormData): Promise<Resultat> {
  return operer("marches.consultation.gerer", async ({ organizationId, userId }) => {
    const poids = entier(d, "poidsPrix") ?? 60;
    if (Number.isNaN(poids) || poids < 0 || poids > 100) return { ok: false, message: "Le poids du prix va de 0 à 100 %." };
    const dateLimite = texte(d, "dateLimite");
    if (dateLimite && !DATE_ISO.test(dateLimite)) return { ok: false, message: "Date limite invalide." };
    const { id, numero } = await creerConsultationPour(organizationId, userId, {
      objet: texte(d, "objet") ?? "",
      description: texte(d, "description"),
      criteres: texte(d, "criteres"),
      budget: entier(d, "budget"),
      dateLimite,
      poidsPrixBp: poids * 100,
    });
    return { ok: true, message: `Consultation ${numero} créée : invitez les fournisseurs.`, id };
  });
}

export async function inviter(consultationId: string, tiersIds: string[], canal: "email" | "whatsapp" | null): Promise<Resultat> {
  return operer("marches.consultation.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(consultationId)) return { ok: false, message: "Consultation inconnue." };
    const ids = tiersIds.filter((t) => UUID.test(t));
    if (ids.length === 0) return { ok: false, message: "Choisissez au moins un fournisseur." };
    const identite = await identiteEntreprise(organizationId);
    const r = await inviterPour(organizationId, userId, consultationId, ids, canal, identite.nom);
    const suite = canal ? ` ; ${r.ecrits} message${r.ecrits > 1 ? "s" : ""} parti${r.ecrits > 1 ? "s" : ""}${r.echecs.length ? ` — non joints : ${r.echecs.join(", ")}` : ""}` : "";
    return { ok: true, message: `${r.invites} fournisseur${r.invites > 1 ? "s" : ""} invité${r.invites > 1 ? "s" : ""}${suite}.` };
  });
}

export async function enregistrerOffre(offreId: string, d: FormData): Promise<Resultat> {
  return operer("marches.consultation.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(offreId)) return { ok: false, message: "Offre inconnue." };
    const montant = entier(d, "montant");
    const note = entier(d, "noteTechnique");
    if (!montant || Number.isNaN(montant)) return { ok: false, message: "Indiquez le montant de l'offre." };
    if (note !== null && (Number.isNaN(note) || note < 0 || note > 100)) return { ok: false, message: "La note technique va de 0 à 100." };
    await enregistrerOffrePour(organizationId, userId, offreId, { montant, delaiJours: entier(d, "delaiJours"), noteTechnique: note, commentaire: texte(d, "commentaire") }, await fichier(d));
    return { ok: true, message: "Offre enregistrée." };
  });
}

export async function cloturerConsultation(id: string): Promise<Resultat> {
  return operer("marches.consultation.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Consultation inconnue." };
    await cloturerConsultationPour(organizationId, userId, id);
    return { ok: true, message: "Réception des offres close." };
  });
}

export async function attribuer(offreId: string): Promise<Resultat> {
  return operer("marches.consultation.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(offreId)) return { ok: false, message: "Offre inconnue." };
    const numero = await attribuerPour(organizationId, userId, offreId);
    return { ok: true, message: `${numero} attribuée.` };
  });
}

export async function annulerConsultation(id: string): Promise<Resultat> {
  return operer("marches.consultation.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Consultation inconnue." };
    await annulerConsultationPour(organizationId, userId, id);
    return { ok: true, message: "Consultation annulée." };
  });
}

// --------------------------------------------------------------- conventions

export async function creerConvention(d: FormData): Promise<Resultat> {
  return operer("marches.convention.gerer", async ({ organizationId, userId }) => {
    const debut = texte(d, "debut");
    const fin = texte(d, "fin");
    if (!debut || !DATE_ISO.test(debut)) return { ok: false, message: "Indiquez la date de début." };
    if (fin && !DATE_ISO.test(fin)) return { ok: false, message: "Date de fin invalide." };
    const sens = texte(d, "sens");
    const tiersId = texte(d, "tiersId");
    const { id, numero } = await creerConventionPour(
      organizationId,
      userId,
      {
        intitule: texte(d, "intitule") ?? "",
        sens: sens === "fournisseur" || sens === "partenariat" ? sens : "client",
        partenaire: texte(d, "partenaire") ?? "",
        tiersId: tiersId && UUID.test(tiersId) ? tiersId : null,
        objet: texte(d, "objet"),
        montant: entier(d, "montant"),
        debut,
        fin,
        reconductionTacite: d.get("reconductionTacite") === "on",
        preavisJours: entier(d, "preavisJours") ?? 30,
        notes: texte(d, "notes"),
      },
      await fichier(d),
    );
    return { ok: true, message: `Convention ${numero} enregistrée.`, id };
  });
}

export async function joindreConvention(id: string, d: FormData): Promise<Resultat> {
  return operer("marches.convention.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Convention inconnue." };
    const f = await fichier(d);
    if (!f) return { ok: false, message: "Choisissez un fichier." };
    await joindreConventionPour(organizationId, userId, id, f);
    return { ok: true, message: "Document joint." };
  });
}

export async function ajouterAvenant(conventionId: string, d: FormData): Promise<Resultat> {
  return operer("marches.convention.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(conventionId)) return { ok: false, message: "Convention inconnue." };
    const signeLe = texte(d, "signeLe");
    const nouvelleFin = texte(d, "nouvelleFin");
    if (!signeLe || !DATE_ISO.test(signeLe)) return { ok: false, message: "Indiquez la date de signature." };
    if (nouvelleFin && !DATE_ISO.test(nouvelleFin)) return { ok: false, message: "Nouvelle fin invalide." };
    const rang = await ajouterAvenantPour(organizationId, userId, conventionId, { objet: texte(d, "objet") ?? "", signeLe, nouvelleFin, nouveauMontant: entier(d, "nouveauMontant") }, await fichier(d));
    return { ok: true, message: `Avenant n° ${rang} enregistré.` };
  });
}

export async function resilierConvention(id: string, date: string, motif?: string): Promise<Resultat> {
  return operer("marches.convention.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id) || !DATE_ISO.test(date)) return { ok: false, message: "Saisie invalide." };
    await resilierConventionPour(organizationId, userId, id, date, (motif ?? "").slice(0, 500));
    return { ok: true, message: "Convention résiliée." };
  });
}

// ------------------------------------------------------------------ suites

const DROIT_ORIGINE = { soumission: "marches.soumission.gerer", convention: "marches.convention.gerer" } as const;

/** Ouvre le projet d'un marché gagné ou d'une convention signée, sans ressaisie. */
export async function creerProjetDepuisMarche(nature: OrigineMarche["nature"], id: string): Promise<Resultat> {
  return operer(DROIT_ORIGINE[nature] ?? "marches.soumission.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id) || !(nature in DROIT_ORIGINE)) return { ok: false, message: "Marché introuvable." };
    const refus = await refusDroit("projet.gerer");
    if (refus) return { ok: false, message: refus.erreur };
    const projet = await creerProjetDepuisMarchePour(organizationId, { nature, id }, userId);
    revalidatePath("/projets", "layout");
    return { ok: true, message: `Projet ${projet.code} ouvert.`, id: projet.id };
  });
}

/** Prépare le devis d'un marché gagné ou d'une convention signée, en brouillon. */
export async function preparerDevisDepuisMarche(nature: OrigineMarche["nature"], id: string): Promise<Resultat> {
  return operer(DROIT_ORIGINE[nature] ?? "marches.soumission.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id) || !(nature in DROIT_ORIGINE)) return { ok: false, message: "Marché introuvable." };
    const refus = await refusDroit("commercial.piece.gerer");
    if (refus) return { ok: false, message: refus.erreur };
    const devis = await preparerDevisDepuisMarchePour(organizationId, { nature, id }, userId);
    revalidatePath("/commercial", "layout");
    return { ok: true, message: "Devis préparé en brouillon : relisez-le et émettez-le depuis la facturation.", id: devis.id };
  });
}

/** URL signée de cinq minutes pour un fichier de marché, demandée au clic. */
export async function ouvrirFichier(nature: "piece" | "offre" | "convention" | "avenant", id: string): Promise<string | null> {
  const session = await exigerEntreprise();
  if (await refusDroit("marches.consulter")) return null;
  if (!UUID.test(id) || !["piece", "offre", "convention", "avenant"].includes(nature)) return null;
  const chemin = await cheminFichier(session.organizationId, nature, id);
  return chemin ? urlSignee(chemin) : null;
}
