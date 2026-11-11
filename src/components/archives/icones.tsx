import type { Famille } from "@/modules/archives/calcul";

/**
 * Icônes des Archives : une chemise de couleur pour chaque dossier, une
 * feuille marquée de son format pour chaque fichier. Dessinées en SVG, sans
 * image à charger : elles s'affichent hors ligne et suivent le thème.
 */

/** Teintes de chemise : l'or de MARIA GROUP d'abord, puis des couleurs de bureau. */
const CHEMISES = [
  { face: "#d9b46a", dos: "#b08e4f" },
  { face: "#3f6fa3", dos: "#2a4f7a" },
  { face: "#2fa36e", dos: "#1f7a51" },
  { face: "#d6604d", dos: "#a8432f" },
  { face: "#7b5fc4", dos: "#5a429b" },
  { face: "#2aa3a0", dos: "#1c7976" },
  { face: "#e2902f", dos: "#b06a19" },
] as const;

/** Toujours la même couleur pour le même dossier, d'un écran à l'autre. */
export function teinteDossier(id: string): (typeof CHEMISES)[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CHEMISES[h % CHEMISES.length];
}

export function IconeDossier({
  id,
  masque = false,
  vide = false,
  className = "size-14",
}: {
  id: string;
  /** Dossier ouvert à personne, hors administrateurs : un cadenas sur la chemise. */
  masque?: boolean;
  /** Sans archive : pas de feuilles qui dépassent. */
  vide?: boolean;
  className?: string;
}) {
  const t = teinteDossier(id);
  return (
    <svg viewBox="0 0 64 52" aria-hidden className={className}>
      <path d="M4 8a4 4 0 0 1 4-4h14.5l5 5H56a4 4 0 0 1 4 4v31a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" fill={t.dos} />
      {!vide && (
        <>
          <rect x="10" y="10" width="44" height="24" rx="1.5" fill="#f3efe6" transform="rotate(-3 32 22)" />
          <rect x="9" y="12" width="46" height="24" rx="1.5" fill="#ffffff" />
          <path d="M14 18h22M14 22h30M14 26h18" stroke="#c9ced6" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      <path d="M4 20a3 3 0 0 1 3-3h50a3 3 0 0 1 3 3v24a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" fill={t.face} />
      <path d="M7 17h50a3 3 0 0 1 3 3v2H4v-2a3 3 0 0 1 3-3Z" fill="#ffffff" opacity="0.22" />
      {masque && (
        <g>
          <circle cx="32" cy="33" r="8.5" fill="#ffffff" opacity="0.92" />
          <path d="M29 32v-2.2a3 3 0 0 1 6 0V32" fill="none" stroke={t.dos} strokeWidth="1.8" />
          <rect x="27.5" y="31.5" width="9" height="6.5" rx="1.3" fill={t.dos} />
        </g>
      )}
    </svg>
  );
}

export const TEINTE_FICHIER: Record<Famille, string> = {
  pdf: "#d0412f",
  image: "#2f86c4",
  texte: "#2b5797",
  tableur: "#1f8a5c",
  presentation: "#d0632a",
  donnees: "#6b7785",
  compresse: "#8a6d3b",
  audio: "#9b4fb5",
  video: "#c2367a",
  autre: "#6b7785",
};

/** Le dessin au centre de la feuille, selon la famille. */
function Motif({ famille, couleur }: { famille: Famille; couleur: string }) {
  switch (famille) {
    case "image":
      return (
        <g>
          <circle cx="17" cy="22" r="3.2" fill={couleur} opacity="0.55" />
          <path d="M9 35l9-9 6 6 4-4 9 7Z" fill={couleur} opacity="0.75" />
        </g>
      );
    case "tableur":
      return (
        <g stroke={couleur} strokeWidth="1.5" fill="none" opacity="0.8">
          <rect x="10" y="17" width="26" height="18" rx="1" />
          <path d="M10 23h26M10 29h26M19 17v18M28 17v18" />
        </g>
      );
    case "presentation":
      return (
        <g fill={couleur} opacity="0.8">
          <rect x="11" y="27" width="5" height="8" rx="1" />
          <rect x="19" y="21" width="5" height="14" rx="1" />
          <rect x="27" y="17" width="5" height="18" rx="1" />
        </g>
      );
    case "audio":
      return <path d="M9 26h3l2-6 3 12 3-16 3 18 3-12 2 4h8" stroke={couleur} strokeWidth="1.8" fill="none" strokeLinejoin="round" opacity="0.85" />;
    case "video":
      return (
        <g>
          <circle cx="23" cy="26" r="9" fill={couleur} opacity="0.18" />
          <path d="M20 21v10l8.5-5Z" fill={couleur} opacity="0.85" />
        </g>
      );
    case "compresse":
      return <path d="M23 12v4h-3v4h3v4h-3v4h3v4" stroke={couleur} strokeWidth="2" fill="none" opacity="0.8" />;
    case "donnees":
      return (
        <text x="23" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill={couleur} opacity="0.8" fontFamily="ui-monospace, monospace">
          {"{ }"}
        </text>
      );
    default:
      return (
        <path d="M11 18h24M11 22.5h24M11 27h24M11 31.5h15" stroke={couleur} strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      );
  }
}

export function IconeFichier({ famille, extension, className = "size-12" }: { famille: Famille; extension: string; className?: string }) {
  const couleur = TEINTE_FICHIER[famille];
  const etiquette = (extension || "—").slice(0, 4);
  return (
    <svg viewBox="0 0 46 58" aria-hidden className={className}>
      <path d="M5 3h25l11 11v38a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" fill="#ffffff" stroke="#d5dae1" strokeWidth="1.2" />
      <path d="M30 3v8a3 3 0 0 0 3 3h8Z" fill="#e6eaf0" />
      <Motif famille={famille} couleur={couleur} />
      <rect x="1" y="39" width="34" height="13" rx="2.5" fill={couleur} />
      <text
        x="18"
        y="48.6"
        textAnchor="middle"
        fontSize={etiquette.length > 3 ? 7.5 : 8.5}
        fontWeight="800"
        fill="#ffffff"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.3"
      >
        {etiquette}
      </text>
    </svg>
  );
}
