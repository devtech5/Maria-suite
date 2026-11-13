"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerEntreprise } from "@/lib/auth/dal";
import { peut, refusDroit } from "@/lib/droits/garde";
import { stockageConfigure, urlSignee } from "@/lib/stockage";

import {
  archiverPour,
  autoriserOuverture,
  creerDossierPour,
  modifierDossierPour,
  retirerArchivePour,
  supprimerDossierPour,
  verifierArchivePour,
  vignettesPropres,
} from "./creation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Resultat = { ok: true; message: string } | { ok: false; message: string };

function lisible(erreur: unknown, contexte: string): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error(`Archives : ${contexte}`, erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

const texte = (donnees: FormData, champ: string) => {
  const v = donnees.get(champ);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

const schemaEnvoi = z.object({
  titre: z.string().max(160).optional(),
  dossier: z.string().max(60).optional(),
  description: z.string().max(1000).optional(),
});

export async function archiver(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("archives.deposer");
  if (refus) return { ok: false, message: refus.erreur };

  if (!stockageConfigure()) {
    return { ok: false, message: "Le dépôt de fichiers n'est pas configuré : rien ne peut être archivé." };
  }

  const analyse = schemaEnvoi.safeParse({
    titre: texte(donnees, "titre"),
    dossier: texte(donnees, "dossier"),
    description: texte(donnees, "description"),
  });
  if (!analyse.success) return { ok: false, message: "Titre, dossier ou description trop long." };

  const bruts = donnees.getAll("fichier").filter((v): v is File => v instanceof File && v.size > 0);
  const dossierId = texte(donnees, "dossierId");
  if (dossierId && !UUID.test(dossierId)) return { ok: false, message: "Dossier inconnu." };

  try {
    const { numeros } = await archiverPour(
      session.organizationId,
      session.userId,
      {
        ...analyse.data,
        dossierId: dossierId ?? null,
        fichiers: await Promise.all(bruts.map(async (b) => ({ nom: b.name, typeMime: b.type, contenu: await b.arrayBuffer() }))),
      },
      await peut("archives.dossier.gerer"),
    );
    revalidatePath("/archives", "layout");
    return {
      ok: true,
      message:
        numeros.length === 1
          ? `Archivé sous ${numeros[0]}.`
          : `${numeros.length} fichiers archivés (${numeros[0]} à ${numeros[numeros.length - 1]}).`,
    };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur, "dépôt refusé") };
  }
}

