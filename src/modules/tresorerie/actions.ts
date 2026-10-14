"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import type { Droit } from "@/lib/droits/catalogue";
import { peut, refusDroit } from "@/lib/droits/garde";
import { estDoublon } from "@/lib/erreurs-pg";
import { moduleOuvert } from "@/lib/modules/garde";
import { stockageConfigure, urlSignee } from "@/lib/stockage";

import { compteTresorerieValide, lireReleve, NATURES_BON, type NatureBon } from "./calcul";
import {
  annulerBonDans,
  annulerVirementDans,
  arreterCaisseDans,
  comptabiliserLigneDans,
  creerCompteDans,
  decaisserBonPour,
  deciderBonDans,
  demanderBonDans,
  depointerDans,
  envoyerVirementDans,
  importerReleve as importerRelevePour,
  modifierCompteDans,
  pointerAutomatiquement,
  pointerDans,
  recevoirVirementDans,
  regulariserAvanceDans,
  remettreAvanceDans,
  reprendreComptesExistants,
  type FicheBeneficiaire,
  type NouveauBon,
  type NouvelleAvance,
} from "./creation";
import { bonsCaisse, comptesTresorerie } from "./schema";
import { notifierDetenteurs } from "@/modules/communication/notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

type Contexte = { organizationId: string; userId: string; estProprietaire: boolean };

async function operer(droit: Droit, travail: (ctx: Contexte) => Promise<Resultat>): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit(droit);
  if (refus) return { ok: false, message: refus.erreur };
  try {
    const r = await travail({ organizationId: session.organizationId, userId: session.userId, estProprietaire: session.estProprietaire });
    if (r.ok) {
      revalidatePath("/tresorerie", "layout");
      revalidatePath("/comptabilite", "layout");
      revalidatePath("/");
    }
    return r;
  } catch (erreur) {
    if (estDoublon(erreur)) return { ok: false, message: "Ce nom ou ce numéro de compte est déjà utilisé." };
    const message = erreur instanceof Error ? erreur.message : "";
    const lisible = message && !message.startsWith("Failed query") && message.length < 240;
    if (!lisible) console.error("Trésorerie : opération refusée", erreur);
    return { ok: false, message: lisible ? message : "L'opération n'a pas abouti. Réessayez." };
  }
}

const texte = (d: FormData, champ: string) => {
  const v = d.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
/** Montant saisi : chiffres et espaces seulement, en francs entiers. */
const montant = (d: FormData, champ: string) => {
  const v = texte(d, champ);
  if (v === undefined) return undefined;
  const propre = v.replace(/[\s  ]/g, "");
  return /^\d+$/.test(propre) ? Number(propre) : Number.NaN;
};
const fr = (n: number) => n.toLocaleString("fr-FR");

/**
 * Fiche du bénéficiaire, telle que l'envoie le sélecteur : « t: » tiers,
 * « e: » salarié, « w: » intervenant, « u: » compte. Vide : nom saisi.
 * `undefined` si la valeur est vide, `null` si elle est illisible.
 */
function lireFiche(d: FormData, admis: string): FicheBeneficiaire | null | undefined {
  const v = texte(d, "beneficiaireRef");
  if (!v) return undefined;
  const [genre, id] = [v.slice(0, 1), v.slice(2)];
  if (v[1] !== ":" || !admis.includes(genre) || !UUID.test(id)) return null;
  if (genre === "t") return { tiersId: id };
  if (genre === "e") return { employeId: id };
  if (genre === "w") return { workerId: id };
  return { userId: id };
}
const NATURES = Object.keys(NATURES_BON) as [NatureBon, ...NatureBon[]];

// ------------------------------------------------------------------ comptes

/**
 * Comptes actifs, pour choisir où entre ou d'où sort l'argent ailleurs dans
 * l'application : encaissement d'une facture, paiement d'une dépense.
 */
export async function comptesDisponibles(): Promise<{ id: string; nom: string; nature: string }[]> {
  const session = await exigerEntreprise();
  if (!moduleOuvert("tresorerie")) return [];
  return db
    .select({ id: comptesTresorerie.id, nom: comptesTresorerie.nom, nature: comptesTresorerie.nature })
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.organizationId, session.organizationId), eq(comptesTresorerie.actif, true)))
    .orderBy(comptesTresorerie.nom);
}

