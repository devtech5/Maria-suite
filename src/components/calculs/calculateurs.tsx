"use client";

import { useMemo, useState, type ReactNode } from "react";

import { EnregistrerNote, type OptionProjet } from "@/components/calculs/enregistrer-note";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { lignesResultat, type Calcul } from "@/modules/calculs/notes";
import {
  AGGLOS,
  CLES_AGGLOS,
  CLES_OUVRAGES,
  DIAMETRES_FER,
  FORMATS_CARRELAGE,
  OUVRAGES_BETON,
  calculerBeton,
  calculerCarrelage,
  calculerEquerre,
  calculerEscalier,
  calculerMaconnerie,
  calculerPente,
  centimetresEnMm,
  lireDecimal,
  metresEnMm,
  type Agglo,
  type DiametreFer,
  type OuvrageBeton,
  type PoseCarrelage,
  type ReglagesCalculs,
  type SaisieBeton,
  type SaisieCarrelage,
  type SaisieEscalier,
  type SaisieMaconnerie,
  type SaisiePente,
} from "@/modules/calculs/regles";

/**
 * Les calculateurs : tout se calcule dans le navigateur, à chaque frappe,
 * par les règles pures du module. Aucun aller-retour au serveur — sur un
 * chantier sans réseau, la page déjà chargée continue de répondre.
 */

// ------------------------------------------------------------------ briques

