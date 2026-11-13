"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Fenetre } from "@/components/ui/fenetre";
import { Retour, type Resultat } from "@/components/ui/operations";
import { signerPv } from "@/modules/pv/actions";
import type { Signataire } from "@/modules/pv/regles";

import { PadSignature, TraceSignature } from "./signature";

const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

export interface SignatureAffichee {
  rang: number;
  trace: string;
  signeLeIso: string;
  personnelle: boolean;
  recueilliePar: string | null;
}

/**
 * Les signatures des participants présents. Chacun signe depuis son compte ;
 * le rédacteur et la direction recueillent sur place celles des autres, sur
 * leur propre appareil. Une fois apposée, une signature ne se reprend pas.
 */
export function SignaturesPv({
  pvId,
  reference,
  signataires,
  signatures,
  moi,
  recueille,
  ouverte,
}: {
  pvId: string;
  reference: string;
  signataires: Signataire[];
  signatures: SignatureAffichee[];
  moi: string;
  /** Rédacteur ou direction : peut recueillir sur place. */
  recueille: boolean;
  /** PV publié et non remplacé : on peut encore signer. */
  ouverte: boolean;
}) {
  const [cible, setCible] = useState<Signataire | null>(null);
  const [trace, setTrace] = useState("");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const parRang = new Map(signatures.map((s) => [s.rang, s]));
  const faites = signataires.filter((s) => parRang.has(s.rang)).length;
  const pourMoi = cible?.userId === moi;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Signatures des présents</h2>
        <span className="chiffres text-xs text-[var(--encre-faible)]">
          {faites} / {signataires.length}
        </span>
      </div>
      {signataires.length === 0 ? (
        <p className="text-sm text-[var(--encre-faible)]">Aucun participant présent à faire signer.</p>
      ) : (
        <ul className="space-y-2">
          {signataires.map((s) => {
            const sig = parRang.get(s.rang);
            const moiMeme = s.userId === moi;
            return (
              <li key={s.rang} className="flex items-center gap-3 rounded-lg border border-[var(--filet)] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {s.nom}
                    {moiMeme && <span className="text-[var(--encre-faible)]"> (vous)</span>}
                  </span>
                  <span className="block truncate text-xs text-[var(--encre-faible)]">
                    {sig
                      ? `Signé le ${MOMENT.format(new Date(sig.signeLeIso))}${sig.recueilliePar ? `, sur place, recueilli par ${sig.recueilliePar}` : ""}`
                      : s.qualite || (s.userId ? "Signe depuis son compte" : "Sans compte : signe sur place")}
                  </span>
                </span>
                {sig ? (
                  <TraceSignature trace={sig.trace} className="h-10 w-24 shrink-0" />
                ) : ouverte && (moiMeme || recueille) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTrace("");
                      setResultat(null);
                      setCible(s);
                    }}
                    className={`h-9 shrink-0 rounded-lg px-3 text-sm font-semibold ${moiMeme ? "bg-marque-600 text-white hover:bg-marque-700" : "border border-[var(--filet)] hover:bg-[var(--surface-creuse)]"}`}
                  >
                    {moiMeme ? "Signer" : "Faire signer sur place"}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-[var(--encre-faible)]">À signer</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!cible && <Retour resultat={resultat} />}

      <Fenetre
        ouverte={cible !== null}
        titre={pourMoi ? `Signer ${reference}` : `Signature de ${cible?.nom ?? ""}`}
        sousTitre={pourMoi ? "Votre signature s'imprime au pied du procès-verbal." : "Tendez l'appareil au participant : il signe lui-même, ici."}
        retenir={trace !== ""}
        onFermer={() => setCible(null)}
      >
        {cible && (
          <div className="space-y-4 px-5 py-4">
            <p className="rounded-lg bg-[var(--surface-creuse)] px-3 py-2.5 text-sm">
              {pourMoi ? "Je" : cible.nom}, certifie avoir participé à la séance et approuve le présent procès-verbal, {reference}.
            </p>
            <PadSignature key={cible.rang} onChange={setTrace} />
            <Retour resultat={resultat} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCible(null)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
                Annuler
              </button>
              <button
                type="button"
                disabled={enCours || trace === ""}
                onClick={() => {
                  setResultat(null);
                  demarrer(async () => {
                    const r = await signerPv(pvId, cible.rang, trace);
                    setResultat(r);
                    if (r.ok) {
                      setCible(null);
                      routeur.refresh();
                    }
                  });
                }}
                className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
              >
                {enCours ? "Enregistrement…" : "Signer le procès-verbal"}
              </button>
            </div>
          </div>
        )}
      </Fenetre>
    </div>
  );
}
