"use server";

import { revalidatePath } from "next/cache";

import { signerLien, urlAbsolue } from "@/lib/liens-publics";
import { stockageConfigure } from "@/lib/stockage";
import { envoyerWhatsApp } from "@/lib/whatsapp";
import { normaliserTelephone } from "@/modules/communication/calcul";
import { heureValide, instantLocal } from "@/modules/presences/calcul";

import { COTES_PHOTO, TAILLE_MAX_PHOTO, TYPES_PHOTO, type CotePhoto, type SaisieVisite } from "./regles";
import { accesVisiteurs } from "./acces";
import {
  accueilsDe,
  affecterAgentPour,
  changerStatutPour,
  creerVisitePour,
  deposerPhotoPour,
  enregistrerAccueilPour,
  urlPhotoPour,
  visiteDe,
} from "./requetes";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Visiteurs", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

function rafraichir() {
  revalidatePath("/visiteurs", "layout");
}

const texte = (d: FormData, champ: string) => {
  const v = d.get(champ);
  return typeof v === "string" ? v : "";
};

const contexte = accesVisiteurs;

function saisieDe(d: FormData): SaisieVisite {
  return {
    nom: texte(d, "nom"),
    telephone: texte(d, "telephone"),
    societe: texte(d, "societe"),
    motif: texte(d, "motif"),
    typePiece: texte(d, "typePiece"),
    numeroPiece: texte(d, "numeroPiece"),
  };
}

/** Photos jointes au formulaire, contrôlées : JPEG, WebP ou PNG, 4 Mo au plus chacune. */
function photosDe(d: FormData): { cote: CotePhoto; fichier: File }[] | string {
  const photos: { cote: CotePhoto; fichier: File }[] = [];
  for (const cote of COTES_PHOTO) {
    const f = d.get(`photo_${cote}`);
    if (!(f instanceof File) || f.size === 0) continue;
    if (!TYPES_PHOTO.has(f.type)) return `Photo ${cote} : format non accepté (${f.type || "inconnu"}).`;
    if (f.size > TAILLE_MAX_PHOTO) return `Photo ${cote} : ${Math.ceil(f.size / 1024 / 1024)} Mo pour 4 Mo au plus.`;
    photos.push({ cote, fichier: f });
  }
  if (photos.length > 0 && !stockageConfigure()) return "Le dépôt de fichiers n'est pas configuré : les photos ne peuvent pas être enregistrées.";
  return photos;
}

async function deposerPhotos(organizationId: string, userId: string, visiteId: string, photos: { cote: CotePhoto; fichier: File }[]) {
  for (const p of photos) await deposerPhotoPour(organizationId, userId, visiteId, p.cote, { contenu: await p.fichier.arrayBuffer(), typeMime: p.fichier.type });
}

function personneVisitee(d: FormData): string | null {
  const id = texte(d, "visiteUserId");
  return UUID.test(id) ? id : null;
}

