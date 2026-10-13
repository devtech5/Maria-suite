"use client";

import { useEffect, useState } from "react";

import {
  composerTicket,
  type DonneesTicket,
  type LargeurTicket,
} from "@/lib/caisse/ticket";

const CLE_LARGEUR = "maria.ticket.largeur";
const CLE_AUTO = "maria.ticket.auto";

/** Lecture tolérante : le stockage local peut être bloqué ou vide. */
function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string) {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Sans stockage, le réglage ne survit pas au rechargement — sans gravité.
  }
}

/**
 * Réglages d'impression propres à l'appareil : largeur du papier, et
 * impression automatique à chaque encaissement. Ils vivent sur l'appareil
 * parce que c'est lui qui porte l'imprimante.
 */
export function useReglagesTicket() {
  const [largeur, setLargeur] = useState<LargeurTicket>(80);
  const [auto, setAuto] = useState(false);

  // Lecture après montage : le serveur ne connaît pas le stockage du navigateur.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLargeur(lire(CLE_LARGEUR) === "58" ? 58 : 80);
    setAuto(lire(CLE_AUTO) === "1");
  }, []);

  return {
    largeur,
    auto,
    changerLargeur(valeur: LargeurTicket) {
      setLargeur(valeur);
      ecrire(CLE_LARGEUR, String(valeur));
    },
    changerAuto(valeur: boolean) {
      setAuto(valeur);
      ecrire(CLE_AUTO, valeur ? "1" : "0");
    },
  };
}

/**
 * Ticket posé hors écran, que seule l'impression révèle (`globals.css`).
 *
 * `@page` fixe la largeur du papier : sans elle le navigateur imprime sur A4
 * et la caisse sort une feuille avec trois lignes en haut.
 */
export function TicketImprimable({
  donnees,
  largeur,
  logo,
}: {
  donnees: DonneesTicket;
  largeur: LargeurTicket;
  /** Data URL : déjà dans la page, donc imprimable sans réseau. */
  logo?: string | null;
}) {
  return (
    <div id="ticket-imprimable" data-largeur={largeur} aria-hidden>
      <style>{`@media print { @page { size: ${largeur}mm auto; margin: 0; } }`}</style>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, rien à optimiser
        <img src={logo} alt="" style={{ display: "block", margin: "0 auto 2mm", maxWidth: "70%", maxHeight: "18mm", objectFit: "contain", filter: "grayscale(1)" }} />
      )}
      <pre>{composerTicket(donnees, largeur).join("\n")}</pre>
    </div>
  );
}