const schemaCompte = z.object({
  nom: z.string().trim().min(2, "Nommez le compte : Caisse siège, SGBCI, Wave…").max(80),
  nature: z.enum(["caisse", "banque", "mobile_money"]),
  compte: z.string().trim().refine(compteTresorerieValide, "Compte de classe 5 attendu : 52…, 55… ou 57…"),
  etablissement: z.string().max(80).optional(),
  reference: z.string().max(80).optional(),
  responsableUserId: z.string().regex(UUID).optional(),
  seuilAlerte: z.number().int().min(0, "Seuil invalide."),
});

export async function creerCompte(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.compte.gerer", async ({ organizationId, userId }) => {
    const analyse = schemaCompte.safeParse({
      nom: donnees.get("nom") ?? "",
      nature: donnees.get("nature"),
      compte: donnees.get("compte") ?? "",
      etablissement: texte(donnees, "etablissement"),
      reference: texte(donnees, "reference"),
      responsableUserId: texte(donnees, "responsableUserId"),
      seuilAlerte: montant(donnees, "seuilAlerte") ?? 0,
    });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    await db.transaction((tx) => creerCompteDans(tx, organizationId, analyse.data, userId));
    return { ok: true, message: `« ${analyse.data.nom} » ouvert sur le compte ${analyse.data.compte}.` };
  });
}

export async function modifierCompte(id: string, donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.compte.gerer", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Compte introuvable." };
    const analyse = schemaCompte.omit({ nature: true, compte: true }).safeParse({
      nom: donnees.get("nom") ?? "",
      etablissement: texte(donnees, "etablissement"),
      reference: texte(donnees, "reference"),
      responsableUserId: texte(donnees, "responsableUserId"),
      seuilAlerte: montant(donnees, "seuilAlerte") ?? 0,
    });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    await db.transaction((tx) => modifierCompteDans(tx, organizationId, id, { ...analyse.data, actif: donnees.get("actif") === "on" }, userId));
    return { ok: true, message: `« ${analyse.data.nom} » mis à jour.` };
  });
}

export async function reprendreComptes(): Promise<Resultat> {
  return operer("tresorerie.compte.gerer", async ({ organizationId, userId }) => {
    const n = await reprendreComptesExistants(organizationId, userId);
    return n === 0
      ? { ok: true, message: "Aucun compte de trésorerie à reprendre : tous sont déjà déclarés." }
      : { ok: true, message: `${n} compte${n > 1 ? "s" : ""} repris depuis la comptabilité. Vérifiez leur nom et fixez un seuil d'alerte.` };
  });
}

// --------------------------------------------------------- virements internes

const schemaVirement = z.object({
  sourceId: z.string().regex(UUID, "Choisissez le compte d'où part l'argent."),
  destinationId: z.string().regex(UUID, "Choisissez le compte qui reçoit."),
  montant: z.number().int().positive("Indiquez le montant."),
  frais: z.number().int().min(0, "Frais invalides."),
  date: z.string().regex(DATE_ISO, "Date invalide."),
  reference: z.string().max(80).optional(),
  motif: z.string().max(300).optional(),
  recuImmediat: z.boolean(),
});

export async function envoyerVirement(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.virement.saisir", async ({ organizationId, userId }) => {
    const analyse = schemaVirement.safeParse({
      sourceId: donnees.get("sourceId") ?? "",
      destinationId: donnees.get("destinationId") ?? "",
      montant: montant(donnees, "montant"),
      frais: montant(donnees, "frais") ?? 0,
      date: texte(donnees, "date") ?? new Date().toISOString().slice(0, 10),
      reference: texte(donnees, "reference"),
      motif: texte(donnees, "motif"),
      recuImmediat: donnees.get("recuImmediat") === "on",
    });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const { numero } = await db.transaction((tx) => envoyerVirementDans(tx, organizationId, analyse.data, userId));
    return {
      ok: true,
      message: analyse.data.recuImmediat
        ? `${numero} : ${fr(analyse.data.montant)} F transférés.`
        : `${numero} : ${fr(analyse.data.montant)} F en route — constatez l'arrivée quand le compte est crédité.`,
    };
  });
}

