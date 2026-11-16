/**
 * Notes de calcul : règles pures, sans base ni React.
 *
 * Une note fige un calcul sur un projet : la saisie, le résultat, les ratios
 * du jour et la liste des MATÉRIAUX à acheter. Le serveur ne croit jamais le
 * résultat envoyé par le navigateur : il relit la saisie (`lireSaisie`) et
 * refait le calcul avec les ratios de l'entreprise.
 *
 * Un matériau s'exprime dans son unité d'achat — sacs, m³, barres, agglos,
 * cartons — en MILLIÈMES, comme toute quantité de pièce commerciale. Il se
 * rattache à un article du catalogue par sa clé (`ciment`, `agglo_creux_15`,
 * `carreau_600x600`) ; l'article doit se vendre dans la même unité, sinon la
 * ligne est refusée plutôt que convertie de travers.
 */

import {
  AGGLOS,
  DIAMETRES_FER,
  LIBELLES_CONFORT,
  OUVRAGES_BETON,
  TOLERANCE_EQUERRE_MM,
  calculerBeton,
  calculerCarrelage,
  calculerEquerre,
  calculerEscalier,
  calculerMaconnerie,
  calculerPente,
  centiemes,
  entier,
  litresEnM3,
  mm2EnM2,
  mmEnM,
  type Agglo,
  type DiametreFer,
  type OuvrageBeton,
  type ReglagesCalculs,
  type ResultatBeton,
  type ResultatCarrelage,
  type ResultatEquerre,
  type ResultatEscalier,
  type ResultatMaconnerie,
  type ResultatPente,
  type SaisieBeton,
  type SaisieCarrelage,
  type SaisieEscalier,
  type SaisieMaconnerie,
  type SaisiePente,
} from "./regles";

export const TYPES_NOTE = {
  beton: "Béton et fer",
  maconnerie: "Maçonnerie d'agglos",
  carrelage: "Carrelage",
  pente: "Pente",
  escalier: "Escalier droit",
  equerre: "Angle droit",
} as const;
export type TypeNote = keyof typeof TYPES_NOTE;
export const CLES_TYPES_NOTE = Object.keys(TYPES_NOTE) as TypeNote[];

export interface SaisieEquerre {
  aMm: number;
  bMm: number;
  diagonaleMesureeMm: number | null;
}

/** Saisie et résultat d'un calcul, par type. */
export type Calcul =
  | { type: "beton"; saisie: SaisieBeton; resultat: ResultatBeton }
  | { type: "maconnerie"; saisie: SaisieMaconnerie; resultat: ResultatMaconnerie }
  | { type: "carrelage"; saisie: SaisieCarrelage; resultat: ResultatCarrelage }
  | { type: "pente"; saisie: SaisiePente; resultat: ResultatPente }
  | { type: "escalier"; saisie: SaisieEscalier; resultat: ResultatEscalier }
  | { type: "equerre"; saisie: SaisieEquerre; resultat: ResultatEquerre };

// ------------------------------------------------------------------ saisie

