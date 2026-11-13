/**
 * Colonnes personnalisées des tâches : types, options, et la normalisation
 * d'une saisie en valeur stockée. Sans base ni React : le navigateur et le
 * serveur appliquent les mêmes règles, et le serveur les rejoue toujours.
 *
 * Une valeur se stocke en texte normalisé :
 *
 *   texte     — le texte, resserré, 500 caractères au plus ;
 *   nombre    — un ENTIER en chiffres (« 1250000 ») : pas de virgule, comme
 *               tout montant de Maria Suite ; l'unité vit sur la colonne ;
 *   date      — un jour ISO ;
 *   etiquette — la clé de l'étiquette choisie ;
 *   case      — « 1 » cochée, rien sinon ;
 *   lien      — une adresse http(s) complète.
 */

export const TYPES_COLONNE = ["texte", "nombre", "date", "etiquette", "case", "lien"] as const;
export type TypeColonne = (typeof TYPES_COLONNE)[number];

export const LIBELLE_TYPE: Record<TypeColonne, string> = {
  texte: "Texte",
  nombre: "Nombre",
  date: "Date",
  etiquette: "Étiquettes",
  case: "Case à cocher",
  lien: "Lien",
};

export const DESCRIPTION_TYPE: Record<TypeColonne, string> = {
  texte: "Une note libre : client, lieu, référence…",
  nombre: "Un nombre entier, avec son unité, additionné au pied du groupe.",
  date: "Une date de plus : livraison, rendez-vous, relance…",
  etiquette: "Des étiquettes de couleur à choisir : à valider, validé, refusé…",
  case: "Oui ou non, d'un clic : facturé, livré, signé…",
  lien: "Une adresse web : dossier partagé, devis en ligne…",
};

/** Couleur d'en-tête de chaque type, pour le choisir d'un coup d'œil. */
export const COULEUR_TYPE: Record<TypeColonne, string> = {
  texte: "#ff9f1c",
  nombre: "#ffcb00",
  date: "#11dd80",
  etiquette: "#00c875",
  case: "#579bfc",
  lien: "#a25ddc",
};

export const estTypeColonne = (v: unknown): v is TypeColonne =>
  typeof v === "string" && (TYPES_COLONNE as readonly string[]).includes(v);

/** Palette des étiquettes : les couleurs franches d'un tableau de suivi. */
export const PALETTE_ETIQUETTES = [
  "#00c875",
  "#fdab3d",
  "#df2f4a",
  "#579bfc",
  "#a25ddc",
  "#ff642e",
  "#037f4c",
  "#0086c0",
  "#bb3354",
  "#9d99b9",
  "#401694",
  "#ff5ac4",
] as const;

export interface Etiquette {
  cle: string;
  libelle: string;
  couleur: string;
}

export interface OptionsColonne {
  etiquettes?: Etiquette[];
  /** Unité d'un nombre : « FCFA », « % », « m² »… */
  unite?: string;
}

export const LIBELLE_MAX = 40;
export const TEXTE_MAX = 500;
export const ETIQUETTES_MAX = 20;
export const COLONNES_MAX = 30;

/** Étiquettes proposées à la création : on les renomme ensuite. */
export const ETIQUETTES_PAR_DEFAUT: Etiquette[] = [
  { cle: "e1", libelle: "À valider", couleur: "#fdab3d" },
  { cle: "e2", libelle: "Validé", couleur: "#00c875" },
  { cle: "e3", libelle: "Refusé", couleur: "#df2f4a" },
];

export type Verdict<T> = { ok: true; valeur: T } | { ok: false; message: string };

/**
 * Options d'une colonne, nettoyées : seules celles de son type restent.
 * Les étiquettes gardent leur clé — une valeur déjà posée la retrouve — et
 * une étiquette nouvelle en reçoit une libre.
 */
export function normaliserOptions(type: TypeColonne, options: OptionsColonne | null | undefined): Verdict<OptionsColonne> {
  if (type === "nombre") {
    const unite = options?.unite?.trim().slice(0, 12);
    return { ok: true, valeur: unite ? { unite } : {} };
  }
  if (type !== "etiquette") return { ok: true, valeur: {} };

  const saisies = (options?.etiquettes ?? []).filter((e) => e.libelle.trim() !== "");
  if (saisies.length === 0) return { ok: false, message: "Donnez au moins une étiquette." };
  if (saisies.length > ETIQUETTES_MAX) return { ok: false, message: `${ETIQUETTES_MAX} étiquettes au plus.` };
  const libelles = new Set<string>();
  const cles = new Set<string>();
  const etiquettes: Etiquette[] = [];
  for (const e of saisies) {
    const libelle = e.libelle.trim().replace(/\s+/g, " ");
    if (libelle.length > LIBELLE_MAX) return { ok: false, message: `« ${libelle.slice(0, 20)}… » : ${LIBELLE_MAX} caractères au plus.` };
    const repere = libelle.toLocaleLowerCase("fr");
    if (libelles.has(repere)) return { ok: false, message: `L'étiquette « ${libelle} » figure deux fois.` };
    libelles.add(repere);
    const couleur = (PALETTE_ETIQUETTES as readonly string[]).includes(e.couleur) ? e.couleur : PALETTE_ETIQUETTES[0];
    const cle = /^e\d{1,4}$/.test(e.cle) && !cles.has(e.cle) ? e.cle : "";
    if (cle) cles.add(cle);
    etiquettes.push({ cle, libelle, couleur });
  }
  // Clés libres pour les nouvelles, sans jamais reprendre une clé gardée.
  let n = 1;
  for (const e of etiquettes) {
    if (e.cle) continue;
    while (cles.has(`e${n}`)) n++;
    e.cle = `e${n}`;
    cles.add(e.cle);
  }
  return { ok: true, valeur: { etiquettes } };
}