export async function recevoirVirement(id: string, date: string): Promise<Resultat> {
  return operer("tresorerie.virement.saisir", async ({ organizationId, userId }) => {
    if (!UUID.test(id) || !DATE_ISO.test(date)) return { ok: false, message: "Virement ou date invalide." };
    const { numero } = await db.transaction((tx) => recevoirVirementDans(tx, organizationId, id, date, userId));
    return { ok: true, message: `${numero} arrivé.` };
  });
}

export async function annulerVirement(id: string, motif: string): Promise<Resultat> {
  return operer("tresorerie.virement.saisir", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Virement introuvable." };
    if (motif.trim().length < 3) return { ok: false, message: "Indiquez le motif de l'annulation." };
    const { numero } = await db.transaction((tx) => annulerVirementDans(tx, organizationId, id, motif.trim().slice(0, 200), userId));
    return { ok: true, message: `${numero} annulé : l'argent est revenu sur le compte d'origine.` };
  });
}

// ------------------------------------------------------------ bons de caisse

const schemaBon = z.object({
  caisseId: z.string().regex(UUID, "Choisissez la caisse qui paie."),
  nature: z.enum(NATURES),
  montant: z.number().int().positive("Indiquez le montant."),
  beneficiaire: z.string().trim().max(120).optional(),
  motif: z.string().trim().min(3, "Dites à quoi sert la dépense.").max(500),
});

export async function demanderBon(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.bon.demander", async ({ organizationId, userId }) => {
    const analyse = schemaBon.safeParse({
      caisseId: donnees.get("caisseId") ?? "",
      nature: donnees.get("nature"),
      montant: montant(donnees, "montant"),
      beneficiaire: texte(donnees, "beneficiaire"),
      motif: donnees.get("motif") ?? "",
    });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const fiche = lireFiche(donnees, "tew");
    if (fiche === null) return { ok: false, message: "Bénéficiaire inconnu." };
    const { numero, beneficiaire } = await db.transaction((tx) =>
      demanderBonDans(tx, organizationId, { ...analyse.data, fiche: fiche as NouveauBon["fiche"] }, userId),
    );
    await notifierDetenteurs(
      organizationId,
      "tresorerie.bon.approuver",
      {
        categorie: "bon",
        titre: `Bon de caisse ${numero} à approuver`,
        corps: `${beneficiaire} — ${analyse.data.montant.toLocaleString("fr-FR")} FCFA : ${analyse.data.motif}`,
        lien: "/tresorerie/caisse",
      },
      userId,
    );
    return { ok: true, message: `Bon ${numero} demandé : il attend une approbation.` };
  });
}

export async function deciderBon(id: string, approuve: boolean, motif?: string): Promise<Resultat> {
  return operer("tresorerie.bon.approuver", async ({ organizationId, userId, estProprietaire }) => {
    if (!UUID.test(id)) return { ok: false, message: "Bon introuvable." };
    if (!approuve && (!motif || motif.trim().length < 3)) return { ok: false, message: "Indiquez le motif du refus." };
    const { numero } = await db.transaction((tx) =>
      deciderBonDans(tx, organizationId, id, approuve ? { approuve: true } : { approuve: false, motif: motif!.trim().slice(0, 300) }, {
        userId,
        estProprietaire,
      }),
    );
    return { ok: true, message: approuve ? `${numero} approuvé : il peut être décaissé.` : `${numero} refusé.` };
  });
}

const TYPES_JUSTIFICATIF = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

export async function decaisserBon(id: string, donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.caisse.tenir", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Bon introuvable." };
    const brut = donnees.getAll("fichier").find((v): v is File => v instanceof File && v.size > 0);
    let justificatif = null;
    if (brut) {
      if (!stockageConfigure()) return { ok: false, message: "Le dépôt de fichiers n'est pas configuré : décaissez sans justificatif ou configurez-le." };
      if (brut.size > 10 * 1024 * 1024) return { ok: false, message: "Justificatif trop lourd : 10 Mo au plus." };
      if (!TYPES_JUSTIFICATIF.has(brut.type)) return { ok: false, message: "Justificatif : photo ou PDF." };
      justificatif = { nom: brut.name, typeMime: brut.type, contenu: await brut.arrayBuffer() };
    }
    const { numero, ecriture } = await decaisserBonPour(organizationId, id, justificatif, userId);
    return { ok: true, message: `${numero} décaissé — écriture ${ecriture}.` };
  });
}

