"use server";

import { revalidatePath } from "next/cache";

import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { refusDroit } from "@/lib/droits/garde";
import { stockageConfigure, urlSignee } from "@/lib/stockage";

import { annulerIntervenantPour, cheminDecharge, confierIntervenantPour, fixerBudgetPour, payerIntervenantPour, type Decharge } from "./intervenants";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const TAILLE_MAX = 10 * 1024 * 1024;

const texte = (d: FormData, c: string): string => {
  const v = d.get(c);
  return typeof v === "string" ? v.trim() : "";
};

/** Un entier de francs saisi au clavier : « 1 500 000 » passe. Illisible : -1, refusé plus loin. */
const nombre = (d: FormData, c: string): number => {
  const brut = texte(d, c).replace(/[\s  ]/g, "");
  return /^\d+$/.test(brut) ? Number(brut) : -1;
};

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 260) return message;
  console.error("Intervenants de mission", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

async function operer(droit: Droit, travail: (organizationId: string, userId: string) => Promise<string>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const message = await travail(session.organizationId, session.userId);
    revalidatePath("/missions", "layout");
    return { ok: true, message };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

const ouverte = (id: string) => {
  if (!UUID.test(id)) throw new Error("Introuvable.");
};

/** Planifier la mission, c'est aussi la budgétiser : le geste de qui la gère. */
export async function fixerBudget(missionId: string, d: FormData): Promise<Resultat> {
  return operer("missions.mission.gerer", async (org, user) => {
    ouverte(missionId);
    await fixerBudgetPour(org, user, missionId, nombre(d, "budget"));
    return "Budget enregistré.";
  });
}

export async function confierIntervenant(missionId: string, d: FormData): Promise<Resultat> {
  return operer("missions.mission.gerer", async (org, user) => {
    ouverte(missionId);
    // « qui » vaut `w:<intervenant>`, `p:<prestataire>`, ou `libre` : alors le nom est saisi.
    const qui = texte(d, "qui");
    await confierIntervenantPour(org, user, missionId, {
      tache: texte(d, "tache"),
      nature: texte(d, "nature"),
      nom: texte(d, "nom"),
      telephone: texte(d, "telephone"),
      workerId: qui.startsWith("w:") && UUID.test(qui.slice(2)) ? qui.slice(2) : null,
      prestataireId: qui.startsWith("p:") && UUID.test(qui.slice(2)) ? qui.slice(2) : null,
      montantConvenu: nombre(d, "montant"),
    });
    return "Tâche confiée.";
  });
}

/** La décharge : photo prise à la caméra, ou fichier. Contrôlée avant tout dépôt. */
async function lireDecharge(d: FormData): Promise<Decharge | null | string> {
  for (const champ of ["decharge_photo", "decharge"]) {
    const f = d.get(champ);
    if (!(f instanceof File) || f.size === 0) continue;
    if (!TYPES.has(f.type)) return `« ${f.name} » : format non accepté, photo ou PDF.`;
    if (f.size > TAILLE_MAX) return `« ${f.name} » : 10 Mo au plus.`;
    if (!stockageConfigure()) return "Le dépôt de fichiers n'est pas configuré : la décharge ne peut pas être enregistrée.";
    return { nom: f.name, typeMime: f.type, contenu: await f.arrayBuffer() };
  }
  return null;
}

/** Payer sur place : le geste de qui est sur le terrain — et la décharge est la preuve. */
export async function payerIntervenant(id: string, d: FormData): Promise<Resultat> {
  return operer("missions.terrain.saisir", async (org, user) => {
    ouverte(id);
    const decharge = await lireDecharge(d);
    if (typeof decharge === "string") throw new Error(decharge);
    await payerIntervenantPour(org, user, id, { payeLe: texte(d, "payeLe"), moyen: texte(d, "moyen"), recuPar: texte(d, "recuPar"), decharge });
    return "Paiement enregistré, décharge jointe.";
  });
}

export async function annulerIntervenant(id: string, motif: string): Promise<Resultat> {
  return operer("missions.mission.gerer", async (org, user) => {
    ouverte(id);
    await annulerIntervenantPour(org, user, id, motif);
    return "Tâche annulée.";
  });
}

/** URL signée de la décharge, demandée au clic par la visionneuse. */
export async function ouvrirDecharge(id: string): Promise<string | null> {
  const session = await exigerEntreprise();
  if (!UUID.test(id) || (await refusDroit("missions.consulter"))) return null;
  const chemin = await cheminDecharge(session.organizationId, id);
  return chemin ? urlSignee(chemin, 120) : null;
}
