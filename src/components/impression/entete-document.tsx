import type { ReactNode } from "react";

import type { IdentiteEntreprise } from "@/lib/identite";
import { fmt } from "@/lib/format";

/**
 * Papier à en-tête de l'entreprise, commun à tous les documents A4 (modèle
 * « En-tête élégant » de MARIA GROUP) :
 *
 *   · en tête, le logo à gauche, la raison sociale et les coordonnées à
 *     droite, puis un filet à la couleur secondaire ;
 *   · sous le filet, à droite, le titre et les références de la pièce ;
 *   · en pied, la devise de l'entreprise, un filet, puis les identifiants
 *     légaux ;
 *   · en fond, le monogramme en filigrane, en bas à droite.
 *
 * Les couleurs viennent de l'entreprise : primaire pour le texte de l'en-tête
 * et le titre, secondaire pour les filets et la devise.
 */

/** Logo de la marque, quand l'entreprise n'en a pas déposé. */
export const LOGO_MARQUE = "/marque/logo-maria-group.svg";
/** Monogramme posé en filigrane. */
export const FILIGRANE_MARQUE = "/marque/filigrane-maria-group.svg";

/** Teinte assombrie d'une couleur #RRGGBB : la devise reste lisible sur fond blanc. */
export function assombrir(hex: string, part = 0.4): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `#${m
    .slice(1)
    .map((c) => Math.round(parseInt(c, 16) * (1 - part)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function EnTeteDocument({ identite, children }: { identite: IdentiteEntreprise; children: ReactNode }) {
  const i = identite;
  const coordonnees = [[i.adresse, i.ville].filter(Boolean).join(", "), i.telephone, i.email, i.siteWeb].filter(Boolean);
  return (
    <header style={{ color: i.couleur }}>
      {/* Filigrane : positionné sur la feuille (`FeuilleA4`, relative et isolée), derrière le texte. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique, imprimé tel quel */}
      <img src={FILIGRANE_MARQUE} alt="" aria-hidden className="pointer-events-none absolute -right-[25mm] bottom-[3mm] -z-10 w-[122mm] opacity-[0.06]" />
      <div className="relative flex items-center justify-between gap-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL ou SVG statique, rien à optimiser */}
        <img src={i.logo ?? LOGO_MARQUE} alt={i.nom} className="max-h-[32mm] max-w-[62mm] object-contain" />
        <div className="flex flex-col items-end gap-[0.6mm] text-right text-[8pt] font-medium leading-[11.5pt]">
          <p className="mb-[1mm] text-[10pt] font-bold uppercase tracking-[0.12em]">{i.nom}</p>
          {coordonnees.map((ligne) => (
            <p key={ligne}>{ligne}</p>
          ))}
        </div>
      </div>
      <div className="relative mt-[6mm] h-[2px]" style={{ background: i.couleurSecondaire }} />
      <div className="relative mt-[7mm] text-right text-black [&>p:first-child]:text-[var(--couleur-doc)]" style={{ ["--couleur-doc" as string]: i.couleur }}>
        {children}
      </div>
    </header>
  );
}

/** Pied de page : mentions libres, devise de l'entreprise, filet, identifiants légaux. */
export function PiedDocument({ identite }: { identite: IdentiteEntreprise }) {
  const i = identite;
  // Comme le modèle : registre, identifiant fiscal, capital. La raison sociale est déjà en tête.
  const legal = [
    i.rccm ? `${i.referentiel.registre} ${i.rccm}` : null,
    i.identifiantFiscal ? `${i.referentiel.identifiantFiscal} ${i.identifiantFiscal}` : null,
    i.capitalSocial !== null ? `Capital ${fmt(i.capitalSocial)} ${i.devise === "XOF" ? "FCFA" : i.devise}` : null,
    i.regimeFiscal,
  ].filter(Boolean);
  if (!i.piedDePage && !i.slogan && legal.length === 0) return null;
  return (
    <footer className="relative mt-8 flex flex-col items-center gap-[2mm] text-center">
      {i.piedDePage && <p className="whitespace-pre-line text-[8pt] text-black/60">{i.piedDePage}</p>}
      {i.slogan && (
        <p className="text-[9pt] font-semibold italic tracking-[0.04em]" style={{ color: assombrir(i.couleurSecondaire) }}>
          {i.slogan}
        </p>
      )}
      <div className="h-[2px] w-full" style={{ background: i.couleurSecondaire }} />
      {legal.length > 0 && <p className="text-[7.5pt] font-medium text-[#5b6b7c]">{legal.join(" · ")}</p>}
    </footer>
  );
}
