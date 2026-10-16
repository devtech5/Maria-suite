import type { ReactNode } from "react";

import type { IdentiteEntreprise } from "@/lib/identite";

/**
 * En-tête commun aux documents A4 : logo, raison sociale, coordonnées et
 * identifiants légaux à gauche ; titre et références de la pièce à droite.
 * La couleur primaire porte la raison sociale, le titre et le filet épais
 * sous l'en-tête ; la secondaire, le filet fin qui le double.
 */
export function EnTeteDocument({ identite, children }: { identite: IdentiteEntreprise; children: ReactNode }) {
  const i = identite;
  return (
    <header className="border-b pb-0.5" style={{ borderColor: i.couleurSecondaire }}>
      <div className="flex items-start justify-between gap-6 border-b-2 pb-5" style={{ borderColor: i.couleur }}>
        <div className="flex items-start gap-4">
          {i.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, rien à optimiser
            <img src={i.logo} alt="" className="max-h-[22mm] max-w-[45mm] object-contain" />
          )}
          <div>
            <p className="text-lg font-bold" style={{ color: i.couleur }}>
              {i.nom}
            </p>
            {i.formeJuridique && <p>{i.formeJuridique}</p>}
            {i.adresse && <p>{i.adresse}</p>}
            {i.ville && <p>{i.ville}</p>}
            {i.telephone && <p>Tél. {i.telephone}</p>}
            {i.email && <p>{i.email}</p>}
            {i.identifiantFiscal && (
              <p>
                {i.referentiel.identifiantFiscal} : {i.identifiantFiscal}
              </p>
            )}
            {i.rccm && (
              <p>
                {i.referentiel.registre} : {i.rccm}
              </p>
            )}
          </div>
        </div>
        <div className="text-right [&>p:first-child]:text-[var(--couleur-doc)]" style={{ ["--couleur-doc" as string]: i.couleur }}>
          {children}
        </div>
      </div>
    </header>
  );
}

/** Pied de page : mentions libres de l'entreprise, puis identifiants légaux. */
export function PiedDocument({ identite }: { identite: IdentiteEntreprise }) {
  const i = identite;
  const legal = [
    i.nom,
    i.formeJuridique,
    i.identifiantFiscal ? `${i.referentiel.identifiantFiscal} ${i.identifiantFiscal}` : null,
    i.rccm ? `${i.referentiel.registre} ${i.rccm}` : null,
    i.regimeFiscal,
  ].filter(Boolean);
  if (!i.piedDePage && legal.length <= 1) return null;
  return (
    <footer className="mt-8 border-t pt-3 text-center text-[8.5pt] text-black/60" style={{ borderColor: i.couleurSecondaire }}>
      {i.piedDePage && <p className="whitespace-pre-line">{i.piedDePage}</p>}
      <p className="mt-1">{legal.join(" · ")}</p>
    </footer>
  );
}