export async function retirerArchive(archiveId: string, motif: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("archives.deposer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(archiveId)) return { ok: false, message: "Archive inconnue." };
  if (motif.trim().length < 3) return { ok: false, message: "Indiquez le motif du retrait." };

  try {
    const { numero } = await retirerArchivePour(session.organizationId, session.userId, archiveId, motif.trim().slice(0, 300));
    revalidatePath("/archives", "layout");
    return { ok: true, message: `${numero} retirée de votre espace.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur, "retrait refusé") };
  }
}

/**
 * Rend une URL de lecture valable cinq minutes, demandée au clic et jamais
 * posée dans la page. L'ouverture est journalisée avant que l'URL parte.
 */
export async function ouvrirArchive(archiveId: string): Promise<string | null> {
  const session = await exigerEntreprise();
  if (!UUID.test(archiveId)) return null;

  const [consulter, gestionnaire, superviseur] = await Promise.all([
    peut("archives.consulter"),
    peut("archives.dossier.gerer"),
    peut("archives.superviser"),
  ]);
  if (!consulter && !gestionnaire && !superviseur) return null;

  const chemin = await autoriserOuverture(session.organizationId, session.userId, archiveId, {
    consulter,
    gestionnaire,
    superviseur,
  });
  if (!chemin) return null;

  revalidatePath("/archives", "layout");
  return urlSignee(chemin);
}

/** Au plus, par demande : une page d'archives n'en montre pas davantage. */
const VIGNETTES_MAX = 200;

/**
 * URL signées des vignettes : ses propres images seulement, sans journal.
 * Demandées après l'affichage, jamais posées dans le HTML.
 */
export async function vignettesArchives(ids: string[]): Promise<Record<string, string>> {
  const session = await exigerEntreprise();
  if (!Array.isArray(ids) || !(await peut("archives.consulter"))) return {};
  const valides = ids.filter((i) => typeof i === "string" && UUID.test(i)).slice(0, VIGNETTES_MAX);
  const lignes = await vignettesPropres(session.organizationId, session.userId, valides);
  const paires = await Promise.all(lignes.map(async (l) => [l.id, await urlSignee(l.chemin)] as const));
  return Object.fromEntries(paires.filter((p): p is readonly [string, string] => p[1] !== null));
}

export async function verifierArchive(archiveId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("archives.superviser");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(archiveId)) return { ok: false, message: "Archive inconnue." };

  try {
    const r = await verifierArchivePour(session.organizationId, session.userId, archiveId);
    revalidatePath("/archives", "layout");
    if (r.etat === "conforme") return { ok: true, message: `${r.numero} intègre : le fichier n'a pas changé d'un octet depuis son dépôt.` };
    if (r.etat === "absent") return { ok: false, message: `${r.numero} : fichier introuvable dans le dépôt.` };
    return { ok: false, message: `${r.numero} ALTÉRÉE : l'empreinte relue ne correspond plus à celle du dépôt.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur, "vérification impossible") };
  }
}

// ------------------------------------------------------------ dossiers partagés

const schemaDossier = z.object({
  nom: z.string().trim().min(2, "Indiquez le nom du dossier.").max(80, "Nom trop long : 80 caractères au plus."),
  description: z.string().max(500).optional(),
  visibilite: z.enum(["tous", "selection"]),
  depotOuvert: z.boolean(),
  membres: z.array(z.string().regex(UUID)).max(500),
  deposants: z.array(z.string().regex(UUID)).max(500),
});

function lireDossier(donnees: FormData) {
  return schemaDossier.safeParse({
    nom: donnees.get("nom") ?? "",
    description: texte(donnees, "description"),
    visibilite: donnees.get("visibilite") === "tous" ? "tous" : "selection",
    // « admins » : les administrateurs seuls ; « tous » : tous ceux qui voient ; « certains » : les membres cochés.
    depotOuvert: donnees.get("depot") === "tous",
    membres: donnees.getAll("membres").map(String),
    deposants: donnees.get("depot") === "certains" ? donnees.getAll("deposants").map(String) : [],
  });
}

export async function creerDossier(donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("archives.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };

  const analyse = lireDossier(donnees);
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  try {
    await creerDossierPour(session.organizationId, session.userId, analyse.data);
    revalidatePath("/archives", "layout");
    return { ok: true, message: `Dossier « ${analyse.data.nom} » créé.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur, "création de dossier refusée") };
  }
}

export async function modifierDossier(dossierId: string, donnees: FormData): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("archives.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(dossierId)) return { ok: false, message: "Dossier inconnu." };

  const analyse = lireDossier(donnees);
  if (!analyse.success) return { ok: false, message: analyse.error.issues[0].message };

  try {
    await modifierDossierPour(session.organizationId, session.userId, dossierId, analyse.data);
    revalidatePath("/archives", "layout");
    return { ok: true, message: `Dossier « ${analyse.data.nom} » mis à jour.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur, "modification de dossier refusée") };
  }
}

export async function supprimerDossier(dossierId: string): Promise<Resultat> {
  const session = await exigerEntreprise();
  const refus = await refusDroit("archives.dossier.gerer");
  if (refus) return { ok: false, message: refus.erreur };
  if (!UUID.test(dossierId)) return { ok: false, message: "Dossier inconnu." };

  try {
    const nom = await supprimerDossierPour(session.organizationId, session.userId, dossierId);
    revalidatePath("/archives", "layout");
    return { ok: true, message: `Dossier « ${nom} » supprimé.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur, "suppression de dossier refusée") };
  }
}