/** Évalue un calcul ; rend `null` tant que la saisie est incomplète, le message sinon. */
function evaluer<T>(complet: boolean, calcul: () => T): { resultat: T | null; erreur: string | null } {
  if (!complet) return { resultat: null, erreur: null };
  try {
    return { resultat: calcul(), erreur: null };
  } catch (e) {
    return { resultat: null, erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
}

function Saisie({
  libelle,
  valeur,
  onChange,
  unite,
  precision,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  unite: string;
  precision?: string;
}) {
  return (
    <Champ libelle={`${libelle} (${unite})`} precision={precision}>
      <input inputMode="decimal" value={valeur} onChange={(e) => onChange(e.target.value)} className={`${CLASSE_CHAMP} chiffres`} />
    </Champ>
  );
}

/** Ce que chaque calculateur reçoit de sa page : ratios, et de quoi enregistrer une note. */
export interface Contexte {
  reglages: ReglagesCalculs;
  /** Projets ouverts, pour enregistrer la note ; vide sans projet ou sans droit. */
  projets: OptionProjet[];
}

function Mise({ titre, saisie, calcul, erreur, aide, contexte }: { titre: string; saisie: ReactNode; calcul: Calcul | null; erreur: string | null; aide?: ReactNode; contexte: Contexte }) {
  const lignes = calcul ? lignesResultat(calcul, contexte.reglages) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <section className="space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5 print:hidden">
        <h2 className="text-sm font-semibold">{titre}</h2>
        {saisie}
        {aide && <div className="border-t border-[var(--filet)] pt-3 text-xs text-[var(--encre-faible)]">{aide}</div>}
      </section>
      <section aria-live="polite" className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-semibold">Résultat</h2>
        {erreur && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-600">
            {erreur}
          </p>
        )}
        {!erreur && !lignes && <p className="mt-3 text-sm text-[var(--encre-faible)]">Renseignez les dimensions : le résultat s&apos;affiche aussitôt.</p>}
        {calcul && lignes && (
          <>
            <dl className="mt-3 divide-y divide-[var(--filet)]">
              {lignes.map((l) => (
                <div key={l.libelle} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-sm text-[var(--encre-douce)]">
                    {l.libelle}
                    {l.precision && <span className="block text-xs text-[var(--encre-faible)]">{l.precision}</span>}
                  </dt>
                  <dd className={`chiffres shrink-0 whitespace-nowrap text-right ${l.fort ? "text-base font-bold" : "text-sm font-medium"}`}>{l.valeur}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap items-start gap-2 print:hidden">
              <BoutonImprimer />
              {contexte.projets.length > 0 && <EnregistrerNote calcul={calcul} projets={contexte.projets} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const noteBeton = (saisie: SaisieBeton, r: ReglagesCalculs): Calcul => ({ type: "beton", saisie, resultat: calculerBeton(saisie, r) });
const noteMaconnerie = (saisie: SaisieMaconnerie, r: ReglagesCalculs): Calcul => ({ type: "maconnerie", saisie, resultat: calculerMaconnerie(saisie, r) });
const noteCarrelage = (saisie: SaisieCarrelage, r: ReglagesCalculs): Calcul => ({ type: "carrelage", saisie, resultat: calculerCarrelage(saisie, r) });
const notePente = (saisie: SaisiePente): Calcul => ({ type: "pente", saisie, resultat: calculerPente(saisie) });
const noteEscalier = (saisie: SaisieEscalier): Calcul => ({ type: "escalier", saisie, resultat: calculerEscalier(saisie) });
const noteEquerre = (aMm: number, bMm: number, diagonaleMesureeMm: number | null): Calcul => ({
  type: "equerre",
  saisie: { aMm, bMm, diagonaleMesureeMm },
  resultat: calculerEquerre(aMm, bMm, diagonaleMesureeMm),
});

// ------------------------------------------------------------------- béton

export function CalculBeton({ contexte }: { contexte: Contexte }) {
  const reglages = contexte.reglages;
  const [ouvrage, setOuvrage] = useState<OuvrageBeton>("dalle");
  const [longueur, setLongueur] = useState("");
  const [largeur, setLargeur] = useState("");
  const [hauteur, setHauteur] = useState("");
  const [nombre, setNombre] = useState("1");
  const [diametre, setDiametre] = useState("");
  const d = reglages.beton[ouvrage];

  const { resultat, erreur } = useMemo(() => {
    const L = metresEnMm(longueur);
    const l = metresEnMm(largeur);
    const h = metresEnMm(hauteur);
    const nb = lireDecimal(nombre, 0);
    return evaluer(Boolean(longueur && largeur && hauteur && nombre), () => {
      if (L === null || l === null || h === null) throw new Error("Dimensions en mètres, trois décimales au plus (0,12 pour 12 cm).");
      if (nb === null) throw new Error("Nombre d'éléments : un entier.");
      return noteBeton({ ouvrage, longueurMm: L, largeurMm: l, hauteurMm: h, nombre: nb, diametreFer: diametre ? (Number(diametre) as DiametreFer) : null }, reglages);
    });
  }, [ouvrage, longueur, largeur, hauteur, nombre, diametre, reglages]);

  return (
    <Mise
      titre="Ouvrage"
      erreur={erreur}
      calcul={resultat}
      contexte={contexte}
      saisie={
        <>
          <Champ libelle="Type d'ouvrage" precision={`${d.cimentKg} kg de ciment, ${d.sableL} L de sable, ${d.gravierL} L de gravier par m³${d.ferKg ? `, ${d.ferKg} kg de fer` : ""}.`}>
            <select value={ouvrage} onChange={(e) => setOuvrage(e.target.value as OuvrageBeton)} className={CLASSE_CHAMP}>
              {CLES_OUVRAGES.map((k) => (
                <option key={k} value={k}>
                  {OUVRAGES_BETON[k]}
                </option>
              ))}
            </select>
          </Champ>
          <div className="grid gap-3 sm:grid-cols-3">
            <Saisie libelle="Longueur" unite="m" valeur={longueur} onChange={setLongueur} />
            <Saisie libelle="Largeur" unite="m" valeur={largeur} onChange={setLargeur} />
            <Saisie libelle="Épaisseur ou hauteur" unite="m" valeur={hauteur} onChange={setHauteur} precision="0,12 pour 12 cm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Saisie libelle="Éléments identiques" unite="nombre" valeur={nombre} onChange={setNombre} precision="12 poteaux, 8 semelles…" />
            <Champ libelle="Diamètre principal (facultatif)" precision="Pour compter les barres">
              <select value={diametre} onChange={(e) => setDiametre(e.target.value)} className={CLASSE_CHAMP}>
                <option value="">Fer en kilogrammes seulement</option>
                {DIAMETRES_FER.map((x) => (
                  <option key={x} value={x}>
                    HA{x}
                  </option>
                ))}
              </select>
            </Champ>
          </div>
        </>
      }
      aide="Volume = longueur × largeur × épaisseur × nombre. Les quantités à acheter s'arrondissent au-dessus. Le fer se compte sur le volume théorique : le ratio inclut recouvrements et chutes."
    />
  );
}

// -------------------------------------------------------------- maçonnerie

type SaisieOuverture = { largeur: string; hauteur: string; nombre: string };

export function CalculMaconnerie({ contexte }: { contexte: Contexte }) {
  const reglages = contexte.reglages;
  const [agglo, setAgglo] = useState<Agglo>("creux_15");
  const [longueur, setLongueur] = useState("");
  const [hauteur, setHauteur] = useState("");
  const [ouvertures, setOuvertures] = useState<SaisieOuverture[]>([]);

  const { resultat, erreur } = useMemo(() => {
    const L = metresEnMm(longueur);
    const H = metresEnMm(hauteur);
    const completes = ouvertures.every((o) => o.largeur && o.hauteur && o.nombre);
    return evaluer(Boolean(longueur && hauteur && completes), () => {
      if (L === null || H === null) throw new Error("Dimensions en mètres, trois décimales au plus.");
      return noteMaconnerie(
        {
          agglo,
          longueurMm: L,
          hauteurMm: H,
          ouvertures: ouvertures.map((o, i) => {
            const largeurMm = metresEnMm(o.largeur);
            const hauteurMm = metresEnMm(o.hauteur);
            const nombre = lireDecimal(o.nombre, 0);
            if (largeurMm === null || hauteurMm === null || nombre === null) throw new Error(`Ouverture ${i + 1} : dimensions en mètres, nombre entier.`);
            return { largeurMm, hauteurMm, nombre };
          }),
        },
        reglages,
      );
    });
  }, [agglo, longueur, hauteur, ouvertures, reglages]);

  const changer = (i: number, champ: keyof SaisieOuverture, v: string) => setOuvertures((os) => os.map((o, j) => (j === i ? { ...o, [champ]: v } : o)));

  return (
    <Mise
      titre="Mur"
      erreur={erreur}
      calcul={resultat}
      contexte={contexte}
      saisie={
        <>
          <Champ libelle="Agglo">
            <select value={agglo} onChange={(e) => setAgglo(e.target.value as Agglo)} className={CLASSE_CHAMP}>
              {CLES_AGGLOS.map((k) => (
                <option key={k} value={k}>
                  {AGGLOS[k]}
                </option>
              ))}
            </select>
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Saisie libelle="Longueur du mur" unite="m" valeur={longueur} onChange={setLongueur} />
            <Saisie libelle="Hauteur du mur" unite="m" valeur={hauteur} onChange={setHauteur} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Portes et fenêtres à déduire</legend>
            {ouvertures.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_5rem_auto] items-end gap-2">
                <Saisie libelle="Largeur" unite="m" valeur={o.largeur} onChange={(v) => changer(i, "largeur", v)} />
                <Saisie libelle="Hauteur" unite="m" valeur={o.hauteur} onChange={(v) => changer(i, "hauteur", v)} />
                <Saisie libelle="Nombre" unite="u" valeur={o.nombre} onChange={(v) => changer(i, "nombre", v)} />
                <button
                  type="button"
                  aria-label={`Retirer l'ouverture ${i + 1}`}
                  onClick={() => setOuvertures((os) => os.filter((_, j) => j !== i))}
                  className="h-cible rounded-lg border border-[var(--filet)] px-3 text-sm hover:bg-[var(--surface-creuse)]"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOuvertures((os) => [...os, { largeur: "", hauteur: "", nombre: "1" }])}
              className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]"
            >
              Ajouter une ouverture
            </button>
          </fieldset>
        </>
      }
      aide="Agglos de 40 × 20 cm : 12,5 au m² sans compter les joints. Les poteaux et chaînages en béton se calculent à part, dans « Béton et fer »."
    />
  );
}

// --------------------------------------------------------------- carrelage

export function CalculCarrelage({ contexte }: { contexte: Contexte }) {
  const reglages = contexte.reglages;
  const [longueur, setLongueur] = useState("");
  const [largeur, setLargeur] = useState("");
  const [format, setFormat] = useState("60x60");
  const [cL, setCL] = useState("60");
  const [cl, setCl] = useState("60");
  const [parCarton, setParCarton] = useState("4");
  const [pose, setPose] = useState<PoseCarrelage>("colle");
  const [plinthes, setPlinthes] = useState(true);
  const [portes, setPortes] = useState("0,9");

  const choisirFormat = (cle: string) => {
    setFormat(cle);
    const f = FORMATS_CARRELAGE.find((x) => x.cle === cle);
    if (f) {
      setCL(String(f.longueurMm / 10));
      setCl(String(f.largeurMm / 10));
      setParCarton(String(f.parCarton));
    }
  };

  const { resultat, erreur } = useMemo(() => {
    const L = metresEnMm(longueur);
    const l = metresEnMm(largeur);
    const a = centimetresEnMm(cL);
    const b = centimetresEnMm(cl);
    const c = lireDecimal(parCarton, 0);
    const p = plinthes ? metresEnMm(portes || "0") : 0;
    return evaluer(Boolean(longueur && largeur && cL && cl && parCarton), () => {
      if (L === null || l === null) throw new Error("Pièce : dimensions en mètres.");
      if (a === null || b === null) throw new Error("Carreau : dimensions en centimètres.");
      if (c === null) throw new Error("Carreaux par carton : un entier.");
      if (p === null) throw new Error("Largeur des portes : en mètres.");
      return noteCarrelage({ longueurMm: L, largeurMm: l, carreauLongueurMm: a, carreauLargeurMm: b, parCarton: c, pose, plinthes, portesMm: p }, reglages);
    });
  }, [longueur, largeur, cL, cl, parCarton, pose, plinthes, portes, reglages]);

  return (
    <Mise
      titre="Pièce et carreau"
      erreur={erreur}
      calcul={resultat}
      contexte={contexte}
      saisie={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Saisie libelle="Longueur de la pièce" unite="m" valeur={longueur} onChange={setLongueur} />
            <Saisie libelle="Largeur de la pièce" unite="m" valeur={largeur} onChange={setLargeur} />
          </div>
          <Champ libelle="Format">
            <select value={format} onChange={(e) => choisirFormat(e.target.value)} className={CLASSE_CHAMP}>
              {FORMATS_CARRELAGE.map((f) => (
                <option key={f.cle} value={f.cle}>
                  {f.largeurMm / 10} × {f.longueurMm / 10} cm
                </option>
              ))}
              <option value="autre">Autre format</option>
            </select>
          </Champ>
          <div className="grid gap-3 sm:grid-cols-3">
            <Saisie libelle="Longueur du carreau" unite="cm" valeur={cL} onChange={(v) => {
                setFormat("autre");
                setCL(v);
              }} />
            <Saisie libelle="Largeur du carreau" unite="cm" valeur={cl} onChange={(v) => {
                setFormat("autre");
                setCl(v);
              }} />
            <Saisie libelle="Carreaux par carton" unite="u" valeur={parCarton} onChange={setParCarton} precision="Varie selon la marque" />
          </div>
          <Champ libelle="Pose">
            <select value={pose} onChange={(e) => setPose(e.target.value as PoseCarrelage)} className={CLASSE_CHAMP}>
              <option value="colle">À la colle</option>
              <option value="mortier">Au mortier (ciment et sable)</option>
            </select>
          </Champ>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={plinthes} onChange={(e) => setPlinthes(e.target.checked)} /> Compter les plinthes
          </label>
          {plinthes && <Saisie libelle="Largeur totale des portes" unite="m" valeur={portes} onChange={setPortes} precision="Retirée du tour de la pièce" />}
        </>
      }
      aide="Carreaux = surface × (1 + pertes) ÷ surface d'un carreau, arrondi au-dessus, puis en cartons entiers. Pièce en L : calculez chaque rectangle à part."
    />
  );
}

// ------------------------------------------------------------------- pente

export function CalculPente({ contexte }: { contexte: Contexte }) {
  const [longueur, setLongueur] = useState("");
  const [hauteur, setHauteur] = useState("");
  const [pente, setPente] = useState("");

  const { resultat, erreur } = useMemo(() => {
    const remplis = [longueur, hauteur, pente].filter(Boolean).length;
    return evaluer(remplis >= 2, () => {
      const L = longueur ? metresEnMm(longueur) : null;
      const H = hauteur ? metresEnMm(hauteur) : null;
      const p = pente ? lireDecimal(pente, 2) : null;
      if ((longueur && L === null) || (hauteur && H === null)) throw new Error("Longueur et hauteur en mètres, trois décimales au plus.");
      if (pente && p === null) throw new Error("Pente en %, deux décimales au plus.");
      // Trois valeurs : la longueur et la hauteur font foi, la pente se recalcule.
      return notePente({ longueurMm: L, hauteurMm: H, penteCentiemes: L !== null && H !== null ? null : p });
    });
  }, [longueur, hauteur, pente]);

  return (
    <Mise
      titre="Deux valeurs sur trois"
      erreur={erreur}
      calcul={resultat}
      contexte={contexte}
      saisie={
        <div className="grid gap-3 sm:grid-cols-3">
          <Saisie libelle="Longueur horizontale" unite="m" valeur={longueur} onChange={setLongueur} />
          <Saisie libelle="Hauteur" unite="m" valeur={hauteur} onChange={setHauteur} />
          <Saisie libelle="Pente" unite="%" valeur={pente} onChange={setPente} />
        </div>
      }
      aide="Pente (%) = hauteur ÷ longueur × 100. Repères usuels : terrasse et dallage extérieur 1 à 2 %, caniveau et évacuation 1 à 3 %."
    />
  );
}

// ---------------------------------------------------------------- escalier

export function CalculEscalier({ contexte }: { contexte: Contexte }) {
  const [hauteur, setHauteur] = useState("");
  const [marche, setMarche] = useState("");
  const [recul, setRecul] = useState("");

  const { resultat, erreur } = useMemo(() => {
    return evaluer(Boolean(hauteur), () => {
      const H = metresEnMm(hauteur);
      const h = marche ? centimetresEnMm(marche) : null;
      const r = recul ? metresEnMm(recul) : null;
      if (H === null) throw new Error("Hauteur à franchir en mètres.");
      if (marche && h === null) throw new Error("Hauteur de marche en centimètres, une décimale au plus.");
      if (recul && r === null) throw new Error("Reculement en mètres.");
      return noteEscalier({ hauteurMm: H, marcheVoulueMm: h, reculementMm: r });
    });
  }, [hauteur, marche, recul]);

  return (
    <Mise
      titre="Escalier droit"
      erreur={erreur}
      calcul={resultat}
      contexte={contexte}
      saisie={
        <div className="grid gap-3 sm:grid-cols-3">
          <Saisie libelle="Hauteur sol à sol" unite="m" valeur={hauteur} onChange={setHauteur} precision="Sols finis" />
          <Saisie libelle="Marche visée (facultatif)" unite="cm" valeur={marche} onChange={setMarche} precision="17 cm à défaut" />
          <Saisie libelle="Reculement disponible (facultatif)" unite="m" valeur={recul} onChange={setRecul} precision="Sinon, giron de Blondel" />
        </div>
      }
      aide="Confortable : marche de 15 à 18 cm, giron de 24 à 30 cm, 2 H + G entre 60 et 65 cm."
    />
  );
}

// ------------------------------------------------------------- angle droit

export function CalculEquerre({ contexte }: { contexte: Contexte }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [mesure, setMesure] = useState("");

  const { resultat, erreur } = useMemo(() => {
    return evaluer(Boolean(a && b), () => {
      const A = metresEnMm(a);
      const B = metresEnMm(b);
      const M = mesure ? metresEnMm(mesure) : null;
      if (A === null || B === null || (mesure && M === null)) throw new Error("Longueurs en mètres, trois décimales au plus.");
      return noteEquerre(A, B, M);
    });
  }, [a, b, mesure]);

  return (
    <Mise
      titre="Contrôle d'équerrage"
      erreur={erreur}
      calcul={resultat}
      contexte={contexte}
      saisie={
        <div className="grid gap-3 sm:grid-cols-3">
          <Saisie libelle="Côté A" unite="m" valeur={a} onChange={setA} />
          <Saisie libelle="Côté B" unite="m" valeur={b} onChange={setB} />
          <Saisie libelle="Diagonale mesurée (facultatif)" unite="m" valeur={mesure} onChange={setMesure} />
        </div>
      }
      aide="Méthode 3-4-5 : 3 m sur un côté, 4 m sur l'autre, la diagonale doit faire 5 m. Plus les côtés sont longs, plus le contrôle est précis."
    />
  );
}
