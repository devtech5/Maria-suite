"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { enregistrerNote } from "@/modules/calculs/actions";
import type { Calcul } from "@/modules/calculs/notes";

export interface OptionProjet {
  id: string;
  code: string;
  nom: string;
}

const BOUTON = "h-cible rounded-lg px-3.5 text-sm font-semibold disabled:opacity-50";
const SECONDAIRE = `${BOUTON} border border-[var(--filet)] bg-[var(--surface)] font-medium hover:bg-[var(--surface-creuse)]`;
const PRINCIPAL = `${BOUTON} bg-marque-600 text-white hover:bg-marque-700`;

/**
 * Fige le calcul affiché sur un projet. Seule la SAISIE part au serveur :
 * il refait le calcul avec les ratios de l'entreprise et attribue le numéro.
 */
export function EnregistrerNote({ calcul, projets }: { calcul: Calcul; projets: OptionProjet[] }) {
  const routeur = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [projetId, setProjetId] = useState(projets[0]?.id ?? "");
  const [libelle, setLibelle] = useState("");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={SECONDAIRE}>
        Enregistrer sur un projet
      </button>
    );
  }

  return (
    <form
      className="mt-2 w-full space-y-3 rounded-lg border border-[var(--filet)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setResultat(null);
        demarrer(async () => {
          const r = await enregistrerNote(calcul.type, calcul.saisie, projetId, libelle);
          setResultat(r);
          if (r.ok && r.id) routeur.push(`/calculs/notes/${r.id}`);
        });
      }}
    >
      <Champ libelle="Projet">
        <select value={projetId} onChange={(e) => setProjetId(e.target.value)} required className={CLASSE_CHAMP}>
          {projets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.nom}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Libellé" precision="Ce que la note calcule : « Dalle du RDC », « Mur de clôture nord ».">
        <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required minLength={2} maxLength={200} className={CLASSE_CHAMP} />
      </Champ>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => setOuvert(false)} className={SECONDAIRE}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className={PRINCIPAL}>
          {enCours ? "Enregistrement…" : "Enregistrer la note"}
        </button>
      </div>
      <Retour resultat={resultat} />
    </form>
  );
}