/** Arrivée sans rendez-vous : la visite naît présente, photos comprises. */
export async function enregistrerArrivee(d: FormData): Promise<Resultat> {
  const c = await contexte();
  if (!c.accueillir) return { ok: false, message: "Vous n'accueillez pas les visiteurs." };
  const accueilId = texte(d, "accueilId");
  if (!UUID.test(accueilId) || !c.accueilPermis(accueilId)) return { ok: false, message: "Vous ne tenez pas ce point d'accueil." };
  const photos = photosDe(d);
  if (typeof photos === "string") return { ok: false, message: photos };
  try {
    const { id, numero } = await creerVisitePour(c.session.organizationId, c.session.userId, {
      accueilId,
      saisie: saisieDe(d),
      visiteUserId: personneVisitee(d),
      visiteLibelle: texte(d, "visiteLibelle"),
    });
    rafraichir();
    // La visite existe désormais : une photo refusée ne doit pas la faire ressaisir (et dupliquer).
    const refus = await deposerPhotos(c.session.organizationId, c.session.userId, id, photos).then(
      () => null,
      (erreur: unknown) => lisible(erreur),
    );
    if (refus) return { ok: true, message: `Visite ${numero} enregistrée, mais les photos ne l'ont pas été (${refus}). Reprenez-les depuis sa fiche.`, id };
    return { ok: true, message: `Visite ${numero} enregistrée.`, id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

async function visitePermise(c: Awaited<ReturnType<typeof contexte>>, visiteId: string) {
  if (!UUID.test(visiteId)) return null;
  const v = await visiteDe(c.session.organizationId, visiteId);
  return v && c.accueilPermis(v.accueilId) ? v : null;
}

/** Arrivée d'un visiteur attendu : on complète sa pièce et ses photos. */
export async function enregistrerArriveeAttendue(visiteId: string, d: FormData): Promise<Resultat> {
  const c = await contexte();
  if (!c.accueillir || !(await visitePermise(c, visiteId))) return { ok: false, message: "Visite introuvable dans vos accueils." };
  const photos = photosDe(d);
  if (typeof photos === "string") return { ok: false, message: photos };
  try {
    const v = await changerStatutPour(c.session.organizationId, c.session.userId, visiteId, "presente", { saisie: saisieDe(d) });
    rafraichir();
    const refus = await deposerPhotos(c.session.organizationId, c.session.userId, visiteId, photos).then(
      () => null,
      (erreur: unknown) => lisible(erreur),
    );
    if (refus) return { ok: true, message: `${v.nom} est enregistré sur place, mais les photos ne l'ont pas été (${refus}). Reprenez-les ci-dessous.`, id: visiteId };
    return { ok: true, message: `${v.nom} est enregistré sur place.`, id: visiteId };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function enregistrerSortie(visiteId: string): Promise<Resultat> {
  const c = await contexte();
  if (!c.accueillir || !(await visitePermise(c, visiteId))) return { ok: false, message: "Visite introuvable dans vos accueils." };
  try {
    const v = await changerStatutPour(c.session.organizationId, c.session.userId, visiteId, "sortie");
    rafraichir();
    return { ok: true, message: `Sortie de ${v.nom} enregistrée.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Annule un rendez-vous : l'accueil, ou qui l'a annoncé. */
export async function annulerVisite(visiteId: string): Promise<Resultat> {
  const c = await contexte();
  if (!UUID.test(visiteId)) return { ok: false, message: "Visite introuvable." };
  const v = await visiteDe(c.session.organizationId, visiteId);
  const sienne = v && (v.brute.annoncePar === c.session.userId || v.visiteUserId === c.session.userId);
  if (!v || !((c.accueillir && c.accueilPermis(v.accueilId)) || sienne)) return { ok: false, message: "Visite introuvable." };
  try {
    await changerStatutPour(c.session.organizationId, c.session.userId, visiteId, "annulee");
    rafraichir();
    return { ok: true, message: "Rendez-vous annulé." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Ajoute ou remplace une photo après coup. */
export async function photoVisite(visiteId: string, d: FormData): Promise<Resultat> {
  const c = await contexte();
  if (!c.accueillir || !(await visitePermise(c, visiteId))) return { ok: false, message: "Visite introuvable dans vos accueils." };
  const photos = photosDe(d);
  if (typeof photos === "string") return { ok: false, message: photos };
  if (photos.length === 0) return { ok: false, message: "Aucune photo reçue." };
  try {
    await deposerPhotos(c.session.organizationId, c.session.userId, visiteId, photos);
    rafraichir();
    return { ok: true, message: "Photo enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** URL signée d'une photo, deux minutes, demandée au clic. */
export async function ouvrirPhotoVisite(visiteId: string, cote: string): Promise<string | null> {
  const c = await contexte();
  if (!c.accueillir || !(COTES_PHOTO as readonly string[]).includes(cote) || !(await visitePermise(c, visiteId))) return null;
  return urlPhotoPour(c.session.organizationId, c.session.userId, visiteId, cote as CotePhoto);
}

/** Lien public du rendez-vous : le visiteur y trouve son QR d'entrée. */
function lienRendezVous(organizationId: string, visiteId: string): string {
  return urlAbsolue(`/consulter/${signerLien(["visite", organizationId, visiteId], 30)}`);
}

async function envoyerQr(organizationId: string, visiteId: string): Promise<string | null> {
  const v = await visiteDe(organizationId, visiteId);
  if (!v?.telephone) return "Pas de numéro de téléphone pour ce visiteur.";
  const numero = normaliserTelephone(v.telephone);
  if (!numero) return "Le numéro du visiteur est illisible.";
  const quand = v.attenduLe ? v.attenduLe.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Abidjan" }) : "";
  const r = await envoyerWhatsApp(
    numero,
    `Bonjour ${v.nom}, votre rendez-vous chez MARIA GROUP SARL (${v.accueil}) est prévu ${quand ? `le ${quand}` : "prochainement"}. ` +
      `Présentez ce QR code à l'accueil : ${lienRendezVous(organizationId, visiteId)}`,
  );
  return r.ok ? null : r.raison;
}

/**
 * Annonce un visiteur : rendez-vous attendu à l'accueil choisi, à l'heure
 * dite (fuseau de l'entreprise). Le QR part par WhatsApp si demandé.
 */
export async function annoncerVisite(d: FormData): Promise<Resultat> {
  const c = await contexte();
  if (!c.annoncer) return { ok: false, message: "Vous ne pouvez pas annoncer de visiteur." };
  const accueilId = texte(d, "accueilId");
  const actifs = await accueilsDe(c.session.organizationId, { actifs: true });
  if (!actifs.some((a) => a.id === accueilId)) return { ok: false, message: "Choisissez le point d'accueil." };
  const jour = texte(d, "jour");
  const heure = texte(d, "heure");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !heureValide(heure)) return { ok: false, message: "Indiquez le jour et l'heure du rendez-vous." };
  const attenduLe = instantLocal(jour, heure);
  if (attenduLe.getTime() < Date.now() - 60 * 60_000) return { ok: false, message: "Ce rendez-vous est déjà passé." };
  try {
    const { id, numero } = await creerVisitePour(c.session.organizationId, c.session.userId, {
      accueilId,
      saisie: { ...saisieDe(d), typePiece: "", numeroPiece: "" },
      visiteUserId: personneVisitee(d) ?? c.session.userId,
      visiteLibelle: texte(d, "visiteLibelle"),
      attenduLe,
    });
    rafraichir();
    if (d.get("whatsapp") === "on") {
      const refus = await envoyerQr(c.session.organizationId, id);
      if (refus) return { ok: true, message: `Visiteur annoncé (${numero}). QR non envoyé : ${refus}`, id };
      return { ok: true, message: `Visiteur annoncé (${numero}), QR envoyé par WhatsApp.`, id };
    }
    return { ok: true, message: `Visiteur annoncé (${numero}).`, id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Renvoie le QR d'un rendez-vous par WhatsApp. */
export async function renvoyerQr(visiteId: string): Promise<Resultat> {
  const c = await contexte();
  if (!UUID.test(visiteId)) return { ok: false, message: "Visite introuvable." };
  const v = await visiteDe(c.session.organizationId, visiteId);
  const sienne = v && (v.brute.annoncePar === c.session.userId || v.visiteUserId === c.session.userId);
  if (!v || !((c.accueillir && c.accueilPermis(v.accueilId)) || sienne)) return { ok: false, message: "Visite introuvable." };
  if (v.statut !== "attendue") return { ok: false, message: "Le visiteur n'est plus attendu." };
  const refus = await envoyerQr(c.session.organizationId, visiteId);
  return refus ? { ok: false, message: refus } : { ok: true, message: "QR envoyé par WhatsApp." };
}

/** Lien du QR d'un rendez-vous, à copier et envoyer soi-même. */
export async function lienQr(visiteId: string): Promise<string | null> {
  const c = await contexte();
  if (!UUID.test(visiteId)) return null;
  const v = await visiteDe(c.session.organizationId, visiteId);
  const sienne = v && (v.brute.annoncePar === c.session.userId || v.visiteUserId === c.session.userId);
  if (!v || v.statut !== "attendue" || !((c.accueillir && c.accueilPermis(v.accueilId)) || sienne)) return null;
  return lienRendezVous(c.session.organizationId, visiteId);
}

// --------------------------------------------------------------- accueils

export async function enregistrerAccueil(d: FormData): Promise<Resultat> {
  const c = await contexte();
  if (!c.superviser) return { ok: false, message: "La gestion des points d'accueil revient à la supervision." };
  const id = texte(d, "id");
  try {
    await enregistrerAccueilPour(c.session.organizationId, c.session.userId, {
      id: UUID.test(id) ? id : undefined,
      nom: texte(d, "nom"),
      lieu: texte(d, "lieu"),
      pieceExigee: d.get("pieceExigee") === "on",
      actif: UUID.test(id) ? d.get("actif") === "on" : true,
    });
    rafraichir();
    return { ok: true, message: "Point d'accueil enregistré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function affecterAgent(accueilId: string, agentId: string, affecter: boolean): Promise<Resultat> {
  const c = await contexte();
  if (!c.superviser) return { ok: false, message: "La gestion des points d'accueil revient à la supervision." };
  if (!UUID.test(accueilId) || !UUID.test(agentId)) return { ok: false, message: "Accueil ou compte introuvable." };
  try {
    await affecterAgentPour(c.session.organizationId, c.session.userId, accueilId, agentId, affecter);
    rafraichir();
    return { ok: true, message: affecter ? "Agent ajouté." : "Agent retiré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
