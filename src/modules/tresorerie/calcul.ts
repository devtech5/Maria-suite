import type { CodeJournal, Ecriture, LigneEcriture } from "@/lib/comptabilite/ecritures";

/**
 * Trésorerie interne : règles pures, sans base ni React. Importable depuis le
 * navigateur — les libellés et les suggestions de compte servent aux écrans.
 *
 * Un principe tient tout le module : **aucun solde n'est stocké**. Le solde
 * d'une caisse ou d'une banque est la somme des écritures passées sur son
 * compte. Un solde tenu à part finit toujours par diverger de la comptabilité,
 * et personne ne sait plus lequel croire.
 */

export type NatureCompte = "caisse" | "banque" | "mobile_money";

export const LIBELLE_NATURE_COMPTE: Record<NatureCompte, string> = {
  caisse: "Caisse",
  banque: "Banque",
  mobile_money: "Mobile money",
};

/**
 * Comptes SYSCOHADA proposés à la création.
 *
 *   521x — banques locales, un sous-compte par banque ;
 *   57x  — caisses : 571 siège, 572 et suivants pour les succursales ;
 *   552x — monnaie électronique sur téléphone portable (SYSCOHADA révisé,
 *          classe 55 « instruments de monnaie électronique »).
 *
 * 5711 et 5712 sont réservés : la caisse du point de vente y passe le mobile
 * money encaissé, le guichet de transfert y tient son float.
 */
const CANDIDATS: Record<NatureCompte, string[]> = {
  banque: ["5211", "5212", "5213", "5214", "5215", "5216", "5217", "5218", "5219"],
  caisse: ["571", "572", "573", "574", "575", "576", "577", "578"],
  mobile_money: ["5521", "5522", "5523", "5524", "5525", "5526", "5527", "5528"],
};

export const COMPTES_RESERVES = ["5711", "5712"];

export function compteSuggere(nature: NatureCompte, dejaPris: readonly string[]): string | null {
  const pris = new Set([...dejaPris, ...COMPTES_RESERVES]);
  return CANDIDATS[nature].find((c) => !pris.has(c)) ?? null;
}

/**
 * Un compte de trésorerie est un compte de classe 5 : banque (52), établissement
 * financier (53), monnaie électronique (55) ou caisse (57). Jamais 58 : les
 * virements de fonds sont un compte de passage, pas un endroit où l'argent est.
 */
export function compteTresorerieValide(compte: string): boolean {
  return /^5[2357]\d{0,4}$/.test(compte);
}

/** Journal d'une écriture qui mouvemente ce compte. */
export function journalDe(nature: NatureCompte): CodeJournal {
  return nature === "banque" ? "BQ" : "CA";
}

export const COMPTE_VIREMENTS = { numero: "585", libelle: "Virements de fonds" } as const;
export const COMPTE_FRAIS_BANCAIRES = { numero: "631", libelle: "Frais bancaires" } as const;
export const COMPTE_AVANCES = { numero: "4251", libelle: "Personnel, avances" } as const;
export const COMPTE_MANQUANT = { numero: "658", libelle: "Charges diverses — manquant de caisse" } as const;
export const COMPTE_EXCEDENT = { numero: "758", libelle: "Produits divers — excédent de caisse" } as const;
export const COMPTE_PRODUITS_FINANCIERS = { numero: "771", libelle: "Intérêts et produits financiers" } as const;

export interface CompteRef {
  numero: string;
  libelle: string;
  nature: NatureCompte;
}

const ligne = (compte: { numero: string; libelle: string }, debit: number, credit: number): LigneEcriture => ({
  compte: compte.numero,
  libelleCompte: compte.libelle,
  debit,
  credit,
});

function equilibree(e: Ecriture): Ecriture {
  const d = e.lignes.reduce((s, l) => s + l.debit, 0);
  const c = e.lignes.reduce((s, l) => s + l.credit, 0);
  if (d !== c) throw new Error(`Écriture ${e.piece} déséquilibrée : ${d} au débit, ${c} au crédit.`);
  return e;
}

