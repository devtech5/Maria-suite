"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { peut, refusDroit } from "@/lib/droits/garde";
import { notifier, notifierDetenteurs } from "@/modules/communication/notifications";
import { servicesActifs } from "@/modules/personnes/referentiel-services";

import { lireLignes } from "./commandes-internes";
import { annulerCommandeInterneDans, deciderCommandeInterneDans, demanderCommandeInterneDans } from "./creation-commandes-internes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIEN = "/tresorerie/caisse/commandes";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

type Contexte = { organizationId: string; userId: string; estProprietaire: boolean };

async function operer(droit: Droit, travail: (ctx: Contexte) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail({ organizationId: session.organizationId, userId: session.userId, estProprietaire: session.estProprietaire });
    if (r.ok) revalidatePath(LIEN);
    return r;
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Bon de commande interne : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

const texte = (d: FormData, champ: string) => {
  const v = d.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

const schemaEntete = z.object({
  objet: z.string().trim().min(3, "Indiquez l'objet du bon.").max(200, "Objet trop long : 200 caractères au plus."),
  service: z.string().trim().max(120, "Service trop long.").optional(),
  lieuLivraison: z.string().trim().max(200, "Lieu de livraison trop long : 200 caractères au plus.").optional(),
  notes: z.string().trim().max(1000, "Observations trop longues : 1 000 caractères au plus.").optional(),
});

/** « e:<id> » un collaborateur du Personnel, « u:<id> » un compte sans fiche. Absent : le nom saisi ; illisible : null. */
function lireFiche(v: string | undefined): { employeId: string } | { userId: string } | null | undefined {
  if (!v) return undefined;
  const id = v.slice(2);
  if (v[1] !== ":" || !UUID.test(id)) return null;
  if (v[0] === "e") return { employeId: id };
  if (v[0] === "u") return { userId: id };
  return null;
}

const fmtF = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

export async function demanderCommandeInterne(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.bon.demander", async ({ organizationId, userId }) => {
    const entete = schemaEntete.safeParse({
      objet: texte(donnees, "objet") ?? "",
      service: texte(donnees, "service"),
      lieuLivraison: texte(donnees, "lieuLivraison"),
      notes: texte(donnees, "notes"),
    });
    if (!entete.success) return { ok: false, message: entete.error.issues[0].message };
    if (entete.data.service) {
      const services = await servicesActifs(organizationId);
      if (services.length > 0 && !services.includes(entete.data.service)) return { ok: false, message: "Choisissez un service de la liste." };
    }
    let brut: unknown;
    try {
      brut = JSON.parse(texte(donnees, "lignes") ?? "[]");
    } catch {
      return { ok: false, message: "Lignes illisibles." };
    }
    const lignes = lireLignes(brut);
    if (typeof lignes === "string") return { ok: false, message: lignes };
    const fiche = lireFiche(texte(donnees, "beneficiaireRef"));
    if (fiche === null) return { ok: false, message: "Bénéficiaire inconnu." };

    const { numero, total, beneficiaire } = await db.transaction((tx) =>
      demanderCommandeInterneDans(tx, organizationId, { ...entete.data, lignes, fiche, beneficiaire: texte(donnees, "beneficiaire") }, userId),
    );
    await notifierDetenteurs(
      organizationId,
      "tresorerie.bon.approuver",
      { categorie: "bon", titre: `Bon de commande interne ${numero} à approuver`, corps: `${entete.data.objet} — ${fmtF(total)} — pour ${beneficiaire}`, lien: LIEN },
      userId,
    );
    return { ok: true, message: `Bon ${numero} demandé : il attend une approbation.` };
  });
}

export async function deciderCommandeInterne(id: string, approuve: boolean, motif?: string): Promise<Resultat> {
  return operer("tresorerie.bon.approuver", async ({ organizationId, userId, estProprietaire }) => {
    if (!UUID.test(id)) return { ok: false, message: "Bon introuvable." };
    const raison = motif?.trim() ?? "";
    if (!approuve && raison.length < 3) return { ok: false, message: "Indiquez le motif du refus." };
    const { numero, demandeParUserId } = await db.transaction((tx) =>
      deciderCommandeInterneDans(tx, organizationId, id, approuve ? { approuve: true } : { approuve: false, motif: raison.slice(0, 300) }, { userId, estProprietaire }),
    );
    if (demandeParUserId !== userId) {
      await notifier(organizationId, [demandeParUserId], {
        categorie: "bon",
        titre: approuve ? `Bon de commande interne ${numero} approuvé` : `Bon de commande interne ${numero} refusé`,
        corps: approuve ? "Votre demande est approuvée." : `Motif : ${raison.slice(0, 300)}`,
        lien: LIEN,
      });
    }
    return { ok: true, message: approuve ? `${numero} approuvé.` : `${numero} refusé.` };
  });
}

export async function annulerCommandeInterne(id: string): Promise<Resultat> {
  return operer("tresorerie.bon.demander", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Bon introuvable." };
    const approuve = await peut("tresorerie.bon.approuver");
    const { numero } = await db.transaction((tx) => annulerCommandeInterneDans(tx, organizationId, id, { userId, approuve }));
    return { ok: true, message: `${numero} annulé.` };
  });
}
