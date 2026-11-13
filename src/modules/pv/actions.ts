"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";
import { utilisateursAyantDroit } from "@/lib/droits/destinataires";
import { notifier } from "@/modules/communication/notifications";

import {
  accuserLectureDans,
  actionEnTacheDans,
  creerPvDans,
  enregistrerPvDans,
  publierPvDans,
  relancerPvDans,
  renvoyerPvDans,
  reviserPvDans,
  soumettrePvDans,
  supprimerPvDans,
  type ActeurPv,
} from "./donnees";
import { referencePv, TYPES_PV } from "./regles";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

async function acteur(): Promise<{ organizationId: string; acteur: ActeurPv }> {
  const session = await exigerEntreprise();
  return { organizationId: session.organizationId, acteur: { userId: session.userId, valideur: await peut("pv.valider") } };
}

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Procès-verbaux : opération refusée", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function rafraichir(pvId?: string) {
  revalidatePath("/pv", "layout");
  if (pvId) revalidatePath(`/imprimer/pv/${pvId}`);
}

const schemaNouveau = z.object({
  type: z.enum(TYPES_PV),
  objet: z.string().max(400),
  dateSeance: z.string().regex(DATE_ISO, "Indiquez la date de la séance."),
  lieu: z.string().max(200).optional(),
  reunionId: z.string().regex(UUID).optional(),
});

