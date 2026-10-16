import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { envoyerCourriel } from "@/lib/courriel";
import { newId } from "@/lib/ids";
import { signerLien, urlAbsolue } from "@/lib/liens-publics";
import { motsRecherche, type FiltresListe } from "@/lib/recherche";
import { dansPeriodeSql, motsDans } from "@/lib/recherche-sql";
import { envoyerWhatsApp } from "@/lib/whatsapp";

import { CANAUX, normaliserDestinataire } from "./calcul";
import { desinscriptions, envois, type CanalEnvoi, type Envoi } from "./schema";

export interface Message {
  canal: CanalEnvoi;
  /** Adresse e-mail ou numéro, tels que saisis : normalisés ici. */
  destinataire: string;
  nom?: string | null;
  tiersId?: string | null;
  employeId?: string | null;
  objet?: string | null;
  corps: string;
  origine: string;
  campagneId?: string | null;
  /** Nom de l'entreprise, en signature. */
  entreprise: string;
}

export type ResultatMessage = { statut: "envoye" | "echec" | "ignore"; raison?: string; id: string };

/** Lien de désinscription, valable un an, à poser au pied de chaque e-mail. */
export function lienDesinscription(organizationId: string, canal: CanalEnvoi, adresse: string): string {
  return urlAbsolue(`/desinscription/${signerLien(["desinscription", organizationId, canal, adresse], 365)}`);
}

export async function estDesinscrit(organizationId: string, canal: CanalEnvoi, adresse: string): Promise<boolean> {
  const [ligne] = await db
    .select({ id: desinscriptions.id })
    .from(desinscriptions)
    .where(and(eq(desinscriptions.organizationId, organizationId), eq(desinscriptions.canal, canal), eq(desinscriptions.adresse, adresse)))
    .limit(1);
  return Boolean(ligne);
}

export async function desinscrire(organizationId: string, canal: CanalEnvoi, adresse: string, origine: "lien" | "demande"): Promise<void> {
  await db.insert(desinscriptions).values({ id: newId(), organizationId, canal, adresse, origine }).onConflictDoNothing();
}

/**
 * Envoie un message et le trace — réussi, refusé ou retenu.
 *
 * La ligne d'envoi naît AVANT l'appel au fournisseur : si le serveur tombe
 * pendant l'envoi, il reste une trace « en attente » plutôt qu'un silence.
 * Un destinataire désinscrit n'est pas contacté : la ligne le dit (`ignore`).
 */
export async function envoyerMessage(organizationId: string, userId: string | null, m: Message): Promise<ResultatMessage> {
  const id = newId();
  const adresse = normaliserDestinataire(m.canal, m.destinataire);
  const base = {
    id,
    organizationId,
    canal: m.canal,
    destinataire: adresse ?? m.destinataire.trim(),
    nom: m.nom ?? null,
    tiersId: m.tiersId ?? null,
    employeId: m.employeId ?? null,
    objet: m.objet ?? null,
    corps: m.corps,
    origine: m.origine,
    campagneId: m.campagneId ?? null,
    userId,
  };

  if (!adresse) {
    const raison = m.canal === "email" ? "Adresse e-mail invalide." : "Numéro de téléphone invalide.";
    await db.insert(envois).values({ ...base, statut: "ignore", raison });
    return { statut: "ignore", raison, id };
  }
  if (await estDesinscrit(organizationId, m.canal, adresse)) {
    const raison = `Désinscrit des messages par ${CANAUX[m.canal]}.`;
    await db.insert(envois).values({ ...base, statut: "ignore", raison });
    return { statut: "ignore", raison, id };
  }

  await db.insert(envois).values({ ...base, statut: "en_attente" });

  let resultat: { ok: true } | { ok: false; raison: string };
  if (m.canal === "email") {
    const desinscription = lienDesinscription(organizationId, "email", adresse);
    const texte = `${m.corps}\n\n—\n${m.entreprise}\nNe plus recevoir nos messages : ${desinscription}`;
    resultat = await envoyerCourriel({
      a: adresse,
      sujet: m.objet?.trim() || `Message de ${m.entreprise}`,
      texte,
      html: versHtml(m.corps, m.entreprise, desinscription),
    });
  } else {
    resultat = await envoyerWhatsApp(adresse, `${m.corps}\n\n— ${m.entreprise}`);
  }

  await db
    .update(envois)
    .set(resultat.ok ? { statut: "envoye", envoyeLe: new Date(), updatedAt: new Date() } : { statut: "echec", raison: resultat.raison, updatedAt: new Date() })
    .where(eq(envois.id, id));
  return resultat.ok ? { statut: "envoye", id } : { statut: "echec", raison: resultat.raison, id };
}

function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Mise en forme minimale : paragraphes, liens cliquables, pied avec désinscription. */
function versHtml(corps: string, entreprise: string, desinscription: string): string {
  const paragraphes = echapper(corps)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">${paragraphes}<p style="margin:24px 0 0;color:#555">— ${echapper(entreprise)}</p><p style="margin:16px 0 0;font-size:12px;color:#888"><a href="${desinscription}" style="color:#888">Ne plus recevoir nos messages</a></p></div>`;
}

export async function listerEnvois(organizationId: string, limite = 200, filtres?: FiltresListe): Promise<Envoi[]> {
  return db
    .select()
    .from(envois)
    .where(
      and(
        eq(envois.organizationId, organizationId),
        // Filtrés en base : sinon la recherche ne verrait que les derniers envois.
        // La date est celle du journal, l'envoi tenté : un échec n'a pas d'`envoye_le`.
        filtres && motsDans([envois.destinataire, envois.nom, envois.objet, envois.corps, envois.origine, envois.raison], motsRecherche(filtres.q)),
        filtres && dansPeriodeSql(envois.createdAt, filtres.periode),
      ),
    )
    .orderBy(desc(envois.createdAt))
    .limit(limite);
}
