/**
 * Console des données : ce que le propriétaire peut voir, modifier,
 * désactiver et supprimer, ligne par ligne, dans toutes les tables de
 * l'entreprise. Règles pures, sans base ni navigateur.
 *
 * La console passe outre les écrans des modules, pas la comptabilité : une
 * ligne comptabilisée ou une pièce numérotée figée reste en lecture seule —
 * elle se corrige dans son module, par contre-passation. Les colonnes de
 * système (identifiant, entreprise, version, numéro) ne se touchent pas, et
 * un secret (empreinte de mot de passe, clé chiffrée) ne quitte jamais le
 * serveur.
 */

export type GenreColonne = "texte" | "entier" | "booleen" | "date" | "horodatage" | "choix" | "json" | "uuid" | "liste";

export interface ColonneDecrite {
  nom: string;
  genre: GenreColonne;
  /** Valeurs admises d'une colonne à choix (énumération PostgreSQL). */
  choix: readonly string[] | null;
  /** NOT NULL en base : la valeur ne peut pas être vidée. */
  obligatoire: boolean;
  /** Table visée par une clé étrangère, nulle sinon. */
  reference: string | null;
  /** Nom du type énuméré en base, pour convertir la saisie. */
  typeEnum: string | null;
  /** Fait partie de la clé primaire. */
  cle: boolean;
}

export interface TableDecrite {
  nom: string;
  /** Colonne de clé primaire, quand elle est unique ; nulle pour une clé composée (la table se lit, sans fiche). */
  cle: string | null;
  libelle: string;
  groupe: string;
  colonnes: readonly ColonneDecrite[];
  /** Colonnes d'autres tables qui pointent vers celle-ci. */
  referencee: readonly { table: string; colonne: string }[];
}

/** Tables qui se lisent ici mais se gèrent ailleurs : la comptabilité, les comptes, la numérotation, la trace. */
export const TABLES_LECTURE_SEULE: ReadonlySet<string> = new Set([
  "ecritures",
  "lignes_ecriture",
  "exercices_clotures",
  "reouvertures_exercice",
  "document_sequences",
  "audit_logs",
  "sync_mutations",
  "change_log",
  "memberships",
  "roles",
  "acces_modules",
  "acces_modules_roles",
  "organization_modules",
  "sync_cursors",
]);

/** Tables absentes de la console : elles ne portent que des jetons de session. */
export const TABLES_EXCLUES: ReadonlySet<string> = new Set(["sessions"]);

/** Colonnes de système : posées par l'application, jamais saisies. */
const COLONNES_SYSTEME = new Set(["id", "organization_id", "created_at", "updated_at", "deleted_at", "version", "numero", "is_owner"]);

/** Un secret ne quitte pas le serveur : empreinte, mot de passe chiffré, clé privée. */
const SECRET = /(_hash$|^password|mot_de_passe|_chiffre$|^cle_privee$|secret)/;

/**
 * Statuts où une pièce numérotée est figée : émise, encaissée, payée,
 * comptabilisée. Elle se corrige dans son module (avoir, contre-passation),
 * jamais en place.
 */
export const STATUTS_FIGES: ReadonlySet<string> = new Set([
  "emise",
  "acceptee",
  "convertie",
  "encaissee",
  "comptabilisee",
  "payee",
  "decaisse",
  "recu",
  "soldee",
  "valide",
  "validee",
  "verrouillee",
]);

export type Acces = "masquee" | "lecture" | "modifiable";

export function accesColonne(table: string, c: ColonneDecrite): Acces {
  if (SECRET.test(c.nom)) return "masquee";
  if (c.cle) return "lecture";
  if (TABLES_LECTURE_SEULE.has(table) || COLONNES_SYSTEME.has(c.nom)) return "lecture";
  // Une clé étrangère, une date d'horodatage ou une liste ne se saisissent pas à la main sans risque.
  if (c.genre === "uuid" || c.genre === "horodatage" || c.genre === "liste") return "lecture";
  return "modifiable";
}

const aColonne = (t: TableDecrite, nom: string) => t.colonnes.some((c) => c.nom === nom);

export const supprimable = (t: TableDecrite) => aColonne(t, "deleted_at") && !TABLES_LECTURE_SEULE.has(t.nom);
export const desactivable = (t: TableDecrite) => t.colonnes.some((c) => c.nom === "actif" && c.genre === "booleen") && !TABLES_LECTURE_SEULE.has(t.nom);

/**
 * Pourquoi une ligne ne se modifie ni ne se supprime ici, ou null.
 *
 * Comptabilisée — une colonne d'écriture renseignée — ou pièce numérotée
 * dans un statut figé : son module la corrige.
 */
export function verrouLigne(t: TableDecrite, ligne: Readonly<Record<string, unknown>>): string | null {
  if (TABLES_LECTURE_SEULE.has(t.nom)) return "Cette table se lit ici et se gère dans son module.";
  for (const c of t.colonnes) {
    if (!/^ecriture/.test(c.nom) || c.genre === "uuid") continue;
    const v = ligne[c.nom];
    if (typeof v === "string" && v !== "") return `Comptabilisée (écriture ${v}) : elle se corrige dans son module, par contre-passation.`;
  }
  const statut = ligne.statut;
  if (aColonne(t, "numero") && typeof statut === "string" && STATUTS_FIGES.has(statut)) {
    const numero = typeof ligne.numero === "string" && ligne.numero ? `${ligne.numero} ` : "";
    return `Pièce ${numero}au statut « ${statut} » : figée, elle se corrige dans son module.`;
  }
  return null;
}

