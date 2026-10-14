import type { ReactNode } from "react";

import type { CleIcone } from "@/lib/navigation";

/**
 * Icônes des modules, dessinées pour Maria Suite : formes plates superposées,
 * trois couleurs au plus, sur une grille de 48. Lisibles à 18 px dans la
 * barre latérale comme à 48 px sur l'accueil.
 *
 * Aucun « trou » peint en blanc pour simuler le fond : la barre latérale est
 * sombre, un blanc de remplissage y apparaîtrait comme une tache. Les
 * découpes sont dans les tracés (ticket) ; le blanc ne sert qu'aux détails
 * posés SUR une forme colorée.
 */

const ORANGE = "#F97316";
const JAUNE = "#FBBF24";
const CORAIL = "#FB7185";
const VIOLET = "#8B5CF6";
const PRUNE = "#6D28D9";
const SARCELLE = "#14B8A6";
const CANARD = "#0F766E";
const BLEU = "#3B82F6";
const BLANC = "#FFFFFF";

/** Dents d'engrenage : huit rectangles tournés autour du centre. */
const dents = Array.from({ length: 8 }, (_, i) => (
  <rect key={i} x="20.5" y="3" width="7" height="9" rx="2" fill={PRUNE} transform={`rotate(${i * 45} 24 24)`} />
));

