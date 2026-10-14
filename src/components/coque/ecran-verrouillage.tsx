"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { IconeCadenas } from "@/components/ui/icone-cadenas";
import { deverrouiller, type EtatDeverrouillage } from "@/lib/auth/actions-verrou";

/**
 * Police système de Windows 11 quand elle est là, celle de l'interface sinon.
 * L'horloge en Segoe UI Variable est ce qui fait reconnaître l'écran au
 * premier coup d'œil.
 */
const POLICE_SYSTEME = {
  fontFamily: '"Segoe UI Variable Display", "Segoe UI", var(--font-sans)',
};

/** Sans geste pendant ce délai, la saisie se referme sur l'horloge, comme sous Windows. */
const RETOUR_HORLOGE_MS = 30_000;

/** Touches qui, seules, ne doivent pas réveiller l'écran. */
const TOUCHES_INERTES = new Set(["Shift", "Control", "Alt", "Meta", "Tab", "CapsLock"]);

/**
 * Écran de verrouillage, calqué sur celui de Windows 11.
 *
 * Deux temps, comme l'original : au repos, l'horloge et la date sur le fond ;
 * au premier geste, le fond se floute et laisse place à la personne et à son
 * mot de passe. Un caissier qui a déjà verrouillé son poste Windows sait
 * d'instinct quoi faire, sans qu'on le lui explique.
 *
 * Le champ existe dès le repos, simplement invisible : une touche frappée sur
 * l'horloge le prend pour cible et la première lettre du mot de passe n'est
 * pas perdue.
 *
 * Le fond est opaque : la page restée montée dessous — panier, formulaire à
 * moitié saisi — ne se devine pas au travers.
 */
