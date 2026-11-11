"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";
import { newId } from "@/lib/ids";
import { cheminDe, deposer, urlSignee } from "@/lib/stockage";
import { notifier, notifierDetenteurs } from "@/modules/communication/notifications";

import { NATURES_CONGE, formatJours, heureValide, jourLocal, type NatureConge } from "./calcul";
import {
  ajouterFeriePour,
  ajusterSoldePour,
  annulerCongePour,
  annulerPermissionPour,
  deciderCongePour,
  deciderPermissionPour,
  demanderCongePour,
  demanderPermissionPour,
  enregistrerReglagesPour,
  pointerDepartPour,
  pointerManuellementPour,
  proposerFeriesPour,
  reglagesDe,
  retirerFeriePour,
  salarieDuCompte,
} from "./creation";
import { formatDuree, GENRES_PERMISSION, MOTIFS_PERMISSION, TRAITEMENTS_PERMISSION, valide as dansListe } from "./permissions";
import { soldesConges } from "./requetes";
import { conges, demandesPermission } from "./schema";
import { employees } from "@/modules/personnes/schema";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const TAILLE_MAX_JUSTIFICATIF = 5 * 1024 * 1024;

function texte(d: FormData, champ: string): string | null {
  const v = d.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Présences", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function revalider() {
  revalidatePath("/presences", "layout");
}

async function aujourdhuiDe(organizationId: string): Promise<string> {
  const r = await reglagesDe(organizationId);
  return jourLocal(new Date(), r.fuseau);
}

// --------------------------------------------------------------- pointage