const montantValide = (n: number) => Number.isInteger(n) && n > 0;

// ------------------------------------------------------- virements internes

/**
 * Sortie d'un virement interne : l'argent quitte la source et passe au 585
 * tant qu'il n'est pas arrivé. Les frais d'envoi (frais Wave, commission de
 * versement) vont en 631.
 *
 *   585 Virements de fonds   débit   montant
 *   631 Frais bancaires      débit   frais
 *   5xx Source               crédit  montant + frais
 */
export function ecritureEnvoi(v: { numero: string; date: string; source: CompteRef; destination: string; montant: number; frais: number }): Ecriture {
  if (!montantValide(v.montant)) throw new Error("Montant invalide.");
  if (!Number.isInteger(v.frais) || v.frais < 0) throw new Error("Frais invalides.");
  const lignes = [ligne(COMPTE_VIREMENTS, v.montant, 0)];
  if (v.frais > 0) lignes.push(ligne(COMPTE_FRAIS_BANCAIRES, v.frais, 0));
  lignes.push(ligne(v.source, 0, v.montant + v.frais));
  return equilibree({
    journal: journalDe(v.source.nature),
    date: v.date,
    piece: `${v.numero}-E`,
    libelle: `Virement ${v.numero} — ${v.source.libelle} vers ${v.destination}`,
    lignes,
  });
}

/**
 * Arrivée d'un virement interne : la destination reçoit, le 585 se solde.
 *
 *   5xx Destination          débit   montant
 *   585 Virements de fonds   crédit  montant
 */
export function ecritureReception(v: { numero: string; date: string; destination: CompteRef; source: string; montant: number }): Ecriture {
  if (!montantValide(v.montant)) throw new Error("Montant invalide.");
  return equilibree({
    journal: journalDe(v.destination.nature),
    date: v.date,
    piece: `${v.numero}-R`,
    libelle: `Virement ${v.numero} — reçu de ${v.source}`,
    lignes: [ligne(v.destination, v.montant, 0), ligne(COMPTE_VIREMENTS, 0, v.montant)],
  });
}

// ------------------------------------------------------- caisse de dépenses

export type NatureBon = "fournitures" | "carburant" | "transport" | "mission" | "entretien" | "telecom" | "reception" | "divers";

/**
 * Nature d'une dépense de caisse et son compte de charge.
 *
 * La petite caisse paie TTC et sans facture en règle la plupart du temps :
 * pas de TVA récupérable, la charge prend le montant entier.
 */
export const NATURES_BON: Record<NatureBon, { libelle: string; compte: string; libelleCompte: string }> = {
  fournitures: { libelle: "Fournitures, petit matériel", compte: "605", libelleCompte: "Autres achats" },
  carburant: { libelle: "Carburant", compte: "6042", libelleCompte: "Matières combustibles" },
  transport: { libelle: "Transport, taxi, livraison", compte: "618", libelleCompte: "Autres frais de transport" },
  mission: { libelle: "Frais de mission", compte: "6181", libelleCompte: "Voyages et déplacements" },
  entretien: { libelle: "Entretien, réparation", compte: "624", libelleCompte: "Entretien, réparations et maintenance" },
  telecom: { libelle: "Crédit téléphone, internet", compte: "628", libelleCompte: "Frais de télécommunications" },
  reception: { libelle: "Réception, restauration", compte: "6276", libelleCompte: "Frais de réception" },
  divers: { libelle: "Divers", compte: "658", libelleCompte: "Charges diverses" },
};

/**
 * Décaissement d'un bon de caisse.
 *
 *   6xx Charge          débit   montant
 *   57x Caisse          crédit  montant
 */
export function ecritureBon(b: { numero: string; date: string; caisse: CompteRef; nature: NatureBon; montant: number; beneficiaire: string }): Ecriture {
  if (!montantValide(b.montant)) throw new Error("Montant invalide.");
  const n = NATURES_BON[b.nature];
  return equilibree({
    journal: journalDe(b.caisse.nature),
    date: b.date,
    piece: b.numero,
    libelle: `Bon ${b.numero} — ${n.libelle}, ${b.beneficiaire}`,
    lignes: [ligne({ numero: n.compte, libelle: n.libelleCompte }, b.montant, 0), ligne(b.caisse, 0, b.montant)],
  });
}

