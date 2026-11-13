"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { correspond, dansPeriode, lirePeriode, type Periode } from "@/lib/recherche";
import {
  AFFICHAGES,
  DESCRIPTION_AFFICHAGE,
  estClose,
  LIBELLE_AFFICHAGE,
  LIBELLE_REGROUPEMENT,
  type Affichage,
  type Regroupement,
} from "@/modules/taches/vues";

import type { Salarie } from "./champs-tache";
import { FournisseurTaches, useTaches } from "./contexte";
import type { ColonneAffichee, Mentionnable, PersonnePossible, TacheAffichee } from "./types";
import { VueCalendrier } from "./vue-calendrier";
import { VueFiches, VueKanban } from "./vue-cartes";
import { VueFrise } from "./vue-frise";
import { VueTableur } from "./vue-tableur";

export type Perimetre = "miennes" | "confiees" | "toutes";

const PERIMETRES: { cle: Perimetre; libelle: string }[] = [
  { cle: "miennes", libelle: "Mes tâches" },
  { cle: "confiees", libelle: "Confiées à d'autres" },
  { cle: "toutes", libelle: "Toute l'équipe" },
];

/** Pictogramme de chaque affichage : un carré de couleur et son dessin. */
const ICONE: Record<Affichage, { couleur: string; dessin: ReactNode }> = {
  tableur: { couleur: "#6c6cff", dessin: <path d="M3 4h10v8H3zM3 7h10M3 10h10M7 4v8" /> },
  fiches: { couleur: "#ff642e", dessin: <path d="M3 4h5v8H3zM10 5h3v6h-3" /> },
  calendrier: { couleur: "#e97ae4", dessin: <path d="M3 5h10v7H3zM3 7.5h10M6 3.5v2.5M10 3.5v2.5" /> },
  kanban: { couleur: "#1f76f0", dessin: <path d="M3 4h10v8H3zM6.5 4v5M9.5 4v3" /> },
  gantt: { couleur: "#037f4c", dessin: <path d="M4 5h5M6 8h5M5 11h6" /> },
  echeancier: { couleur: "#fdab3d", dessin: <path d="M3 5h6M3 8h10M3 11h4" /> },
};

function Pictogramme({ affichage }: { affichage: Affichage }) {
  const { couleur, dessin } = ICONE[affichage];
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded" style={{ background: couleur }}>
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dessin}
      </svg>
    </span>
  );
}

/**
 * Les tâches, en six vues : Tableur, Fiches, Calendrier, Kanban, Gantt,
 * Échéancier. Recherche, période et regroupement valent pour toutes ; la vue
 * choisie se garde dans l'adresse (`?affichage=`), si bien qu'un lien envoyé
 * ou un retour arrière la retrouve.
 */
