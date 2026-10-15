import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Indicateur de tête. Une valeur, son libellé, une précision facultative.
 *
 * Carte pleine en dégradé, reprise de Ferme360 : le ton se lit avant le
 * chiffre — bleu nuit pour un compte, vert pour ce qui va bien, or pour ce qui
 * demande de l'attention, rouge pour ce qui presse. Les couleurs sont fixes
 * dans les deux thèmes (`.carte-degrade`, `globals.css`) : le texte blanc y
 * garde son contraste.
 *
 * Avec `href`, la carte devient cliquable et prend un survol, sans changer
 * d'allure. C'est ce qui permet à une alerte du tableau de bord de mener vers
 * son module tout en se rangeant dans la même grille qu'un indicateur : deux
 * cartes côte à côte qui ne se ressemblent qu'à moitié se lisent comme deux
 * écrans juxtaposés.
 */
export function CarteIndicateur({
  libelle,
  valeur,
  unite,
  precision,
  ton = "neutre",
  href,
}: {
  libelle: string;
  valeur: string;
  unite?: string;
  precision?: ReactNode;
  ton?: "neutre" | "marque" | "alerte" | "danger" | "valide";
  href?: string;
}) {
  const contenu = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-90">{libelle}</p>
      <p className="chiffres mt-1 text-xl font-bold sm:text-2xl">
        {valeur}
        {unite && <span className="ml-1 text-sm font-semibold opacity-85">{unite}</span>}
      </p>
      {precision && <div className="mt-0.5 text-xs text-[var(--encre-douce)]">{precision}</div>}
    </>
  );

  // `min-w-0` : dans une grille à deux colonnes sur téléphone, un montant long
  // ne doit pas pousser sa voisine hors de l'écran.
  const habillage = `carte-degrade carte-${ton} min-w-0 rounded-2xl p-3 shadow-sm sm:p-4`;

  // `h-full` sur le lien : dans une grille, une carte au texte plus court
  // laisserait sinon un vide sous elle et casserait l'alignement de la rangée.
  return href ? (
    <Link href={href} className={`${habillage} block h-full transition hover:-translate-y-px hover:shadow-md hover:brightness-110`}>
      {contenu}
    </Link>
  ) : (
    <div className={habillage}>{contenu}</div>
  );
}

export type TonPastille = "neutre" | "marque" | "valide" | "alerte" | "danger";

export function Pastille({
  ton = "neutre",
  children,
}: {
  ton?: TonPastille;
  children: ReactNode;
}) {
  // Chaque ton se définit par un couple fond/texte pris dans la même famille,
  // pour rester lisible sous les deux thèmes.
  const tons = {
    neutre: "bg-[var(--surface-creuse)] text-[var(--encre-douce)]",
    marque: "bg-marque-600 text-white",
    valide: "bg-valide-50 text-valide-600",
    alerte: "bg-alerte-50 text-alerte-600",
    danger: "bg-danger-50 text-danger-600",
  } as const;

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tons[ton]}`}
    >
      {children}
    </span>
  );
}

/** En-tête de page : titre, sous-titre, actions alignées à droite. */
export function EnTetePage({
  titre,
  sousTitre,
  actions,
}: {
  titre: string;
  sousTitre?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{titre}</h1>
        {sousTitre && (
          <p className="mt-0.5 text-sm text-[var(--encre-douce)]">{sousTitre}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Conteneur de tableau. Le défilement horizontal reste interne : la page ne
 * doit jamais défiler latéralement, même sur un écran de 1024 px.
 */
export function Tableau({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  aligne = "gauche",
}: {
  children: ReactNode;
  aligne?: "gauche" | "droite";
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-[var(--filet)] bg-[var(--surface-creuse)] px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--encre-faible)] ${
        aligne === "droite" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  aligne = "gauche",
  chiffres = false,
  fort = false,
}: {
  children: ReactNode;
  aligne?: "gauche" | "droite";
  chiffres?: boolean;
  fort?: boolean;
}) {
  return (
    <td
      className={`border-b border-[var(--filet)] px-3.5 py-2.5 ${
        aligne === "droite" ? "text-right" : "text-left"
      } ${chiffres ? "chiffres whitespace-nowrap" : ""} ${fort ? "font-semibold" : ""}`}
    >
      {/* Un montant, un numéro ou une date ne se coupent jamais : « 1 770 »
          sur une ligne et « 000 » sur la suivante se lit 1 770. */}
      {children}
    </td>
  );
}

export function BoutonSecondaire({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]"
    >
      {children}
    </button>
  );
}

export function BoutonPrincipal({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
    >
      {children}
    </button>
  );
}

/**
 * Écran vide.
 *
 * Un tableau sans lignes n'est pas une erreur, c'est le premier jour d'un
 * exploitant. Il doit dire quoi faire, pas afficher un cadre gris : sur les
 * écrans de démonstration du concurrent, une liste vide ne propose rien et
 * laisse croire que le module ne fonctionne pas.
 */
export function EtatVide({
  titre,
  message,
  actions,
}: {
  titre: string;
  message: string;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] px-6 py-12 text-center shadow-sm">
      <p className="text-base font-semibold">{titre}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--encre-douce)]">
        {message}
      </p>
      {actions && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Champ de formulaire : libellé, contrôle, et précision facultative. */
export function Champ({
  libelle,
  precision,
  children,
}: {
  libelle: string;
  precision?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{libelle}</span>
      {children}
      {precision && (
        <span className="mt-1 block text-xs text-[var(--encre-faible)]">
          {precision}
        </span>
      )}
    </label>
  );
}

/** Classe commune aux entrées de formulaire, pour ne pas la recopier partout. */
export const CLASSE_CHAMP =
  "h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3.5 text-sm outline-none focus:border-marque-500";

/** Même habillage, sans prendre toute la largeur : un filtre posé à côté d'une recherche. */
export const CLASSE_CHAMP_COMPACT =
  "h-cible rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-sm outline-none focus:border-marque-500";
