import type { CodeJournal, Ecriture, LigneEcriture } from "@/lib/comptabilite/ecritures";
import { divideMoney, rateOf } from "@/lib/money";
import { BAREME_CI } from "@/modules/personnes/paie";
import { jourDecompte, joursDecomptes, joursEntre, type OptionsDecompte } from "@/modules/presences/calcul";

/**
 * Paie : règles pures, sans base ni React.
 *
 * Le barème n'est plus figé dans le code : chaque entreprise le porte, et un
 * responsable atteste l'avoir vérifié auprès de la CNPS et de la DGI avant que
 * le premier bulletin puisse être émis. Les valeurs par défaut sont celles du
 * moteur de démonstration — elles ne valent rien tant que personne ne les a
 * confrontées à un bulletin réel.
 *
 * Tous les taux en points de base (630 = 6,30 %), tous les montants en francs
 * entiers. La cascade : brut − cotisations salariales − impôt + indemnités non
 * imposables − retenues = net.
 */

export interface TrancheImpot {
  /** Le taux s'applique à la part du revenu imposable AU-DESSUS de ce seuil. */
  seuil: number;
  tauxBp: number;
}

export interface BaremePaie {
  cnpsRetraiteSalarieBp: number;
  cnpsRetraitePatronalBp: number;
  /** Plafond mensuel de l'assiette retraite. */
  cnpsPlafondMensuel: number;
  prestationsFamilialesBp: number;
  accidentTravailBp: number;
  /** Barème progressif de l'impôt sur salaire, par tranches marginales. */
  tranchesImpot: TrancheImpot[];
}

/** Barème de départ : celui de la démonstration, à vérifier avant tout usage réel. */
export const BAREME_PAR_DEFAUT: BaremePaie = {
  cnpsRetraiteSalarieBp: BAREME_CI.cnpsRetraiteSalarieBp,
  cnpsRetraitePatronalBp: BAREME_CI.cnpsRetraitePatronalBp,
  cnpsPlafondMensuel: BAREME_CI.cnpsPlafondMensuel,
  prestationsFamilialesBp: BAREME_CI.prestationsFamilialesBp,
  accidentTravailBp: BAREME_CI.accidentTravailBp,
  tranchesImpot: [
    { seuil: 75_000, tauxBp: 150 },
    { seuil: 240_000, tauxBp: 500 },
    { seuil: 800_000, tauxBp: 1_000 },
  ],
};

/** Contrôle d'un barème saisi : rend le motif du refus, ou `null`. */
export function refusBareme(b: BaremePaie): string | null {
  const taux = [b.cnpsRetraiteSalarieBp, b.cnpsRetraitePatronalBp, b.prestationsFamilialesBp, b.accidentTravailBp];
  if (taux.some((t) => !Number.isInteger(t) || t < 0 || t > 5_000)) return "Un taux de cotisation doit être compris entre 0 et 50 %.";
  if (!Number.isInteger(b.cnpsPlafondMensuel) || b.cnpsPlafondMensuel <= 0) return "Le plafond CNPS doit être un montant positif.";
  if (b.tranchesImpot.some((t) => !Number.isInteger(t.seuil) || t.seuil < 0 || !Number.isInteger(t.tauxBp) || t.tauxBp < 0 || t.tauxBp > 6_000)) {
    return "Chaque tranche d'impôt porte un seuil positif et un taux entre 0 et 60 %.";
  }
  const seuils = b.tranchesImpot.map((t) => t.seuil);
  if (new Set(seuils).size !== seuils.length) return "Deux tranches d'impôt ont le même seuil.";
  return null;
}

/**
 * Impôt progressif par tranches marginales : chaque taux ne frappe que la part
 * du revenu comprise entre son seuil et le seuil suivant.
 */
export function impotProgressif(base: number, tranches: readonly TrancheImpot[]): number {
  if (base <= 0) return 0;
  const triees = [...tranches].sort((a, b) => a.seuil - b.seuil);
  let impot = 0;
  for (let i = 0; i < triees.length; i++) {
    const bas = triees[i].seuil;
    const haut = triees[i + 1]?.seuil ?? Infinity;
    if (base <= bas) break;
    impot += rateOf(Math.min(base, haut) - bas, triees[i].tauxBp);
  }
  return impot;
}