export function VuesTaches({
  taches,
  perimetre,
  perimetres,
  affichageInitial,
  rechercheInitiale = "",
  periodeInitiale = { du: null, au: null },
  vide,
  ...partage
}: {
  taches: TacheAffichee[];
  /** Ce qui s'affiche quand le périmètre n'a aucune tâche. */
  vide: ReactNode;
  /** Colonnes personnalisées du tableau. */
  colonnes: ColonneAffichee[];
  personnesPossibles: PersonnePossible[];
  mentionnables: Mentionnable[];
  perimetre: Perimetre;
  /** Les périmètres permis : « Toute l'équipe » demande le droit d'attribuer. */
  perimetres: Perimetre[];
  affichageInitial: Affichage;
  rechercheInitiale?: string;
  periodeInitiale?: Periode;
  moi: string;
  attribue: boolean;
  executer: boolean;
  personnel: Salarie[];
  aujourdhui: string;
  maintenantIso: string;
}) {
  const [affichage, setAffichage] = useState<Affichage>(affichageInitial);
  const [regroupement, setRegroupement] = useState<Regroupement>("statut");
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [du, setDu] = useState(periodeInitiale.du ?? "");
  const [au, setAu] = useState(periodeInitiale.au ?? "");
  const [masquerCloses, setMasquerCloses] = useState(false);

  const periode = lirePeriode(du, au);
  const filtre = recherche.trim() !== "" || !!periode.du || !!periode.au || masquerCloses;
  const visibles = taches.filter(
    (t) =>
      correspond(recherche, [t.titre, t.numero, t.description, t.assignee, t.createur, ...t.intervenants.map((i) => i.nom), ...t.sousTaches.map((st) => st.titre), ...texteDesColonnes(t, partage.colonnes)]) &&
      dansPeriode(t.echeance, periode) &&
      !(masquerCloses && estClose(t.statut)),
  );

  function choisir(a: Affichage) {
    setAffichage(a);
    // L'adresse suit sans recharger la page : la vue choisie survit au retour arrière et au partage du lien.
    const url = new URL(window.location.href);
    if (a === "tableur") url.searchParams.delete("affichage");
    else url.searchParams.set("affichage", a);
    window.history.replaceState(window.history.state, "", url);
  }

  const lienPerimetre = (p: Perimetre) => {
    const params = new URLSearchParams();
    if (p !== "miennes") params.set("vue", p);
    if (affichage !== "tableur") params.set("affichage", affichage);
    const q = params.toString();
    return q ? `/taches?${q}` : "/taches";
  };

  return (
    <FournisseurTaches taches={taches} {...partage}>
      <nav aria-label="Périmètre" className="mb-3 flex gap-1 overflow-x-auto">
        {PERIMETRES.filter((p) => perimetres.includes(p.cle)).map((p) => (
          <Link
            key={p.cle}
            href={lienPerimetre(p.cle)}
            aria-current={perimetre === p.cle ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              perimetre === p.cle ? "bg-[var(--surface-creuse)] text-[var(--encre)]" : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
            }`}
          >
            {p.libelle}
          </Link>
        ))}
      </nav>

      <div role="tablist" aria-label="Affichage" className="mb-1 flex gap-1.5 overflow-x-auto border-b border-[var(--filet)] pb-2">
        {AFFICHAGES.map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={affichage === a}
            onClick={() => choisir(a)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              affichage === a
                ? "border-[#1f76f0] bg-[#1f76f0]/5 text-[var(--encre)] ring-1 ring-[#1f76f0]"
                : "border-[var(--filet)] text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
            }`}
          >
            <Pictogramme affichage={a} />
            {LIBELLE_AFFICHAGE[a]}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-[var(--encre-faible)]">{DESCRIPTION_AFFICHAGE[affichage]}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AjoutRapide />
        <BoutonColonne />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une tâche, une personne…"
          aria-label="Rechercher une tâche"
          className={`${CLASSE_CHAMP} h-9 min-w-[12rem] flex-1 sm:max-w-xs`}
        />
        {(affichage === "tableur" || affichage === "gantt") && (
          <label className="flex items-center gap-1.5 text-sm text-[var(--encre-douce)]">
            Regrouper par
            <select value={regroupement} onChange={(e) => setRegroupement(e.target.value as Regroupement)} className={CLASSE_CHAMP_COMPACT}>
              {(Object.keys(LIBELLE_REGROUPEMENT) as Regroupement[]).map((r) => (
                <option key={r} value={r}>
                  {LIBELLE_REGROUPEMENT[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="flex flex-wrap items-center gap-1.5 text-sm">
          <legend className="sr-only">Échéance</legend>
          <span className="text-[var(--encre-faible)]">Échéance du</span>
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Échéance : du" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          <span className="text-[var(--encre-faible)]">au</span>
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Échéance : au" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
        </fieldset>
        <label className="flex items-center gap-1.5 text-sm text-[var(--encre-douce)]">
          <input type="checkbox" checked={masquerCloses} onChange={(e) => setMasquerCloses(e.target.checked)} className="size-4 accent-marque-600" />
          Masquer terminées et annulées
        </label>
        {filtre && (
          <button
            type="button"
            onClick={() => {
              setRecherche("");
              setDu("");
              setAu("");
              setMasquerCloses(false);
            }}
            className="text-xs font-semibold text-marque-600 hover:underline"
          >
            Tout afficher ({taches.length})
          </button>
        )}
      </div>

      {taches.length === 0 ? (
        vide
      ) : filtre && visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Aucun résultat : aucune tâche ne répond à cette recherche ici.</p>
      ) : affichage === "tableur" ? (
        <VueTableur taches={visibles} regroupement={regroupement} />
      ) : affichage === "fiches" ? (
        <VueFiches taches={visibles} />
      ) : affichage === "calendrier" ? (
        <VueCalendrier taches={visibles} />
      ) : affichage === "kanban" ? (
        <VueKanban taches={visibles} />
      ) : (
        <VueFrise taches={visibles} mode={affichage} regroupement={regroupement} />
      )}
    </FournisseurTaches>
  );
}

/** « + Nouvelle tâche » d'un mot : pour soi, priorité normale ; le reste se règle ensuite dans les cellules. */
function AjoutRapide() {
  const { executer, creerRapide, enCours } = useTaches();
  const [titre, setTitre] = useState("");
  if (!executer) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (titre.trim().length < 3) return;
        creerRapide(titre.trim());
        setTitre("");
      }}
      className="flex items-center gap-1"
    >
      <input
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        maxLength={160}
        placeholder="+ Ajouter une tâche, puis Entrée"
        aria-label="Ajouter une tâche rapidement"
        className={`${CLASSE_CHAMP} h-9 w-60`}
      />
      <button type="submit" disabled={enCours || titre.trim().length < 3} className="h-9 rounded-lg bg-[#1f76f0] px-3 text-sm font-semibold text-white disabled:opacity-40">
        Ajouter
      </button>
    </form>
  );
}

/** Ce qu'une recherche trouve dans les colonnes personnalisées : le texte, le lien, le nom de l'étiquette. */
function texteDesColonnes(t: TacheAffichee, colonnes: ColonneAffichee[]): string[] {
  return colonnes.flatMap((c) => {
    const v = t.valeurs[c.id];
    if (!v) return [];
    if (c.type === "etiquette") return c.options.etiquettes?.filter((e) => e.cle === v).map((e) => e.libelle) ?? [];
    return c.type === "texte" || c.type === "lien" || c.type === "nombre" ? [v] : [];
  });
}

/** « + Colonne » : la même fenêtre que le « + » du tableur, offerte dans toutes les vues. */
function BoutonColonne() {
  const { gererColonnes, composerColonne } = useTaches();
  if (!gererColonnes) return null;
  return (
    <button
      type="button"
      onClick={() => composerColonne(null)}
      className="h-9 rounded-lg border border-[var(--filet)] px-3 text-sm font-medium text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
    >
      + Colonne
    </button>
  );
}
