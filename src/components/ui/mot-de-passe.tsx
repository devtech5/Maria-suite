"use client";

import { useState, type ComponentProps } from "react";

/**
 * Champ de mot de passe, masqué en étoiles, avec un bouton pour le lire.
 *
 * Le champ reste un vrai `type="password"` tant qu'on ne demande pas à voir :
 * le gestionnaire de mots de passe le reconnaît, le clavier du téléphone ne
 * mémorise pas la frappe. Les étoiles viennent de la police « Maria Masque »
 * (voir `globals.css`).
 *
 * Afficher sert à vérifier une saisie sur un clavier tactile, où une faute de
 * frappe passe inaperçue — mais un écran de caisse se lit par-dessus l'épaule.
 * Le texte se remasque donc dès que le champ perd le focus.
 */
export function ChampMotDePasse({ className = "", onBlur, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onBlur={(e) => {
          // Le clic sur le bouton fait perdre le focus au champ : ne pas
          // remasquer dans ce cas, sinon le bouton ne servirait à rien.
          if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.dataset.basculeMotDePasse)) setVisible(false);
          onBlur?.(e);
        }}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        data-bascule-mot-de-passe="1"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        title={visible ? "Masquer" : "Afficher"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-[var(--encre-douce)] hover:text-[var(--encre)] focus-visible:outline-2 focus-visible:outline-marque-500"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a12.6 12.6 0 0 1-3.1 4.3M6.3 6.3C4 7.8 2.6 10 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1.1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
            <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