/**
 * Suppression définitive : seulement une ligne déjà à la corbeille, sans
 * numéro (la numérotation reste sans trou), que plus rien ne désigne.
 */
export function refusSuppressionDefinitive(t: TableDecrite, ligne: Readonly<Record<string, unknown>>, references: number): string | null {
  if (!supprimable(t)) return "Cette table ne se supprime pas ici.";
  if (ligne.deleted_at == null) return "Mettez d'abord la ligne à la corbeille.";
  if (aColonne(t, "numero")) return "Une pièce numérotée reste à la corbeille : son numéro ne doit pas laisser de trou.";
  if (references > 0) return `${references} ligne${references > 1 ? "s y font" : " y fait"} encore référence : elle reste à la corbeille.`;
  return null;
}

export type Saisie = { ok: true; valeur: unknown } | { ok: false; message: string };

/**
 * Lit la saisie d'un champ selon sa colonne. `avant` sert au JSON : un
 * tableau reste un tableau, un objet un objet. Un montant est un entier,
 * jamais un flottant.
 */
export function lireSaisie(c: ColonneDecrite, brut: string | null, avant: unknown): Saisie {
  if (c.genre === "booleen") return { ok: true, valeur: brut === "on" || brut === "true" };
  const texte = (brut ?? "").trim();
  if (texte === "") {
    if (c.obligatoire) return { ok: false, message: `« ${libelle(c.nom)} » est obligatoire.` };
    return { ok: true, valeur: null };
  }
  switch (c.genre) {
    case "texte":
      return { ok: true, valeur: texte };
    case "entier": {
      const propre = texte.replace(/[\s  ]/g, "");
      if (!/^-?\d+$/.test(propre) || !Number.isSafeInteger(Number(propre))) return { ok: false, message: `« ${libelle(c.nom)} » : un nombre entier, sans virgule.` };
      return { ok: true, valeur: Number(propre) };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texte) || Number.isNaN(Date.parse(`${texte}T00:00:00Z`)) || new Date(`${texte}T00:00:00Z`).toISOString().slice(0, 10) !== texte) {
        return { ok: false, message: `« ${libelle(c.nom)} » : une date au format AAAA-MM-JJ.` };
      }
      return { ok: true, valeur: texte };
    }
    case "choix":
      if (!c.choix?.includes(texte)) return { ok: false, message: `« ${libelle(c.nom)} » : valeur inconnue.` };
      return { ok: true, valeur: texte };
    case "json": {
      let valeur: unknown;
      try {
        valeur = JSON.parse(texte);
      } catch {
        return { ok: false, message: `« ${libelle(c.nom)} » : JSON illisible.` };
      }
      if (avant !== null && avant !== undefined && Array.isArray(avant) !== Array.isArray(valeur)) {
        return { ok: false, message: `« ${libelle(c.nom)} » : la structure doit rester ${Array.isArray(avant) ? "une liste" : "un objet"}.` };
      }
      return { ok: true, valeur };
    }
    default:
      return { ok: false, message: `« ${libelle(c.nom)} » ne se modifie pas.` };
  }
}

/** Deux valeurs égales au sens de la base : sert à n'écrire que ce qui change. */
export function memeValeur(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return (a ?? null) === (b ?? null);
}

/** « bons_caisse » devient « Bons caisse » ; « beneficiaire_tiers_id », « Beneficiaire tiers ». */
export function libelle(nom: string): string {
  const mots = nom.replace(/_id$/, "").split("_").filter(Boolean).join(" ");
  return mots.charAt(0).toLocaleUpperCase("fr-FR") + mots.slice(1);
}

/** Ordre de préférence des colonnes montrées dans une liste. */
const RESUME = [
  "numero",
  "nom",
  "full_name",
  "raison_sociale",
  "titre",
  "objet",
  "libelle",
  "designation",
  "reference",
  "immatriculation",
  "email",
  "statut",
  "montant",
  "total",
  "total_ttc",
  "actif",
];

/** Au plus cinq colonnes pour reconnaître une ligne dans une liste, la date de création en dernier. */
export function colonnesResume(t: TableDecrite): ColonneDecrite[] {
  const lisibles = t.colonnes.filter((c) => accesColonne(t.nom, c) !== "masquee");
  const choisies: ColonneDecrite[] = [];
  for (const nom of RESUME) {
    const c = lisibles.find((x) => x.nom === nom);
    if (c && choisies.length < 4) choisies.push(c);
  }
  for (const c of lisibles) {
    if (choisies.length >= 4) break;
    if (!choisies.includes(c) && (c.genre === "texte" || c.genre === "choix" || c.genre === "date") && !COLONNES_SYSTEME.has(c.nom)) choisies.push(c);
  }
  const creation = lisibles.find((c) => c.nom === "created_at");
  return creation ? [...choisies, creation] : choisies;
}

/** Colonnes où porte la recherche : le texte lisible. */
export function colonnesRecherche(t: TableDecrite): ColonneDecrite[] {
  return t.colonnes.filter((c) => (c.genre === "texte" || c.genre === "choix") && accesColonne(t.nom, c) !== "masquee");
}

/** Un montant se lit avec ses séparateurs ; une année, un rang ou un code, tel quel. */
export function estMontant(nom: string): boolean {
  return /(montant|total|prix|solde|cout|salaire|debit|credit|reste|budget|valeur|frais|net|brut|tarif|loyer|caution|plafond|seuil)/.test(nom);
}
