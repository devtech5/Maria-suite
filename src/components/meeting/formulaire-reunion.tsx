"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { programmerReunion } from "@/modules/meeting/actions";
import { DUREES } from "@/modules/meeting/calcul";

interface Membre {
  userId: string;
  nom: string;
}

const LIBELLE = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";

function libelleDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return minutes % 60 ? `${h} h ${minutes % 60}` : `${h} h`;
}

/**
 * Programmer une réunion, ou en ouvrir une sur-le-champ.
 *
 * « Maintenant » envoie l'organisateur droit dans la salle et prévient les
 * invités qu'elle est ouverte ; « Plus tard » leur envoie l'invitation.
 */
export function FormulaireReunion({ membres, moi, aujourdhui }: { membres: Membre[]; moi: string; aujourdhui: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [quand, setQuand] = useState<"maintenant" | "plus_tard">("plus_tard");
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState("");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const autres = useMemo(() => membres.filter((m) => m.userId !== moi), [membres, moi]);
  const visibles = autres.filter((m) => m.nom.toLowerCase().includes(filtre.trim().toLowerCase()));

  if (!ouvert) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setQuand("maintenant");
            setOuvert(true);
          }}
          className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]"
        >
          Réunion immédiate
        </button>
        <button
          type="button"
          onClick={() => {
            setQuand("plus_tard");
            setOuvert(true);
          }}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          Programmer une réunion
        </button>
      </div>
    );
  }

  const basculer = (userId: string) =>
    setChoisis((actuels) => {
      const suivants = new Set(actuels);
      if (suivants.has(userId)) suivants.delete(userId);
      else suivants.add(userId);
      return suivants;
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        donnees.delete("participants");
        choisis.forEach((u) => donnees.append("participants", u));
        donnees.set("instantanee", quand === "maintenant" ? "oui" : "non");
        demarrer(async () => {
          const r = await programmerReunion(donnees);
          setResultat(r);
          if (r.ok && r.id) routeur.push(quand === "maintenant" ? `/meeting/${r.id}/salle` : `/meeting/${r.id}`);
        });
      }}
      className="mb-5 w-full space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Quand" className="inline-flex rounded-lg border border-[var(--filet)] p-0.5">
          {(
            [
              ["maintenant", "Maintenant"],
              ["plus_tard", "Plus tard"],
            ] as const
          ).map(([valeur, libelle]) => (
            <button
              key={valeur}
              type="button"
              role="radio"
              aria-checked={quand === valeur}
              onClick={() => setQuand(valeur)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${quand === valeur ? "bg-marque-600 text-white" : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"}`}
            >
              {libelle}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>

      <label className="block">
        <span className={LIBELLE}>Objet de la réunion</span>
        <input name="titre" required minLength={3} maxLength={160} placeholder="Point hebdomadaire de l'équipe commerciale" className={CLASSE_CHAMP} />
      </label>
      <label className="block">
        <span className={LIBELLE}>Ordre du jour</span>
        <textarea name="ordreDuJour" rows={3} maxLength={4000} placeholder={"1. Chiffres de la semaine\n2. Relances clients\n3. Questions diverses"} className={`${CLASSE_CHAMP} h-auto py-2`} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        {quand === "plus_tard" && (
          <>
            <label className="block">
              <span className={LIBELLE}>Date</span>
              <input type="date" name="jour" required min={aujourdhui} defaultValue={aujourdhui} className={CLASSE_CHAMP} />
            </label>
            <label className="block">
              <span className={LIBELLE}>Heure</span>
              <input type="time" name="heure" required step={300} defaultValue="09:00" className={CLASSE_CHAMP} />
            </label>
          </>
        )}
        <label className="block">
          <span className={LIBELLE}>Durée prévue</span>
          <select name="dureeMinutes" defaultValue={60} className={CLASSE_CHAMP}>
            {DUREES.map((d) => (
              <option key={d} value={d}>
                {libelleDuree(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <legend className={LIBELLE}>
            Invités <span className="font-normal">· {choisis.size} sur {autres.length}</span>
          </legend>
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={() => setChoisis(new Set(autres.map((m) => m.userId)))} className="text-marque-600 hover:underline">
              Toute l&apos;équipe
            </button>
            <button type="button" onClick={() => setChoisis(new Set())} className="text-[var(--encre-faible)] hover:underline">
              Personne
            </button>
          </div>
        </div>
        {autres.length > 8 && (
          <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Chercher un membre…" className={`${CLASSE_CHAMP} mb-2`} />
        )}
        {autres.length === 0 ? (
          <p className="text-sm text-[var(--encre-douce)]">Aucun autre membre dans l&apos;entreprise pour l&apos;instant.</p>
        ) : (
          <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-[var(--filet)] p-2 sm:grid-cols-2">
            {visibles.map((m) => (
              <li key={m.userId}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surface-creuse)]">
                  <input type="checkbox" checked={choisis.has(m.userId)} onChange={() => basculer(m.userId)} className="size-4 accent-marque-600" />
                  <span className="truncate">{m.nom}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {resultat && !resultat.ok && <Retour resultat={resultat} />}
      <div className="flex justify-end">
        <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          {enCours ? "Un instant…" : quand === "maintenant" ? "Ouvrir la salle" : "Programmer et inviter"}
        </button>
      </div>
    </form>
  );
}