/**
 * Remise d'une avance : l'argent sort, la personne le doit à l'entreprise.
 *
 *   4251 Personnel, avances   débit   montant
 *   57x  Caisse               crédit  montant
 */
export function ecritureAvance(a: { numero: string; date: string; caisse: CompteRef; montant: number; beneficiaire: string }): Ecriture {
  if (!montantValide(a.montant)) throw new Error("Montant invalide.");
  return equilibree({
    journal: journalDe(a.caisse.nature),
    date: a.date,
    piece: a.numero,
    libelle: `Avance ${a.numero} — ${a.beneficiaire}`,
    lignes: [ligne(COMPTE_AVANCES, a.montant, 0), ligne(a.caisse, 0, a.montant)],
  });
}

/**
 * Justification d'une avance par une dépense : la créance sur la personne
 * devient une charge. Aucun argent ne bouge, d'où le journal des opérations
 * diverses.
 *
 *   6xx Charge                débit   montant
 *   4251 Personnel, avances   crédit  montant
 */
export function ecritureJustification(j: { piece: string; date: string; nature: NatureBon; montant: number; beneficiaire: string }): Ecriture {
  if (!montantValide(j.montant)) throw new Error("Montant invalide.");
  const n = NATURES_BON[j.nature];
  return equilibree({
    journal: "OD",
    date: j.date,
    piece: j.piece,
    libelle: `Justification ${j.piece} — ${n.libelle}, ${j.beneficiaire}`,
    lignes: [ligne({ numero: n.compte, libelle: n.libelleCompte }, j.montant, 0), ligne(COMPTE_AVANCES, 0, j.montant)],
  });
}

/**
 * Remboursement du reliquat d'une avance, en espèces ou sur un compte.
 *
 *   57x Caisse                débit   montant
 *   4251 Personnel, avances   crédit  montant
 */
export function ecritureRemboursement(r: { piece: string; date: string; caisse: CompteRef; montant: number; beneficiaire: string }): Ecriture {
  if (!montantValide(r.montant)) throw new Error("Montant invalide.");
  return equilibree({
    journal: journalDe(r.caisse.nature),
    date: r.date,
    piece: r.piece,
    libelle: `Remboursement ${r.piece} — ${r.beneficiaire}`,
    lignes: [ligne(r.caisse, r.montant, 0), ligne(COMPTE_AVANCES, 0, r.montant)],
  });
}

/** Reste dû sur une avance : remis moins justifié moins remboursé. */
export function resteAvance(montant: number, regularisations: readonly { montant: number }[]): number {
  return montant - regularisations.reduce((s, r) => s + r.montant, 0);
}

/** Une régularisation ne peut pas dépasser ce qui reste dû. */
export function refusRegularisation(reste: number, montant: number): string | null {
  if (!montantValide(montant)) return "Montant invalide.";
  if (montant > reste) return `Il ne reste que ${reste.toLocaleString("fr-FR")} F à régulariser sur cette avance.`;
  return null;
}

// ------------------------------------------------------------ arrêté de caisse

/**
 * Écart d'un arrêté de caisse : compté moins attendu. Un manquant est une
 * charge, un excédent un produit — jamais un compte d'attente, qui finit par
 * cacher un vol régulier sous un solde que personne ne justifie.
 */
export function ecritureArrete(a: { numero: string; date: string; caisse: CompteRef; ecart: number }): Ecriture | null {
  if (!Number.isInteger(a.ecart)) throw new Error("Écart invalide.");
  if (a.ecart === 0) return null;
  const montant = Math.abs(a.ecart);
  return equilibree({
    journal: journalDe(a.caisse.nature),
    date: a.date,
    piece: a.numero,
    libelle: `Arrêté ${a.numero} — ${a.ecart < 0 ? "manquant" : "excédent"} ${a.caisse.libelle}`,
    lignes:
      a.ecart < 0
        ? [ligne(COMPTE_MANQUANT, montant, 0), ligne(a.caisse, 0, montant)]
        : [ligne(a.caisse, montant, 0), ligne(COMPTE_EXCEDENT, 0, montant)],
  });
}

