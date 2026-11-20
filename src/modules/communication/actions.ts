"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise, session as lireSessionCourante } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";
import { fmt, fmtDateIso } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";
import { signerLien, urlAbsolue, verifierLien } from "@/lib/liens-publics";
import { resteDu } from "@/modules/facturation/calcul";
import { listerPieces } from "@/modules/facturation/requetes";
import { totalNonLus } from "@/modules/messagerie/conversations";
import { contactsTiers, tiers } from "@/modules/tiers/schema";

import { normaliserDestinataire } from "./calcul";
import { apercu, creerCampagnePour, destinataires, envoyerCampagnePour, supprimerBrouillonPour } from "./campagnes";
import { desinscrire, envoyerMessage } from "./envoi";
import { marquerLues, nombreNonLues, notificationsDe } from "./notifications";

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------ notifications

export interface NotificationVue {
  id: string;
  categorie: string;
  titre: string;
  corps: string | null;
  lien: string | null;
  lue: boolean;
  le: string;
}

/** La cloche : non lues et dernières notifications de la personne connectée. */
export async function etatCloche(): Promise<{ nonLues: number; dernieres: NotificationVue[]; messages: number | null }> {
  // Interrogée en tâche de fond : une session verrouillée ne redirige pas — la
  // page conservée sous le voile serait perdue — et ne livre rien non plus.
  const session = await lireSessionCourante();
  if (!session?.organizationId || session.verrouillee) return { nonLues: 0, dernieres: [], messages: null };
  const messagerie = moduleOuvert("messagerie") && (await peut("messagerie.utiliser"));
  const [nonLues, dernieres, messages] = await Promise.all([
    nombreNonLues(session.organizationId, session.userId),
    notificationsDe(session.organizationId, session.userId, 15),
    messagerie ? totalNonLus(session.organizationId, session.userId) : Promise.resolve(null),
  ]);
  return {
    nonLues,
    messages,
    dernieres: dernieres.map((n) => ({
      id: n.id,
      categorie: n.categorie,
      titre: n.titre,
      corps: n.corps,
      lien: n.lien,
      lue: n.lueLe !== null,
      le: n.createdAt.toISOString(),
    })),
  };
}

export async function marquerNotificationsLues(ids?: string[]): Promise<void> {
  const session = await exigerEntreprise();
  await marquerLues(session.organizationId, session.userId, ids?.filter((id) => UUID.test(id)));
  revalidatePath("/notifications");
}

// ------------------------------------------------------- pièces aux clients

const TITRE = { devis: "devis", facture: "facture", avoir: "avoir" } as const;

/**
 * Envoie une pièce au client, ou relance une facture échue.
 *
 * Le destinataire est le contact de la pièce s'il a une adresse sur ce canal,
 * sinon le client lui-même — sauf adresse saisie à la main. Le message porte
 * un lien signé, valable soixante jours, qui ouvre la pièce sans compte.
 */
