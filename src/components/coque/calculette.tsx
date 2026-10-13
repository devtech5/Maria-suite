"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  cfaVersEuro,
  depuisTtc,
  ErreurCalcul,
  euroVersCfa,
  evaluer,
  formater,
  lireSaisie,
  marge,
  remise,
  versTtc,
} from "@/lib/calculette";

const CLE_HISTORIQUE = "maria-calculette";
const NOMBRE = new Intl.NumberFormat("fr-FR");

function lireHistorique(): { expression: string; resultat: string }[] {
  try {
    const brut = localStorage.getItem(CLE_HISTORIQUE);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function ecrireHistorique(liste: { expression: string; resultat: string }[]) {
  try {
    localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(liste.slice(0, 10)));
  } catch {
    // Stockage indisponible (navigation privée) : l'historique vit le temps de la page.
  }
}

/** Résultat en direct de la saisie, ou rien tant qu'elle est incomplète. */
function apercu(expression: string): { texte: string; exact: boolean } | { erreur: string } | null {
  if (!expression.trim()) return null;
  try {
    return formater(evaluer(expression));
  } catch (e) {
    return e instanceof ErreurCalcul ? { erreur: e.message } : null;
  }
}

const TOUCHES: { libelle: string; insere?: string; action?: "effacer" | "retour" | "egal"; ton?: "op" | "egal" | "fonction" }[] = [
  { libelle: "C", action: "effacer", ton: "fonction" },
  { libelle: "(", insere: "(", ton: "fonction" },
  { libelle: ")", insere: ")", ton: "fonction" },
  { libelle: "÷", insere: " ÷ ", ton: "op" },
  { libelle: "7", insere: "7" },
  { libelle: "8", insere: "8" },
  { libelle: "9", insere: "9" },
  { libelle: "×", insere: " × ", ton: "op" },
  { libelle: "4", insere: "4" },
  { libelle: "5", insere: "5" },
  { libelle: "6", insere: "6" },
  { libelle: "−", insere: " − ", ton: "op" },
  { libelle: "1", insere: "1" },
  { libelle: "2", insere: "2" },
  { libelle: "3", insere: "3" },
  { libelle: "+", insere: " + ", ton: "op" },
  { libelle: "%", insere: " %", ton: "fonction" },
  { libelle: "0", insere: "0" },
  { libelle: "000", insere: "000" },
  { libelle: ",", insere: "," },
  { libelle: "⌫", action: "retour", ton: "fonction" },
  { libelle: "=", action: "egal", ton: "egal" },
];

function Calcul() {
  const [expression, setExpression] = useState("");
  // Le panneau ne s'ouvre qu'au clic : jamais rendu côté serveur, le stockage local est lisible ici.
  const [historique, setHistorique] = useState(lireHistorique);
  const [copie, setCopie] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const resultat = useMemo(() => apercu(expression), [expression]);

  useEffect(() => {
    champ.current?.focus();
  }, []);

  function inserer(texte: string) {
    setExpression((e) => e + texte);
    champ.current?.focus();
  }

  function egal() {
    if (!resultat || "erreur" in resultat) return;
    const brut = resultat.texte.replace(/ /g, " ");
    const suivant = [{ expression: expression.trim(), resultat: brut }, ...historique.filter((h) => h.expression !== expression.trim())];
    setHistorique(suivant.slice(0, 10));
    ecrireHistorique(suivant);
    // Le résultat devient la saisie suivante, comme sur une calculette : on enchaîne.
    setExpression(brut.replace(/\s/g, "").replace("−", "-"));
  }

  function toucher(t: (typeof TOUCHES)[number]) {
    if (t.action === "effacer") setExpression("");
    else if (t.action === "retour") setExpression((e) => e.trimEnd().slice(0, -1).trimEnd());
    else if (t.action === "egal") egal();
    else if (t.insere) inserer(t.insere);
    champ.current?.focus();
  }

  async function copier() {
    if (!resultat || "erreur" in resultat) return;
    try {
      await navigator.clipboard.writeText(resultat.texte.replace(/ /g, "").replace(",", ".").replace("−", "-"));
      setCopie(true);
      window.setTimeout(() => setCopie(false), 1500);
    } catch {
      // Presse-papiers refusé : rien à faire, le résultat reste affiché.
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          egal();
        }}
        className="rounded-lg bg-[var(--surface-creuse)] px-3 py-2"
      >
        <input
          ref={champ}
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          aria-label="Calcul"
          inputMode="decimal"
          autoComplete="off"
          placeholder="25 000 × 3 + 18 %"
          className="chiffres w-full bg-transparent text-right text-base outline-none placeholder:text-[var(--encre-faible)]"
        />
        <p className="flex min-h-9 items-baseline justify-end gap-2 text-right" aria-live="polite">
          {resultat && "erreur" in resultat ? (
            <span className="text-xs text-danger-600">{resultat.erreur}</span>
          ) : resultat ? (
            <>
              {!resultat.exact && <span className="text-[11px] text-[var(--encre-faible)]">arrondi</span>}
              <button type="button" onClick={() => void copier()} title="Copier le résultat" className="chiffres text-2xl font-bold">
                {resultat.texte}
              </button>
            </>
          ) : (
            <span className="chiffres text-2xl font-bold text-[var(--encre-faible)]">0</span>
          )}
        </p>
        {copie && <p className="text-right text-[11px] text-valide-600">Copié</p>}
      </form>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {TOUCHES.map((t) => (
          <button
            key={t.libelle}
            type="button"
            onClick={() => toucher(t)}
            className={`chiffres h-11 rounded-lg text-base font-semibold ${
              t.ton === "egal"
                ? "col-span-3 bg-marque-600 text-white hover:bg-marque-700"
                : t.ton === "op"
                  ? "bg-marque-50 text-marque-700 hover:bg-marque-100"
                  : t.ton === "fonction"
                    ? "bg-[var(--surface-creuse)] text-[var(--encre-douce)] hover:text-[var(--encre)]"
                    : "border border-[var(--filet)] bg-[var(--surface)] hover:bg-[var(--surface-creuse)]"
            }`}
          >
            {t.libelle}
          </button>
        ))}
      </div>

      {historique.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--encre-faible)]">Derniers calculs</span>
            <button
              type="button"
              onClick={() => {
                setHistorique([]);
                ecrireHistorique([]);
              }}
              className="text-[11px] text-[var(--encre-faible)] hover:underline"
            >
              Effacer
            </button>
          </div>
          <ul className="max-h-28 overflow-y-auto text-right text-xs">
            {historique.map((h) => (
              <li key={h.expression}>
                <button type="button" onClick={() => setExpression(h.expression)} className="chiffres w-full truncate rounded px-1 py-0.5 text-right hover:bg-[var(--surface-creuse)]">
                  <span className="text-[var(--encre-faible)]">{h.expression} =</span> <span className="font-semibold">{h.resultat}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Champ({ libelle, valeur, changer, suffixe }: { libelle: string; valeur: string; changer: (v: string) => void; suffixe?: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block text-[var(--encre-faible)]">{libelle}</span>
      <span className="flex items-center rounded-md border border-[var(--filet)] bg-[var(--surface)] pr-2">
        <input value={valeur} onChange={(e) => changer(e.target.value)} inputMode="decimal" className="chiffres h-9 w-full min-w-0 bg-transparent px-2 text-sm outline-none" />
        {suffixe && <span className="text-[var(--encre-faible)]">{suffixe}</span>}
      </span>
    </label>
  );
}

function Ligne({ libelle, valeur, fort }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <p className={`flex justify-between gap-3 text-sm ${fort ? "font-semibold" : "text-[var(--encre-douce)]"}`}>
      <span>{libelle}</span>
      <span className="chiffres">{valeur}</span>
    </p>
  );
}

const F = (v: number) => `${NOMBRE.format(v)} F`;

type LigneOutil = { libelle: string; valeur: string; fort?: boolean };

/** Lignes du résultat d'un outil, ou le message d'une saisie impossible (division par zéro…). */
function calculerOutil(
  outil: "tva" | "remise" | "marge" | "euro",
  sens: "ht" | "ttc",
  a: string,
  b: string,
  x: ReturnType<typeof lireSaisie>,
  y: ReturnType<typeof lireSaisie>,
): { lignes: LigneOutil[]; erreur: string | null } {
  try {
    if (outil === "tva" && x && y) {
      const r = sens === "ttc" ? depuisTtc(x, y) : versTtc(x, y);
      return {
        lignes: [
          { libelle: "Hors taxes", valeur: F(r.ht), fort: sens === "ttc" },
          { libelle: "TVA", valeur: F(r.tva) },
          { libelle: "TTC", valeur: F(r.ttc), fort: sens === "ht" },
        ],
        erreur: null,
      };
    }
    if (outil === "remise" && x && y) {
      const r = remise(x, y);
      return { lignes: [{ libelle: "Remise", valeur: `− ${F(r.remise)}` }, { libelle: "Net à payer", valeur: F(r.net), fort: true }], erreur: null };
    }
    if (outil === "marge" && x && y) {
      const r = marge(x, y);
      return {
        lignes: [
          { libelle: "Marge", valeur: F(r.marge), fort: true },
          { libelle: "Taux de marge (sur l'achat)", valeur: r.tauxMarge ?? "—" },
          { libelle: "Taux de marque (sur la vente)", valeur: r.tauxMarque ?? "—" },
        ],
        erreur: null,
      };
    }
    if (outil === "euro") {
      const lignes: LigneOutil[] = [];
      if (x) lignes.push({ libelle: `${a.trim()} €`, valeur: F(euroVersCfa(x)), fort: true });
      if (y) lignes.push({ libelle: `${b.trim()} F`, valeur: `${cfaVersEuro(y)} €`, fort: true });
      return { lignes, erreur: null };
    }
    return { lignes: [], erreur: null };
  } catch (e) {
    return { lignes: [], erreur: e instanceof Error ? e.message : "Calcul impossible." };
  }
}

/** Les calculs de tous les jours au comptoir et au bureau, au franc près. */
function Outils() {
  const [outil, setOutil] = useState<"tva" | "remise" | "marge" | "euro">("tva");
  const [a, setA] = useState("");
  const [b, setB] = useState("18");
  const [sens, setSens] = useState<"ht" | "ttc">("ttc");

  function choisir(o: typeof outil) {
    setOutil(o);
    setA("");
    setB(o === "tva" ? "18" : o === "remise" ? "10" : "");
  }

  const x = lireSaisie(a);
  const y = lireSaisie(b);

  const { lignes, erreur } = calculerOutil(outil, sens, a, b, x, y);
  const rendu: ReactNode = erreur ? (
    <p className="text-xs text-danger-600">{erreur}</p>
  ) : lignes.length === 0 ? (
    <p className="text-xs text-[var(--encre-faible)]">Saisissez les montants.</p>
  ) : (
    lignes.map((l) => <Ligne key={l.libelle} {...l} />)
  );

  const ONGLETS = [
    ["tva", "TVA"],
    ["remise", "Remise"],
    ["marge", "Marge"],
    ["euro", "Euro"],
  ] as const;

  return (
    <div>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-[var(--surface-creuse)] p-1 text-xs">
        {ONGLETS.map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => choisir(cle)}
            className={`h-8 rounded-md font-medium ${outil === cle ? "bg-[var(--surface)] shadow-sm" : "text-[var(--encre-douce)]"}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {outil === "tva" && (
          <>
            <Champ libelle={sens === "ttc" ? "Prix TTC" : "Prix hors taxes"} valeur={a} changer={setA} suffixe="F" />
            <Champ libelle="Taux" valeur={b} changer={setB} suffixe="%" />
            <div className="col-span-2 flex gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={sens === "ttc"} onChange={() => setSens("ttc")} /> Je connais le TTC
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={sens === "ht"} onChange={() => setSens("ht")} /> Je connais le HT
              </label>
            </div>
          </>
        )}
        {outil === "remise" && (
          <>
            <Champ libelle="Prix" valeur={a} changer={setA} suffixe="F" />
            <Champ libelle="Remise" valeur={b} changer={setB} suffixe="%" />
          </>
        )}
        {outil === "marge" && (
          <>
            <Champ libelle="Prix d'achat" valeur={a} changer={setA} suffixe="F" />
            <Champ libelle="Prix de vente" valeur={b} changer={setB} suffixe="F" />
          </>
        )}
        {outil === "euro" && (
          <>
            <Champ libelle="Euros" valeur={a} changer={setA} suffixe="€" />
            <Champ libelle="Francs CFA" valeur={b} changer={setB} suffixe="F" />
          </>
        )}
      </div>

      <div className="mt-3 space-y-1 rounded-lg bg-[var(--surface-creuse)] px-3 py-2">{rendu}</div>
      {outil === "euro" && <p className="mt-2 text-[11px] text-[var(--encre-faible)]">Parité fixe du franc CFA : 1 € = 655,957 F.</p>}
      {outil === "tva" && <p className="mt-2 text-[11px] text-[var(--encre-faible)]">La taxe s&apos;extrait du TTC au franc près, comme en comptabilité.</p>}
    </div>
  );
}

/**
 * Calculette de la barre du haut, ouverte à tout utilisateur connecté : elle
 * ne lit ni n'écrit rien sur le serveur, et ne demande donc aucun droit.
 */
export function Calculette() {
  const [ouvert, setOuvert] = useState(false);
  const [onglet, setOnglet] = useState<"calcul" | "outils">("calcul");
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (panneau.current && !panneau.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  return (
    <div ref={panneau} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label="Calculette"
        aria-expanded={ouvert}
        title="Calculette"
        className="flex size-9 items-center justify-center rounded-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h.01M12 18h.01" />
        </svg>
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-label="Calculette"
          className="fixed inset-x-2 top-14 z-50 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1 text-sm">
              {(
                [
                  ["calcul", "Calcul"],
                  ["outils", "Outils"],
                ] as const
              ).map(([cle, libelle]) => (
                <button
                  key={cle}
                  type="button"
                  onClick={() => setOnglet(cle)}
                  className={`rounded-md px-2.5 py-1 font-medium ${onglet === cle ? "bg-marque-50 text-marque-700" : "text-[var(--encre-douce)] hover:text-[var(--encre)]"}`}
                >
                  {libelle}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer la calculette" className="text-lg leading-none text-[var(--encre-faible)] hover:text-[var(--encre)]">
              ×
            </button>
          </div>
          {onglet === "calcul" ? <Calcul /> : <Outils />}
        </div>
      )}
    </div>
  );
}
