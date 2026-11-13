"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { joindrePiece, ouvrirPiece, retirerPiece } from "@/modules/pv/actions";
import { PIECES_MAX } from "@/modules/pv/regles";
import { FICHIER_MAX_OCTETS, tailleLisible, TYPES_FICHIER } from "@/modules/taches/suivi-regles";

export interface PieceAffichee {
  id: string;
  nom: string;
  typeMime: string;
  taille: number;
  deposePar: string | null;
}

/**
 * Les pièces jointes d'un PV : plans, photos, feuille de présence signée.
 * Tant que le PV s'écrit, on les glisse ou les choisit, on les retire ;
 * publié, elles se figent avec lui et ne font plus que s'ouvrir — par une URL
 * signée de deux minutes, demandée au clic.
 */
export function PiecesJointesPv({ pvId, pieces, modifiables }: { pvId: string; pieces: PieceAffichee[]; modifiables: boolean }) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const choix = useRef<HTMLInputElement>(null);
  const routeur = useRouter();
  const pleines = pieces.length >= PIECES_MAX;

  const lancer = (action: () => Promise<Resultat>) => {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r.ok ? null : r);
      routeur.refresh();
    });
  };

  const deposer = (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    // Un fichier à la fois, dans l'ordre : chacun dit s'il passe ou non.
    const liste = [...fichiers].slice(0, PIECES_MAX - pieces.length);
    setResultat(null);
    demarrer(async () => {
      for (const f of liste) {
        if (f.size > FICHIER_MAX_OCTETS) {
          setResultat({ ok: false, message: `« ${f.name} » : trop lourd, 10 Mo au plus.` });
          continue;
        }
        const donnees = new FormData();
        donnees.set("pvId", pvId);
        donnees.set("fichier", f);
        const r = await joindrePiece(donnees);
        if (!r.ok) setResultat(r);
      }
      routeur.refresh();
    });
  };

  return (
    <div>
      {modifiables && !pleines && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            deposer(e.dataTransfer.files);
          }}
          className="mb-3 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--filet)] px-4 py-5 text-center"
        >
          <p className="text-sm text-[var(--encre-douce)]">Glissez des fichiers ici, ou</p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => choix.current?.click()}
            className="h-9 rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
          >
            {enCours ? "Envoi…" : "Joindre des pièces"}
          </button>
          <p className="text-xs text-[var(--encre-faible)]">
            PDF, image, Word, Excel, PowerPoint, texte — 10 Mo par fichier, {PIECES_MAX} pièces au plus.
          </p>
          <input
            ref={choix}
            type="file"
            multiple
            hidden
            accept={Object.keys(TYPES_FICHIER).join(",")}
            onChange={(e) => {
              deposer(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}
      <Retour resultat={resultat} />
      {pieces.length === 0 ? (
        <p className="text-sm text-[var(--encre-faible)]">Aucune pièce jointe.</p>
      ) : (
        <ul className="divide-y divide-[var(--filet)] rounded-lg border border-[var(--filet)]">
          {pieces.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--surface-creuse)] text-[10px] font-bold uppercase text-[var(--encre-douce)]">
                {TYPES_FICHIER[p.typeMime] ?? "?"}
              </span>
              <span className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={async () => {
                    const url = await ouvrirPiece(p.id);
                    if (url) window.open(url, "_blank", "noopener");
                    else setResultat({ ok: false, message: "Cette pièce ne s'ouvre pas : le dépôt de fichiers ne répond pas." });
                  }}
                  className="block max-w-full truncate text-left text-sm font-medium text-marque-600 hover:underline"
                >
                  {p.nom}
                </button>
                <span className="block text-xs text-[var(--encre-faible)]">
                  {tailleLisible(p.taille)}
                  {p.deposePar ? ` · ${p.deposePar}` : ""}
                </span>
              </span>
              {modifiables && (
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => {
                    if (window.confirm(`Retirer « ${p.nom} » ?`)) lancer(() => retirerPiece(p.id));
                  }}
                  aria-label={`Retirer ${p.nom}`}
                  className="rounded-md px-2 py-1 text-xs text-[var(--encre-faible)] hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50"
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