export interface ElementsVariables {
  salaireBase: number;
  /** Part du salaire de base non due : jours hors contrat, sans solde, absences. */
  retenueAbsence?: number;
  /** Primes et heures supplémentaires : soumises à cotisations et à l'impôt. */
  primesImposables: number;
  /** Indemnités de transport, de panier : ni cotisées ni imposées, dans les limites légales. */
  indemnitesNonImposables: number;
  /** Retenues sur le net : remboursement d'avance, de prêt, cantine. */
  retenuesDiverses: number;
}

export interface CalculBulletin {
  brut: number;
  assietteCnps: number;
  cnpsSalarie: number;
  baseImposable: number;
  impot: number;
  net: number;
  cnpsPatronal: number;
  prestationsFamiliales: number;
  accidentTravail: number;
  chargesPatronales: number;
  /** Ce que l'employeur débourse : brut, indemnités et charges patronales. */
  coutTotal: number;
}

/**
 * Bulletin d'un salarié. L'assiette retraite est plafonnée ; celles des
 * prestations familiales et de l'accident du travail ne le sont pas.
 */
export function calculerBulletinPaie(e: ElementsVariables, b: BaremePaie): CalculBulletin {
  const retenueAbsence = e.retenueAbsence ?? 0;
  for (const v of [e.salaireBase, retenueAbsence, e.primesImposables, e.indemnitesNonImposables, e.retenuesDiverses]) {
    if (!Number.isInteger(v) || v < 0) throw new Error("Les éléments de paie sont des montants entiers positifs.");
  }
  if (retenueAbsence > e.salaireBase) throw new Error("La retenue pour absence dépasse le salaire de base.");
  const brut = e.salaireBase - retenueAbsence + e.primesImposables;
  const assietteCnps = Math.min(brut, b.cnpsPlafondMensuel);
  const cnpsSalarie = rateOf(assietteCnps, b.cnpsRetraiteSalarieBp);
  const baseImposable = brut - cnpsSalarie;
  const impot = impotProgressif(baseImposable, b.tranchesImpot);
  const net = brut - cnpsSalarie - impot + e.indemnitesNonImposables - e.retenuesDiverses;
  if (net < 0) throw new Error("Les retenues dépassent ce qui revient au salarié : le net serait négatif.");
  const cnpsPatronal = rateOf(assietteCnps, b.cnpsRetraitePatronalBp);
  const prestationsFamiliales = rateOf(brut, b.prestationsFamilialesBp);
  const accidentTravail = rateOf(brut, b.accidentTravailBp);
  const chargesPatronales = cnpsPatronal + prestationsFamiliales + accidentTravail;
  return {
    brut,
    assietteCnps,
    cnpsSalarie,
    baseImposable,
    impot,
    net,
    cnpsPatronal,
    prestationsFamiliales,
    accidentTravail,
    chargesPatronales,
    coutTotal: brut + e.indemnitesNonImposables + chargesPatronales,
  };
}

export interface TotauxPaie {
  brut: number;
  indemnites: number;
  retenues: number;
  cnpsSalarie: number;
  impot: number;
  net: number;
  chargesPatronales: number;
  /** Tout ce qui part à la CNPS : parts salariale et patronale, prestations, accident. */
  totalCnps: number;
}

export function totaliser(bulletins: readonly (CalculBulletin & { indemnitesNonImposables: number; retenuesDiverses: number })[]): TotauxPaie {
  const s = (f: (b: (typeof bulletins)[number]) => number) => bulletins.reduce((t, b) => t + f(b), 0);
  return {
    brut: s((b) => b.brut),
    indemnites: s((b) => b.indemnitesNonImposables),
    retenues: s((b) => b.retenuesDiverses),
    cnpsSalarie: s((b) => b.cnpsSalarie),
    impot: s((b) => b.impot),
    net: s((b) => b.net),
    chargesPatronales: s((b) => b.chargesPatronales),
    totalCnps: s((b) => b.cnpsSalarie + b.chargesPatronales),
  };
}

const C = {
  salaires: { numero: "661", libelle: "Rémunérations directes versées au personnel" },
  indemnites: { numero: "663", libelle: "Indemnités forfaitaires versées au personnel" },
  chargesSociales: { numero: "664", libelle: "Charges sociales" },
  remunerationsDues: { numero: "422", libelle: "Personnel, rémunérations dues" },
  avances: { numero: "4251", libelle: "Personnel, avances" },
  cnps: { numero: "431", libelle: "Sécurité sociale (CNPS)" },
  impot: { numero: "447", libelle: "État, impôts retenus à la source" },
} as const;