/** Ouvre un brouillon et y mène. */
export async function creerPv(donnees: FormData): Promise<Resultat> {
  const refus = await refusDroit("pv.rediger");
  if (refus) return { ok: false, message: refus.erreur };
  const texte = (c: string) => {
    const v = donnees.get(c);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const analyse = schemaNouveau.safeParse({
    type: donnees.get("type") ?? "reunion",
    objet: texte("objet") ?? "",
    dateSeance: texte("dateSeance") ?? "",
    lieu: texte("lieu"),
    reunionId: texte("reunionId"),
  });
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  const { organizationId, acteur: qui } = await acteur();
  let id: string;
  try {
    ({ id } = await db.transaction((tx) => creerPvDans(tx, organizationId, analyse.data, qui)));
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
  rafraichir();
  redirect(`/pv/${id}`);
}

const schemaBrouillon = z.object({
  type: z.enum(TYPES_PV),
  objet: z.string().max(400),
  dateSeance: z.string().regex(DATE_ISO, "Indiquez la date de la séance."),
  lieu: z.string().max(200).nullable(),
  participants: z.array(z.unknown()).max(500),
  points: z.array(z.unknown()).max(200),
  conclusion: z.string().max(10_000).nullable(),
  diffusion: z.unknown(),
  accuseRequis: z.boolean(),
  confidentiel: z.boolean(),
  actions: z
    .array(
      z.object({
        id: z.string().regex(UUID).nullable().optional(),
        libelle: z.string().max(600),
        responsableEmployeId: z.string().regex(UUID).nullable().optional(),
        echeance: z.string().regex(DATE_ISO).nullable().optional(),
      }),
    )
    .max(200),
});

export type SaisiePv = z.input<typeof schemaBrouillon>;

export async function enregistrerPv(pvId: string, saisie: SaisiePv): Promise<Resultat> {
  const refus = await refusDroit("pv.rediger");
  if (refus) return { ok: false, message: refus.erreur };
  const analyse = schemaBrouillon.safeParse(saisie);
  if (!UUID.test(pvId) || !analyse.success) return { ok: false, message: analyse.success ? "Procès-verbal introuvable." : analyse.error.issues[0].message };
  const { organizationId, acteur: qui } = await acteur();
  try {
    await db.transaction((tx) => enregistrerPvDans(tx, organizationId, pvId, analyse.data, qui));
    rafraichir(pvId);
    return { ok: true, message: "Brouillon enregistré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Enregistre puis soumet à la direction, qui en est prévenue. */
export async function soumettrePv(pvId: string, saisie: SaisiePv): Promise<Resultat> {
  const enregistre = await enregistrerPv(pvId, saisie);
  if (!enregistre.ok) return enregistre;
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { objet } = await db.transaction((tx) => soumettrePvDans(tx, organizationId, pvId, qui));
    rafraichir(pvId);
    const direction = (await utilisateursAyantDroit(organizationId, "pv.valider")).filter((u) => u !== qui.userId);
    await notifier(organizationId, direction, {
      categorie: "pv",
      titre: `Procès-verbal à valider : ${objet}`,
      corps: "Relisez-le, puis publiez-le ou renvoyez-le avec une remarque.",
      lien: `/pv/${pvId}`,
    });
    return { ok: true, message: "Soumis à la direction pour validation." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function renvoyerPv(pvId: string, remarque: string | null): Promise<Resultat> {
  if (!UUID.test(pvId)) return { ok: false, message: "Procès-verbal introuvable." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { redacteur, objet } = await db.transaction((tx) => renvoyerPvDans(tx, organizationId, pvId, typeof remarque === "string" ? remarque : null, qui));
    rafraichir(pvId);
    if (redacteur !== qui.userId) {
      await notifier(organizationId, [redacteur], {
        categorie: "pv",
        titre: `Procès-verbal à reprendre : ${objet}`,
        corps: remarque?.trim().slice(0, 200) || null,
        lien: `/pv/${pvId}`,
      });
    }
    return { ok: true, message: redacteur === qui.userId ? "Repris en brouillon." : "Renvoyé au rédacteur avec votre remarque." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Publie (direction) : numéro, texte figé, diffusion et cloche des destinataires. */
export async function publierPv(pvId: string, saisie?: SaisiePv): Promise<Resultat> {
  const refus = await refusDroit("pv.valider");
  if (refus) return { ok: false, message: refus.erreur };
  if (saisie) {
    const enregistre = await enregistrerPv(pvId, saisie);
    if (!enregistre.ok) return enregistre;
  }
  const { organizationId, acteur: qui } = await acteur();
  try {
    const r = await db.transaction((tx) => publierPvDans(tx, organizationId, pvId, qui));
    rafraichir(pvId);
    const reference = referencePv(r.numero, r.revision);
    await notifier(organizationId, r.destinataires, {
      categorie: "pv",
      titre: `${r.revision > 1 ? "Nouvelle version — " : ""}${reference} : ${r.objet}`,
      corps: r.accuseRequis ? "À lire, puis confirmez « J'ai pris connaissance »." : "Diffusé à votre attention.",
      lien: `/pv/${pvId}`,
    });
    if (r.redacteur !== qui.userId) {
      await notifier(organizationId, [r.redacteur], { categorie: "pv", titre: `Votre procès-verbal est publié : ${reference}`, corps: r.objet, lien: `/pv/${pvId}` });
    }
    return { ok: true, message: `${reference} publié et diffusé à ${r.destinataires.length} personne${r.destinataires.length > 1 ? "s" : ""}.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function reviserPv(pvId: string): Promise<Resultat> {
  if (!UUID.test(pvId)) return { ok: false, message: "Procès-verbal introuvable." };
  const { organizationId, acteur: qui } = await acteur();
  let id: string;
  try {
    ({ id } = await db.transaction((tx) => reviserPvDans(tx, organizationId, pvId, qui)));
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
  rafraichir();
  redirect(`/pv/${id}`);
}

export async function supprimerPv(pvId: string): Promise<Resultat> {
  if (!UUID.test(pvId)) return { ok: false, message: "Procès-verbal introuvable." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    await db.transaction((tx) => supprimerPvDans(tx, organizationId, pvId, qui));
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
  rafraichir();
  redirect("/pv");
}

export async function accuserLecture(pvId: string): Promise<Resultat> {
  const refus = await refusDroit("pv.consulter");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(pvId)) return { ok: false, message: "Procès-verbal introuvable." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const { deja } = await db.transaction((tx) => accuserLectureDans(tx, organizationId, pvId, qui.userId));
    rafraichir(pvId);
    return { ok: true, message: deja ? "Vous en aviez déjà pris connaissance." : "Prise de connaissance enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function relancerPv(pvId: string): Promise<Resultat> {
  if (!UUID.test(pvId)) return { ok: false, message: "Procès-verbal introuvable." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const r = await db.transaction((tx) => relancerPvDans(tx, organizationId, pvId, qui));
    await notifier(organizationId, r.aRelancer, {
      categorie: "pv",
      titre: `Rappel : ${r.numero} à lire`,
      corps: `${r.objet} — confirmez « J'ai pris connaissance ».`,
      lien: `/pv/${pvId}`,
    });
    rafraichir(pvId);
    return { ok: true, message: r.aRelancer.length ? `${r.aRelancer.length} relancé${r.aRelancer.length > 1 ? "s" : ""}.` : "Tout le monde a pris connaissance." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Change une action en tâche confiée à son responsable, qui en est prévenu. */
export async function creerTacheAction(actionId: string): Promise<Resultat> {
  if (!UUID.test(actionId)) return { ok: false, message: "Action introuvable." };
  if (await refusDroit("taches.executer")) return { ok: false, message: "Votre rôle ne permet pas de créer des tâches." };
  const { organizationId, acteur: qui } = await acteur();
  try {
    const r = await db.transaction((tx) => actionEnTacheDans(tx, organizationId, actionId, qui));
    rafraichir();
    revalidatePath("/taches", "layout");
    if (r.assigneeUserId !== qui.userId) {
      await notifier(organizationId, [r.assigneeUserId], { categorie: "tache", titre: `Nouvelle tâche ${r.numeroTache} : ${r.libelle}`, corps: "Décidée dans un procès-verbal.", lien: "/taches" });
    }
    return { ok: true, message: `Tâche ${r.numeroTache} créée.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