export async function annulerBon(id: string): Promise<Resultat> {
  return operer("tresorerie.bon.demander", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Bon introuvable." };
    const approuve = await peut("tresorerie.bon.approuver");
    const { numero } = await db.transaction((tx) => annulerBonDans(tx, organizationId, id, { userId, approuve }));
    return { ok: true, message: `${numero} annulé.` };
  });
}

/** Justificatif d'un bon : URL signée, demandée au clic. */
export async function ouvrirJustificatif(bonId: string): Promise<string | null> {
  const session = await exigerEntreprise();
  if (!UUID.test(bonId)) return null;
  const [bon] = await db
    .select({ chemin: bonsCaisse.justificatifChemin, demandeur: bonsCaisse.demandeParUserId })
    .from(bonsCaisse)
    .where(and(eq(bonsCaisse.id, bonId), eq(bonsCaisse.organizationId, session.organizationId)));
  if (!bon?.chemin) return null;
  if (bon.demandeur !== session.userId && !(await peut("tresorerie.consulter"))) return null;
  return urlSignee(bon.chemin);
}

// ------------------------------------------------------------------- avances

const schemaAvance = z.object({
  caisseId: z.string().regex(UUID, "Choisissez la caisse qui avance l'argent."),
  beneficiaire: z.string().trim().max(120).optional(),
  montant: z.number().int().positive("Indiquez le montant."),
  motif: z.string().trim().min(3, "Dites à quoi sert l'avance.").max(500),
  echeance: z.string().regex(DATE_ISO).optional(),
});

export async function remettreAvance(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.caisse.tenir", async ({ organizationId, userId }) => {
    const analyse = schemaAvance.safeParse({
      caisseId: donnees.get("caisseId") ?? "",
      beneficiaire: texte(donnees, "beneficiaire"),
      montant: montant(donnees, "montant"),
      motif: donnees.get("motif") ?? "",
      echeance: texte(donnees, "echeance"),
    });
    if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };
    const fiche = lireFiche(donnees, "eu");
    if (fiche === null) return { ok: false, message: "Bénéficiaire inconnu." };
    const { numero, beneficiaire } = await db.transaction((tx) =>
      remettreAvanceDans(tx, organizationId, { ...analyse.data, fiche: fiche as NouvelleAvance["fiche"] }, userId),
    );
    return { ok: true, message: `Avance ${numero} remise : ${fr(analyse.data.montant)} F à ${beneficiaire}.` };
  });
}

export async function regulariserAvance(id: string, donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.caisse.tenir", async ({ organizationId, userId }) => {
    if (!UUID.test(id)) return { ok: false, message: "Avance introuvable." };
    const type = donnees.get("type") === "remboursement" ? "remboursement" : "justification";
    const somme = montant(donnees, "montant");
    if (!somme || Number.isNaN(somme)) return { ok: false, message: "Indiquez le montant." };
    const caisseId = texte(donnees, "caisseId");
    const nature = donnees.get("nature");
    if (type === "remboursement" && (!caisseId || !UUID.test(caisseId))) return { ok: false, message: "Choisissez la caisse qui reçoit le remboursement." };
    if (type === "justification" && !NATURES.includes(nature as NatureBon)) return { ok: false, message: "Choisissez la nature de la dépense." };
    const { numero, reste } = await db.transaction((tx) =>
      regulariserAvanceDans(
        tx,
        organizationId,
        id,
        type === "remboursement"
          ? { type, montant: somme, caisseId: caisseId! }
          : { type, montant: somme, nature: nature as NatureBon, libelle: texte(donnees, "libelle") ?? null },
        userId,
      ),
    );
    return { ok: true, message: reste === 0 ? `${numero} soldée.` : `${numero} : reste ${fr(reste)} F à régulariser.` };
  });
}

// ----------------------------------------------------------- arrêté de caisse

export async function arreterCaisse(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.caisse.tenir", async ({ organizationId, userId }) => {
    const compteId = texte(donnees, "compteId");
    const compte = montant(donnees, "compte");
    if (!compteId || !UUID.test(compteId)) return { ok: false, message: "Choisissez la caisse arrêtée." };
    if (compte === undefined || Number.isNaN(compte)) return { ok: false, message: "Indiquez ce que vous avez compté." };
    const r = await db.transaction((tx) => arreterCaisseDans(tx, organizationId, { compteId, compte, observations: texte(donnees, "observations") }, userId));
    return {
      ok: true,
      message:
        r.ecart === 0
          ? `${r.numero} : caisse juste.`
          : `${r.numero} : ${r.ecart < 0 ? "manquant" : "excédent"} de ${fr(Math.abs(r.ecart))} F, passé en écriture ${r.ecriture}.`,
    };
  });
}

