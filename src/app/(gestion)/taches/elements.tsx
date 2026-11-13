"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { joursAvantEcheance, LIBELLE_PRIORITE, LIBELLE_STATUT, type Geste, type Priorite, type Statut } from "@/modules/taches/calcul";
import { COULEUR_PRIORITE, COULEUR_STATUT, couleurPersonne, estClose, gesteVers, initiales } from "@/modules/taches/vues";

import { valeurExecutant } from "./champs-tache";
import { CelluleChamp } from "./colonnes-ui";
import { CelluleIntervenants } from "./intervenants-ui";
import { useTaches } from "./contexte";
import type { TacheAffichee } from "./types";

// ------------------------------------------------------------------ formats

const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const JOUR_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const RELATIF = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

export const jourCourt = (iso: string) => JOUR_COURT.format(new Date(`${iso}T00:00:00Z`));
export const jourLong = (iso: string) => JOUR_LONG.format(new Date(`${iso}T00:00:00Z`));

/** « il y a 2 heures », mesuré à l'instant du rendu serveur. */
export function depuis(instantIso: string, maintenantIso: string): string {
  const secondes = Math.round((Date.parse(instantIso) - Date.parse(maintenantIso)) / 1000);
  const abs = Math.abs(secondes);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return RELATIF.format(Math.round(secondes / 60), "minute");
  if (abs < 86_400) return RELATIF.format(Math.round(secondes / 3600), "hour");
  if (abs < 30 * 86_400) return RELATIF.format(Math.round(secondes / 86_400), "day");
  return RELATIF.format(Math.round(secondes / (30 * 86_400)), "month");
}

export const LIBELLE_GESTE: Record<Geste, string> = { demarrer: "Commencer", terminer: "Terminer", rouvrir: "Rouvrir", annuler: "Annuler" };

// ------------------------------------------------------------------ pastilles

