"use client";

import { useState } from "react";

import { useTaches } from "./contexte";
import { Avatar, Deroulant } from "./elements";
import type { IntervenantAffiche, PersonnePossible, TacheAffichee } from "./types";

const VISIBLES = 3;

/** Avatars empilés : les trois premiers, puis « +N ». */
export function PileAvatars({ personnes, taille = 26 }: { personnes: IntervenantAffiche[]; taille?: number }) {
  if (personnes.length === 0) return <span className="text-[var(--encre-faible)]">—</span>;
  return (
    <span className="flex items-center" title={personnes.map((p) => `${p.nom}${p.detail ? ` — ${p.detail}` : ""}`).join("\n")}>
      {personnes.slice(0, VISIBLES).map((p, i) => (
        <span key={p.ref} className={`rounded-full ring-2 ring-[var(--surface)] ${i > 0 ? "-ml-2" : ""}`}>
          <Avatar nom={p.nom} taille={taille} />
        </span>
      ))}
      {personnes.length > VISIBLES && (
        <span
          className="-ml-2 grid place-items-center rounded-full bg-[var(--surface-creuse)] text-[11px] font-semibold text-[var(--encre-douce)] ring-2 ring-[var(--surface)]"
          style={{ width: taille, height: taille }}
        >
          +{personnes.length - VISIBLES}
        </span>
      )}
    </span>
  );
}

/** La liste à cocher, avec recherche, rangée en collaborateurs puis intervenants. */
function ListeACocher({ t }: { t: TacheAffichee }) {
  const { personnesPossibles } = useTaches();
  const [cherche, setCherche] = useState("");
  // Un intervenant retiré du Personnel reste affiché tant qu'il est sur la tâche : on peut l'enlever.
  const toutes: PersonnePossible[] = [...personnesPossibles, ...t.intervenants.filter((i) => !personnesPossibles.some((p) => p.ref === i.ref))];
  const mot = cherche.trim().toLocaleLowerCase("fr");
  const trouvees = toutes.filter((p) => !mot || `${p.nom} ${p.detail}`.toLocaleLowerCase("fr").includes(mot));
  return (
    <>
      <input
        autoFocus
        value={cherche}
        onChange={(e) => setCherche(e.target.value)}
        placeholder="Chercher une personne…"
        aria-label="Chercher une personne"
        className="mb-1 h-8 w-full rounded-md border border-[var(--filet)] bg-[var(--fond)] px-2 text-sm outline-none focus:border-[#1f76f0]"
      />
      {/* La clé suit la liste du serveur : à chaque retour, les cases se réalignent sur ce qui est enregistré. */}
      <Cases key={t.intervenants.map((i) => i.ref).join()} t={t} trouvees={trouvees} />
      {trouvees.length === 0 && <p className="px-2 py-3 text-center text-xs text-[var(--encre-faible)]">Personne à ce nom.</p>}
    </>
  );
}

/** Les cases suivent le clic aussitôt ; le serveur confirme ensuite. */
function Cases({ t, trouvees }: { t: TacheAffichee; trouvees: PersonnePossible[] }) {
  const { basculerIntervenant } = useTaches();
  const [coches, setCoches] = useState(() => new Set(t.intervenants.map((i) => i.ref)));
  const basculer = (ref: string) => {
    setCoches((c) => {
      const suite = new Set(c);
      if (suite.has(ref)) suite.delete(ref);
      else suite.add(ref);
      return suite;
    });
    basculerIntervenant(t, ref);
  };
  const section = (titre: string, liste: PersonnePossible[]) =>
    liste.length > 0 && (
      <div>
        <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--encre-faible)]">{titre}</p>
        {liste.map((p) => (
          <label key={p.ref} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-creuse)]">
            <input type="checkbox" checked={coches.has(p.ref)} onChange={() => basculer(p.ref)} className="size-4 accent-[#1f76f0]" />
            <Avatar nom={p.nom} taille={22} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.nom}</span>
              {p.detail && <span className="block truncate text-xs text-[var(--encre-faible)]">{p.detail}</span>}
            </span>
          </label>
        ))}
      </div>
    );
  return (
    <>
      {section("Collaborateurs", trouvees.filter((p) => p.nature === "collaborateur"))}
      {section("Intervenants", trouvees.filter((p) => p.nature === "intervenant"))}
    </>
  );
}

/**
 * Cellule « Intervenants » : les avatars, et pour qui peut modifier la
 * tâche, la liste à cocher. Chaque case ajoute ou retire aussitôt ; le menu
 * reste ouvert pour en cocher plusieurs.
 */
export function CelluleIntervenants({ t }: { t: TacheAffichee }) {
  const { modifiable, enCours } = useTaches();
  const pile = (
    <span className="flex h-full min-h-9 items-center justify-center px-2">
      <PileAvatars personnes={t.intervenants} />
    </span>
  );
  if (!modifiable(t)) return pile;
  return (
    <Deroulant declencheur={pile} libelle={`Intervenants : ${t.intervenants.length}. Choisir`} desactive={enCours} className="hover:bg-[var(--surface-creuse)]" largeurMin={260}>
      {() => <ListeACocher t={t} />}
    </Deroulant>
  );
}