// ---------------------------------------------------------- relevé bancaire

export async function importerReleve(donnees: FormData): Promise<Resultat> {
  return operer("tresorerie.rapprocher", async ({ organizationId, userId }) => {
    const compteId = texte(donnees, "compteId");
    if (!compteId || !UUID.test(compteId)) return { ok: false, message: "Choisissez le compte bancaire." };
    const fichier = donnees.get("releve");
    if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, message: "Choisissez le fichier du relevé (CSV)." };
    if (fichier.size > 5 * 1024 * 1024) return { ok: false, message: "Relevé trop lourd : 5 Mo au plus." };

    // Les exports des banques locales sortent souvent en Windows-1252 : un
    // « é » mal lu en UTF-8 devient un caractère de remplacement.
    const octets = new Uint8Array(await fichier.arrayBuffer());
    let contenu = new TextDecoder("utf-8").decode(octets);
    if (contenu.includes("�")) contenu = new TextDecoder("windows-1252").decode(octets);

    const { lignes, erreurs } = lireReleve(contenu);
    if (lignes.length === 0) return { ok: false, message: erreurs[0] ?? "Aucune ligne lisible dans ce relevé." };
    const r = await importerRelevePour(organizationId, compteId, fichier.name, lignes, userId);
    const avertissement = erreurs.length ? ` ${erreurs.length} ligne${erreurs.length > 1 ? "s" : ""} illisible${erreurs.length > 1 ? "s" : ""} ignorée${erreurs.length > 1 ? "s" : ""}.` : "";
    return {
      ok: true,
      message: `${r.ajoutees} ligne${r.ajoutees > 1 ? "s" : ""} importée${r.ajoutees > 1 ? "s" : ""}, ${r.pointees} pointée${r.pointees > 1 ? "s" : ""} automatiquement${r.doublons ? `, ${r.doublons} déjà connue${r.doublons > 1 ? "s" : ""}` : ""}.${avertissement}`,
    };
  });
}

export async function pointerAuto(compteId: string): Promise<Resultat> {
  return operer("tresorerie.rapprocher", async ({ organizationId, userId }) => {
    if (!UUID.test(compteId)) return { ok: false, message: "Compte introuvable." };
    const n = await pointerAutomatiquement(organizationId, compteId, userId);
    return { ok: true, message: n === 0 ? "Aucune nouvelle correspondance trouvée." : `${n} ligne${n > 1 ? "s" : ""} pointée${n > 1 ? "s" : ""}.` };
  });
}

export async function pointer(ligneReleveId: string, ligneEcritureId: string): Promise<Resultat> {
  return operer("tresorerie.rapprocher", async ({ organizationId, userId }) => {
    if (!UUID.test(ligneReleveId) || !UUID.test(ligneEcritureId)) return { ok: false, message: "Ligne introuvable." };
    await db.transaction((tx) => pointerDans(tx, organizationId, ligneReleveId, ligneEcritureId, userId));
    return { ok: true, message: "Ligne pointée." };
  });
}

export async function depointer(ligneReleveId: string): Promise<Resultat> {
  return operer("tresorerie.rapprocher", async ({ organizationId, userId }) => {
    if (!UUID.test(ligneReleveId)) return { ok: false, message: "Ligne introuvable." };
    await db.transaction((tx) => depointerDans(tx, organizationId, ligneReleveId, userId));
    return { ok: true, message: "Pointage retiré." };
  });
}

export async function comptabiliserLigne(ligneReleveId: string): Promise<Resultat> {
  return operer("tresorerie.rapprocher", async ({ organizationId, userId }) => {
    if (!UUID.test(ligneReleveId)) return { ok: false, message: "Ligne introuvable." };
    const { ecriture } = await db.transaction((tx) => comptabiliserLigneDans(tx, organizationId, ligneReleveId, userId));
    return { ok: true, message: `Écriture ${ecriture} passée et pointée.` };
  });
}
