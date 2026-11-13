"use client";

import { useRef, useState } from "react";

import type { Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerColonne, modifierColonne } from "@/modules/taches/actions";
import {
  COULEUR_TYPE,
  DESCRIPTION_TYPE,
  domaineDe,
  ETIQUETTES_MAX,
  ETIQUETTES_PAR_DEFAUT,
  LIBELLE_MAX,
  LIBELLE_TYPE,
  nombreLisible,
  normaliserValeur,
  PALETTE_ETIQUETTES,
  sommeNombres,
  TYPES_COLONNE,
  type Etiquette,
  type TypeColonne,
} from "@/modules/taches/colonnes";

import { useTaches } from "./contexte";
import { BlocCouleur, Deroulant, jourCourt } from "./elements";
import type { ColonneAffichee, TacheAffichee } from "./types";

const VIDE = <span className="text-[var(--encre-faible)]">—</span>;

/** Ce qu'on lit d'une valeur, sans pouvoir la changer. */
function Lecture({ colonne, valeur }: { colonne: ColonneAffichee; valeur: string | undefined }) {
  if (!valeur) return colonne.type === "case" ? <Coche cochee={false} /> : VIDE;
  switch (colonne.type) {
    case "nombre":
      return <span className="chiffres">{nombreLisible(valeur, colonne.options.unite)}</span>;
    case "date":
      return <span>{jourCourt(valeur)}</span>;
    case "case":
      return <Coche cochee />;
    case "lien":
      return (
        <a href={valeur} target="_blank" rel="noopener noreferrer nofollow" className="pointer-events-auto truncate text-[#1f76f0] hover:underline" onClick={(e) => e.stopPropagation()}>
          ↗ {domaineDe(valeur)}
        </a>
      );
    case "etiquette": {
      const e = colonne.options.etiquettes?.find((x) => x.cle === valeur);
      return e ? <BlocCouleur couleur={e.couleur}>{e.libelle}</BlocCouleur> : VIDE;
    }
    default:
      return (
        <span className="truncate" title={valeur}>
          {valeur}
        </span>
      );
  }
}