export async function pointerMonDepart(): Promise<Resultat> {
  const s = await exigerEntreprise();
  try {
    await pointerDepartPour(s.organizationId, s.userId);
    revalider();
    return { ok: true, message: "Départ pointé. Bonne soirée !" };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function pointerSalarie(d: FormData): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("presences.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const employeeId = texte(d, "employeeId") ?? "";
  const jour = texte(d, "jour") ?? "";
  const arrivee = texte(d, "arrivee") ?? "";
  const depart = texte(d, "depart");
  if (!UUID.test(employeeId)) return { ok: false, message: "Choisissez le salarié." };
  if (!DATE_ISO.test(jour)) return { ok: false, message: "Date invalide." };
  if (!heureValide(arrivee)) return { ok: false, message: "Heure d'arrivée au format HH:MM." };
  try {
    await pointerManuellementPour(s.organizationId, s.userId, { employeeId, jour, arrivee, depart, motif: texte(d, "motif") ?? "" });
    revalider();
    return { ok: true, message: "Présence enregistrée." };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

// --------------------------------------------------------------- réglages

const schemaReglages = z.object({
  pointageAuto: z.boolean(),
  heureArrivee: z.string(),
  heureDepart: z.string(),
  toleranceMinutes: z.number().int("Tolérance en minutes entières.").min(0).max(240),
  joursTravailles: z.array(z.number().int().min(1).max(7)).min(1, "Cochez au moins un jour travaillé."),
  congesCentiemesParMois: z.number().int().min(0).max(1000, "Plus de 10 jours par mois : vérifiez la saisie."),
  decompte: z.enum(["ouvrables", "ouvres"]),
});

export async function enregistrerReglages(d: FormData): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("presences.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const taux = Number(String(d.get("joursParMois") ?? "").replace(",", "."));
  const analyse = schemaReglages.safeParse({
    pointageAuto: d.get("pointageAuto") === "on",
    heureArrivee: texte(d, "heureArrivee") ?? "",
    heureDepart: texte(d, "heureDepart") ?? "",
    toleranceMinutes: Number(texte(d, "toleranceMinutes") ?? "0"),
    joursTravailles: d.getAll("joursTravailles").map(Number),
    // Saisie en jours (2,2) ; stockage en centièmes entiers (220).
    congesCentiemesParMois: Number.isFinite(taux) ? Math.round(taux * 100) : NaN,
    decompte: d.get("decompte"),
  });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  try {
    await enregistrerReglagesPour(s.organizationId, s.userId, analyse.data, d.get("atteste") === "on");
    revalider();
    return { ok: true, message: "Réglages enregistrés." };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function ajouterFerie(d: FormData): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("presences.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const jour = texte(d, "jour") ?? "";
  const libelle = texte(d, "libelle") ?? "";
  if (!DATE_ISO.test(jour)) return { ok: false, message: "Date invalide." };
  if (libelle.length < 2) return { ok: false, message: "Nommez le jour férié : Tabaski, Korité…" };
  try {
    await ajouterFeriePour(s.organizationId, s.userId, jour, libelle.slice(0, 80));
    revalider();
    return { ok: true, message: `${libelle} ajouté.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function retirerFerie(id: string): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("presences.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id)) return { ok: false, message: "Jour férié introuvable." };
  try {
    await retirerFeriePour(s.organizationId, s.userId, id);
    revalider();
    return { ok: true, message: "Jour férié retiré." };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function proposerFeries(annee: number): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("presences.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) return { ok: false, message: "Année invalide." };
  try {
    const n = await proposerFeriesPour(s.organizationId, s.userId, annee);
    revalider();
    return n > 0
      ? { ok: true, message: `${n} jour(s) férié(s) ajouté(s) pour ${annee}. Ajoutez les fêtes musulmanes dès leur annonce.` }
      : { ok: true, message: "Rien à ajouter : les fériés connus de l'année sont déjà posés." };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

// ----------------------------------------------------------------- congés

const NATURES = Object.keys(NATURES_CONGE) as [NatureConge, ...NatureConge[]];

/**
 * Demande pour soi (droit « demander »), ou saisie pour un salarié par un
 * responsable (droit « accorder »), qui vaut accord immédiat.
 */
export async function demanderConge(d: FormData): Promise<Resultat> {
  const s = await exigerEntreprise();
  const nature = d.get("nature");
  const debut = texte(d, "debut") ?? "";
  const fin = texte(d, "fin") ?? debut;
  if (!NATURES.includes(nature as NatureConge)) return { ok: false, message: "Choisissez la nature du congé." };
  if (!DATE_ISO.test(debut) || !DATE_ISO.test(fin)) return { ok: false, message: "Dates invalides." };

  const cible = texte(d, "employeeId");
  const moi = await salarieDuCompte(s.organizationId, s.userId);
  const pourAutrui = Boolean(cible && cible !== moi?.id);
  const refus = await refusDroit(pourAutrui ? "conges.valider" : "conges.demander");
  if (refus) return { ok: false, message: refus.erreur };
  const employeeId = pourAutrui ? cible! : moi?.id;
  if (!employeeId || !UUID.test(employeeId)) return { ok: false, message: "Votre compte n'est rattaché à aucune fiche salarié : demandez à votre responsable de le faire." };

  const aujourdhui = await aujourdhuiDe(s.organizationId);
  if (!pourAutrui && debut < aujourdhui && nature === "paye") return { ok: false, message: "Un congé payé se demande à l'avance. Pour une absence passée, voyez votre responsable." };

  // Justificatif facultatif : certificat médical, acte de naissance…
  let justificatif: string | null = null;
  const fichier = d.get("justificatif");
  if (fichier instanceof File && fichier.size > 0) {
    if (fichier.size > TAILLE_MAX_JUSTIFICATIF) return { ok: false, message: "Justificatif trop lourd : 5 Mo au plus." };
    const extension = fichier.name.split(".").pop() ?? "";
    const depot = await deposer({ chemin: cheminDe(s.organizationId, newId(), extension), contenu: await fichier.arrayBuffer(), typeMime: fichier.type || "application/octet-stream" });
    if (!depot.ok) return { ok: false, message: depot.raison };
    justificatif = depot.chemin;
  }

  try {
    const r = await reglagesDe(s.organizationId);
    const [solde] = await soldesConges(s.organizationId, r, aujourdhui, [employeeId]);
    const cree = await demanderCongePour(
      s.organizationId,
      s.userId,
      { employeeId, nature: nature as NatureConge, debut, fin, debutDemi: d.get("debutDemi") === "on", finDemi: d.get("finDemi") === "on", motif: texte(d, "motif"), justificatif },
      { accorder: pourAutrui, soldeApresDemandes: solde?.apresDemandes },
    );
    if (!pourAutrui) {
      await notifierDetenteurs(
        s.organizationId,
        "conges.valider",
        { categorie: "conge", titre: `Demande de congé : ${cree.salarie}`, corps: `${NATURES_CONGE[nature as NatureConge].libelle}, du ${debut} au ${fin} (${formatJours(cree.jours)}). ${cree.numero}.`, lien: "/presences/conges" },
        s.userId,
      );
    }
    revalider();
    return { ok: true, message: pourAutrui ? `${cree.numero} saisi et accordé (${formatJours(cree.jours)}).` : `${cree.numero} envoyé (${formatJours(cree.jours)}). Vous serez prévenu de la décision.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function deciderConge(id: string, decision: "approuve" | "refuse", commentaire: string | null): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("conges.valider");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id) || (decision !== "approuve" && decision !== "refuse")) return { ok: false, message: "Demande introuvable." };
  try {
    const c = await deciderCongePour(s.organizationId, s.userId, id, decision, commentaire?.slice(0, 500) ?? null);
    const destinataires = [c.salarieUserId, c.demandeur].filter((u): u is string => Boolean(u) && u !== s.userId);
    await notifier(s.organizationId, destinataires, {
      categorie: "conge",
      titre: decision === "approuve" ? `Congé accordé : ${c.numero}` : `Congé refusé : ${c.numero}`,
      corps: commentaire?.trim() || null,
      lien: "/presences/conges",
    });
    revalider();
    return { ok: true, message: decision === "approuve" ? `${c.numero} accordé à ${c.nom}.` : `${c.numero} refusé.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function annulerConge(id: string): Promise<Resultat> {
  const s = await exigerEntreprise();
  const responsable = await peut("conges.valider");
  if (!responsable) {
    const refus = await refusDroit("conges.demander");
    if (refus) return { ok: false, message: refus.erreur };
  }
  if (!UUID.test(id)) return { ok: false, message: "Congé introuvable." };
  try {
    const { numero } = await annulerCongePour(s.organizationId, s.userId, id, responsable, await aujourdhuiDe(s.organizationId));
    revalider();
    return { ok: true, message: `${numero} annulé.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

/** URL signée du justificatif, demandée au clic : le salarié concerné ou un responsable. */
export async function ouvrirJustificatif(id: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const s = await exigerEntreprise();
  if (!UUID.test(id)) return { ok: false, message: "Congé introuvable." };
  const [c] = await db
    .select({ justificatif: conges.justificatif, salarieUserId: employees.userId })
    .from(conges)
    .innerJoin(employees, eq(employees.id, conges.employeeId))
    .where(and(eq(conges.id, id), eq(conges.organizationId, s.organizationId)));
  if (!c?.justificatif) return { ok: false, message: "Aucun justificatif joint." };
  if (c.salarieUserId !== s.userId && !(await peut("conges.valider"))) return { ok: false, message: "Ce justificatif ne vous est pas destiné." };
  const url = await urlSignee(c.justificatif);
  return url ? { ok: true, url } : { ok: false, message: "Le dépôt de fichiers ne répond pas." };
}

export async function ajusterSolde(d: FormData): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("conges.valider");
  if (refus) return { ok: false, message: refus.erreur };
  const employeeId = texte(d, "employeeId") ?? "";
  const jour = texte(d, "jour") ?? "";
  const motif = d.get("motif");
  const jours = Number(String(d.get("jours") ?? "").replace(",", "."));
  if (!UUID.test(employeeId)) return { ok: false, message: "Choisissez le salarié." };
  if (!DATE_ISO.test(jour)) return { ok: false, message: "Date invalide." };
  if (motif !== "reprise" && motif !== "majoration" && motif !== "correction") return { ok: false, message: "Choisissez le type d'ajustement." };
  if (!Number.isFinite(jours) || Math.abs(jours) > 1000) return { ok: false, message: "Nombre de jours invalide." };
  try {
    await ajusterSoldePour(s.organizationId, s.userId, { employeeId, jour, motif, centiemes: Math.round(jours * 100), note: texte(d, "note") });
    revalider();
    return { ok: true, message: motif === "reprise" ? "Solde repris : le décompte repart de cette date." : "Solde ajusté." };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

// ------------------------------------------------------ permissions et absences

/** Dépose un justificatif joint au formulaire ; `null` sans fichier. */
async function deposerJustificatif(organizationId: string, d: FormData): Promise<{ ok: true; chemin: string | null } | { ok: false; message: string }> {
  const fichier = d.get("justificatif");
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: true, chemin: null };
  if (fichier.size > TAILLE_MAX_JUSTIFICATIF) return { ok: false, message: "Justificatif trop lourd : 5 Mo au plus." };
  const extension = fichier.name.split(".").pop() ?? "";
  const depot = await deposer({ chemin: cheminDe(organizationId, newId(), extension), contenu: await fichier.arrayBuffer(), typeMime: fichier.type || "application/octet-stream" });
  return depot.ok ? { ok: true, chemin: depot.chemin } : { ok: false, message: depot.raison };
}

/**
 * Demande pour soi (droit « conges.demander »), ou saisie pour un salarié par
 * un responsable (droit « conges.valider »), accordée d'office avec son traitement.
 */
export async function demanderPermission(d: FormData): Promise<Resultat> {
  const s = await exigerEntreprise();
  const genre = d.get("genre");
  const motif = d.get("motif");
  const debut = texte(d, "debut") ?? "";
  const fin = genre === "heures" ? debut : (texte(d, "fin") ?? debut);
  if (!dansListe(GENRES_PERMISSION, genre)) return { ok: false, message: "Choisissez : permission de quelques heures, ou absence." };
  if (!dansListe(MOTIFS_PERMISSION, motif)) return { ok: false, message: "Choisissez le motif." };
  if (!DATE_ISO.test(debut) || !DATE_ISO.test(fin)) return { ok: false, message: "Dates invalides." };
  const precision = texte(d, "precision")?.slice(0, 300) ?? null;
  if (motif === "autre" && !precision) return { ok: false, message: "Précisez le motif." };

  const cible = texte(d, "employeeId");
  const moi = await salarieDuCompte(s.organizationId, s.userId);
  const pourAutrui = Boolean(cible && cible !== moi?.id);
  const refus = await refusDroit(pourAutrui ? "conges.valider" : "conges.demander");
  if (refus) return { ok: false, message: refus.erreur };
  const employeeId = pourAutrui ? cible! : moi?.id;
  if (!employeeId || !UUID.test(employeeId)) return { ok: false, message: "Votre compte n'est rattaché à aucune fiche salarié : demandez à votre responsable de le faire." };

  const traitement = d.get("traitement");
  if (pourAutrui && !dansListe(TRAITEMENTS_PERMISSION, traitement)) return { ok: false, message: "Choisissez comment ce temps est traité." };

  const justificatif = await deposerJustificatif(s.organizationId, d);
  if (!justificatif.ok) return { ok: false, message: justificatif.message };

  try {
    const cree = await demanderPermissionPour(
      s.organizationId,
      s.userId,
      { employeeId, genre, debut, fin, heureDebut: texte(d, "heureDebut"), heureFin: texte(d, "heureFin"), motif, precision, justificatif: justificatif.chemin },
      { aujourdhui: await aujourdhuiDe(s.organizationId), accorder: pourAutrui ? (traitement as keyof typeof TRAITEMENTS_PERMISSION) : null },
    );
    const duree = genre === "heures" ? `le ${debut}, ${formatDuree(cree.minutes)}` : `du ${debut} au ${fin} (${formatJours(cree.jours)})`;
    if (!pourAutrui) {
      await notifierDetenteurs(
        s.organizationId,
        "conges.valider",
        { categorie: "conge", titre: `Demande de permission : ${cree.salarie}`, corps: `${MOTIFS_PERMISSION[motif]}, ${duree}. ${cree.numero}.`, lien: "/presences/permissions" },
        s.userId,
      );
    }
    revalider();
    return { ok: true, message: pourAutrui ? `${cree.numero} saisie et accordée.` : `${cree.numero} envoyée (${duree}). Vous serez prévenu de la décision.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function deciderPermission(id: string, decision: "approuve" | "refuse", traitement: string | null, commentaire: string | null): Promise<Resultat> {
  const s = await exigerEntreprise();
  const refus = await refusDroit("conges.valider");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(id) || (decision !== "approuve" && decision !== "refuse")) return { ok: false, message: "Demande introuvable." };
  const retenu = decision === "approuve" && dansListe(TRAITEMENTS_PERMISSION, traitement) ? traitement : null;
  try {
    const p = await deciderPermissionPour(s.organizationId, s.userId, id, decision, retenu, commentaire?.slice(0, 500) ?? null);
    const destinataires = [p.salarieUserId, p.demandeur].filter((u): u is string => Boolean(u) && u !== s.userId);
    await notifier(s.organizationId, [...new Set(destinataires)], {
      categorie: "conge",
      titre: decision === "approuve" ? `Permission accordée : ${p.numero}` : `Permission refusée : ${p.numero}`,
      corps: decision === "approuve" ? `${TRAITEMENTS_PERMISSION[retenu!]}.${commentaire?.trim() ? ` ${commentaire.trim()}` : ""}` : commentaire?.trim() || null,
      lien: "/presences/permissions",
    });
    revalider();
    return { ok: true, message: decision === "approuve" ? `${p.numero} accordée à ${p.nom}.` : `${p.numero} refusée.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

export async function annulerPermission(id: string): Promise<Resultat> {
  const s = await exigerEntreprise();
  const responsable = await peut("conges.valider");
  if (!responsable) {
    const refus = await refusDroit("conges.demander");
    if (refus) return { ok: false, message: refus.erreur };
  }
  if (!UUID.test(id)) return { ok: false, message: "Demande introuvable." };
  try {
    const { numero } = await annulerPermissionPour(s.organizationId, s.userId, id, responsable, await aujourdhuiDe(s.organizationId));
    revalider();
    return { ok: true, message: `${numero} annulée.` };
  } catch (e) {
    return { ok: false, message: lisible(e) };
  }
}

/** URL signée du justificatif d'une permission : le salarié concerné ou un responsable. */
export async function ouvrirJustificatifPermission(id: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const s = await exigerEntreprise();
  if (!UUID.test(id)) return { ok: false, message: "Demande introuvable." };
  const [p] = await db
    .select({ justificatif: demandesPermission.justificatif, salarieUserId: employees.userId })
    .from(demandesPermission)
    .innerJoin(employees, eq(employees.id, demandesPermission.employeeId))
    .where(and(eq(demandesPermission.id, id), eq(demandesPermission.organizationId, s.organizationId)));
  if (!p?.justificatif) return { ok: false, message: "Aucun justificatif joint." };
  if (p.salarieUserId !== s.userId && !(await peut("conges.valider"))) return { ok: false, message: "Ce justificatif ne vous est pas destiné." };
  const url = await urlSignee(p.justificatif);
  return url ? { ok: true, url } : { ok: false, message: "Le dépôt de fichiers ne répond pas." };
}
