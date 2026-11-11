"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { ouvrirPhotoVisite, photoVisite } from "@/modules/visiteurs/actions";
import type { CotePhoto } from "@/modules/visiteurs/regles";

import { PrisePhoto } from "@/components/ui/prise-photo";

const LIBELLES: Record<CotePhoto, string> = { recto: "Pièce — recto", verso: "Pièce — verso", visiteur: "Visiteur" };

/**
 * Les photos d'une visite : chacune s'ouvre au clic, par une adresse signée
 * de deux minutes, et chaque ouverture est tracée. Une photo manquante se
 * prend ici tant que la visite n'est pas purgée.
 */
export function PhotosVisite({ visiteId, presentes, modifiable }: { visiteId: string; presentes: Record<CotePhoto, boolean>; modifiable: boolean }) {
  const [vue, setVue] = useState<{ cote: CotePhoto; url: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const ouvrir = (cote: CotePhoto) =>
    demarrer(async () => {
      const url = await ouvrirPhotoVisite(visiteId, cote);
      if (url) setVue({ cote, url });
      else setResultat({ ok: false, message: "Photo indisponible." });
    });

  const manquantes = (Object.keys(LIBELLES) as CotePhoto[]).filter((c) => !presentes[c]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LIBELLES) as CotePhoto[])
          .filter((c) => presentes[c])
          .map((c) => (
            <button key={c} type="button" disabled={enCours} onClick={() => ouvrir(c)} className="h-9 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
              Voir : {LIBELLES[c]}
            </button>
          ))}
      </div>
      {vue && (
        <figure className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-2">
          {/* Adresse signée, valable deux minutes : pas d'optimisation d'image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={vue.url} alt={LIBELLES[vue.cote]} className="max-h-[60vh] w-full rounded-lg object-contain" />
          <figcaption className="mt-1 flex justify-between text-xs text-[var(--encre-faible)]">
            {LIBELLES[vue.cote]}
            <button type="button" onClick={() => setVue(null)} className="hover:underline">
              Fermer
            </button>
          </figcaption>
        </figure>
      )}
      {modifiable && manquantes.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            demarrer(async () => {
              const r = await photoVisite(visiteId, donnees);
              setResultat(r);
              if (r.ok) routeur.refresh();
            });
          }}
          className="space-y-2"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {manquantes.map((c) => (
              <PrisePhoto key={c} nom={`photo_${c}`} libelle={LIBELLES[c]} />
            ))}
          </div>
          <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
            Enregistrer les photos
          </button>
        </form>
      )}
      <Retour resultat={resultat} />
    </div>
  );
}