// ------------------------------------------------------------- relevé bancaire

export interface LigneReleve {
  date: string;
  libelle: string;
  /** Signé du point de vue de l'entreprise : positif, l'argent est entré. */
  montant: number;
}

/**
 * Montant lu dans un relevé, en francs entiers et sans passer par un flottant.
 *
 * Accepte « 1 250 000 », « 1.250.000 », « 1250000,00 », « -42 000 », « (42 000) ».
 * Le franc CFA n'a pas de centimes : une partie décimale non nulle est
 * arrondie au franc le plus proche, à la main, chiffre par chiffre.
 */
export function lireMontant(brut: string): number | null {
  let s = brut.trim().replace(/[\s  ]/g, "").replace(/(F|FCFA|XOF)$/i, "");
  if (!s) return null;
  let negatif = false;
  if (/^\(.*\)$/.test(s)) {
    negatif = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negatif = !negatif;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    negatif = !negatif;
    s = s.slice(0, -1);
  }

  // Séparateur décimal : la virgule, ou un point suivi d'un ou deux chiffres en fin.
  let entier = s;
  let decimales = "";
  const virgule = s.lastIndexOf(",");
  if (virgule >= 0) {
    entier = s.slice(0, virgule);
    decimales = s.slice(virgule + 1);
  } else {
    const point = /\.(\d{1,2})$/.exec(s);
    if (point) {
      entier = s.slice(0, point.index);
      decimales = point[1];
    }
  }
  entier = entier.replace(/\./g, "");
  if (!/^\d+$/.test(entier) || (decimales && !/^\d+$/.test(decimales))) return null;

  let valeur = Number(entier);
  if (!Number.isSafeInteger(valeur)) return null;
  if (decimales && Number(decimales[0]) >= 5) valeur += 1;
  return negatif ? -valeur : valeur;
}