function objet(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Un entier exact, ou une erreur lisible : la saisie vient du navigateur. */
function entierDe(v: unknown, quoi: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new Error(`${quoi} : valeur manquante ou invalide.`);
  return v;
}

function entierOuNul(v: unknown, quoi: string): number | null {
  return v === null || v === undefined ? null : entierDe(v, quoi);
}

function parmi<T extends string>(v: unknown, cles: readonly T[], quoi: string): T {
  if (typeof v !== "string" || !(cles as readonly string[]).includes(v)) throw new Error(`${quoi} : choix inconnu.`);
  return v as T;
}

/**
 * Relit une saisie arrivée en JSON et refait le calcul. Lève une erreur
 * lisible sur une saisie incomplète ou incohérente — les mêmes que l'écran.
 */
export function calculerNote(type: TypeNote, brut: unknown, r: ReglagesCalculs): Calcul {
  const s = objet(brut);
  switch (type) {
    case "beton": {
      const diametre = s.diametreFer === null || s.diametreFer === undefined ? null : entierDe(s.diametreFer, "Diamètre du fer");
      if (diametre !== null && !(DIAMETRES_FER as number[]).includes(diametre)) throw new Error("Diamètre du fer : choix inconnu.");
      const saisie: SaisieBeton = {
        ouvrage: parmi(s.ouvrage, Object.keys(OUVRAGES_BETON) as OuvrageBeton[], "Ouvrage"),
        longueurMm: entierDe(s.longueurMm, "Longueur"),
        largeurMm: entierDe(s.largeurMm, "Largeur"),
        hauteurMm: entierDe(s.hauteurMm, "Épaisseur ou hauteur"),
        nombre: entierDe(s.nombre, "Nombre d'éléments"),
        diametreFer: diametre as DiametreFer | null,
      };
      return { type, saisie, resultat: calculerBeton(saisie, r) };
    }
    case "maconnerie": {
      const ouvertures = Array.isArray(s.ouvertures) ? s.ouvertures : [];
      if (ouvertures.length > 50) throw new Error("Plus de 50 ouvertures : regroupez les identiques.");
      const saisie: SaisieMaconnerie = {
        agglo: parmi(s.agglo, Object.keys(AGGLOS) as Agglo[], "Agglo"),
        longueurMm: entierDe(s.longueurMm, "Longueur du mur"),
        hauteurMm: entierDe(s.hauteurMm, "Hauteur du mur"),
        ouvertures: ouvertures.map((o, i) => {
          const x = objet(o);
          return {
            largeurMm: entierDe(x.largeurMm, `Ouverture ${i + 1}, largeur`),
            hauteurMm: entierDe(x.hauteurMm, `Ouverture ${i + 1}, hauteur`),
            nombre: entierDe(x.nombre, `Ouverture ${i + 1}, nombre`),
          };
        }),
      };
      return { type, saisie, resultat: calculerMaconnerie(saisie, r) };
    }
    case "carrelage": {
      const saisie: SaisieCarrelage = {
        longueurMm: entierDe(s.longueurMm, "Longueur de la pièce"),
        largeurMm: entierDe(s.largeurMm, "Largeur de la pièce"),
        carreauLongueurMm: entierDe(s.carreauLongueurMm, "Longueur du carreau"),
        carreauLargeurMm: entierDe(s.carreauLargeurMm, "Largeur du carreau"),
        parCarton: entierDe(s.parCarton, "Carreaux par carton"),
        pose: parmi(s.pose, ["colle", "mortier"] as const, "Pose"),
        plinthes: s.plinthes === true,
        portesMm: s.plinthes === true ? entierDe(s.portesMm ?? 0, "Largeur des portes") : 0,
      };
      return { type, saisie, resultat: calculerCarrelage(saisie, r) };
    }
    case "pente": {
      const saisie: SaisiePente = {
        longueurMm: entierOuNul(s.longueurMm, "Longueur horizontale"),
        hauteurMm: entierOuNul(s.hauteurMm, "Hauteur"),
        penteCentiemes: entierOuNul(s.penteCentiemes, "Pente"),
      };
      return { type, saisie, resultat: calculerPente(saisie) };
    }
    case "escalier": {
      const saisie: SaisieEscalier = {
        hauteurMm: entierDe(s.hauteurMm, "Hauteur à franchir"),
        marcheVoulueMm: entierOuNul(s.marcheVoulueMm, "Hauteur de marche"),
        reculementMm: entierOuNul(s.reculementMm, "Reculement"),
      };
      return { type, saisie, resultat: calculerEscalier(saisie) };
    }
    case "equerre": {
      const saisie: SaisieEquerre = {
        aMm: entierDe(s.aMm, "Côté A"),
        bMm: entierDe(s.bMm, "Côté B"),
        diagonaleMesureeMm: entierOuNul(s.diagonaleMesureeMm, "Diagonale mesurée"),
      };
      return { type, saisie, resultat: calculerEquerre(saisie.aMm, saisie.bMm, saisie.diagonaleMesureeMm) };
    }
    default:
      throw new Error("Type de calcul inconnu.");
  }
}

// --------------------------------------------------------------- matériaux

/** Unités d'achat d'un matériau : celles du catalogue (`code_unite`). */
export type UniteMateriau = "piece" | "m3" | "kg";
export const LIBELLES_UNITE: Record<UniteMateriau, string> = { piece: "pièce", m3: "m³", kg: "kg" };

export interface Materiau {
  /** Clé de correspondance avec un article : `ciment`, `fer_ha10`, `carreau_600x600`. */
  cle: string;
  designation: string;
  /** En MILLIÈMES de l'unité : 18 sacs -> 18 000, 1,008 m³ -> 1 008. */
  quantite: number;
  unite: UniteMateriau;
}

/** Libellés des clés connues, pour la page des correspondances. */
export function libelleCle(cle: string): string {
  if (cle === "ciment") return "Ciment (sac)";
  if (cle === "sable") return "Sable (m³)";
  if (cle === "gravier") return "Gravier (m³)";
  if (cle === "fer") return "Fer à béton (kg)";
  if (cle === "colle") return "Colle à carrelage (sac)";
  const fer = /^fer_ha(\d+)$/.exec(cle);
  if (fer) return `Fer HA${fer[1]} (barre)`;
  const agglo = /^agglo_(\w+)$/.exec(cle);
  if (agglo && agglo[1] in AGGLOS) return AGGLOS[agglo[1] as Agglo];
  const carreau = /^carreau_(\d+)x(\d+)$/.exec(cle);
  if (carreau) return `Carreau ${Number(carreau[2]) / 10} × ${Number(carreau[1]) / 10} cm (carton)`;
  return cle;
}

/** Unité d'achat attendue pour une clé. */
export function uniteCle(cle: string): UniteMateriau {
  if (cle === "sable" || cle === "gravier") return "m3";
  if (cle === "fer") return "kg";
  return "piece";
}

/** Clés que toute entreprise peut relier d'avance, avant même une note. */
export function clesUsuelles(): string[] {
  return [
    "ciment",
    "sable",
    "gravier",
    "fer",
    ...DIAMETRES_FER.map((d) => `fer_ha${d}`),
    ...Object.keys(AGGLOS).map((a) => `agglo_${a}`),
    "colle",
  ];
}

export const cleCarreau = (longueurMm: number, largeurMm: number) => `carreau_${longueurMm}x${largeurMm}`;

const milliers = (n: number) => n * 1000;

/** Ce qu'il faut acheter pour un calcul. Vide pour pente, escalier et angle droit. */
export function materiauxDe(c: Calcul, r: ReglagesCalculs): Materiau[] {
  const sac = `sac de ${r.sacCimentKg} kg`;
  const ciment = (sacs: number): Materiau => ({ cle: "ciment", designation: `Ciment (${sac})`, quantite: milliers(sacs), unite: "piece" });
  const sable = (l: number): Materiau => ({ cle: "sable", designation: "Sable", quantite: l, unite: "m3" });
  const liste: Materiau[] = [];
  switch (c.type) {
    case "beton": {
      const x = c.resultat;
      liste.push(ciment(x.sacsCiment), sable(x.sableL), { cle: "gravier", designation: "Gravier", quantite: x.gravierL, unite: "m3" });
      if (x.ferKg > 0) {
        if (x.barresFer !== null && c.saisie.diametreFer)
          liste.push({ cle: `fer_ha${c.saisie.diametreFer}`, designation: `Fer HA${c.saisie.diametreFer} (barre de ${mmEnM(r.barreFerMm)})`, quantite: milliers(x.barresFer), unite: "piece" });
        else liste.push({ cle: "fer", designation: "Fer à béton", quantite: milliers(x.ferKg), unite: "kg" });
      }
      break;
    }
    case "maconnerie": {
      const x = c.resultat;
      liste.push({ cle: `agglo_${c.saisie.agglo}`, designation: AGGLOS[c.saisie.agglo], quantite: milliers(x.blocs), unite: "piece" }, ciment(x.sacsCiment), sable(x.sableL));
      break;
    }
    case "carrelage": {
      const x = c.resultat;
      const s = c.saisie;
      liste.push({
        cle: cleCarreau(s.carreauLongueurMm, s.carreauLargeurMm),
        designation: `Carreau ${s.carreauLargeurMm / 10} × ${s.carreauLongueurMm / 10} cm (carton de ${s.parCarton})`,
        quantite: milliers(x.cartons),
        unite: "piece",
      });
      if (x.sacsColle !== null) liste.push({ cle: "colle", designation: `Colle à carrelage (sac de ${r.sacColleKg} kg)`, quantite: milliers(x.sacsColle), unite: "piece" });
      if (x.sacsCiment !== null) liste.push(ciment(x.sacsCiment));
      if (x.sableL !== null) liste.push(sable(x.sableL));
      break;
    }
    default:
      break;
  }
  return liste.filter((m) => m.quantite > 0);
}

// --------------------------------------------------------------- chiffrage

export interface ArticleChiffrage {
  id: string;
  designation: string;
  unite: string;
  prixVente: number;
  prixAchat: number;
}

export interface LigneChiffree {
  materiau: Materiau;
  article: ArticleChiffrage | null;
  /** Prix unitaire retenu, en francs ; nul sans article. */
  prixUnitaire: number;
  /** Quantité × prix, en francs entiers. */
  montant: number;
  /** Pourquoi la ligne ne peut pas partir sur une pièce. */
  refus: string | null;
}

/**
 * Montant d'une ligne : quantité en millièmes × prix, arrondi au franc —
 * la même règle que les pièces commerciales (`montantLigne`), recopiée ici
 * pour que le module reste sans dépendance et s'exécute dans le navigateur.
 */
export function montantMateriau(quantiteMilliemes: number, prix: number): number {
  return Math.round((quantiteMilliemes * prix) / 1000);
}

/** Refus d'une association matériau / article, ou `null` si elle convient. */
export function refusArticle(m: Materiau, a: ArticleChiffrage | null): string | null {
  if (!a) return "Aucun article du catalogue n'est associé.";
  if (a.unite !== m.unite) return `« ${a.designation} » se compte en ${a.unite}, la note en ${LIBELLES_UNITE[m.unite]}.`;
  return null;
}

/** Chiffre les matériaux au prix de vente (devis) ou d'achat (commande). */
export function chiffrer(materiaux: Materiau[], articleDe: (cle: string) => ArticleChiffrage | null, prix: "vente" | "achat"): { lignes: LigneChiffree[]; total: number } {
  const lignes = materiaux.map((m) => {
    const article = articleDe(m.cle);
    const refus = refusArticle(m, article);
    const prixUnitaire = article && !refus ? (prix === "vente" ? article.prixVente : article.prixAchat) : 0;
    return { materiau: m, article, prixUnitaire, montant: montantMateriau(m.quantite, prixUnitaire), refus };
  });
  return { lignes, total: lignes.reduce((t, l) => t + l.montant, 0) };
}

/** Quantité en millièmes, lisible dans son unité : 18 000 -> « 18 », 1 008 -> « 1,008 ». */
export function quantiteLisible(m: Pick<Materiau, "quantite" | "unite">): string {
  const unite = LIBELLES_UNITE[m.unite];
  const entiere = m.quantite % 1000 === 0;
  const valeur = entiere ? entier(m.quantite / 1000) : `${entier(Math.floor(m.quantite / 1000))},${String(m.quantite % 1000).padStart(3, "0").replace(/0+$/, "")}`;
  return m.unite === "piece" ? valeur : `${valeur} ${unite}`;
}

// --------------------------------------------------------------- affichage

export interface LigneResultat {
  libelle: string;
  valeur: string;
  fort?: boolean;
  precision?: string;
}

const kg = (v: number) => `${entier(v)} kg`;
const litres = (v: number) => `${entier(v)} L`;
const sacs = (v: number, poids: number) => `${entier(v)} sac${v > 1 ? "s" : ""} de ${poids} kg`;
const mm = (v: number) => `${entier(v)} mm`;
const degres = (c: number) => `${centiemes(c)}°`;

const VERDICTS_EQUERRE = {
  droit: "Angle droit",
  ouvert: "Angle ouvert (plus de 90°) : rapprochez les côtés",
  ferme: "Angle fermé (moins de 90°) : écartez les côtés",
} as const;

/**
 * Les lignes du résultat, telles que l'écran et la note imprimée les
 * montrent. Une seule source : la note relue dans six mois dit exactement
 * ce que l'écran disait le jour du calcul.
 */
export function lignesResultat(c: Calcul, r: ReglagesCalculs): LigneResultat[] {
  switch (c.type) {
    case "beton": {
      const x = c.resultat;
      const d = r.beton[c.saisie.ouvrage];
      return [
        { libelle: "Volume de béton", valeur: litresEnM3(x.volumeL) },
        { libelle: "À gâcher ou commander", valeur: litresEnM3(x.volumeCommandeL), fort: true, precision: `Pertes de ${r.pertesBetonPct} % comprises` },
        { libelle: "Ciment", valeur: sacs(x.sacsCiment, r.sacCimentKg), fort: true, precision: `${kg(x.cimentKg)} à ${d.cimentKg} kg/m³` },
        { libelle: "Sable", valeur: litresEnM3(x.sableL), precision: litres(x.sableL) },
        { libelle: "Gravier", valeur: litresEnM3(x.gravierL), precision: litres(x.gravierL) },
        { libelle: "Eau", valeur: litres(x.eauL) },
        ...(d.ferKg > 0
          ? [
              { libelle: "Fer", valeur: kg(x.ferKg), fort: true, precision: `Ratio de ${d.ferKg} kg/m³ — le plan de ferraillage fait foi` },
              ...(x.barresFer !== null && c.saisie.diametreFer
                ? [{ libelle: `Barres HA${c.saisie.diametreFer}`, valeur: `${entier(x.barresFer)} barres de ${mmEnM(r.barreFerMm)}`, precision: "Si tout le fer était de ce diamètre" }]
                : []),
            ]
          : []),
      ];
    }
    case "maconnerie": {
      const x = c.resultat;
      const a = r.agglos[c.saisie.agglo];
      return [
        { libelle: "Surface du mur", valeur: mm2EnM2(x.surfaceBruteMm2) },
        ...(x.surfaceOuverturesMm2 ? [{ libelle: "Ouvertures déduites", valeur: mm2EnM2(x.surfaceOuverturesMm2) }] : []),
        { libelle: "Surface à monter", valeur: mm2EnM2(x.surfaceNetteMm2) },
        { libelle: "Agglos à poser", valeur: entier(x.blocsTheoriques), precision: `${centiemes(a.centiemesParM2)} par m²` },
        { libelle: "Agglos à commander", valeur: entier(x.blocs), fort: true, precision: `Casse et coupes : ${r.pertesAgglosPct} %` },
        { libelle: "Mortier de pose", valeur: litresEnM3(x.mortierL), precision: `${a.mortierLParM2} L par m²` },
        { libelle: "Ciment", valeur: sacs(x.sacsCiment, r.sacCimentKg), fort: true, precision: `${kg(x.cimentKg)} à ${r.mortier.cimentKg} kg/m³ de mortier` },
        { libelle: "Sable", valeur: litresEnM3(x.sableL), precision: litres(x.sableL) },
        { libelle: "Eau", valeur: litres(x.eauL) },
      ];
    }
    case "carrelage": {
      const x = c.resultat;
      return [
        { libelle: "Surface à carreler", valeur: mm2EnM2(x.surfaceMm2) },
        { libelle: "Carreaux", valeur: entier(x.carreaux), precision: `Coupes et casse : ${r.pertesCarrelagePct} %` },
        { libelle: "Cartons", valeur: entier(x.cartons), fort: true, precision: `${mm2EnM2(x.surfaceAcheteeMm2)} achetés` },
        ...(x.sacsColle !== null && x.colleKg !== null
          ? [{ libelle: "Colle", valeur: sacs(x.sacsColle, r.sacColleKg), fort: true, precision: `${kg(x.colleKg)} à ${r.colleKgParM2} kg/m²` }]
          : []),
        ...(x.mortierL !== null && x.sacsCiment !== null && x.cimentKg !== null && x.sableL !== null
          ? [
              { libelle: "Mortier de pose", valeur: litresEnM3(x.mortierL), precision: `Lit de ${r.mortierCarrelageMm} mm` },
              { libelle: "Ciment", valeur: sacs(x.sacsCiment, r.sacCimentKg), fort: true, precision: kg(x.cimentKg) },
              { libelle: "Sable", valeur: litresEnM3(x.sableL) },
            ]
          : []),
        ...(x.plinthesMm !== null && x.plinthesPieces !== null
          ? [{ libelle: "Plinthes", valeur: mmEnM(x.plinthesMm), precision: `${entier(x.plinthesPieces)} longueurs de ${c.saisie.carreauLongueurMm / 10} cm, pertes comprises` }]
          : []),
      ];
    }
    case "pente": {
      const x = c.resultat;
      return [
        { libelle: "Pente", valeur: `${centiemes(x.penteCentiemes)} %`, fort: true },
        { libelle: "Angle", valeur: degres(x.angleCentiemes) },
        { libelle: "Longueur horizontale", valeur: mmEnM(x.longueurMm) },
        { libelle: "Hauteur (dénivelé)", valeur: `${mmEnM(x.hauteurMm)} · ${mm(x.hauteurMm)}`, fort: true },
        { libelle: "Longueur réelle de la rampe", valeur: mmEnM(x.rampantMm) },
      ];
    }
    case "escalier": {
      const x = c.resultat;
      return [
        { libelle: "Marches", valeur: entier(x.marches), fort: true },
        {
          libelle: "Hauteur de marche",
          valeur: mm(x.hauteurMarcheMm),
          fort: true,
          precision: x.marchesPlusHautes ? `Dont ${x.marchesPlusHautes} de ${x.hauteurMarcheMm + 1} mm, pour tomber juste` : undefined,
        },
        { libelle: "Giron (profondeur)", valeur: mm(x.gironMm), fort: true },
        { libelle: "Reculement", valeur: mmEnM(x.reculementMm), precision: `${entier(Math.max(x.marches - 1, 1))} girons : la dernière marche arrive au palier` },
        { libelle: "Formule de Blondel (2 H + G)", valeur: mm(x.blondelMm), precision: "Idéal entre 600 et 650 mm" },
        { libelle: "Inclinaison", valeur: degres(x.angleCentiemes) },
        { libelle: "Confort", valeur: LIBELLES_CONFORT[x.confort], fort: true },
      ];
    }
    case "equerre": {
      const x = c.resultat;
      return [
        { libelle: "Diagonale théorique", valeur: `${mmEnM(x.diagonaleMm)} · ${mm(x.diagonaleMm)}`, fort: true },
        ...(x.ecartMm !== null && x.verdict
          ? [
              { libelle: "Écart mesuré", valeur: `${x.ecartMm > 0 ? "+" : ""}${entier(x.ecartMm)} mm`, precision: `Toléré : ± ${TOLERANCE_EQUERRE_MM} mm` },
              { libelle: "Verdict", valeur: VERDICTS_EQUERRE[x.verdict], fort: true },
            ]
          : []),
      ];
    }
  }
}

/** La saisie résumée en une ligne, pour la liste des notes et l'en-tête imprimé. */
export function resumeSaisie(c: Calcul): string {
  switch (c.type) {
    case "beton": {
      const s = c.saisie;
      return `${OUVRAGES_BETON[s.ouvrage]} · ${mmEnM(s.longueurMm)} × ${mmEnM(s.largeurMm)} × ${mmEnM(s.hauteurMm)}${s.nombre > 1 ? ` · ${s.nombre} éléments` : ""}`;
    }
    case "maconnerie": {
      const s = c.saisie;
      const n = s.ouvertures.reduce((t, o) => t + o.nombre, 0);
      return `${AGGLOS[s.agglo]} · mur de ${mmEnM(s.longueurMm)} × ${mmEnM(s.hauteurMm)}${n ? ` · ${n} ouverture${n > 1 ? "s" : ""} déduite${n > 1 ? "s" : ""}` : ""}`;
    }
    case "carrelage": {
      const s = c.saisie;
      return `Pièce de ${mmEnM(s.longueurMm)} × ${mmEnM(s.largeurMm)} · carreau ${s.carreauLargeurMm / 10} × ${s.carreauLongueurMm / 10} cm · pose ${s.pose === "colle" ? "collée" : "au mortier"}`;
    }
    case "pente":
      return `Longueur ${mmEnM(c.resultat.longueurMm)} · hauteur ${mmEnM(c.resultat.hauteurMm)}`;
    case "escalier":
      return `Hauteur sol à sol ${mmEnM(c.saisie.hauteurMm)}${c.saisie.reculementMm !== null ? ` · reculement ${mmEnM(c.saisie.reculementMm)}` : ""}`;
    case "equerre":
      return `Côtés ${mmEnM(c.saisie.aMm)} et ${mmEnM(c.saisie.bMm)}`;
  }
}

/** Numéro d'une note : `NC-2026-00012`. */
export const PREFIXE_NOTE = "NC";