export const COMPTES_PAIE = C;

const ligne = (c: { numero: string; libelle: string }, debit: number, credit: number): LigneEcriture => ({ compte: c.numero, libelleCompte: c.libelle, debit, credit });

/**
 * Écriture de paie du mois, au journal des opérations diverses.
 *
 *   661 Salaires bruts            débit   brut
 *   663 Indemnités                débit   indemnités non imposables
 *   664 Charges sociales          débit   part patronale
 *   431 CNPS                      crédit  parts salariale et patronale
 *   447 Impôt retenu              crédit  impôt sur salaire
 *   4251 Avances                  crédit  retenues diverses
 *   422 Rémunérations dues        crédit  net à payer
 */
export function ecriturePaie(p: { mois: string; date: string; totaux: TotauxPaie; salaries: number }): Ecriture {
  const t = p.totaux;
  const lignes = [
    ligne(C.salaires, t.brut, 0),
    ...(t.indemnites ? [ligne(C.indemnites, t.indemnites, 0)] : []),
    ...(t.chargesPatronales ? [ligne(C.chargesSociales, t.chargesPatronales, 0)] : []),
    ...(t.totalCnps ? [ligne(C.cnps, 0, t.totalCnps)] : []),
    ...(t.impot ? [ligne(C.impot, 0, t.impot)] : []),
    ...(t.retenues ? [ligne(C.avances, 0, t.retenues)] : []),
    ligne(C.remunerationsDues, 0, t.net),
  ];
  const debit = lignes.reduce((s, l) => s + l.debit, 0);
  const credit = lignes.reduce((s, l) => s + l.credit, 0);
  if (debit !== credit) throw new Error(`Écriture de paie déséquilibrée : ${debit} contre ${credit}.`);
  return { journal: "OD", date: p.date, piece: `PAIE-${p.mois}`, libelle: `Paie de ${libelleMois(p.mois)} — ${p.salaries} salarié${p.salaries > 1 ? "s" : ""}`, lignes };
}

/** Versement d'un salaire : la dette envers le salarié s'éteint. */
export function ecriturePaiementSalaire(v: {
  piece: string;
  date: string;
  salarie: string;
  montant: number;
  tresorerie: { numero: string; libelle: string; journal: CodeJournal };
}): Ecriture {
  if (!Number.isInteger(v.montant) || v.montant <= 0) throw new Error("Montant invalide.");
  return {
    journal: v.tresorerie.journal,
    date: v.date,
    piece: v.piece,
    libelle: `Salaire — ${v.salarie}`,
    lignes: [ligne(C.remunerationsDues, v.montant, 0), ligne(v.tresorerie, 0, v.montant)],
  };
}

/** Versement à un organisme : la CNPS (431) ou le Trésor pour l'impôt retenu (447). */
export function ecritureVersement(v: {
  organisme: "cnps" | "impot";
  piece: string;
  date: string;
  mois: string;
  montant: number;
  tresorerie: { numero: string; libelle: string; journal: CodeJournal };
}): Ecriture {
  if (!Number.isInteger(v.montant) || v.montant <= 0) throw new Error("Rien à verser.");
  const compte = v.organisme === "cnps" ? C.cnps : C.impot;
  return {
    journal: v.tresorerie.journal,
    date: v.date,
    piece: v.piece,
    libelle: `${v.organisme === "cnps" ? "Cotisations CNPS" : "Impôt sur salaires"} de ${libelleMois(v.mois)}`,
    lignes: [ligne(compte, v.montant, 0), ligne(v.tresorerie, 0, v.montant)],
  };
}

// ------------------------------------------------------------------ absences

/**
 * Jours payés ou non : la paie se cale sur le même décompte que les congés
 * (jours ouvrables ou ouvrés, fériés exclus, réglés dans Présences). Un mois
 * compte ses jours décomptables ; un salarié entré le 15, parti le 10 ou en
 * congé sans solde ne touche que la part de son salaire de base qui
 * correspond aux jours dus. Tout en CENTIÈMES de jour, comme les congés.
 *
 * Les autres natures d'absence (maladie, maternité, événement familial) ne
 * retiennent rien d'elles-mêmes : leur maintien de salaire dépend de
 * l'ancienneté et de la convention, et se règle à la main sur le bulletin.
 */
export interface PeriodeAbsence {
  debut: string;
  fin: string;
  /** Part l'après-midi du premier jour. */
  debutDemi: boolean;
  /** Rentre l'après-midi du dernier jour. */
  finDemi: boolean;
}

