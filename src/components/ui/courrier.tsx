import type { ReactNode } from "react";

/**
 * Briques communes à la Boîte mail et à la Messagerie, sur le modèle d'Outlook :
 * un ruban d'actions au-dessus de tout, les dossiers à gauche, la liste au
 * milieu, la lecture à droite en cartes posées sur le fond.
 *
 * Sous 768 px il ne reste qu'un volet à la fois : la liste, ou la lecture avec
 * sa croix et ses flèches pour passer au message voisin sans revenir en arrière.
 */

// ---------------------------------------------------------------- icônes

const TRACES = {
  nouveau: (
    <>
      <path d="M12 20h8" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  corbeille: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </>
  ),
  archiver: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
  repondre: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5" />,
  "repondre-tous": (
    <>
      <path d="M8 14 3 9l5-5" />
      <path d="M12 14 7 9l5-5M7 9h7a6 6 0 0 1 6 6v5" />
    </>
  ),
  transferer: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0-6 6v5" />,
  enveloppe: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  "enveloppe-ouverte": (
    <>
      <path d="M3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9" />
      <path d="m3 10 9-7 9 7-9 6Z" />
    </>
  ),
  drapeau: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  actualiser: (
    <>
      <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />
    </>
  ),
  fermer: <path d="M6 6l12 12M18 6 6 18" />,
  precedent: <path d="m15 18-6-6 6-6" />,
  suivant: <path d="m9 18 6-6-6-6" />,
  trombone: <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />,
  reception: (
    <>
      <path d="M3 13h5l1.5 3h5l1.5-3h5" />
      <path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
    </>
  ),
  envoyes: <path d="M21 3 3 10.5l7 3 3 7.5Zm-11 10.5L21 3" />,
  brouillons: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6M9 15l5-5" />
    </>
  ),
  indesirables: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  dossier: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  discussions: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12Z" />,
  personne: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  groupe: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  recherche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  sortie: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />,
} as const;

export type NomIcone = keyof typeof TRACES;

/** Icônes au trait, comme le cadenas du verrou : la même langue que Windows 11. */
export function Icone({ nom, className = "size-4" }: { nom: NomIcone; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {TRACES[nom]}
    </svg>
  );
}

// ---------------------------------------------------------------- avatar

/**
 * Teintes claires sur encre foncée : lisibles en thème clair comme sombre,
 * puisque la pastille garde son propre fond.
 */
const TEINTES = [
  ["#d8e1ec", "#162e49"],
  ["#fde3c8", "#8a4b0f"],
  ["#dfe8fb", "#2b4c94"],
  ["#e7dcf7", "#5b2f99"],
  ["#d9f0e2", "#1d6b45"],
  ["#fbdde3", "#962943"],
  ["#f6ecc5", "#6f5a0c"],
] as const;

export function initialesDe(nom: string): string {
  return nom
    .replace(/<[^>]*>|["']/g, " ")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
}

/** Pastille aux initiales ; la couleur suit le nom, donc une personne garde la sienne. */
export function Avatar({ nom, groupe = false, className = "size-9 text-xs" }: { nom: string; groupe?: boolean; className?: string }) {
  let h = 0;
  for (const c of nom.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [fond, encre] = TEINTES[h % TEINTES.length];
  return (
    <span aria-hidden style={{ background: fond, color: encre }} className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}>
      {groupe ? <Icone nom="groupe" className="size-1/2" /> : initialesDe(nom) || "?"}
    </span>
  );
}

// ------------------------------------------------------------------ ruban

/** Le ruban : une ligne d'actions qui défile sur un petit écran plutôt que de passer à la ligne. */
export function Ruban({ children }: { children: ReactNode }) {
  return (
    <div role="toolbar" className="flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-1.5 shadow-sm">
      {children}
    </div>
  );
}

export function SeparateurRuban() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-[var(--filet)]" />;
}

/**
 * Une action du ruban. Le libellé disparaît sous 640 px (400 px pour l'action
 * principale, pour que le ruban tienne sur un téléphone) — l'icône reste, et
 * le nom passe dans l'info-bulle et l'étiquette d'accessibilité.
 */
export function ActionRuban({
  icone,
  libelle,
  onClick,
  disabled = false,
  principal = false,
  danger = false,
  actif = false,
}: {
  icone: NomIcone;
  libelle: string;
  onClick: () => void;
  disabled?: boolean;
  principal?: boolean;
  danger?: boolean;
  actif?: boolean;
}) {
  const teinte = principal
    ? "bg-marque-500 text-white hover:bg-marque-600"
    : `${actif ? "bg-[var(--surface-creuse)]" : ""} ${danger ? "text-danger-600" : ""} hover:bg-[var(--surface-creuse)]`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={libelle}
      aria-label={libelle}
      aria-pressed={actif || undefined}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm whitespace-nowrap disabled:opacity-40 disabled:hover:bg-transparent ${teinte}`}
    >
      <Icone nom={icone} />
      <span className={principal ? "max-[400px]:hidden" : "max-sm:hidden"}>{libelle}</span>
    </button>
  );
}

// --------------------------------------------------------------- dossiers

export function EntreeDossier({
  icone,
  libelle,
  compte,
  actif,
  onClick,
}: {
  icone: NomIcone;
  libelle: string;
  compte?: number;
  actif: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif || undefined}
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm ${actif ? "bg-[var(--surface)] font-semibold shadow-sm" : "hover:bg-[var(--surface-creuse)]"}`}
    >
      <Icone nom={icone} className="size-4 shrink-0 text-[var(--encre-douce)]" />
      <span className="flex-1 truncate">{libelle}</span>
      {compte ? <span className="chiffres text-xs font-semibold text-marque-600">{compte}</span> : null}
    </button>
  );
}