export function normaliserLibelle(libelle: string): Verdict<string> {
  const propre = libelle.trim().replace(/\s+/g, " ");
  if (propre.length < 1) return { ok: false, message: "Donnez un nom à la colonne." };
  if (propre.length > LIBELLE_MAX) return { ok: false, message: `Nom de colonne trop long : ${LIBELLE_MAX} caractères au plus.` };
  return { ok: true, valeur: propre };
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Ramène une saisie à sa forme stockée, ou dit pourquoi elle est refusée.
 * Une saisie vide vide la cellule (`null`).
 */
export function normaliserValeur(type: TypeColonne, saisie: string | null | undefined, options: OptionsColonne): Verdict<string | null> {
  const brut = (saisie ?? "").trim();
  if (brut === "") return { ok: true, valeur: null };

  switch (type) {
    case "texte": {
      const texte = brut.replace(/\s+/g, " ");
      if (texte.length > TEXTE_MAX) return { ok: false, message: `Texte trop long : ${TEXTE_MAX} caractères au plus.` };
      return { ok: true, valeur: texte };
    }
    case "nombre": {
      // Espaces de milliers acceptés (« 1 250 000 »), virgule refusée : un entier, comme tout montant.
      const chiffres = brut.replace(/[\s  ]/g, "");
      if (!/^-?\d+$/.test(chiffres)) return { ok: false, message: "Un nombre entier, sans virgule." };
      const n = Number(chiffres);
      if (!Number.isSafeInteger(n)) return { ok: false, message: "Nombre trop grand." };
      return { ok: true, valeur: String(n) };
    }
    case "date": {
      const m = DATE_ISO.exec(brut);
      if (!m) return { ok: false, message: "Date invalide." };
      const d = new Date(`${brut}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== brut) return { ok: false, message: "Date invalide." };
      return { ok: true, valeur: brut };
    }
    case "etiquette": {
      if (!(options.etiquettes ?? []).some((e) => e.cle === brut)) return { ok: false, message: "Étiquette inconnue." };
      return { ok: true, valeur: brut };
    }
    case "case":
      return { ok: true, valeur: brut === "1" || brut === "true" ? "1" : null };
    case "lien": {
      if (brut.length > TEXTE_MAX) return { ok: false, message: "Adresse trop longue." };
      const complete = /^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : `https://${brut}`;
      let url: URL;
      try {
        url = new URL(complete);
      } catch {
        return { ok: false, message: "Adresse web invalide." };
      }
      // Rien d'autre que le web : un « javascript: » posé dans une cellule s'exécuterait au clic.
      if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: "Seule une adresse http ou https est admise." };
      if (!url.hostname.includes(".")) return { ok: false, message: "Adresse web invalide." };
      return { ok: true, valeur: url.href };
    }
  }
}

const GROUPES = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** « 1 250 000 FCFA ». */
export function nombreLisible(valeur: string | number, unite?: string): string {
  const n = typeof valeur === "number" ? valeur : Number(valeur);
  return `${GROUPES.format(n)}${unite ? ` ${unite}` : ""}`;
}

/**
 * Somme d'une colonne de nombres, au pied d'un groupe. Entiers, donc exacte ;
 * les cellules vides ne comptent pas. `null` s'il n'y a rien à additionner.
 */
export function sommeNombres(valeurs: (string | null | undefined)[]): number | null {
  let somme = 0;
  let compte = 0;
  for (const v of valeurs) {
    if (v == null || !/^-?\d+$/.test(v)) continue;
    somme += Number(v);
    compte++;
  }
  return compte === 0 ? null : somme;
}

/** Ce qu'affiche un lien : le domaine, sans « www. ». */
export function domaineDe(lien: string): string {
  try {
    return new URL(lien).hostname.replace(/^www\./, "");
  } catch {
    return lien;
  }
}

/** Échange de place avec la voisine : rend le nouvel ordre des identifiants, ou `null` au bord. */
export function deplacer(ordre: string[], id: string, sens: -1 | 1): string[] | null {
  const i = ordre.indexOf(id);
  const j = i + sens;
  if (i === -1 || j < 0 || j >= ordre.length) return null;
  const suite = [...ordre];
  [suite[i], suite[j]] = [suite[j], suite[i]];
  return suite;
}