export function EcranVerrouillage({
  nom,
  email,
  entreprise,
  onDeverrouille,
}: {
  nom: string;
  email: string | null;
  entreprise: string | null;
  onDeverrouille: () => void;
}) {
  const [saisie, setSaisie] = useState(false);
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  const [enLigne, setEnLigne] = useState(true);
  const [etat, action, enCours] = useActionState<EtatDeverrouillage, FormData>(deverrouiller, {});
  const champ = useRef<HTMLInputElement>(null);

  function ouvrirSaisie() {
    setSaisie(true);
    champ.current?.focus();
  }

  function revenirHorloge() {
    setSaisie(false);
    if (champ.current) {
      champ.current.value = "";
      champ.current.blur();
    }
  }

  // L'horloge ne se rend qu'après montage : le serveur et le client
  // divergeraient d'une seconde et React signalerait une hydratation cassée.
  useEffect(() => {
    const tic = () => setMaintenant(new Date());
    tic();
    const minuteur = setInterval(tic, 1000);
    return () => clearInterval(minuteur);
  }, []);

  // Le déverrouillage passe par le serveur : hors ligne, il faut le dire
  // plutôt que laisser croire à un mot de passe refusé.
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);

  useEffect(() => {
    function auClavier(evenement: KeyboardEvent) {
      if (saisie) {
        if (evenement.key === "Escape") revenirHorloge();
        return;
      }
      if (TOUCHES_INERTES.has(evenement.key) || evenement.ctrlKey || evenement.metaKey || evenement.altKey) {
        return;
      }
      // Entrée, Espace ou Échap réveillent l'écran sans rien écrire ni envoyer.
      if (evenement.key === "Enter" || evenement.key === " " || evenement.key === "Escape") {
        evenement.preventDefault();
      }
      ouvrirSaisie();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [saisie]);

  // Saisie abandonnée : retour à l'horloge, le mot de passe à moitié tapé
  // n'attend pas le suivant.
  useEffect(() => {
    if (!saisie || enCours) return;
    let minuteur = setTimeout(revenirHorloge, RETOUR_HORLOGE_MS);
    const relancer = () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(revenirHorloge, RETOUR_HORLOGE_MS);
    };
    document.addEventListener("keydown", relancer);
    document.addEventListener("pointerdown", relancer);
    return () => {
      clearTimeout(minuteur);
      document.removeEventListener("keydown", relancer);
      document.removeEventListener("pointerdown", relancer);
    };
  }, [saisie, enCours]);

  // Accepté : le voile se lève. Refusé : le champ vidé reprend la main pour
  // l'essai suivant.
  useEffect(() => {
    if (etat.ok) onDeverrouille();
    else if (etat.erreur) champ.current?.focus();
  }, [etat, onDeverrouille]);

  const initiales = nom
    .split(" ")
    .map((mot) => mot.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const heure = maintenant?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const date = maintenant?.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-verrou"
      className="fixed inset-0 z-[1000] overflow-hidden bg-[#061630] text-white select-none"
      style={POLICE_SYSTEME}
    >
      <FondBloom />

      {/* Le voile acrylique : le fond se floute dès qu'on veut entrer. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-[#061630]/35 backdrop-blur-2xl motion-safe:transition-opacity motion-safe:duration-500 ${
          saisie ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* ------------------------------------------------------ repos */}
      <div
        className={`absolute inset-x-0 top-[12vh] flex flex-col items-center motion-safe:transition-all motion-safe:duration-500 ${
          saisie ? "-translate-y-10 opacity-0" : "opacity-100"
        }`}
        aria-hidden={saisie}
      >
        <p className="chiffres text-[clamp(5rem,14vw,8.5rem)] leading-none font-semibold tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          {heure ?? " "}
        </p>
        <p className="mt-3 text-[clamp(1.25rem,2.4vw,1.75rem)] font-medium first-letter:uppercase drop-shadow-[0_1px_8px_rgba(0,0,0,0.3)]">
          {date ?? " "}
        </p>
      </div>

      {!saisie && (
        <button
          type="button"
          onClick={ouvrirSaisie}
          className="absolute inset-0 cursor-default"
          aria-label="Déverrouiller la session"
        >
          <span className="absolute inset-x-0 bottom-10 flex items-center justify-center gap-2 text-sm text-white/75">
            <IconeCadenas className="size-4" />
            Appuyez sur une touche ou touchez l&apos;écran pour déverrouiller
          </span>
        </button>
      )}

      {/* ----------------------------------------------------- saisie */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center px-4 motion-safe:transition-all motion-safe:duration-500 ${
          saisie ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        }`}
        aria-hidden={!saisie}
      >
        <div className="flex size-[clamp(7rem,18vw,12rem)] items-center justify-center rounded-full bg-white/15 text-[clamp(2.5rem,6vw,4rem)] font-semibold ring-1 ring-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
          {initiales}
        </div>
        <h1 id="titre-verrou" className="mt-5 max-w-full truncate text-[clamp(1.5rem,3vw,2.25rem)] font-semibold">
          {nom}
        </h1>
        {entreprise && <p className="mt-1 truncate text-sm text-white/75">{entreprise}</p>}
        <p className="mt-2 text-xs text-white/60">Votre travail en cours est conservé.</p>

        <form action={action} className="mt-6 w-full max-w-[18.5rem]">
          {/* Pour le gestionnaire de mots de passe : il retrouve le compte. */}
          {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
          <div className="flex h-10 items-center overflow-hidden rounded-md border border-white/25 border-b-white/60 bg-black/25 focus-within:border-b-2 focus-within:border-b-marque-300">
            <input
              ref={champ}
              name="motDePasse"
              type="password"
              autoComplete="current-password"
              placeholder="Mot de passe"
              aria-label="Mot de passe"
              tabIndex={saisie ? 0 : -1}
              disabled={enCours}
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-white outline-none placeholder:text-white/60 select-text"
            />
            <button
              type="submit"
              tabIndex={saisie ? 0 : -1}
              disabled={enCours}
              aria-label="Déverrouiller"
              className="flex h-full w-10 shrink-0 items-center justify-center hover:bg-white/15 disabled:opacity-50"
            >
              {enCours ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>

          {etat.erreur && (
            <p role="alert" className="mt-3 rounded-md bg-danger-600/85 px-3 py-2 text-center text-sm font-medium">
              {etat.erreur}
            </p>
          )}
          {!enLigne && (
            <p role="status" className="mt-3 text-center text-sm text-white/80">
              Hors ligne : le déverrouillage reprendra au retour du réseau.
            </p>
          )}
        </form>
      </div>

      {/* Bas d'écran : l'état du réseau, à droite. */}
      <div
        className="pointer-events-none absolute right-6 bottom-6 flex items-center gap-2 text-white/85"
        title={enLigne ? "En ligne" : "Hors ligne"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="size-5" aria-hidden>
          {enLigne ? (
            <>
              <path d="M2.5 9a14 14 0 0 1 19 0" />
              <path d="M5.5 12.5a9.5 9.5 0 0 1 13 0" />
              <path d="M8.5 16a5 5 0 0 1 7 0" />
              <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
            </>
          ) : (
            <>
              <path d="M8.5 16a5 5 0 0 1 7 0" />
              <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
              <path d="M3 3l18 18" />
            </>
          )}
        </svg>
        <span className="sr-only">{enLigne ? "En ligne" : "Hors ligne"}</span>
      </div>
    </div>
  );
}

/**
 * Pétales de « Bloom », le fond de Windows 11, redessinés en dégradés : aucune
 * image à télécharger, l'écran s'affiche aussi vite sur une connexion 3G.
 * Aux couleurs de MARIA GROUP : pétales d'or et de bleu clair sur bleu nuit.
 */
const PETALES: { angle: number; couleur: string }[] = [
  { angle: -168, couleur: "rgba(191, 161, 105, 0.85)" },
  { angle: -142, couleur: "rgba(127, 152, 183, 0.85)" },
  { angle: -116, couleur: "rgba(212, 189, 140, 0.85)" },
  { angle: -90, couleur: "rgba(216, 225, 236, 0.9)" },
  { angle: -64, couleur: "rgba(212, 189, 140, 0.85)" },
  { angle: -38, couleur: "rgba(127, 152, 183, 0.85)" },
  { angle: -12, couleur: "rgba(191, 161, 105, 0.85)" },
];

function FondBloom() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 72%, rgba(191,161,105,0.35), transparent 70%)," +
            "radial-gradient(ellipse 90% 60% at 50% 105%, rgba(44,77,116,0.9), transparent 75%)," +
            "linear-gradient(170deg, #07121d 0%, #0f2236 45%, #162e49 75%, #1f3d5f 100%)",
        }}
      />
      {PETALES.map(({ angle, couleur }) => (
        <div
          key={angle}
          className="absolute top-[74%] left-1/2 h-[13vmin] w-[44vmin] rounded-[50%] mix-blend-screen blur-[6px]"
          style={{
            transform: `translate(-50%, -50%) rotate(${angle}deg) translateX(17vmin)`,
            background: `linear-gradient(90deg, transparent 0%, ${couleur} 70%, rgba(255,255,255,0.55) 100%)`,
          }}
        />
      ))}
      <div
        className="absolute top-[74%] left-1/2 size-[20vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(244,236,218,0.9), rgba(191,161,105,0.4) 45%, transparent 70%)" }}
      />
      {/* Vignette : les bords s'assombrissent, l'horloge reste lisible partout. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(2,8,20,0.55) 100%)" }}
      />
    </div>
  );
}
