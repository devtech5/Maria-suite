"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { maintenirSession, sessionOuverte, signalerActivite, verrouiller } from "@/lib/auth/actions-verrou";
import {
  CONNEXION_EXPIREE,
  DECONNEXION_INACTIVITE_MINUTES,
  PAS_PRESENCE_MS,
  inactiviteEcoulee,
} from "@/lib/auth/verrou";
import { EcranVerrouillage } from "./ecran-verrouillage";

/**
 * Partagés entre onglets par `localStorage` : l'activité d'un onglet compte
 * pour tous, et le voile tombe — ou se lève — partout à la fois. Sans cela,
 * travailler dans un onglet laisserait l'autre se verrouiller, et déverrouiller
 * l'un laisserait l'autre voilé.
 */
const CLE_ACTIVITE = "maria-activite";
const CLE_VERROU = "maria-verrou";
/**
 * Verrou demandé à la main. Seul celui-là voile la caisse : elle reste ouverte
 * malgré l'inactivité, mais le caissier qui verrouille avant de s'éloigner
 * doit la retrouver verrouillée, même rechargée ou rouverte dans un onglet.
 */
const CLE_VERROU_MANUEL = "maria-verrou-manuel";

/** Demande de verrouillage immédiat, émise dans l'onglet par `verrouillerMaintenant`. */
const EVENEMENT_VERROUILLER = "maria:verrouiller";

/**
 * Verrouille l'écran sans attendre le délai : le caissier ou le gérant qui
 * s'éloigne de son poste. Le voile tombe sur place, la page reste montée —
 * panier ou saisie en cours se retrouvent au retour.
 */
export function verrouillerMaintenant(): void {
  window.dispatchEvent(new Event(EVENEMENT_VERROUILLER));
}

/** Gestes qui comptent comme activité. Le clavier et le toucher autant que la souris. */
const GESTES = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

/** Toutes les dix secondes : le voile tombe au plus dix secondes après l'heure. */
const PAS_CONTROLE_MS = 10_000;

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string): void {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // Navigation privée ou stockage bloqué : l'onglet se garde seul.
  }
}

/** Session rouverte : les autres onglets lèvent leur voile, la caisse oublie le verrou manuel. */
export function marquerDeverrouille(): void {
  ecrire(CLE_VERROU, "0");
  ecrire(CLE_VERROU_MANUEL, "0");
  ecrire(CLE_ACTIVITE, String(Date.now()));
}

interface Props {
  delaiMinutes: number;
  nom: string;
  email: string | null;
  entreprise: string | null;
  /**
   * `verrouiller` pour la gestion. `presence` pour la caisse : ses gestes
   * comptent comme activité, mais elle ne se voile jamais — elle reste ouverte
   * entre deux clients. Affichée, elle tient aussi la session ouverte au-delà
   * du délai de déconnexion.
   */
  mode?: "verrouiller" | "presence";
  /** Identifiant du conteneur rendu inerte pendant le verrou : le clavier ne passe plus dessous. */
  cible?: string;
  /**
   * La session est verrouillée côté serveur. Ne sert qu'à la caisse, servie
   * malgré le verrou : si ce verrou a été demandé à la main, elle se voile dès
   * l'affichage — sans quoi recharger la page le lèverait.
   */
  sessionVerrouillee?: boolean;
}

/**
 * Verrouillage après inactivité, ou à la demande (`verrouillerMaintenant`).
 *
 * Le voile est opaque, pas flouté : un flou laisse lire un total en gros
 * caractères. Sous le voile, la page reste montée — formulaire à moitié saisi,
 * panier, filtre — et se retrouve intacte au déverrouillage.
 *
 * Au-delà de `DECONNEXION_INACTIVITE_MINUTES`, la session prend fin : l'écran
 * demande au serveur si elle vit encore et, sinon, part vers la connexion.
 */