function Coche({ cochee }: { cochee: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-5 place-items-center rounded border text-xs font-bold ${cochee ? "border-[#00c875] bg-[#00c875] text-white" : "border-[var(--filet)] bg-[var(--surface)]"}`}
    >
      {cochee ? "✓" : ""}
    </span>
  );
}

/**
 * Cellule d'une colonne personnalisée : se lit, et pour qui peut remplir la
 * tâche, se change sur place selon son type — saisie au clavier, date du
 * calendrier, étiquette dans un menu, case d'un clic. Le serveur renormalise
 * chaque valeur ; l'écran ne fait qu'éviter un aller-retour inutile.
 */
export function CelluleChamp({ t, colonne }: { t: TacheAffichee; colonne: ColonneAffichee }) {
  const { peutRemplir, definir, enCours } = useTaches();
  const valeur = t.valeurs[colonne.id];
  const [edition, setEdition] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const date = useRef<HTMLInputElement>(null);

  if (!peutRemplir(t)) {
    return (
      <span className="flex h-full w-full items-center justify-center px-2">
        <Lecture colonne={colonne} valeur={valeur} />
      </span>
    );
  }

  const poser = (saisie: string | null) => {
    const verdict = normaliserValeur(colonne.type, saisie, colonne.options);
    if (!verdict.ok) return setErreur(verdict.message);
    setErreur(null);
    definir(t, colonne, verdict.valeur);
  };

  if (colonne.type === "case") {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={valeur === "1"}
        aria-label={colonne.libelle}
        disabled={enCours}
        onClick={() => poser(valeur === "1" ? null : "1")}
        className="flex h-full w-full items-center justify-center hover:bg-[var(--surface-creuse)]"
      >
        <Coche cochee={valeur === "1"} />
      </button>
    );
  }

  if (colonne.type === "etiquette") {
    const etiquettes = colonne.options.etiquettes ?? [];
    return (
      <Deroulant
        declencheur={
          <span className="flex h-full min-h-9 w-full items-center justify-center">
            <Lecture colonne={colonne} valeur={valeur} />
          </span>
        }
        libelle={`${colonne.libelle} : changer`}
        desactive={enCours}
      >
        {(fermer) => (
          <>
            {etiquettes.map((e) => (
              <button
                key={e.cle}
                type="button"
                role="menuitemradio"
                aria-checked={e.cle === valeur}
                onClick={() => {
                  fermer();
                  poser(e.cle);
                }}
                className="flex w-full items-center rounded-lg px-2 py-1 hover:bg-[var(--surface-creuse)]"
              >
                <span className="flex-1 rounded px-2 py-1 text-center text-[13px] font-medium text-white" style={{ background: e.couleur }}>
                  {e.libelle}
                </span>
              </button>
            ))}
            {valeur && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  fermer();
                  poser(null);
                }}
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)]"
              >
                Vider la cellule
              </button>
            )}
          </>
        )}
      </Deroulant>
    );
  }

  if (colonne.type === "date") {
    return (
      <span className="relative flex h-full w-full">
        <button
          type="button"
          disabled={enCours}
          aria-label={`${colonne.libelle} : changer`}
          onClick={() => {
            try {
              date.current?.showPicker();
            } catch {
              date.current?.focus();
            }
          }}
          className="flex h-full w-full items-center justify-center px-2 hover:bg-[var(--surface-creuse)]"
        >
          <Lecture colonne={colonne} valeur={valeur} />
        </button>
        <input
          ref={date}
          key={valeur ?? ""}
          type="date"
          tabIndex={-1}
          aria-hidden
          defaultValue={valeur ?? ""}
          onChange={(e) => poser(e.target.value || null)}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
        />
      </span>
    );
  }

  // Texte, nombre, lien : un champ au clic ; Entrée ou sortie enregistre, Échap renonce.
  if (edition) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          (e.currentTarget.elements.namedItem("v") as HTMLInputElement).blur();
        }}
        className="relative h-full w-full"
      >
        <input
          name="v"
          autoFocus
          defaultValue={valeur ? (colonne.type === "nombre" ? nombreLisible(valeur) : valeur) : ""}
          inputMode={colonne.type === "nombre" ? "numeric" : colonne.type === "lien" ? "url" : "text"}
          aria-label={colonne.libelle}
          aria-invalid={erreur !== null}
          maxLength={500}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setErreur(null);
              setEdition(false);
            }
          }}
          onBlur={(e) => {
            const verdict = normaliserValeur(colonne.type, e.target.value, colonne.options);
            if (!verdict.ok) return setErreur(verdict.message);
            setErreur(null);
            setEdition(false);
            definir(t, colonne, verdict.valeur);
          }}
          className={`h-full min-h-9 w-full border-2 bg-[var(--surface)] px-2 text-center text-sm outline-none ${erreur ? "border-danger-500" : "border-[#1f76f0]"}`}
        />
        {erreur && (
          <span role="alert" className="absolute right-0 top-full z-10 mt-0.5 w-max max-w-[14rem] rounded bg-danger-600 px-2 py-1 text-xs text-white shadow">
            {erreur}
          </span>
        )}
      </form>
    );
  }

  return (
    <span className="group/champ relative flex h-full w-full items-center">
      <button
        type="button"
        disabled={enCours}
        onClick={() => setEdition(true)}
        aria-label={`${colonne.libelle} : ${valeur ? "modifier" : "remplir"}`}
        className="absolute inset-0 hover:bg-[var(--surface-creuse)]"
      />
      {/* Le lien reste cliquable par-dessus le bouton d'édition. */}
      <span className="pointer-events-none relative flex w-full items-center justify-center px-2">
        <Lecture colonne={colonne} valeur={valeur} />
      </span>
    </span>
  );
}

/** En-tête d'une colonne personnalisée ; pour qui compose, son menu. */
export function EnTeteColonne({ colonne, rang, total }: { colonne: ColonneAffichee; rang: number; total: number }) {
  const { gererColonnes, composerColonne, deplacerColonne, retirerColonne, enCours } = useTaches();
  const titre = (
    <span className="flex items-center justify-center gap-1.5 px-2">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: COULEUR_TYPE[colonne.type] }} />
      <span className="truncate">{colonne.libelle}</span>
      {gererColonnes && (
        <span aria-hidden className="text-[10px] text-[var(--encre-faible)]">
          ▾
        </span>
      )}
    </span>
  );
  if (!gererColonnes) return titre;
  const item = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-creuse)] disabled:opacity-40";
  return (
    <Deroulant declencheur={titre} libelle={`Colonne ${colonne.libelle} : options`} desactive={enCours} className="font-medium hover:bg-[var(--surface-creuse)]">
      {(fermer) => (
        <>
          <p className="px-2 pb-1 text-xs text-[var(--encre-faible)]">{LIBELLE_TYPE[colonne.type]}</p>
          <button type="button" role="menuitem" className={item} onClick={() => {
              fermer();
              composerColonne(colonne);
            }}>
            Renommer, régler
          </button>
          <button type="button" role="menuitem" className={item} disabled={rang === 0} onClick={() => {
              fermer();
              deplacerColonne(colonne, -1);
            }}>
            ← Déplacer à gauche
          </button>
          <button type="button" role="menuitem" className={item} disabled={rang === total - 1} onClick={() => {
              fermer();
              deplacerColonne(colonne, 1);
            }}>
            Déplacer à droite →
          </button>
          <button type="button" role="menuitem" className={`${item} text-danger-600`} onClick={() => {
              fermer();
              retirerColonne(colonne);
            }}>
            Retirer la colonne
          </button>
        </>
      )}
    </Deroulant>
  );
}

/** Pied d'une colonne dans un groupe : la somme d'un nombre, la part cochée d'une case. */
export function PiedColonne({ colonne, taches }: { colonne: ColonneAffichee; taches: TacheAffichee[] }) {
  if (colonne.type === "nombre") {
    const somme = sommeNombres(taches.map((t) => t.valeurs[colonne.id]));
    if (somme === null) return null;
    return (
      <span className="chiffres block text-center text-xs font-semibold" title="Somme du groupe">
        {nombreLisible(somme, colonne.options.unite)}
        <span className="block text-[10px] font-normal text-[var(--encre-faible)]">somme</span>
      </span>
    );
  }
  if (colonne.type === "case") {
    const cochees = taches.filter((t) => t.valeurs[colonne.id] === "1").length;
    return (
      <span className="chiffres block text-center text-xs text-[var(--encre-douce)]">
        {cochees} / {taches.length}
      </span>
    );
  }
  return null;
}

/**
 * Créer ou régler une colonne. À la création, on choisit son type, comme
 * sur un tableau de suivi ; ensuite il ne change plus. Les étiquettes se
 * nomment et se colorent, une ligne chacune.
 */
export function FormulaireColonne({
  colonne,
  lancer,
  fermer,
}: {
  colonne: ColonneAffichee | null;
  lancer: (action: () => Promise<Resultat>, apres?: () => void) => void;
  fermer: () => void;
}) {
  const { enCours } = useTaches();
  const [type, setType] = useState<TypeColonne>(colonne?.type ?? "texte");
  const [libelle, setLibelle] = useState(colonne?.libelle ?? "");
  const [unite, setUnite] = useState(colonne?.options.unite ?? "");
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>(colonne?.options.etiquettes ?? ETIQUETTES_PAR_DEFAUT);

  const changer = (i: number, e: Partial<Etiquette>) => setEtiquettes((l) => l.map((x, j) => (j === i ? { ...x, ...e } : x)));
  const options = type === "nombre" ? { unite } : type === "etiquette" ? { etiquettes } : {};

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        lancer(() => (colonne ? modifierColonne(colonne.id, { libelle, options }) : creerColonne({ libelle, type, options })), fermer);
      }}
      className="space-y-4 px-5 py-4"
    >
      {!colonne && (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">Type de colonne</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TYPES_COLONNE.map((x) => (
              <label
                key={x}
                className={`flex cursor-pointer gap-2.5 rounded-lg border p-2.5 ${type === x ? "border-[#1f76f0] ring-1 ring-[#1f76f0]" : "border-[var(--filet)] hover:bg-[var(--surface-creuse)]"}`}
              >
                <input type="radio" name="type" value={x} checked={type === x} onChange={() => setType(x)} className="sr-only" />
                <span aria-hidden className="mt-0.5 size-4 shrink-0 rounded" style={{ background: COULEUR_TYPE[x] }} />
                <span>
                  <span className="block text-sm font-semibold">{LIBELLE_TYPE[x]}</span>
                  <span className="block text-xs text-[var(--encre-faible)]">{DESCRIPTION_TYPE[x]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Nom de la colonne</span>
        <input
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          required
          maxLength={LIBELLE_MAX}
          placeholder={type === "nombre" ? "Montant du devis" : type === "etiquette" ? "Visa du bureau de contrôle" : "Client"}
          className={CLASSE_CHAMP}
        />
      </label>

      {type === "nombre" && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Unité (facultative)</span>
          <input value={unite} onChange={(e) => setUnite(e.target.value)} maxLength={12} placeholder="FCFA, %, m², jours…" className={`${CLASSE_CHAMP} max-w-xs`} />
          <span className="mt-1 block text-xs text-[var(--encre-faible)]">Des nombres entiers, additionnés au pied de chaque groupe.</span>
        </label>
      )}

      {type === "etiquette" && (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">Étiquettes</legend>
          <ul className="space-y-2">
            {etiquettes.map((e, i) => (
              <li key={e.cle || `n${i}`} className="flex flex-wrap items-center gap-2">
                <input
                  value={e.libelle}
                  onChange={(x) => changer(i, { libelle: x.target.value })}
                  maxLength={LIBELLE_MAX}
                  aria-label={`Étiquette ${i + 1}`}
                  className="h-9 min-w-0 flex-1 rounded-lg border-0 px-3 text-sm font-medium text-white outline-none placeholder:text-white/70"
                  style={{ background: e.couleur }}
                  placeholder="Nom de l'étiquette"
                />
                <span className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Couleur de l'étiquette ${i + 1}`}>
                  {PALETTE_ETIQUETTES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={e.couleur === c}
                      aria-label={c}
                      onClick={() => changer(i, { couleur: c })}
                      className={`size-5 rounded-full ${e.couleur === c ? "ring-2 ring-[var(--encre)] ring-offset-1" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                </span>
                <button
                  type="button"
                  onClick={() => setEtiquettes((l) => l.filter((_, j) => j !== i))}
                  disabled={etiquettes.length <= 1}
                  aria-label={`Retirer l'étiquette ${e.libelle || i + 1}`}
                  className="grid size-8 place-items-center rounded-lg text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)] disabled:opacity-30"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {etiquettes.length < ETIQUETTES_MAX && (
            <button
              type="button"
              onClick={() => setEtiquettes((l) => [...l, { cle: "", libelle: "", couleur: PALETTE_ETIQUETTES[l.length % PALETTE_ETIQUETTES.length] }])}
              className="mt-2 text-sm font-semibold text-[#1f76f0] hover:underline"
            >
              + Ajouter une étiquette
            </button>
          )}
          {colonne && <p className="mt-2 text-xs text-[var(--encre-faible)]">Une étiquette retirée vide les cellules qui la portaient ; une étiquette renommée les garde.</p>}
        </fieldset>
      )}

      <div className="flex justify-end gap-2 border-t border-[var(--filet)] pt-3">
        <button type="button" onClick={fermer} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
          Annuler
        </button>
        <button type="submit" disabled={enCours || libelle.trim() === ""} className="h-cible rounded-lg bg-[#1f76f0] px-4 text-sm font-semibold text-white disabled:opacity-50">
          {colonne ? "Enregistrer" : "Ajouter la colonne"}
        </button>
      </div>
    </form>
  );
}