const DESSINS: Record<CleIcone, ReactNode> = {
  accueil: (
    <>
      <rect x="6" y="6" width="16" height="16" rx="5" fill={VIOLET} />
      <circle cx="34" cy="14" r="8" fill={CORAIL} />
      <rect x="6" y="26" width="16" height="16" rx="5" fill={SARCELLE} />
      <rect x="26" y="26" width="16" height="16" rx="5" fill={JAUNE} />
    </>
  ),
  "tableau-de-bord": (
    <>
      <rect x="7" y="24" width="9" height="17" rx="2.5" fill={SARCELLE} />
      <rect x="19.5" y="14" width="9" height="27" rx="2.5" fill={CORAIL} />
      <rect x="32" y="6" width="9" height="35" rx="2.5" fill={JAUNE} />
    </>
  ),
  caisse: (
    <>
      <rect x="9" y="22" width="30" height="20" rx="3" fill={SARCELLE} />
      <rect x="20" y="29" width="8" height="13" rx="1.5" fill={CANARD} />
      <rect x="5" y="6" width="38" height="6" rx="3" fill={PRUNE} />
      <path d="M5 12h9.5v8a4.75 4.75 0 0 1-9.5 0Z" fill={CORAIL} />
      <path d="M14.5 12H24v8a4.75 4.75 0 0 1-9.5 0Z" fill={JAUNE} />
      <path d="M24 12h9.5v8a4.75 4.75 0 0 1-9.5 0Z" fill={CORAIL} />
      <path d="M33.5 12H43v8a4.75 4.75 0 0 1-9.5 0Z" fill={JAUNE} />
    </>
  ),
  commercial: (
    <>
      <circle cx="35" cy="35" r="9" fill={CORAIL} />
      <path d="M6.5 21.5 21.5 6.5a3 3 0 0 1 2.1-.9H38a3 3 0 0 1 3 3v14.4a3 3 0 0 1-.9 2.1L25.1 40.1a3 3 0 0 1-4.2 0L6.5 25.7a3 3 0 0 1 0-4.2Z" fill={SARCELLE} />
      <circle cx="32" cy="14.5" r="3.5" fill={BLANC} />
    </>
  ),
  stock: (
    <>
      <rect x="14" y="5" width="20" height="17" rx="2.5" fill={VIOLET} />
      <rect x="5" y="23" width="19" height="19" rx="2.5" fill={ORANGE} />
      <rect x="24" y="23" width="19" height="19" rx="2.5" fill={JAUNE} />
      <rect x="21" y="5" width="6" height="6" rx="1" fill={BLANC} opacity=".6" />
      <rect x="11.5" y="23" width="6" height="6" rx="1" fill={BLANC} opacity=".6" />
      <rect x="30.5" y="23" width="6" height="6" rx="1" fill={BLANC} opacity=".6" />
    </>
  ),
  achats: (
    <>
      <path d="M16 19 22 7M32 19 26 7" stroke={CANARD} strokeWidth="4" strokeLinecap="round" />
      <path d="M5 19h38l-4.3 19.6a3 3 0 0 1-2.9 2.4H12.2a3 3 0 0 1-2.9-2.4Z" fill={CORAIL} />
      <path d="M17 26v8M24 26v8M31 26v8" stroke={BLANC} strokeWidth="3" strokeLinecap="round" opacity=".8" />
    </>
  ),
  prestataires: (
    <>
      <path d="M8 32a16 16 0 0 1 32 0Z" fill={JAUNE} />
      <rect x="20.5" y="12" width="7" height="20" rx="3.5" fill={ORANGE} />
      <rect x="4" y="31" width="40" height="7" rx="3.5" fill={ORANGE} />
    </>
  ),
  marches: (
    <>
      <rect x="8" y="4" width="26" height="34" rx="3.5" fill={BLEU} />
      <path d="M14 13h14M14 19h14M14 25h8" stroke={BLANC} strokeWidth="3" strokeLinecap="round" />
      <path d="m30 38-3 8 7-3 7 3-3-8Z" fill={PRUNE} />
      <circle cx="34" cy="33" r="9" fill={CORAIL} />
      <circle cx="34" cy="33" r="4" fill={BLANC} opacity=".7" />
    </>
  ),
  reservations: (
    <>
      <rect x="5" y="9" width="38" height="34" rx="5" fill={CORAIL} />
      <path d="M5 14a5 5 0 0 1 5-5h28a5 5 0 0 1 5 5v5H5Z" fill={PRUNE} />
      <rect x="13" y="4" width="5" height="10" rx="2.5" fill={JAUNE} />
      <rect x="30" y="4" width="5" height="10" rx="2.5" fill={JAUNE} />
      <path d="m16 30 6 6 11-11" stroke={BLANC} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  projets: (
    <>
      <rect x="5" y="7" width="24" height="9" rx="4.5" fill={SARCELLE} />
      <rect x="15" y="20" width="28" height="9" rx="4.5" fill={CORAIL} />
      <rect x="9" y="33" width="20" height="9" rx="4.5" fill={JAUNE} />
    </>
  ),
  missions: (
    <>
      <ellipse cx="24" cy="42" rx="13" ry="3.5" fill={SARCELLE} opacity=".55" />
      <path d="M24 3a14 14 0 0 1 14 14c0 10-14 25-14 25S10 27 10 17A14 14 0 0 1 24 3Z" fill={CORAIL} />
      <circle cx="24" cy="17" r="5.5" fill={BLANC} />
    </>
  ),
  actifs: (
    <>
      {dents}
      <circle cx="24" cy="24" r="14" fill={VIOLET} />
      <circle cx="24" cy="24" r="6.5" fill={JAUNE} />
    </>
  ),
  "parc-auto": (
    <>
      <path d="M5 31v-6l5.2-10.4A3 3 0 0 1 12.9 13h22.2a3 3 0 0 1 2.7 1.6L43 25v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" fill={BLEU} />
      <path d="M13 23.5 16 17h16l3 6.5Z" fill={BLANC} opacity=".75" />
      <rect x="37" y="26" width="5" height="3.5" rx="1.75" fill={JAUNE} />
      <circle cx="14" cy="34" r="5.5" fill={PRUNE} />
      <circle cx="34" cy="34" r="5.5" fill={PRUNE} />
    </>
  ),
  "parc-informatique": (
    <>
      <rect x="8" y="8" width="32" height="23" rx="3" fill={SARCELLE} />
      <rect x="12" y="12" width="24" height="15" rx="1.5" fill={BLANC} opacity=".55" />
      <path d="M3 34h42l-3.4 5.1a2 2 0 0 1-1.7.9H8.1a2 2 0 0 1-1.7-.9Z" fill={CORAIL} />
    </>
  ),
  billetterie: (
    <g transform="rotate(-12 24 24)">
      <path d="M4 15a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3v5a4 4 0 0 0 0 8v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a4 4 0 0 0 0-8Z" fill={JAUNE} />
      <path d="M32 12h9a3 3 0 0 1 3 3v5a4 4 0 0 0 0 8v5a3 3 0 0 1-3 3h-9Z" fill={ORANGE} />
      <path d="M32 15v18" stroke={BLANC} strokeWidth="2" strokeDasharray="3 3" />
      <path d="M11 20h14M11 27h9" stroke={PRUNE} strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  comptabilite: (
    <>
      <rect x="9" y="3" width="30" height="42" rx="5" fill={PRUNE} />
      <rect x="13" y="7" width="22" height="9" rx="2" fill={SARCELLE} />
      {[0, 1, 2].map((l) =>
        [0, 1, 2].map((c) => (
          <rect key={`${l}${c}`} x={13 + c * 8} y={20 + l * 8} width="6" height="6" rx="1.5" fill={l === 2 && c === 2 ? CORAIL : JAUNE} opacity={l === 2 && c === 2 ? 1 : 0.9} />
        )),
      )}
    </>
  ),
  tresorerie: (
    <>
      <rect x="9" y="5" width="26" height="14" rx="2.5" fill={JAUNE} transform="rotate(-8 22 12)" />
      <rect x="4" y="14" width="38" height="28" rx="5" fill={SARCELLE} />
      <rect x="29" y="23" width="15" height="10" rx="4" fill={ORANGE} />
      <circle cx="35" cy="28" r="2.3" fill={BLANC} />
    </>
  ),
  guichet: (
    <>
      <rect x="10" y="3" width="22" height="42" rx="5" fill={BLEU} />
      <rect x="13.5" y="8" width="15" height="27" rx="2" fill={BLANC} opacity=".55" />
      <rect x="17.5" y="38.5" width="7" height="3" rx="1.5" fill={BLANC} opacity=".8" />
      <circle cx="35" cy="31" r="10" fill={JAUNE} />
      <circle cx="35" cy="31" r="5" fill={ORANGE} />
    </>
  ),
  personnel: (
    <>
      <circle cx="32" cy="13" r="6.5" fill={VIOLET} />
      <path d="M21 36a11 11 0 0 1 22 0v2H21Z" fill={VIOLET} />
      <circle cx="18" cy="17" r="7.5" fill={CORAIL} />
      <path d="M4 42a14 14 0 0 1 28 0Z" fill={CORAIL} />
    </>
  ),
  presences: (
    <>
      <circle cx="20" cy="24" r="17" fill={BLEU} />
      <path d="M20 13v11l7 4" stroke={BLANC} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="35" cy="35" r="10" fill={SARCELLE} />
      <path d="m30.5 35 3 3 6-6" stroke={BLANC} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  planning: (
    <>
      <rect x="4" y="8" width="34" height="32" rx="5" fill={VIOLET} />
      <rect x="4" y="8" width="34" height="9" rx="4" fill={PRUNE} />
      <rect x="11" y="4" width="4" height="8" rx="2" fill={JAUNE} />
      <rect x="27" y="4" width="4" height="8" rx="2" fill={JAUNE} />
      <rect x="10" y="22" width="14" height="4" rx="2" fill={BLANC} opacity=".85" />
      <rect x="10" y="30" width="9" height="4" rx="2" fill={BLANC} opacity=".6" />
      <circle cx="36" cy="36" r="9" fill={SARCELLE} />
      <circle cx="36" cy="36" r="3.5" fill={BLANC} />
    </>
  ),
  taches: (
    <>
      <rect x="8" y="6" width="32" height="38" rx="5" fill={SARCELLE} />
      <rect x="17" y="2.5" width="14" height="7" rx="3" fill={JAUNE} />
      {[17, 26, 35].map((y, i) => (
        <g key={y}>
          <circle cx="15.5" cy={y} r="3" fill={i < 2 ? CORAIL : BLANC} opacity={i < 2 ? 1 : 0.6} />
          <rect x="21" y={y - 1.5} width="13" height="3" rx="1.5" fill={BLANC} opacity=".85" />
        </g>
      ))}
    </>
  ),
  meeting: (
    <>
      <rect x="3" y="11" width="30" height="26" rx="6" fill={BLEU} />
      <path d="M33 21.5 44 15v18l-11-6.5Z" fill={VIOLET} />
      <circle cx="13" cy="21" r="3.5" fill={BLANC} />
      <path d="M7 31a6 6 0 0 1 12 0Z" fill={BLANC} opacity=".85" />
      <circle cx="23.5" cy="21" r="3.5" fill={JAUNE} />
      <path d="M17.5 31a6 6 0 0 1 12 0Z" fill={JAUNE} opacity=".9" />
    </>
  ),
  messagerie: (
    <>
      <path d="M17 12h22a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5h-2v6l-7-6H17a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5Z" fill={SARCELLE} />
      <path d="M9 4h20a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5H17l-7 6v-6H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z" fill={ORANGE} />
      <circle cx="12" cy="14.5" r="2" fill={BLANC} />
      <circle cx="19" cy="14.5" r="2" fill={BLANC} />
      <circle cx="26" cy="14.5" r="2" fill={BLANC} />
    </>
  ),
  "boite-mail": (
    <>
      <rect x="4" y="12" width="40" height="28" rx="5" fill={CORAIL} />
      <path d="m7 16 17 13 17-13" stroke={BLANC} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="40" cy="11" r="7" fill={BLEU} />
    </>
  ),
  documents: (
    <>
      <rect x="12" y="5" width="26" height="34" rx="3.5" fill={VIOLET} transform="rotate(10 25 22)" />
      <path d="M8 9a3 3 0 0 1 3-3h15l9 9v25a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3Z" fill={BLEU} />
      <path d="M26 6v6a3 3 0 0 0 3 3h6Z" fill={BLANC} opacity=".6" />
      <path d="M14 24h14M14 30h14M14 36h8" stroke={BLANC} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  archives: (
    <>
      <rect x="9" y="17" width="30" height="25" rx="3" fill={JAUNE} />
      <rect x="5" y="7" width="38" height="11" rx="3" fill={ORANGE} />
      <rect x="18" y="24" width="12" height="5" rx="2.5" fill={ORANGE} />
    </>
  ),
  utilisateurs: (
    <>
      <path d="M24 3 41 9.5V22c0 10.5-7.3 18-17 22C14.3 40 7 32.5 7 22V9.5Z" fill={SARCELLE} />
      <circle cx="24" cy="18" r="5.5" fill={BLANC} />
      <path d="M14.5 33a9.5 9.5 0 0 1 19 0Z" fill={BLANC} />
      <circle cx="37" cy="36" r="7" fill={JAUNE} />
    </>
  ),
  entreprise: (
    <>
      <rect x="7" y="5" width="21" height="38" rx="3" fill={BLEU} />
      <rect x="25" y="17" width="16" height="26" rx="3" fill={SARCELLE} />
      {[11, 18, 25, 32].map((y) => (
        <g key={y}>
          <rect x="11.5" y={y} width="4.5" height="4" rx="1" fill={BLANC} opacity=".8" />
          <rect x="19" y={y} width="4.5" height="4" rx="1" fill={BLANC} opacity=".8" />
        </g>
      ))}
      <rect x="30" y="23" width="6" height="4" rx="1" fill={BLANC} opacity=".8" />
      <rect x="30" y="30" width="6" height="4" rx="1" fill={BLANC} opacity=".8" />
    </>
  ),
  demarrage: (
    <>
      <rect x="5" y="27" width="38" height="16" rx="5" fill={VIOLET} />
      <path d="M24 3 37 16h-7.5v14h-11V16H11Z" fill={ORANGE} />
    </>
  ),
  communication: (
    <>
      <path d="M38 14a12 12 0 0 1 0 18M42.5 9.5a18 18 0 0 1 0 27" stroke={JAUNE} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M11 17 33 7v32L11 29Z" fill={CORAIL} />
      <rect x="4" y="16" width="10" height="14" rx="3" fill={PRUNE} />
      <rect x="11" y="27" width="7" height="14" rx="3" fill={PRUNE} />
    </>
  ),
  rapports: (
    <>
      <rect x="5" y="5" width="38" height="38" rx="8" fill={BLEU} />
      <rect x="12" y="24" width="6" height="12" rx="2" fill={BLANC} />
      <rect x="21" y="15" width="6" height="21" rx="2" fill={JAUNE} />
      <rect x="30" y="20" width="6" height="16" rx="2" fill={BLANC} />
    </>
  ),
  boutique: (
    <>
      <path d="M8 17h32l-2.5 23a3 3 0 0 1-3 2.7h-21a3 3 0 0 1-3-2.7Z" fill={ORANGE} />
      <path d="M17 20v-6a7 7 0 0 1 14 0v6" stroke={PRUNE} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <rect x="15" y="27" width="18" height="4" rx="2" fill={BLANC} opacity=".8" />
    </>
  ),
  restaurant: (
    <>
      <rect x="4" y="36" width="40" height="5" rx="2.5" fill={PRUNE} />
      <path d="M7 34a17 17 0 0 1 34 0Z" fill={SARCELLE} />
      <circle cx="24" cy="13" r="3.5" fill={JAUNE} />
      <path d="M15 27a10 10 0 0 1 7-8" stroke={BLANC} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity=".75" />
    </>
  ),
  maquis: (
    <>
      <rect x="4" y="26" width="26" height="6" rx="3" fill={PRUNE} />
      <path d="M8 32h18l-3 10H11Z" fill={CORAIL} />
      <path d="M10 22c0-4 4-4 4-8M17 22c0-4 4-4 4-8M24 22c0-4 4-4 4-8" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M36 4h4v7l3 5v26a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V16l3-5Z" fill={JAUNE} />
      <rect x="33" y="24" width="10" height="8" fill={BLANC} opacity=".75" />
    </>
  ),
  hotel: (
    <>
      <rect x="4" y="10" width="5" height="32" rx="2.5" fill={PRUNE} />
      <rect x="39" y="22" width="5" height="20" rx="2.5" fill={PRUNE} />
      <rect x="6" y="28" width="36" height="8" rx="2" fill={SARCELLE} />
      <rect x="10" y="20" width="10" height="7" rx="3.5" fill={BLANC} opacity=".85" />
      <path d="M21 27v-4a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4v4Z" fill={ORANGE} />
      <circle cx="35" cy="9" r="3" fill={JAUNE} />
    </>
  ),
  securite: (
    <>
      <rect x="4" y="13" width="30" height="20" rx="5" fill={CANARD} />
      <path d="M34 19.5 44 14v18l-10-5.5Z" fill={SARCELLE} />
      <circle cx="16" cy="23" r="6" fill={BLANC} opacity=".85" />
      <circle cx="16" cy="23" r="3" fill={PRUNE} />
      <circle cx="28.5" cy="17.5" r="2" fill={CORAIL} />
      <rect x="15" y="33" width="4" height="9" rx="1.5" fill={PRUNE} />
    </>
  ),
  enquetes: (
    <>
      <rect x="7" y="5" width="28" height="38" rx="4" fill={SARCELLE} />
      <rect x="12" y="12" width="5" height="5" rx="1.5" fill={BLANC} opacity=".85" />
      <rect x="20" y="13" width="10" height="3" rx="1.5" fill={BLANC} opacity=".85" />
      <rect x="12" y="22" width="5" height="5" rx="1.5" fill={BLANC} opacity=".85" />
      <rect x="20" y="23" width="10" height="3" rx="1.5" fill={BLANC} opacity=".85" />
      <path d="m36 22 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" fill={JAUNE} />
    </>
  ),
  journal: (
    <>
      <circle cx="25" cy="25" r="19" fill={SARCELLE} />
      <path d="M25 13v12l8 5" stroke={BLANC} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3 9v10h10Z" fill={ORANGE} />
    </>
  ),
};

export function IconeModule({ cle, className }: { cle: CleIcone; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false" className={className}>
      {DESSINS[cle]}
    </svg>
  );
}
