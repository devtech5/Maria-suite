"use server";

import { revalidatePath } from "next/cache";

import { accesProspection } from "./acces";
import {
  ajouterProspectPour,
  annulerActionPour,
  changerStatutPlanPour,
  changerStatutProspectPour,
  convertirProspectPour,
  creerPlanPour,
  planDe,
  planDeLAction,
  planDuProspect,
  planifierActionPour,
  realiserActionPour,
} from "./requetes";
import type { PlanProspection } from "./schema";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texte = (d: FormData, c: string): string => {
  const v = d.get(c);
  return typeof v === "string" ? v.trim() : "";
};

/** Un entier saisi au clavier : « 1 500 000 » recopié d'un tableur passe. Vide = 0 ; illisible = -1, refusé plus loin. */
const nombre = (d: FormData, c: string): number => {
  const brut = texte(d, c).replace(/[\s  ]/g, "");
  if (brut === "") return 0;
  return /^\d+$/.test(brut) ? Number(brut) : -1;
};

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Prospection", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function rafraichir() {
  revalidatePath("/commercial/prospection", "layout");
}

type Acces = Awaited<ReturnType<typeof accesProspection>>;

/** Exécute une opération sur un plan que la personne peut faire avancer. */
async function surPlan(plan: PlanProspection | null, travail: (a: Acces) => Promise<string>): Promise<Resultat> {
  const a = await accesProspection();
  if (!plan || !a.voit(plan)) return { ok: false, message: "Plan introuvable." };
  if (!a.gere(plan)) return { ok: false, message: "Ce plan est clos : rouvrez-le pour le modifier." };
  try {
    const message = await travail(a);
    rafraichir();
    return { ok: true, message };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function creerPlan(d: FormData): Promise<Resultat> {
  const a = await accesProspection();
  if (!a.planifier) return { ok: false, message: "Vous n'élaborez pas de plan de prospection." };
  const choisi = texte(d, "commercialId");
  // Un commercial n'établit que ses propres plans ; la supervision, pour qui elle veut.
  const commercialId = a.superviser && UUID.test(choisi) ? choisi : a.monCommercialId;
  if (!commercialId) return { ok: false, message: "Votre compte n'est lié à aucune fiche commercial : demandez à la direction de vous enregistrer dans « Commerciaux »." };
  try {
    const { id, numero } = await creerPlanPour(a.session.organizationId, a.session.userId, {
      commercialId,
      titre: texte(d, "titre"),
      debut: texte(d, "debut"),
      fin: texte(d, "fin"),
      zone: texte(d, "zone"),
      cibles: texte(d, "cibles"),
      objectifContacts: nombre(d, "objectifContacts"),
      objectifClients: nombre(d, "objectifClients"),
      objectifCa: nombre(d, "objectifCa"),
      notes: texte(d, "notes"),
    });
    rafraichir();
    return { ok: true, message: `Plan ${numero} créé.`, id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function changerStatutPlan(planId: string, statut: "ouvert" | "clos"): Promise<Resultat> {
  const a = await accesProspection();
  if (!UUID.test(planId) || (statut !== "ouvert" && statut !== "clos")) return { ok: false, message: "Demande invalide." };
  const plan = await planDe(a.session.organizationId, planId);
  if (!plan || !a.voit(plan)) return { ok: false, message: "Plan introuvable." };
  try {
    await changerStatutPlanPour(a.session.organizationId, a.session.userId, planId, statut);
    rafraichir();
    return { ok: true, message: statut === "clos" ? "Plan clos." : "Plan rouvert." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function ajouterProspect(planId: string, d: FormData): Promise<Resultat> {
  const a = await accesProspection();
  const plan = UUID.test(planId) ? await planDe(a.session.organizationId, planId) : null;
  return surPlan(plan, async (acces) => {
    await ajouterProspectPour(acces.session.organizationId, acces.session.userId, planId, {
      nom: texte(d, "nom"),
      nature: texte(d, "nature"),
      contact: texte(d, "contact"),
      fonction: texte(d, "fonction"),
      telephone: texte(d, "telephone"),
      email: texte(d, "email"),
      ville: texte(d, "ville"),
      secteur: texte(d, "secteur"),
      besoin: texte(d, "besoin"),
      potentiel: nombre(d, "potentiel"),
    });
    return `${texte(d, "nom")} ajouté au plan.`;
  });
}

export async function changerStatutProspect(prospectId: string, d: FormData): Promise<Resultat> {
  const a = await accesProspection();
  const plan = UUID.test(prospectId) ? await planDuProspect(a.session.organizationId, prospectId) : null;
  return surPlan(plan, async (acces) => {
    await changerStatutProspectPour(acces.session.organizationId, acces.session.userId, prospectId, texte(d, "statut"), texte(d, "motifPerte"));
    return "Statut enregistré.";
  });
}

export async function planifierAction(prospectId: string, d: FormData): Promise<Resultat> {
  const a = await accesProspection();
  const plan = UUID.test(prospectId) ? await planDuProspect(a.session.organizationId, prospectId) : null;
  return surPlan(plan, async (acces) => {
    await planifierActionPour(acces.session.organizationId, acces.session.userId, prospectId, {
      datePrevue: texte(d, "datePrevue"),
      heure: texte(d, "heure"),
      canal: texte(d, "canal"),
      objet: texte(d, "objet"),
    });
    return "Action planifiée.";
  });
}

export async function realiserAction(actionId: string, d: FormData): Promise<Resultat> {
  const a = await accesProspection();
  const plan = UUID.test(actionId) ? await planDeLAction(a.session.organizationId, actionId) : null;
  return surPlan(plan, async (acces) => {
    const dateSuite = texte(d, "suiteDate");
    await realiserActionPour(acces.session.organizationId, acces.session.userId, actionId, {
      compteRendu: texte(d, "compteRendu"),
      statutProspect: texte(d, "statutProspect") || null,
      motifPerte: texte(d, "motifPerte"),
      suite: dateSuite ? { datePrevue: dateSuite, heure: texte(d, "suiteHeure"), canal: texte(d, "suiteCanal"), objet: texte(d, "suiteObjet") } : null,
    });
    return dateSuite ? "Compte rendu enregistré, action suivante planifiée." : "Compte rendu enregistré.";
  });
}

export async function annulerAction(actionId: string): Promise<Resultat> {
  const a = await accesProspection();
  const plan = UUID.test(actionId) ? await planDeLAction(a.session.organizationId, actionId) : null;
  return surPlan(plan, async (acces) => {
    await annulerActionPour(acces.session.organizationId, acces.session.userId, actionId);
    return "Action annulée.";
  });
}

export async function convertirProspect(prospectId: string, d: FormData): Promise<Resultat> {
  const a = await accesProspection();
  if (!a.enregistrerClients) return { ok: false, message: "Enregistrer un client demande le droit « Gérer les tiers »." };
  const plan = UUID.test(prospectId) ? await planDuProspect(a.session.organizationId, prospectId) : null;
  const existant = texte(d, "tiersId");
  return surPlan(plan, async (acces) => {
    const { code } = await convertirProspectPour(acces.session.organizationId, acces.session.userId, prospectId, UUID.test(existant) ? existant : null);
    revalidatePath("/commercial");
    return `Devenu client : fiche ${code}.`;
  });
}