export function VerrouInactivite({
  delaiMinutes,
  nom,
  email,
  entreprise,
  mode = "verrouiller",
  cible,
  sessionVerrouillee = false,
}: Props) {
  const [verrouille, setVerrouille] = useState(false);
  const verrouilleRef = useRef(false);
  const derniere = useRef(0);
  const dernierEcrit = useRef(0);
  const dernierSignal = useRef(0);
  const dernierMaintien = useRef(0);
  const derniereQuestion = useRef(0);

  const voiler = useCallback((avertirServeur: boolean, manuel = false) => {
    if (verrouilleRef.current) return;
    verrouilleRef.current = true;
    setVerrouille(true);
    ecrire(CLE_VERROU, "1");
    if (manuel) ecrire(CLE_VERROU_MANUEL, "1");
    if (avertirServeur) void verrouiller(manuel);
  }, []);

  const lever = useCallback(() => {
    const maintenant = Date.now();
    verrouilleRef.current = false;
    derniere.current = maintenant;
    dernierSignal.current = maintenant;
    setVerrouille(false);
    marquerDeverrouille();
  }, []);

  useEffect(() => {
    const maintenant = Date.now();
    // La page vient d'être servie : le serveur a jugé la session ouverte, et
    // ouvrir une page est un geste. Un voile resté inscrit d'avant est périmé.
    derniere.current = maintenant;
    dernierSignal.current = maintenant;
    ecrire(CLE_ACTIVITE, String(maintenant));
    if (mode === "verrouiller") {
      ecrire(CLE_VERROU, "0");
      ecrire(CLE_VERROU_MANUEL, "0");
    } else if (sessionVerrouillee && lire(CLE_VERROU_MANUEL) === "1") {
      // Caisse rechargée après un verrou demandé à la main. Le voile est posé
      // après montage : le serveur ne lit pas ce stockage, et le rendre
      // d'emblée casserait l'hydratation.
      voiler(false);
    }

    const derniereConnue = () => Math.max(derniere.current, Number(lire(CLE_ACTIVITE)) || 0);

    const surGeste = () => {
      if (verrouilleRef.current) return;
      const t = Date.now();
      // Contrôle AVANT d'enregistrer : au réveil d'une mise en veille, le
      // premier mouvement de souris arrive avant la minuterie.
      if (mode === "verrouiller" && inactiviteEcoulee(derniereConnue(), t, delaiMinutes)) {
        voiler(true);
        return;
      }
      derniere.current = t;
      if (t - dernierEcrit.current > 5_000) {
        dernierEcrit.current = t;
        ecrire(CLE_ACTIVITE, String(t));
      }
      if (t - dernierSignal.current > PAS_PRESENCE_MS) {
        dernierSignal.current = t;
        void signalerActivite().then((r) => {
          if (r.verrouillee && mode === "verrouiller") voiler(false);
        });
      }
    };

    // Session terminée : la page conservée sous le voile est abandonnée, la
    // connexion efface le cookie.
    const partir = () => window.location.assign(CONNEXION_EXPIREE);

    const controler = () => {
      const t = Date.now();
      if (mode === "verrouiller" && !verrouilleRef.current && inactiviteEcoulee(derniereConnue(), t, delaiMinutes)) {
        voiler(true);
      }

      // Onglet caché : rien ne s'interroge. Le contrôle reprend à son retour.
      if (document.visibilityState !== "visible") return;

      // Caisse ou salle affichée et non voilée : elle tient la session.
      if (mode === "presence" && !verrouilleRef.current) {
        if (t - dernierMaintien.current >= PAS_PRESENCE_MS) {
          dernierMaintien.current = t;
          void maintenirSession().then((r) => {
            if (!r.ouverte) partir();
          });
        }
        return;
      }

      // Délai de déconnexion atteint : le serveur seul juge, une caisse
      // affichée dans un autre onglet a pu maintenir la session.
      if (
        inactiviteEcoulee(derniereConnue(), t, DECONNEXION_INACTIVITE_MINUTES) &&
        t - derniereQuestion.current >= PAS_PRESENCE_MS
      ) {
        derniereQuestion.current = t;
        void sessionOuverte().then((ouverte) => {
          if (!ouverte) partir();
        });
      }
    };

    const surStockage = (e: StorageEvent) => {
      if (e.key !== CLE_VERROU) return;
      // La caisse ne se voile pas sur le verrou d'un onglet voisin, mais un
      // déverrouillage ailleurs lève aussi le sien.
      if (e.newValue === "1" && mode === "verrouiller") voiler(false);
      else if (e.newValue === "0" && verrouilleRef.current) lever();
    };

    // Le verrou demandé à la main vaut pour tous les modes, caisse comprise.
    const surDemande = () => voiler(true, true);

    const surVisibilite = () => {
      if (document.visibilityState === "visible") controler();
    };

    for (const g of GESTES) window.addEventListener(g, surGeste, { passive: true, capture: true });
    window.addEventListener("storage", surStockage);
    window.addEventListener(EVENEMENT_VERROUILLER, surDemande);
    document.addEventListener("visibilitychange", surVisibilite);
    const minuterie = window.setInterval(controler, PAS_CONTROLE_MS);

    return () => {
      for (const g of GESTES) window.removeEventListener(g, surGeste, { capture: true });
      window.removeEventListener("storage", surStockage);
      window.removeEventListener(EVENEMENT_VERROUILLER, surDemande);
      document.removeEventListener("visibilitychange", surVisibilite);
      window.clearInterval(minuterie);
    };
  }, [delaiMinutes, mode, sessionVerrouillee, voiler, lever]);

  useEffect(() => {
    if (!cible) return;
    const conteneur = document.getElementById(cible);
    if (!conteneur) return;
    conteneur.inert = verrouille;
    if (verrouille && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [verrouille, cible]);

  if (!verrouille) return null;

  return <EcranVerrouillage nom={nom} email={email} entreprise={entreprise} onDeverrouille={lever} />;
}