/** Date d'un relevé en jour ISO : 05/10/2026, 05-10-2026, 05/10/26, 2026-10-05. */
export function lireDate(brut: string): string | null {
  const s = brut.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valider(m[1], m[2], m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return valider(m[3].length === 2 ? `20${m[3]}` : m[3], m[2].padStart(2, "0"), m[1].padStart(2, "0"));
  return null;
}

function valider(a: string, mo: string, j: string): string | null {
  const iso = `${a}-${mo}-${j}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

function decouper(ligneTexte: string, separateur: string): string[] {
  const cellules: string[] = [];
  let courant = "";
  let guillemets = false;
  for (let i = 0; i < ligneTexte.length; i++) {
    const c = ligneTexte[i];
    if (c === '"') {
      if (guillemets && ligneTexte[i + 1] === '"') {
        courant += '"';
        i++;
      } else guillemets = !guillemets;
    } else if (c === separateur && !guillemets) {
      cellules.push(courant);
      courant = "";
    } else courant += c;
  }
  cellules.push(courant);
  return cellules.map((x) => x.trim());
}

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lit un relevé bancaire exporté en CSV.
 *
 * Chaque banque a son format : on ne le devine pas, on le reconnaît par les
 * en-têtes. Il faut une colonne de date, une de libellé, et soit un montant
 * signé, soit une colonne de débit et une de crédit. Séparateur point-virgule,
 * virgule ou tabulation, détecté sur la ligne d'en-tête.
 */
export function lireReleve(texte: string): { lignes: LigneReleve[]; erreurs: string[] } {
  const brutes = texte.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (brutes.length === 0) return { lignes: [], erreurs: ["Le fichier est vide."] };

  // L'en-tête est la première ligne qui nomme une date : certaines banques
  // mettent d'abord le nom du compte et la période.
  const indexEntete = brutes.findIndex((l) => /date/i.test(l));
  if (indexEntete < 0) return { lignes: [], erreurs: ["Aucune ligne d'en-tête avec une colonne « Date »."] };

  const enteteBrute = brutes[indexEntete];
  const separateur = [";", "\t", ","].reduce((meilleur, sep) =>
    enteteBrute.split(sep).length > enteteBrute.split(meilleur).length ? sep : meilleur,
  );
  const entete = decouper(enteteBrute, separateur).map(sansAccent);

  // Une colonne de date n'est jamais celle d'un libellé ou d'un montant, même
  // si son nom contient « opération » (« Date opération »).
  const colonne = (...noms: string[]) => entete.findIndex((h) => !h.startsWith("date") && noms.some((n) => h.includes(n)));
  const iDate = entete.findIndex((h) => h.startsWith("date") && !h.includes("valeur"));
  const iDateValeur = entete.findIndex((h) => h.startsWith("date") && h.includes("valeur"));
  const iLibelle = colonne("libelle", "description", "operation", "intitule", "motif", "reference");
  const iDebit = colonne("debit", "sortie", "retrait");
  const iCredit = colonne("credit", "entree", "versement", "depot");
  const iMontant = colonne("montant", "amount");

  const erreurs: string[] = [];
  const dateCol = iDate >= 0 ? iDate : iDateValeur;
  if (dateCol < 0) erreurs.push("Colonne de date introuvable.");
  if (iMontant < 0 && (iDebit < 0 || iCredit < 0)) erreurs.push("Il faut une colonne « Montant », ou deux colonnes « Débit » et « Crédit ».");
  if (erreurs.length) return { lignes: [], erreurs };

  const lignes: LigneReleve[] = [];
  brutes.slice(indexEntete + 1).forEach((brute, i) => {
    const c = decouper(brute, separateur);
    const numero = indexEntete + i + 2;
    const date = lireDate(c[dateCol] ?? "");
    if (!date) {
      // Une ligne de total ou de solde en pied de relevé n'a pas de date : on la passe.
      if (/solde|total/i.test(brute)) return;
      erreurs.push(`Ligne ${numero} : date illisible (« ${c[dateCol] ?? ""} »).`);
      return;
    }
    let montant: number | null;
    if (iMontant >= 0 && (c[iMontant] ?? "") !== "") montant = lireMontant(c[iMontant]);
    else {
      const debit = c[iDebit] ? lireMontant(c[iDebit]) : 0;
      const credit = c[iCredit] ? lireMontant(c[iCredit]) : 0;
      montant = debit === null || credit === null ? null : (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (montant === null) {
      erreurs.push(`Ligne ${numero} : montant illisible.`);
      return;
    }
    if (montant === 0) return;
    lignes.push({ date, libelle: (iLibelle >= 0 ? c[iLibelle] : "") || "Sans libellé", montant });
  });
  return { lignes, erreurs };
}

// ------------------------------------------------------------- rapprochement

export interface ARapprocherReleve {
  id: string;
  date: string;
  montant: number;
}

export interface ARapprocherEcriture {
  id: string;
  date: string;
  /** Débit moins crédit sur le compte de banque : positif, l'argent est entré. */
  montant: number;
}

const ecartJours = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * Pointage automatique : une ligne de relevé et une ligne d'écriture se
 * répondent si elles portent le MÊME montant à quelques jours près — la
 * banque crédite souvent un ou deux jours après la remise.
 *
 * Un pour un, jamais deux lignes de relevé sur la même écriture. Quand
 * plusieurs écritures conviennent, la plus proche en date l'emporte. Le
 * montant n'est jamais approché : 50 000 et 50 500 restent séparés, c'est à
 * quelqu'un de regarder.
 */
export function rapprocherAuto(
  releve: readonly ARapprocherReleve[],
  ecritures: readonly ARapprocherEcriture[],
  toleranceJours = 3,
): { releveId: string; ecritureId: string }[] {
  const prises = new Set<string>();
  const paires: { releveId: string; ecritureId: string }[] = [];
  const ordre = [...releve].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const r of ordre) {
    let meilleure: ARapprocherEcriture | null = null;
    for (const e of ecritures) {
      if (prises.has(e.id) || e.montant !== r.montant) continue;
      const ecart = ecartJours(e.date, r.date);
      if (ecart > toleranceJours) continue;
      if (!meilleure || ecart < ecartJours(meilleure.date, r.date)) meilleure = e;
    }
    if (meilleure) {
      prises.add(meilleure.id);
      paires.push({ releveId: r.id, ecritureId: meilleure.id });
    }
  }
  return paires;
}

/**
 * Comptabilise une ligne de relevé sans écriture : frais prélevés par la
 * banque (631) ou intérêts versés (771).
 */
export function ecritureLigneReleve(l: { piece: string; date: string; banque: CompteRef; montant: number; libelle: string }): Ecriture {
  if (!Number.isInteger(l.montant) || l.montant === 0) throw new Error("Montant invalide.");
  const m = Math.abs(l.montant);
  return equilibree({
    journal: "BQ",
    date: l.date,
    piece: l.piece,
    libelle: `${l.montant < 0 ? "Frais" : "Produit"} bancaire — ${l.libelle}`.slice(0, 200),
    lignes:
      l.montant < 0
        ? [ligne(COMPTE_FRAIS_BANCAIRES, m, 0), ligne(l.banque, 0, m)]
        : [ligne(l.banque, m, 0), ligne(COMPTE_PRODUITS_FINANCIERS, 0, m)],
  });
}

// ---------------------------------------------------------- plan de trésorerie

export interface Flux {
  date: string;
  /** Signé : positif, l'argent entre. */
  montant: number;
  libelle: string;
  origine: "facture" | "depense" | "bon" | "intervenant" | "avance" | "fournisseur" | "paie" | "tva" | "impot" | "commission" | "recurrente";
}

export interface Semaine {
  debut: string;
  fin: string;
  entrees: number;
  sorties: number;
  soldeFin: number;
  flux: Flux[];
}

const plusJours = (iso: string, jours: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10);

/**
 * Plan de trésorerie par semaine.
 *
 * Part du solde disponible aujourd'hui et y ajoute, semaine après semaine, ce
 * qui doit entrer (factures clients à leur échéance) et sortir (dépenses
 * approuvées, bons à décaisser, sommes dues aux intervenants). Ce qui est déjà
 * en retard tombe dans la première semaine : une facture échue n'a pas
 * disparu, elle est attendue maintenant.
 *
 * Rend aussi le premier jour où le solde passe sous zéro — la seule date qui
 * compte vraiment sur cet écran.
 */
export function planTresorerie(
  soldeInitial: number,
  flux: readonly Flux[],
  aujourdhui: string,
  semaines = 13,
): { semaines: Semaine[]; premierDecouvert: string | null; horsHorizon: number } {
  const resultat: Semaine[] = [];
  let solde = soldeInitial;
  let premierDecouvert: string | null = solde < 0 ? aujourdhui : null;
  const fin = plusJours(aujourdhui, semaines * 7 - 1);

  for (let s = 0; s < semaines; s++) {
    const debut = plusJours(aujourdhui, s * 7);
    const finSemaine = plusJours(debut, 6);
    const dedans = flux
      .filter((f) => (s === 0 ? f.date <= finSemaine : f.date >= debut && f.date <= finSemaine))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.montant - b.montant));
    let entrees = 0;
    let sorties = 0;
    for (const f of dedans) {
      if (f.montant >= 0) entrees += f.montant;
      else sorties += -f.montant;
      solde += f.montant;
      if (solde < 0 && !premierDecouvert) premierDecouvert = f.date < aujourdhui ? aujourdhui : f.date;
    }
    resultat.push({ debut, fin: finSemaine, entrees, sorties, soldeFin: solde, flux: dedans });
  }

  return { semaines: resultat, premierDecouvert, horsHorizon: flux.filter((f) => f.date > fin).length };
}
