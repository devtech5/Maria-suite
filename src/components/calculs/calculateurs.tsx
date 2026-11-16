"use client";

import { useMemo, useState, type ReactNode } from "react";

import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import {
  AGGLOS,
  CLES_AGGLOS,
  CLES_OUVRAGES,
  DIAMETRES_FER,
  FORMATS_CARRELAGE,
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
  centimetresEnMm,
  entier,
  lireDecimal,
  litresEnM3,
  metresEnMm,
  mm2EnM2,
  mmEnM,
  type Agglo,
  type DiametreFer,
  type OuvrageBeton,
  type PoseCarrelage,
  type ReglagesCalculs,
} from "@/modules/calculs/regles";

/**
 * Les calculateurs : tout se calcule dans le navigateur, à chaque frappe,
 * par les règles pures du module. Aucun aller-retour au serveur — sur un
 * chantier sans réseau, la page déjà chargée continue de répondre.
 */

// ------------------------------------------------------------------ briques

type Ligne = { libelle: string; valeur: string; fort?: boolean; precision?: string };

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

function Mise({ titre, saisie, resultat, erreur, aide }: { titre: string; saisie: ReactNode; resultat: Ligne[] | null; erreur: string | null; aide?: ReactNode }) {
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
        {!erreur && !resultat && <p className="mt-3 text-sm text-[var(--encre-faible)]">Renseignez les dimensions : le résultat s&apos;affiche aussitôt.</p>}
        {resultat && (
          <>
            <dl className="mt-3 divide-y divide-[var(--filet)]">
              {resultat.map((l) => (
                <div key={l.libelle} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-sm text-[var(--encre-douce)]">
                    {l.libelle}
                    {l.precision && <span className="block text-xs text-[var(--encre-faible)]">{l.precision}</span>}
                  </dt>
                  <dd className={`chiffres shrink-0 whitespace-nowrap text-right ${l.fort ? "text-base font-bold" : "text-sm font-medium"}`}>{l.valeur}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 print:hidden">
              <BoutonImprimer />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const kg = (v: number) => `${entier(v)} kg`;
const litres = (v: number) => `${entier(v)} L`;
const sacs = (v: number, poids: number) => `${entier(v)} sac${v > 1 ? "s" : ""} de ${poids} kg`;
const mm = (v: number) => `${entier(v)} mm`;
const degres = (c: number) => `${centiemes(c)}°`;

// ------------------------------------------------------------------- béton

export function CalculBeton({ reglages }: { reglages: ReglagesCalculs }) {
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
      return calculerBeton({ ouvrage, longueurMm: L, largeurMm: l, hauteurMm: h, nombre: nb, diametreFer: diametre ? (Number(diametre) as DiametreFer) : null }, reglages);
    });
  }, [ouvrage, longueur, largeur, hauteur, nombre, diametre, reglages]);

  const lignes: Ligne[] | null = resultat && [
    { libelle: "Volume de béton", valeur: litresEnM3(resultat.volumeL) },
    { libelle: "À gâcher ou commander", valeur: litresEnM3(resultat.volumeCommandeL), fort: true, precision: `Pertes de ${reglages.pertesBetonPct} % comprises` },
    { libelle: "Ciment", valeur: sacs(resultat.sacsCiment, reglages.sacCimentKg), fort: true, precision: `${kg(resultat.cimentKg)} à ${d.cimentKg} kg/m³` },
    { libelle: "Sable", valeur: litresEnM3(resultat.sableL), precision: litres(resultat.sableL) },
    { libelle: "Gravier", valeur: litresEnM3(resultat.gravierL), precision: litres(resultat.gravierL) },
    { libelle: "Eau", valeur: litres(resultat.eauL) },
    ...(d.ferKg > 0
      ? [
          { libelle: "Fer", valeur: kg(resultat.ferKg), fort: true, precision: `Ratio de ${d.ferKg} kg/m³ — le plan de ferraillage fait foi` },
          ...(resultat.barresFer !== null ? [{ libelle: `Barres HA${diametre}`, valeur: `${entier(resultat.barresFer)} barres de ${mmEnM(reglages.barreFerMm)}`, precision: "Si tout le fer était de ce diamètre" }] : []),
        ]
      : []),
  ];

  return (
    <Mise
      titre="Ouvrage"
      erreur={erreur}
      resultat={lignes}
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

export function CalculMaconnerie({ reglages }: { reglages: ReglagesCalculs }) {
  const [agglo, setAgglo] = useState<Agglo>("creux_15");
  const [longueur, setLongueur] = useState("");
  const [hauteur, setHauteur] = useState("");
  const [ouvertures, setOuvertures] = useState<SaisieOuverture[]>([]);
  const a = reglages.agglos[agglo];

  const { resultat, erreur } = useMemo(() => {
    const L = metresEnMm(longueur);
    const H = metresEnMm(hauteur);
    const completes = ouvertures.every((o) => o.largeur && o.hauteur && o.nombre);
    return evaluer(Boolean(longueur && hauteur && completes), () => {
      if (L === null || H === null) throw new Error("Dimensions en mètres, trois décimales au plus.");
      return calculerMaconnerie(
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

  const lignes: Ligne[] | null = resultat && [
    { libelle: "Surface du mur", valeur: mm2EnM2(resultat.surfaceBruteMm2) },
    ...(resultat.surfaceOuverturesMm2 ? [{ libelle: "Ouvertures déduites", valeur: mm2EnM2(resultat.surfaceOuverturesMm2) }] : []),
    { libelle: "Surface à monter", valeur: mm2EnM2(resultat.surfaceNetteMm2) },
    { libelle: "Agglos à poser", valeur: entier(resultat.blocsTheoriques), precision: `${centiemes(a.centiemesParM2)} par m²` },
    { libelle: "Agglos à commander", valeur: entier(resultat.blocs), fort: true, precision: `Casse et coupes : ${reglages.pertesAgglosPct} %` },
    { libelle: "Mortier de pose", valeur: litresEnM3(resultat.mortierL), precision: `${a.mortierLParM2} L par m²` },
    { libelle: "Ciment", valeur: sacs(resultat.sacsCiment, reglages.sacCimentKg), fort: true, precision: `${kg(resultat.cimentKg)} à ${reglages.mortier.cimentKg} kg/m³ de mortier` },
    { libelle: "Sable", valeur: litresEnM3(resultat.sableL), precision: litres(resultat.sableL) },
    { libelle: "Eau", valeur: litres(resultat.eauL) },
  ];

  const changer = (i: number, champ: keyof SaisieOuverture, v: string) => setOuvertures((os) => os.map((o, j) => (j === i ? { ...o, [champ]: v } : o)));

  return (
    <Mise
      titre="Mur"
      erreur={erreur}
      resultat={lignes}
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

export function CalculCarrelage({ reglages }: { reglages: ReglagesCalculs }) {
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
      return calculerCarrelage({ longueurMm: L, largeurMm: l, carreauLongueurMm: a, carreauLargeurMm: b, parCarton: c, pose, plinthes, portesMm: p }, reglages);
    });
  }, [longueur, largeur, cL, cl, parCarton, pose, plinthes, portes, reglages]);

  const lignes: Ligne[] | null = resultat && [
    { libelle: "Surface à carreler", valeur: mm2EnM2(resultat.surfaceMm2) },
    { libelle: "Carreaux", valeur: entier(resultat.carreaux), precision: `Coupes et casse : ${reglages.pertesCarrelagePct} %` },
    { libelle: "Cartons", valeur: entier(resultat.cartons), fort: true, precision: `${mm2EnM2(resultat.surfaceAcheteeMm2)} achetés` },
    ...(resultat.sacsColle !== null && resultat.colleKg !== null
      ? [{ libelle: "Colle", valeur: sacs(resultat.sacsColle, reglages.sacColleKg), fort: true, precision: `${kg(resultat.colleKg)} à ${reglages.colleKgParM2} kg/m²` }]
      : []),
    ...(resultat.mortierL !== null && resultat.sacsCiment !== null && resultat.cimentKg !== null && resultat.sableL !== null
      ? [
          { libelle: "Mortier de pose", valeur: litresEnM3(resultat.mortierL), precision: `Lit de ${reglages.mortierCarrelageMm} mm` },
          { libelle: "Ciment", valeur: sacs(resultat.sacsCiment, reglages.sacCimentKg), fort: true, precision: kg(resultat.cimentKg) },
          { libelle: "Sable", valeur: litresEnM3(resultat.sableL) },
        ]
      : []),
    ...(resultat.plinthesMm !== null && resultat.plinthesPieces !== null
      ? [{ libelle: "Plinthes", valeur: mmEnM(resultat.plinthesMm), precision: `${entier(resultat.plinthesPieces)} longueurs de ${cL} cm, pertes comprises` }]
      : []),
  ];

  return (
    <Mise
      titre="Pièce et carreau"
      erreur={erreur}
      resultat={lignes}
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

export function CalculPente() {
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
      return calculerPente({ longueurMm: L, hauteurMm: H, penteCentiemes: L !== null && H !== null ? null : p });
    });
  }, [longueur, hauteur, pente]);

  const lignes: Ligne[] | null = resultat && [
    { libelle: "Pente", valeur: `${centiemes(resultat.penteCentiemes)} %`, fort: true },
    { libelle: "Angle", valeur: degres(resultat.angleCentiemes) },
    { libelle: "Longueur horizontale", valeur: mmEnM(resultat.longueurMm) },
    { libelle: "Hauteur (dénivelé)", valeur: `${mmEnM(resultat.hauteurMm)} · ${mm(resultat.hauteurMm)}`, fort: true },
    { libelle: "Longueur réelle de la rampe", valeur: mmEnM(resultat.rampantMm) },
  ];

  return (
    <Mise
      titre="Deux valeurs sur trois"
      erreur={erreur}
      resultat={lignes}
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

export function CalculEscalier() {
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
      return calculerEscalier({ hauteurMm: H, marcheVoulueMm: h, reculementMm: r });
    });
  }, [hauteur, marche, recul]);

  const lignes: Ligne[] | null = resultat && [
    { libelle: "Marches", valeur: entier(resultat.marches), fort: true },
    {
      libelle: "Hauteur de marche",
      valeur: mm(resultat.hauteurMarcheMm),
      fort: true,
      precision: resultat.marchesPlusHautes ? `Dont ${resultat.marchesPlusHautes} de ${resultat.hauteurMarcheMm + 1} mm, pour tomber juste` : undefined,
    },
    { libelle: "Giron (profondeur)", valeur: mm(resultat.gironMm), fort: true },
    { libelle: "Reculement", valeur: mmEnM(resultat.reculementMm), precision: `${entier(Math.max(resultat.marches - 1, 1))} girons : la dernière marche arrive au palier` },
    { libelle: "Formule de Blondel (2 H + G)", valeur: mm(resultat.blondelMm), precision: "Idéal entre 600 et 650 mm" },
    { libelle: "Inclinaison", valeur: degres(resultat.angleCentiemes) },
    { libelle: "Confort", valeur: LIBELLES_CONFORT[resultat.confort], fort: true },
  ];

  return (
    <Mise
      titre="Escalier droit"
      erreur={erreur}
      resultat={lignes}
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

export function CalculEquerre() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [mesure, setMesure] = useState("");

  const { resultat, erreur } = useMemo(() => {
    return evaluer(Boolean(a && b), () => {
      const A = metresEnMm(a);
      const B = metresEnMm(b);
      const M = mesure ? metresEnMm(mesure) : null;
      if (A === null || B === null || (mesure && M === null)) throw new Error("Longueurs en mètres, trois décimales au plus.");
      return calculerEquerre(A, B, M);
    });
  }, [a, b, mesure]);

  const verdicts = {
    droit: "Angle droit",
    ouvert: "Angle ouvert (plus de 90°) : rapprochez les côtés",
    ferme: "Angle fermé (moins de 90°) : écartez les côtés",
  } as const;

  const lignes: Ligne[] | null = resultat && [
    { libelle: "Diagonale théorique", valeur: `${mmEnM(resultat.diagonaleMm)} · ${mm(resultat.diagonaleMm)}`, fort: true },
    ...(resultat.ecartMm !== null && resultat.verdict
      ? [
          { libelle: "Écart mesuré", valeur: `${resultat.ecartMm > 0 ? "+" : ""}${entier(resultat.ecartMm)} mm`, precision: `Toléré : ± ${TOLERANCE_EQUERRE_MM} mm` },
          { libelle: "Verdict", valeur: verdicts[resultat.verdict], fort: true },
        ]
      : []),
  ];

  return (
    <Mise
      titre="Contrôle d'équerrage"
      erreur={erreur}
      resultat={lignes}
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