export async function envoyerPiece(pieceId: string, canal: "email" | "whatsapp", mode: "envoi" | "relance", adresseSaisie?: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("communication.client.notifier");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(pieceId)) return { ok: false, message: "Pièce inconnue." };

  const piece = (await listerPieces(session.organizationId)).find((p) => p.id === pieceId);
  if (!piece || !piece.numero) return { ok: false, message: "Seule une pièce émise s'envoie." };
  if (mode === "relance" && !piece.enRetard) return { ok: false, message: "Cette facture n'est pas en retard." };

  const [client] = await db
    .select({ nom: tiers.nom, email: tiers.email, telephone: tiers.telephone })
    .from(tiers)
    .where(and(eq(tiers.id, piece.clientId), eq(tiers.organizationId, session.organizationId), isNull(tiers.deletedAt)));
  const [contact] = piece.contactId
    ? await db
        .select({ nom: contactsTiers.nom, email: contactsTiers.email, telephone: contactsTiers.telephone })
        .from(contactsTiers)
        .where(
          and(
            eq(contactsTiers.id, piece.contactId),
            eq(contactsTiers.organizationId, session.organizationId),
            isNull(contactsTiers.deletedAt),
          ),
        )
    : [];

  const champ = canal === "email" ? "email" : "telephone";
  const destinataire = adresseSaisie?.trim() || contact?.[champ] || client?.[champ];
  if (!destinataire) {
    return { ok: false, message: canal === "email" ? "Ni le client ni son contact n'ont d'adresse e-mail : saisissez-en une." : "Ni le client ni son contact n'ont de numéro : saisissez-en un." };
  }

  const identite = await identiteEntreprise(session.organizationId);
  const lien = urlAbsolue(`/consulter/${signerLien(["piece", session.organizationId, piece.id], 60)}`);
  const nom = contact?.nom ?? client?.nom ?? piece.clientNom;
  const reste = resteDu(piece.totalTtc, piece.regle);
  const titre = TITRE[piece.nature];

  const corps =
    mode === "relance"
      ? [
          `Bonjour ${nom},`,
          `Sauf erreur de notre part, la facture ${piece.numero} du ${fmtDateIso(piece.datePiece)}${piece.echeance ? `, échue le ${fmtDateIso(piece.echeance)},` : ""} reste à régler : ${fmt(reste)} FCFA sur ${fmt(piece.totalTtc)} FCFA.`,
          `Si le règlement est déjà parti, merci de ne pas tenir compte de ce message.`,
          `Consulter la facture : ${lien}`,
        ].join("\n\n")
      : [
          `Bonjour ${nom},`,
          `Veuillez trouver votre ${titre} ${piece.numero} du ${fmtDateIso(piece.datePiece)}, d'un montant de ${fmt(piece.totalTtc)} FCFA TTC${piece.nature === "facture" && piece.echeance ? `, à régler avant le ${fmtDateIso(piece.echeance)}` : ""}.`,
          `Consulter et imprimer : ${lien}`,
        ].join("\n\n");

  const r = await envoyerMessage(session.organizationId, session.userId, {
    canal,
    destinataire,
    nom,
    tiersId: piece.clientId,
    objet: mode === "relance" ? `Relance — facture ${piece.numero}` : `${titre[0].toUpperCase()}${titre.slice(1)} ${piece.numero}`,
    corps,
    origine: mode === "relance" ? "relance" : piece.nature,
    entreprise: identite.nom,
  });
  revalidatePath("/communication", "layout");
  if (r.statut === "envoye") return { ok: true, message: `${mode === "relance" ? "Relance envoyée" : "Envoyé"} à ${destinataire}.` };
  return { ok: false, message: r.raison ?? "Envoi impossible." };
}

// ------------------------------------------------------------ désinscription

/** Désinscription depuis le lien d'un e-mail : aucune session, la signature fait foi. */
export async function confirmerDesinscription(jeton: string): Promise<Resultat> {
  const parties = verifierLien(jeton);
  if (!parties || parties[0] !== "desinscription" || parties.length !== 4) return { ok: false, message: "Lien invalide ou expiré." };
  const [, organizationId, canal, adresse] = parties;
  if (canal !== "email" && canal !== "whatsapp") return { ok: false, message: "Lien invalide." };
  await desinscrire(organizationId, canal, adresse, "lien");
  return { ok: true, message: "C'est noté : vous ne recevrez plus nos messages." };
}

const schemaDesinscriptionManuelle = z.object({ canal: z.enum(["email", "whatsapp"]), adresse: z.string().min(3) });

/** Désinscription saisie par l'entreprise : le client l'a demandé au téléphone. */
export async function desinscrireManuellement(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("communication.client.notifier");
  if (refus) return { ok: false, message: refus.erreur };
  const analyse = schemaDesinscriptionManuelle.safeParse({ canal: donnees.get("canal"), adresse: donnees.get("adresse") });
  if (!analyse.success) return { ok: false, message: "Canal ou adresse invalide." };
  const adresse = normaliserDestinataire(analyse.data.canal, analyse.data.adresse);
  if (!adresse) return { ok: false, message: "Adresse ou numéro invalide." };
  await desinscrire(session.organizationId, analyse.data.canal, adresse, "demande");
  revalidatePath("/communication", "layout");
  return { ok: true, message: `${adresse} ne recevra plus de messages par ce canal.` };
}