// ------------------------------------------------------------------ liste

/**
 * Une ligne de liste : barre de couleur à gauche quand c'est non lu, fond
 * teinté quand c'est la ligne ouverte.
 */
export function LigneListe({ actif, nonLu, onClick, children }: { actif: boolean; nonLu: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif || undefined}
      className={`relative flex w-full items-start gap-3 border-b border-[var(--filet)] px-3 py-2.5 text-left ${actif ? "bg-marque-50" : "hover:bg-[var(--surface-creuse)]"}`}
    >
      {nonLu && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-marque-500" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- lecture

/**
 * Carte de titre au-dessus de la lecture. La croix ne sert que sur téléphone,
 * où la lecture couvre la liste ; les flèches passent au message voisin.
 */
export function TitreLecture({
  titre,
  sousTitre,
  fermer,
  precedent,
  suivant,
  actions,
}: {
  titre: string;
  sousTitre?: ReactNode;
  fermer: () => void;
  precedent: (() => void) | null;
  suivant: (() => void) | null;
  actions?: ReactNode;
}) {
  const fleche = "flex size-9 items-center justify-center rounded-lg hover:bg-[var(--surface-creuse)] disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <header className="flex shrink-0 items-center gap-2 rounded-xl border border-[var(--filet)] bg-[var(--surface)] px-2 py-2 shadow-sm">
      <button type="button" onClick={fermer} aria-label="Fermer" title="Fermer" className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--filet)] hover:bg-[var(--surface-creuse)] md:hidden">
        <Icone nom="fermer" />
      </button>
      <div className="min-w-0 flex-1 px-1">
        <h2 className="truncate text-base font-semibold">{titre}</h2>
        {sousTitre && <div className="truncate text-xs text-[var(--encre-faible)]">{sousTitre}</div>}
      </div>
      {actions}
      <button type="button" onClick={precedent ?? undefined} disabled={!precedent} aria-label="Élément précédent" title="Précédent" className={fleche}>
        <Icone nom="precedent" />
      </button>
      <button type="button" onClick={suivant ?? undefined} disabled={!suivant} aria-label="Élément suivant" title="Suivant" className={fleche}>
        <Icone nom="suivant" />
      </button>
    </header>
  );
}

/** Bouton bordé du pied de lecture : Répondre, Répondre à tous, Transférer. */
export function BoutonPied({ icone, libelle, onClick }: { icone: NomIcone; libelle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm hover:bg-[var(--surface-creuse)]">
      <Icone nom={icone} className="size-4 text-marque-600" />
      {libelle}
    </button>
  );
}

// ------------------------------------------------------- pièces jointes

const GENRES: { motif: RegExp; sigle: string; teinte: string }[] = [
  { motif: /pdf$/i, sigle: "PDF", teinte: "#c0392b" },
  { motif: /(docx?|odt|rtf|word)$/i, sigle: "W", teinte: "#2b5797" },
  { motif: /(xlsx?|ods|csv|sheet|excel)$/i, sigle: "X", teinte: "#1d7044" },
  { motif: /(pptx?|odp|presentation|powerpoint)$/i, sigle: "P", teinte: "#c4501b" },
  { motif: /(png|jpe?g|gif|webp|heic|svg|image)$/i, sigle: "IMG", teinte: "#7c3aed" },
  { motif: /(zip|rar|7z|gz|compressed)$/i, sigle: "ZIP", teinte: "#6b7f87" },
];

/** Vignette de pièce jointe : la nature se lit à la couleur avant le nom. */
export function VignettePiece({ nom, detail, type, onClick, disabled }: { nom: string; detail: string; type?: string; onClick: () => void; disabled?: boolean }) {
  const genre = GENRES.find((g) => g.motif.test(nom) || (type && g.motif.test(type)));
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={nom}
      className="flex w-60 max-w-full items-center gap-2.5 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-2.5 py-2 text-left hover:bg-[var(--surface-creuse)] disabled:opacity-50"
    >
      <span aria-hidden style={{ background: genre?.teinte ?? "#6b7f87" }} className="flex size-8 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white">
        {genre?.sigle ?? <Icone nom="trombone" className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm">{nom}</span>
        <span className="block text-[11px] text-[var(--encre-faible)]">{detail}</span>
      </span>
    </button>
  );
}
