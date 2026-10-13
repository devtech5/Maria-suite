import type { Ecriture } from "@/lib/comptabilite/ecritures";
import { ECHELLE_QUANTITE, type CodeUnite } from "@/lib/quantite";

/**
 * Reprise de l'existant : ce que l'entreprise apporte en arrivant sur Maria Suite.
 * Articles, clients et fournisseurs, stock initial, et surtout les dettes et
 * créances antérieures — sans elles, un commerce qui a trois ans d'historique
 * repart de zéro et chaque solde affiché est faux.
 *
 * Règles pures : lecture des fichiers et écritures d'ouverture.
 *
 * La contrepartie de toute reprise est le 4711, compte d'attente : il porte
 * la situation nette d'ouverture le temps que le comptable la reclasse
 * (capital, report à nouveau). Un compte d'attente se voit et se solde ; un
 * report à nouveau deviné, lui, fausserait le bilan sans que personne le sache.
 */

export const COMPTE_REPRISE = { numero: "4711", libelle: "Compte d'attente — reprise des soldes antérieurs" } as const;
export const COMPTE_STOCK = { numero: "311", libelle: "Marchandises" } as const;

// ---------------------------------------------------------------- lecture

/** Sans accents, minuscules, espaces et tirets en soulignés : « Prix vente » → prix_vente. */
export function normaliserEntete(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-.'’/]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Lit un CSV tel qu'Excel l'enregistre en français : séparateur « ; » (ou
 * « , », ou tabulation, détecté sur l'en-tête), guillemets, BOM, fins de
 * ligne Windows. Rend une ligne par enregistrement, indexée par en-tête
 * normalisé, avec son numéro de ligne dans le fichier.
 */
export function lireCsv(texte: string): { entetes: string[]; lignes: { numero: number; valeurs: Record<string, string> }[] } {
  const propre = texte.replace(/^﻿/, "");
  const premiere = propre.split(/\r?\n/, 1)[0] ?? "";
  const separateur = [";", "\t", ","].map((s) => ({ s, n: premiere.split(s).length })).sort((a, b) => b.n - a.n)[0].s;

  const enregistrements: string[][] = [];
  let champ = "";
  let courant: string[] = [];
  let guillemets = false;
  for (let i = 0; i < propre.length; i++) {
    const c = propre[i];
    if (guillemets) {
      if (c === '"' && propre[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) {
      courant.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && propre[i + 1] === "\n") i++;
      courant.push(champ);
      enregistrements.push(courant);
      courant = [];
      champ = "";
    } else champ += c;
  }
  if (champ !== "" || courant.length > 0) {
    courant.push(champ);
    enregistrements.push(courant);
  }

  const [tete = [], ...corps] = enregistrements;
  const entetes = tete.map(normaliserEntete);
  const lignes = corps
    .map((valeurs, i) => ({ numero: i + 2, valeurs: Object.fromEntries(entetes.map((e, j) => [e, (valeurs[j] ?? "").trim()])) }))
    .filter((l) => Object.values(l.valeurs).some((v) => v !== ""));
  return { entetes, lignes };
}

/** « 1 250 000 », « 1250000 », « 1.250.000 » → 1250000. Refuse les centimes : le franc CFA n'en a pas. */
export function lireMontant(saisie: string): number | null {
  const t = saisie.replace(/[\s  ]/g, "").replace(/F(CFA)?$/i, "");
  if (t === "") return 0;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

/** « 2,5 » ou « 2.5 » → 2 500 millièmes. Trois décimales au plus. */
export function lireQuantite(saisie: string): number | null {
  const t = saisie.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const [entier, decimales = ""] = t.split(".");
  return Number(entier) * ECHELLE_QUANTITE + Number(decimales.padEnd(3, "0"));
}

/** « 31/12/2025 » ou « 2025-12-31 » → 2025-12-31. */
export function lireDate(saisie: string): string | null {
  const t = saisie.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return valideOuNul(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return valideOuNul(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  return null;
}

function valideOuNul(iso: string): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

const premier = (v: Record<string, string>, ...cles: string[]) => {
  for (const c of cles) if (v[c] !== undefined && v[c] !== "") return v[c];
  return "";
};

export interface Anomalie {
  ligne: number;
  message: string;
}

// ---------------------------------------------------------------- articles

export interface ArticleImporte {
  reference: string | null;
  designation: string;
  type: "marchandise" | "service";
  unite: CodeUnite;
  prixVente: number;
  prixAchat: number;
  /** Points de base : 1800 = 18 %. */
  tauxTva: number;
  seuilAlerte: number;
}

const UNITES: Record<string, CodeUnite> = {
  piece: "piece", pieces: "piece", pce: "piece", u: "piece", unite: "piece",
  kg: "kg", kilo: "kg", g: "g", gramme: "g",
  l: "l", litre: "l", ml: "ml",
  m: "m", metre: "m", m2: "m2", m3: "m3",
  heure: "heure", h: "heure", jour: "jour", j: "jour",
};

/** Taux de TVA : « 18 », « 18 % », « 9 », « 0 » ; vide → 18 %, le taux normal ivoirien. */
function lireTaux(saisie: string): number | null {
  const t = saisie.replace(/[\s%]/g, "").replace(",", ".");
  if (t === "") return 1800;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

export function lireArticles(texte: string): { articles: (ArticleImporte & { ligne: number })[]; anomalies: Anomalie[] } {
  const { lignes } = lireCsv(texte);
  const articles: (ArticleImporte & { ligne: number })[] = [];
  const anomalies: Anomalie[] = [];
  const references = new Set<string>();
  for (const { numero, valeurs: v } of lignes) {
    const designation = premier(v, "designation", "libelle", "nom", "article");
    const reference = premier(v, "reference", "ref", "code", "code_article") || null;
    const prixVente = lireMontant(premier(v, "prix_vente", "prix", "prix_de_vente", "pv"));
    const prixAchat = lireMontant(premier(v, "prix_achat", "prix_d_achat", "cout", "pa"));
    const tauxTva = lireTaux(premier(v, "tva", "taux_tva"));
    const seuil = lireQuantite(premier(v, "seuil_alerte", "seuil", "stock_minimum") || "0");
    const uniteSaisie = normaliserEntete(premier(v, "unite") || "piece");
    const unite = UNITES[uniteSaisie];
    const typeSaisie = normaliserEntete(premier(v, "type") || "marchandise");
    const type = typeSaisie.startsWith("serv") || typeSaisie === "prestation" ? "service" : "marchandise";

    if (!designation) anomalies.push({ ligne: numero, message: "Désignation manquante." });
    else if (prixVente === null || prixVente < 0) anomalies.push({ ligne: numero, message: `Prix de vente illisible : « ${premier(v, "prix_vente", "prix")} ». Francs entiers, sans centimes.` });
    else if (prixAchat === null || prixAchat < 0) anomalies.push({ ligne: numero, message: "Prix d'achat illisible." });
    else if (tauxTva === null) anomalies.push({ ligne: numero, message: "Taux de TVA illisible (18, 9 ou 0)." });
    else if (!unite) anomalies.push({ ligne: numero, message: `Unité inconnue : « ${premier(v, "unite")} ».` });
    else if (seuil === null) anomalies.push({ ligne: numero, message: "Seuil d'alerte illisible." });
    else if (reference && references.has(reference.toLowerCase())) anomalies.push({ ligne: numero, message: `Référence en double dans le fichier : ${reference}.` });
    else {
      if (reference) references.add(reference.toLowerCase());
      articles.push({ ligne: numero, reference, designation, type, unite, prixVente, prixAchat, tauxTva, seuilAlerte: seuil });
    }
  }
  return { articles, anomalies };
}

// ------------------------------------------------------------------- tiers

export interface TiersImporte {
  nom: string;
  estClient: boolean;
  estFournisseur: boolean;
  nature: "entreprise" | "particulier";
  telephone: string | null;
  email: string | null;
  ville: string | null;
  identifiantFiscal: string | null;
  /** Créance antérieure (client) ou dette antérieure (fournisseur), en francs. */
  solde: number;
  /** Échéance du solde repris ; vide → date de reprise. */
  echeance: string | null;
  referenceSolde: string | null;
}

export function lireTiers(texte: string): { tiers: (TiersImporte & { ligne: number })[]; anomalies: Anomalie[] } {
  const { lignes } = lireCsv(texte);
  const liste: (TiersImporte & { ligne: number })[] = [];
  const anomalies: Anomalie[] = [];
  for (const { numero, valeurs: v } of lignes) {
    const nom = premier(v, "nom", "raison_sociale", "client", "fournisseur", "tiers");
    const role = normaliserEntete(premier(v, "role", "type", "categorie") || "client");
    const estFournisseur = role.startsWith("fourn") || role.includes("deux") || role.includes("les_2");
    const estClient = !role.startsWith("fourn") || role.includes("deux") || role.includes("les_2");
    const natureSaisie = normaliserEntete(premier(v, "nature", "forme") || "entreprise");
    const solde = lireMontant(premier(v, "solde", "solde_initial", "solde_d_ouverture", "dette", "creance", "montant_du"));
    const echeanceSaisie = premier(v, "echeance", "date_echeance");
    const echeance = echeanceSaisie ? lireDate(echeanceSaisie) : null;
    const email = premier(v, "email", "e_mail", "courriel") || null;

    if (!nom) anomalies.push({ ligne: numero, message: "Nom manquant." });
    else if (solde === null || solde < 0) anomalies.push({ ligne: numero, message: "Solde illisible : francs entiers, positifs." })
    else if (estClient && estFournisseur && solde > 0) anomalies.push({ ligne: numero, message: "Un solde ne se reprend pas sur un tiers à la fois client et fournisseur : faites deux lignes." });
    else if (echeanceSaisie && !echeance) anomalies.push({ ligne: numero, message: `Échéance illisible : « ${echeanceSaisie} » (JJ/MM/AAAA).` });
    else if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) anomalies.push({ ligne: numero, message: `Adresse e-mail invalide : ${email}.` });
    else
      liste.push({
        ligne: numero,
        nom,
        estClient,
        estFournisseur,
        nature: natureSaisie.startsWith("part") || natureSaisie.startsWith("pers") ? "particulier" : "entreprise",
        telephone: premier(v, "telephone", "tel", "contact") || null,
        email: email?.toLowerCase() ?? null,
        ville: premier(v, "ville", "commune") || null,
        identifiantFiscal: premier(v, "ncc", "identifiant_fiscal", "numero_contribuable") || null,
        solde,
        echeance,
        referenceSolde: premier(v, "reference", "reference_solde", "piece") || null,
      });
  }
  return { tiers: liste, anomalies };
}

// ------------------------------------------------------------------- stock

export interface StockImporte {
  reference: string;
  depot: string | null;
  /** Millièmes d'unité. */
  quantite: number;
  /** Nul : le prix d'achat de la fiche article. */
  coutUnitaire: number | null;
}

export function lireStock(texte: string): { stock: (StockImporte & { ligne: number })[]; anomalies: Anomalie[] } {
  const { lignes } = lireCsv(texte);
  const stock: (StockImporte & { ligne: number })[] = [];
  const anomalies: Anomalie[] = [];
  for (const { numero, valeurs: v } of lignes) {
    const reference = premier(v, "reference", "ref", "code", "code_article");
    const quantite = lireQuantite(premier(v, "quantite", "qte", "stock"));
    const coutSaisi = premier(v, "cout_unitaire", "cout", "prix_achat", "pa");
    const cout = coutSaisi ? lireMontant(coutSaisi) : null;
    if (!reference) anomalies.push({ ligne: numero, message: "Référence d'article manquante." });
    else if (quantite === null || quantite === 0) anomalies.push({ ligne: numero, message: `Quantité illisible ou nulle : « ${premier(v, "quantite", "qte")} ».` });
    else if (coutSaisi && (cout === null || cout < 0)) anomalies.push({ ligne: numero, message: "Coût unitaire illisible." });
    else stock.push({ ligne: numero, reference, depot: premier(v, "depot", "magasin") || null, quantite, coutUnitaire: cout });
  }
  return { stock, anomalies };
}

// ------------------------------------------------------- écritures d'ouverture

const ligne = (compte: string, libelleCompte: string, debit: number, credit: number, auxiliaire?: string) => ({ compte, libelleCompte, debit, credit, auxiliaire });

/** Créance antérieure d'un client : 411 au débit, compte d'attente au crédit. */
export function ecritureRepriseClient(p: { piece: string; date: string; client: string; auxiliaire: string; montant: number }): Ecriture {
  if (!Number.isInteger(p.montant) || p.montant <= 0) throw new Error("Montant de reprise invalide.");
  return {
    journal: "OD",
    date: p.date,
    piece: p.piece,
    libelle: `Reprise du solde antérieur — ${p.client}`,
    lignes: [ligne("411", "Clients", p.montant, 0, p.auxiliaire), ligne(COMPTE_REPRISE.numero, COMPTE_REPRISE.libelle, 0, p.montant)],
  };
}

/** Dette antérieure envers un fournisseur : compte d'attente au débit, 401 au crédit. */
export function ecritureRepriseFournisseur(p: { piece: string; date: string; fournisseur: string; auxiliaire: string; montant: number }): Ecriture {
  if (!Number.isInteger(p.montant) || p.montant <= 0) throw new Error("Montant de reprise invalide.");
  return {
    journal: "OD",
    date: p.date,
    piece: p.piece,
    libelle: `Reprise de la dette antérieure — ${p.fournisseur}`,
    lignes: [ligne(COMPTE_REPRISE.numero, COMPTE_REPRISE.libelle, p.montant, 0), ligne("401", "Fournisseurs", 0, p.montant, p.auxiliaire)],
  };
}

/** Stock initial valorisé : 311 au débit, compte d'attente au crédit. */
export function ecritureRepriseStock(p: { piece: string; date: string; valeur: number }): Ecriture | null {
  if (p.valeur <= 0) return null;
  return {
    journal: "OD",
    date: p.date,
    piece: p.piece,
    libelle: "Reprise du stock initial",
    lignes: [ligne(COMPTE_STOCK.numero, COMPTE_STOCK.libelle, p.valeur, 0), ligne(COMPTE_REPRISE.numero, COMPTE_REPRISE.libelle, 0, p.valeur)],
  };
}

/** Solde d'ouverture d'un compte de trésorerie. Négatif : découvert bancaire. */
export function ecritureRepriseTresorerie(p: { piece: string; date: string; compte: string; libelle: string; solde: number }): Ecriture | null {
  if (!Number.isInteger(p.solde) || p.solde === 0) return null;
  const m = Math.abs(p.solde);
  return {
    journal: "OD",
    date: p.date,
    piece: p.piece,
    libelle: `Solde d'ouverture — ${p.libelle}`,
    lignes:
      p.solde > 0
        ? [ligne(p.compte, p.libelle, m, 0), ligne(COMPTE_REPRISE.numero, COMPTE_REPRISE.libelle, 0, m)]
        : [ligne(COMPTE_REPRISE.numero, COMPTE_REPRISE.libelle, m, 0), ligne(p.compte, p.libelle, 0, m)],
  };
}

/** Modèles de fichiers, téléchargeables depuis l'écran. */
export const MODELES = {
  articles: "reference;designation;type;unite;prix_vente;prix_achat;tva;seuil_alerte\nCIM-50;Ciment CPJ 45 sac 50 kg;marchandise;piece;5200;4600;18;20\nPOSE-01;Pose de carrelage;service;m2;2500;0;18;0\n",
  tiers: "nom;role;nature;telephone;email;ville;ncc;solde;echeance;reference\nSOCOCE Yopougon;client;entreprise;+2250700000000;achats@sococe.ci;Abidjan;1234567A;350000;31/10/2026;FAC-2025-118\nCimaf CI;fournisseur;entreprise;+2252720000000;;Abidjan;;1200000;15/11/2026;F-88421\n",
  stock: "reference;depot;quantite;cout_unitaire\nCIM-50;Magasin principal;120;4600\n",
} as const;