// ------------------------------------------------------------ messages groupés

const schemaCampagne = z.object({
  titre: z.string().trim().min(3, "Donnez un titre au message.").max(120),
  public: z.enum(["personnel", "clients"]),
  canaux: z.array(z.enum(["email", "whatsapp", "application"])).min(1, "Choisissez au moins un canal."),
  cible: z.string().max(20).nullable(),
  ville: z.string().trim().max(80).nullable(),
  secteur: z.string().trim().max(80).nullable(),
  objet: z.string().trim().max(160).nullable(),
  corps: z.string().trim().min(5, "Écrivez le message.").max(2000, "Message trop long : 2 000 caractères au plus."),
});

function lireCampagne(donnees: FormData) {
  const texte = (champ: string) => {
    const v = donnees.get(champ);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  return schemaCampagne.safeParse({
    titre: texte("titre") ?? "",
    public: texte("public") ?? "personnel",
    canaux: donnees.getAll("canaux").map(String),
    cible: texte("cible"),
    ville: texte("ville"),
    secteur: texte("secteur"),
    objet: texte("objet"),
    corps: texte("corps") ?? "",
  });
}

/** Aperçu du nombre de destinataires joignables, canal par canal, avant tout envoi. */
export async function apercuCampagne(publicVise: "personnel" | "clients", filtre: { cible?: string | null; ville?: string | null; secteur?: string | null }) {
  const session = await exigerEntreprise();
  if (await refusDroit("communication.campagne.gerer")) return null;
  return apercu(await destinataires(session.organizationId, publicVise === "clients" ? "clients" : "personnel", filtre));
}

export async function creerCampagne(donnees: FormData): Promise<Resultat & { id?: string }> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("communication.campagne.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  const analyse = lireCampagne(donnees);
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
  const v = analyse.data;
  if (v.canaux.includes("email") && !v.objet) return { ok: false, message: "Un e-mail a besoin d'un objet." };
  try {
    const id = await creerCampagnePour(session.organizationId, session.userId, {
      titre: v.titre,
      public: v.public,
      canaux: v.canaux,
      filtre: { cible: v.cible, ville: v.ville, secteur: v.secteur },
      objet: v.objet,
      corps: v.corps,
    });
    revalidatePath("/communication", "layout");
    return { ok: true, message: "Brouillon enregistré : vérifiez les destinataires, puis envoyez.", id };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Enregistrement impossible." };
  }
}

export async function envoyerCampagne(campagneId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("communication.campagne.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(campagneId)) return { ok: false, message: "Message inconnu." };
  try {
    const identite = await identiteEntreprise(session.organizationId);
    const c = await envoyerCampagnePour(session.organizationId, session.userId, campagneId, identite.nom);
    revalidatePath("/communication", "layout");
    return {
      ok: true,
      message: `${c.numero} envoyé : ${c.envoyes} remis${c.echecs ? `, ${c.echecs} échec${c.echecs > 1 ? "s" : ""}` : ""}${c.ignores ? `, ${c.ignores} retenu${c.ignores > 1 ? "s" : ""} (sans adresse ou désinscrits)` : ""}.`,
    };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Envoi impossible." };
  }
}

export async function supprimerBrouillon(campagneId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("communication.campagne.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(campagneId)) return { ok: false, message: "Message inconnu." };
  try {
    await supprimerBrouillonPour(session.organizationId, campagneId);
    revalidatePath("/communication", "layout");
    return { ok: true, message: "Brouillon supprimé." };
  } catch (erreur) {
    return { ok: false, message: erreur instanceof Error ? erreur.message : "Suppression impossible." };
  }
}