export function Avatar({ nom, taille = 28, sansCompte = false }: { nom: string; taille?: number; sansCompte?: boolean }) {
  return (
    <span
      title={sansCompte ? `${nom} — sans compte, suivie par son auteur` : nom}
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ${sansCompte ? "ring-2 ring-dashed ring-[var(--filet)]" : ""}`}
      style={{ width: taille, height: taille, fontSize: Math.round(taille * 0.38), background: couleurPersonne(nom) }}
    >
      {initiales(nom)}
    </span>
  );
}

/** Bloc de couleur plein, texte blanc centré : la cellule d'état ou de priorité. */
export function BlocCouleur({ couleur, children, className = "" }: { couleur: string; children: ReactNode; className?: string }) {
  return (
    <span className={`flex h-full min-h-9 w-full items-center justify-center px-2 text-center text-[13px] font-medium text-white ${className}`} style={{ background: couleur }}>
      {children}
    </span>
  );
}

/**
 * Échéance lisible : un point rouge en retard, une coche et la date barrée
 * une fois terminée, un demi-cercle le jour même.
 */
export function TexteEcheance({ t, aujourdhui }: { t: { echeance: string | null; statut: Statut }; aujourdhui: string }) {
  if (!t.echeance) return <span className="text-[var(--encre-faible)]">—</span>;
  const jours = joursAvantEcheance(t.echeance, t.statut, aujourdhui);
  const date = jourCourt(t.echeance);
  if (t.statut === "terminee")
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="text-valide-600">
          ✓
        </span>
        <span className="text-[var(--encre-faible)] line-through">{date}</span>
      </span>
    );
  if (jours === null) return <span className="text-[var(--encre-faible)]">{date}</span>;
  return (
    <span className="inline-flex items-center gap-1.5" title={jours < 0 ? `En retard de ${-jours} j` : jours === 0 ? "Pour aujourd'hui" : `Dans ${jours} j`}>
      {jours < 0 ? (
        <span aria-label="En retard" className="grid size-4 place-items-center rounded-full border-2 border-danger-500 text-[9px] font-bold text-danger-600">
          !
        </span>
      ) : jours === 0 ? (
        <span aria-label="Aujourd'hui" className="size-3.5 rounded-full border-2 border-[#fdab3d] bg-[linear-gradient(90deg,#fdab3d_50%,transparent_50%)]" />
      ) : null}
      <span className={jours < 0 ? "font-semibold text-danger-600" : ""}>{date}</span>
    </span>
  );
}

// ------------------------------------------------------------------ menu déroulant

/**
 * Menu ouvert sous une cellule. Posé dans le corps de la page, en position
 * fixe : un tableau qui défile de côté ne le rogne pas. Il suit sa cellule
 * quand la page défile, et se ferme au clic à côté, à Échap, ou quand la
 * cellule sort de l'écran.
 */
interface Position {
  x: number;
  largeur: number;
  /** Ouvert vers le bas : son haut ; vers le haut : la distance de son bas au bas de la fenêtre. */
  haut?: number;
  bas?: number;
  hauteurMax: number;
}

const HAUTEUR_MENU = 288;

/**
 * Place du menu sous son bouton — ou au-dessus quand la place manque en bas
 * de l'écran —, `null` si le bouton n'est plus à l'écran.
 */
function positionSous(el: HTMLElement | null, largeurMin = 176): Position | null {
  const r = el?.getBoundingClientRect();
  if (!r || r.bottom < 0 || r.top > window.innerHeight) return null;
  const largeur = Math.max(r.width, largeurMin);
  const x = Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8));
  const dessous = window.innerHeight - r.bottom - 12;
  const dessus = r.top - 12;
  if (dessous >= Math.min(HAUTEUR_MENU, 200) || dessous >= dessus) return { x, largeur, haut: r.bottom + 4, hauteurMax: Math.min(HAUTEUR_MENU, dessous) };
  return { x, largeur, bas: window.innerHeight - r.top + 4, hauteurMax: Math.min(HAUTEUR_MENU, dessus) };
}

export function Deroulant({
  declencheur,
  libelle,
  desactive,
  children,
  className = "",
  largeurMin = 176,
}: {
  declencheur: ReactNode;
  libelle: string;
  desactive?: boolean;
  children: (fermer: () => void) => ReactNode;
  className?: string;
  /** Largeur du menu au moins, en pixels. */
  largeurMin?: number;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const fermer = () => setPosition(null);
  const ouvert = position !== null;

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !bouton.current?.contains(e.target as Node)) setPosition(null);
    };
    const clavier = (e: KeyboardEvent) => e.key === "Escape" && setPosition(null);
    const suivre = () => setPosition(positionSous(bouton.current, largeurMin));
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", clavier);
    window.addEventListener("scroll", suivre, true);
    window.addEventListener("resize", suivre);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", clavier);
      window.removeEventListener("scroll", suivre, true);
      window.removeEventListener("resize", suivre);
    };
  }, [ouvert, largeurMin]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        disabled={desactive}
        aria-label={libelle}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => (ouvert ? fermer() : setPosition(positionSous(bouton.current, largeurMin)))}
        className={`block h-full w-full disabled:cursor-default ${className}`}
      >
        {declencheur}
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className="fixed z-[55] overflow-y-auto rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-1.5 shadow-xl"
            style={{ left: position.x, top: position.haut, bottom: position.bas, width: position.largeur, maxHeight: position.hauteurMax }}
          >
            {children(fermer)}
          </div>,
          document.body,
        )}
    </>
  );
}

const CLASSE_ITEM = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-creuse)]";

// ------------------------------------------------------------------ cellules

/** État en bloc de couleur ; un clic propose les gestes permis, chacun vers sa couleur. */
export function CelluleStatut({ t }: { t: TacheAffichee }) {
  const { gestes, geste, enCours } = useTaches();
  const possibles = gestes(t);
  const bloc = <BlocCouleur couleur={COULEUR_STATUT[t.statut]}>{LIBELLE_STATUT[t.statut]}</BlocCouleur>;
  if (possibles.length === 0) return bloc;
  return (
    <Deroulant declencheur={bloc} libelle={`État : ${LIBELLE_STATUT[t.statut]}. Changer`} desactive={enCours}>
      {(fermer) =>
        possibles.map((g) => {
          const vers = (["a_faire", "en_cours", "terminee", "annulee"] as Statut[]).find((s) => gesteVers(t.statut, s) === g)!;
          return (
            <button
              key={g}
              type="button"
              role="menuitem"
              onClick={() => {
                fermer();
                geste(t, g);
              }}
              className={CLASSE_ITEM}
            >
              <span className="h-5 w-1.5 rounded-full" style={{ background: COULEUR_STATUT[vers] }} />
              <span className="font-medium">{LIBELLE_GESTE[g]}</span>
              <span className="ml-auto text-xs text-[var(--encre-faible)]">{LIBELLE_STATUT[vers]}</span>
            </button>
          );
        })
      }
    </Deroulant>
  );
}

export function CellulePriorite({ t }: { t: TacheAffichee }) {
  const { modifiable, retoucher, enCours } = useTaches();
  const bloc = <BlocCouleur couleur={COULEUR_PRIORITE[t.priorite]}>{LIBELLE_PRIORITE[t.priorite]}</BlocCouleur>;
  if (!modifiable(t)) return bloc;
  return (
    <Deroulant declencheur={bloc} libelle={`Priorité : ${LIBELLE_PRIORITE[t.priorite]}. Changer`} desactive={enCours}>
      {(fermer) =>
        (["urgente", "haute", "normale", "basse"] as Priorite[]).map((p) => (
          <button
            key={p}
            type="button"
            role="menuitemradio"
            aria-checked={p === t.priorite}
            onClick={() => {
              fermer();
              if (p !== t.priorite) retoucher(t, { priorite: p });
            }}
            className={CLASSE_ITEM}
          >
            <span className="flex-1 rounded px-2 py-1 text-center text-[13px] font-medium text-white" style={{ background: COULEUR_PRIORITE[p] }}>
              {LIBELLE_PRIORITE[p]}
            </span>
          </button>
        ))
      }
    </Deroulant>
  );
}

/** Une date qui s'ouvre au clic, par le sélecteur du navigateur. */
export function CelluleDate({
  t,
  champ,
  children,
}: {
  t: TacheAffichee;
  champ: "echeance" | "dateDebut";
  children: ReactNode;
}) {
  const { modifiable, retoucher, enCours } = useTaches();
  const entree = useRef<HTMLInputElement>(null);
  if (!modifiable(t)) return <span className="flex h-full items-center justify-center px-2">{children}</span>;
  const libelle = champ === "echeance" ? "Échéance" : "Début prévu";
  return (
    <span className="relative flex h-full items-center justify-center">
      <button
        type="button"
        disabled={enCours}
        aria-label={`${libelle} : changer`}
        onClick={() => {
          const e = entree.current;
          if (!e) return;
          try {
            e.showPicker();
          } catch {
            e.focus();
          }
        }}
        className="flex h-full w-full items-center justify-center px-2 hover:bg-[var(--surface-creuse)]"
      >
        {children}
      </button>
      <input
        ref={entree}
        key={t[champ] ?? ""}
        type="date"
        tabIndex={-1}
        aria-hidden
        defaultValue={t[champ] ?? ""}
        min={champ === "echeance" ? t.dateDebut ?? undefined : undefined}
        max={champ === "dateDebut" ? t.echeance ?? undefined : undefined}
        onChange={(e) => {
          const valeur = e.target.value || null;
          if (valeur !== t[champ]) retoucher(t, { [champ]: valeur });
        }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
      />
    </span>
  );
}

/** Responsable : l'avatar, et pour qui attribue, la liste du Personnel. */
export function CelluleResponsable({ t, avecNom = false }: { t: TacheAffichee; avecNom?: boolean }) {
  const { attribue, modifiable, retoucher, personnel, moi, enCours } = useTaches();
  const contenu = (
    <span className="flex h-full items-center justify-center gap-2 px-2">
      <Avatar nom={t.assignee} sansCompte={t.sansCompte} />
      {avecNom && <span className="truncate text-sm">{t.assigneeUserId === moi && !t.sansCompte ? "Moi" : t.assignee}</span>}
    </span>
  );
  if (!attribue || !modifiable(t)) return contenu;
  const actuel = valeurExecutant(t, moi);
  const monSalarie = personnel.find((p) => p.userId === moi);
  const choix = [
    { valeur: monSalarie ? `e:${monSalarie.id}` : "", nom: "Moi", poste: monSalarie?.poste ?? "", couleur: monSalarie?.nom ?? "Moi" },
    ...personnel.filter((p) => p !== monSalarie).map((p) => ({ valeur: `e:${p.id}`, nom: p.nom, poste: p.poste, couleur: p.nom })),
  ];
  return (
    <Deroulant declencheur={contenu} libelle={`Responsable : ${t.assignee}. Réattribuer`} desactive={enCours} className="hover:bg-[var(--surface-creuse)]">
      {(fermer) =>
        choix.map((c) => (
          <button
            key={c.valeur || "moi"}
            type="button"
            role="menuitemradio"
            aria-checked={c.valeur === actuel}
            onClick={() => {
              fermer();
              if (c.valeur !== actuel) retoucher(t, { executant: c.valeur });
            }}
            className={`${CLASSE_ITEM} ${c.valeur === actuel ? "bg-[var(--surface-creuse)]" : ""}`}
          >
            <Avatar nom={c.couleur} taille={24} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.nom}</span>
              {c.poste && <span className="block truncate text-xs text-[var(--encre-faible)]">{c.poste}</span>}
            </span>
          </button>
        ))
      }
    </Deroulant>
  );
}

/** Petits dessins des lignes de fiche, au trait. */
const DESSINS = {
  personne: <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 13c.6-2.3 2.4-3.5 4.5-3.5s3.9 1.2 4.5 3.5" />,
  etat: <path d="M3 4h10v8H3zM3 8h10" />,
  calendrier: <path d="M3 5h10v8H3zM3 7.5h10M6 3v3M10 3v3" />,
  drapeau: <path d="M4 14V3M4 3h7l-1.5 2.5L11 8H4" />,
  texte: <path d="M4 4h8M8 4v9" />,
  horloge: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 5v3l2 1.5" />,
  nombre: <path d="M6 3 5 13M11 3l-1 10M3 6h10M3 10h10" />,
  etiquette: <path d="M3 3h5l5 5-5 5-5-5zM5.5 5.5h.01" />,
  case: <path d="M3 3h10v10H3zM5.5 8l2 2 3-4" />,
  lien: <path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5L8 4.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l1-1" />,
  date: <path d="M3 5h10v8H3zM3 7.5h10M6 3v3M10 3v3" />,
  personnes: <path d="M6 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2.5 12.5c.5-1.8 1.8-2.8 3.5-2.8s3 1 3.5 2.8M11 7a1.7 1.7 0 1 0 0-3.4M11.5 9.7c1.2.2 2 1.1 2.3 2.6" />,
};

export type Dessin = keyof typeof DESSINS;

/** Ligne « icône · libellé · valeur » des fiches et des cartes du Kanban. */
export function LigneFiche({ icone, libelle, children }: { icone: Dessin; libelle: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-1 text-[13px]">
      <span className="flex items-center gap-1.5 truncate text-[var(--encre-douce)]" title={libelle}>
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-[var(--encre-faible)]" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {DESSINS[icone]}
        </svg>
        {libelle}
      </span>
      <span className="flex min-h-8 items-center justify-center overflow-hidden rounded bg-[var(--surface-creuse)]">{children}</span>
    </div>
  );
}

/** Le contenu d'une carte : celui des Fiches, plus serré dans le Kanban. */
export function CorpsCarte({ t, compacte = false }: { t: TacheAffichee; compacte?: boolean }) {
  const { aujourdhui, maintenantIso, colonnes } = useTaches();
  return (
    <div className="space-y-1">
      <LigneFiche icone="personne" libelle="Responsable">
        <CelluleResponsable t={t} />
      </LigneFiche>
      <LigneFiche icone="personnes" libelle="Intervenants">
        <CelluleIntervenants t={t} />
      </LigneFiche>
      {!compacte && (
        <LigneFiche icone="etat" libelle="État">
          <CelluleStatut t={t} />
        </LigneFiche>
      )}
      <LigneFiche icone="calendrier" libelle="Échéance">
        <CelluleDate t={t} champ="echeance">
          <TexteEcheance t={t} aujourdhui={aujourdhui} />
        </CelluleDate>
      </LigneFiche>
      <LigneFiche icone="drapeau" libelle="Priorité">
        <CellulePriorite t={t} />
      </LigneFiche>
      <LigneFiche icone="texte" libelle="Remarques">
        <span className="truncate px-2 text-[var(--encre-douce)]" title={t.description ?? undefined}>
          {t.description || "—"}
        </span>
      </LigneFiche>
      {colonnes.map((c) => (
        <LigneFiche key={c.id} icone={c.type === "texte" ? "texte" : c.type} libelle={c.libelle}>
          <CelluleChamp t={t} colonne={c} />
        </LigneFiche>
      ))}
      <LigneFiche icone="horloge" libelle="Mise à jour">
        <span className="truncate px-2 text-[var(--encre-douce)]">{depuis(t.majLeIso, maintenantIso)}</span>
      </LigneFiche>
    </div>
  );
}

export const titreBarre = (t: TacheAffichee) => (estClose(t.statut) ? "text-[var(--encre-faible)] line-through decoration-1" : "");