export interface CongeDuMois extends PeriodeAbsence {
  employeeId: string;
  nature: "paye" | "sans_solde";
}

/** Ce que Présences sait du mois, lu une fois pour toute la paie. */
export interface ContexteAbsences {
  options: OptionsDecompte;
  /** Congés ACCORDÉS qui touchent le mois, payés et sans solde. */
  conges: readonly CongeDuMois[];
  /** Solde de congés payés de chaque salarié à la fin du mois, en centièmes. */
  soldes: ReadonlyMap<string, number>;
}

export interface AbsencesDuMois {
  /** Jours décomptables du mois : la base du prorata. */
  joursMois: number;
  /** Jours avant l'embauche ou après le terme du contrat. */
  joursHorsContrat: number;
  /** Jours de congé sans solde accordés. */
  joursSansSolde: number;
  /** Jours de congé payé accordés : sans effet sur le salaire, imprimés sur le bulletin. */
  congesPris: number;
  /** Solde de congés payés en fin de mois ; `null` si Présences ne le connaît pas. */
  soldeConges: number | null;
}

/** Premier et dernier jour d'un mois `AAAA-MM`. */
export function bornesMois(mois: string): { debut: string; fin: string } {
  return { debut: `${mois}-01`, fin: finDeMois(mois) };
}

/**
 * Jours décomptés d'une absence, rognée aux bornes données. Une demi-journée
 * ne vaut qu'au bord réel de l'absence : un congé du 28 au 3 qui part
 * l'après-midi du 28 ne retire pas une demi-journée au 1er du mois suivant.
 */
function joursDansBornes(a: PeriodeAbsence, debut: string, fin: string, o: OptionsDecompte): number {
  const d = a.debut > debut ? a.debut : debut;
  const f = a.fin < fin ? a.fin : fin;
  if (f < d) return 0;
  return joursDecomptes(d, f, o, { debut: a.debutDemi && d === a.debut, fin: a.finDemi && f === a.fin });
}

export function absencesDuMois(mois: string, salarie: { id: string; debut: string; fin: string | null }, ctx: ContexteAbsences): AbsencesDuMois {
  const bornes = bornesMois(mois);
  const jours = joursEntre(bornes.debut, bornes.fin).filter((j) => jourDecompte(j, ctx.options));
  const joursMois = jours.length * 100;
  const joursHorsContrat = jours.filter((j) => j < salarie.debut || (salarie.fin !== null && j > salarie.fin)).length * 100;

  // Les congés ne comptent que pendant le contrat : le hors-contrat est déjà retenu.
  const debut = salarie.debut > bornes.debut ? salarie.debut : bornes.debut;
  const fin = salarie.fin !== null && salarie.fin < bornes.fin ? salarie.fin : bornes.fin;
  const siens = ctx.conges.filter((c) => c.employeeId === salarie.id);
  const somme = (nature: CongeDuMois["nature"]) => siens.filter((c) => c.nature === nature).reduce((t, c) => t + joursDansBornes(c, debut, fin, ctx.options), 0);

  return {
    joursMois,
    joursHorsContrat,
    joursSansSolde: Math.min(somme("sans_solde"), joursMois - joursHorsContrat),
    congesPris: somme("paye"),
    soldeConges: ctx.soldes.get(salarie.id) ?? null,
  };
}

/**
 * Part du salaire de base retenue pour `joursNonPayes` sur `joursMois`. Tout
 * le mois non payé retient tout le salaire, au franc près.
 */
export function retenueAbsence(salaireBase: number, joursNonPayes: number, joursMois: number): number {
  if (joursMois <= 0 || joursNonPayes <= 0) return 0;
  if (joursNonPayes >= joursMois) return salaireBase;
  return divideMoney(salaireBase * joursNonPayes, joursMois);
}

// ------------------------------------------------------------------ périodes

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function moisValide(mois: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mois);
}

export function libelleMois(mois: string): string {
  const [a, m] = mois.split("-");
  return `${MOIS[Number(m) - 1]} ${a}`;
}

/** Dernier jour du mois : la date de l'écriture de paie. */
export function finDeMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/**
 * Échéance des déclarations du mois : le 15 du mois suivant. Date indicative,
 * à confirmer selon l'effectif et le régime de l'entreprise.
 */
export function echeanceDeclarations(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m, 15)).toISOString().slice(0, 10);
}

export function moisCourant(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}
