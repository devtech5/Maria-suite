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
import {
  annulerCommandeInterneDans,
  deciderCommandeInterneDans,
  demanderCommandeInterneDans,
  modifierCommandeInterneDans,
  type NouvelleCommandeInterne,
} from "./creation-commandes-internes";

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

/** Relit l'en-tête, les lignes et le bénéficiaire saisis : la commande, ou le refus lisible. */
async function lireSaisie(donnees: FormData, organizationId: string): Promise<NouvelleCommandeInterne | string> {
  const entete = schemaEntete.safeParse({
    objet: texte(donnees, "objet") ?? "",
    service: texte(donnees, "service"),
    notes: texte(donnees, "notes"),
  });
  if (!entete.success) return entete.error.issues[0].message;
  if (entete.data.service) {
    const services = await servicesActifs(organizationId);
    if (services.length > 0 && !services.includes(entete.data.service)) return "Choisissez un service de la liste.";
  }
  let brut: unknown;
  try {
    brut = JSON.parse(texte(donnees, "lignes") ?? "[]");
  } catch {
    return "Lignes illisibles.";
  }
  const lignes = lireLignes(brut);
  if (typeof lignes === "string") return lignes;
  const fiche = lireFiche(texte(donnees, "beneficiaireRef"));
  if (fiche === null) return "Bénéficiaire inconnu.";
  return { ...entete.data, lignes, fiche, beneficiaire: texte(donnees, "beneficiaire") };
}

export async function demanderCommandeInterne(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.bon.demander", async ({ organizationId, userId }) => {
    const saisie = await lireSaisie(donnees, organizationId);
    if (typeof saisie === "string") return { ok: false, message: saisie };
    const { numero, total, beneficiaire } = await db.transaction((tx) => demanderCommandeInterneDans(tx, organizationId, saisie, userId));
    await notifierDetenteurs(
      organizationId,
      "tresorerie.bon.approuver",
      { categorie: "bon", titre: `Bon de commande interne ${numero} à approuver`, corps: `${saisie.objet} — ${fmtF(total)} — pour ${beneficiaire}`, lien: LIEN },
      userId,
    );
    return { ok: true, message: `Bon ${numero} demandé : il attend une approbation.` };
  });
}

export async function modifierCommandeInterne(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.bon.demander", async ({ organizationId, userId }) => {
    const id = texte(donnees, "id") ?? "";
    if (!UUID.test(id)) return { ok: false, message: "Bon introuvable." };
    const saisie = await lireSaisie(donnees, organizationId);
    if (typeof saisie === "string") return { ok: false, message: saisie };
    const approuve = await peut("tresorerie.bon.approuver");
    const { numero, total, beneficiaire, approbationRetiree } = await db.transaction((tx) => modifierCommandeInterneDans(tx, organizationId, id, saisie, { userId, approuve }));
    await notifierDetenteurs(
      organizationId,
      "tresorerie.bon.approuver",
      {
        categorie: "bon",
        titre: approbationRetiree ? `Bon de commande interne ${numero} modifié : à approuver de nouveau` : `Bon de commande interne ${numero} modifié`,
        corps: `${saisie.objet} — ${fmtF(total)} — pour ${beneficiaire}`,
        lien: LIEN,
      },
      userId,
    );
    return { ok: true, message: approbationRetiree ? `${numero} modifié : il attend de nouveau une approbation.` : `${numero} modifié.` };
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
