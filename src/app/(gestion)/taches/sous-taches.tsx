"use client";

import { useRef, useState } from "react";

import { ajouterSousTache, cocherSousTache, modifierSousTache, supprimerSousTache } from "@/modules/taches/actions";
import { estClose } from "@/modules/taches/vues";
import { avancement, TITRE_SOUS_TACHE_MAX } from "@/modules/taches/suivi-regles";

import { useTaches } from "./contexte";
import { Avatar, Deroulant, jourCourt } from "./elements";
import type { SousTacheAffichee, TacheAffichee } from "./types";

/** Barre d'avancement : la part des sous-tâches faites. */
export function Avancement({ t, large = false }: { t: TacheAffichee; large?: boolean }) {
  const { faites, total } = avancement(t.sousTaches);
  if (total === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${large ? "w-full" : ""}`} title={`${faites} sur ${total} sous-tâches faites`}>
      <span className={`h-1.5 overflow-hidden rounded-full bg-[var(--surface-creuse)] ${large ? "flex-1" : "w-12"}`}>
        <span className="block h-full rounded-full bg-[#00c875]" style={{ width: `${Math.round((faites * 100) / total)}%` }} />
      </span>
      <span className="chiffres text-[11px] text-[var(--encre-faible)]">
        {faites}/{total}
      </span>
    </span>
  );
}

/**
 * Les sous-tâches d'une tâche : ce qu'il faut faire, précisément. Chacune se
 * coche, se renomme d'un clic, se confie à un collaborateur ou un intervenant
 * et reçoit son échéance. Le responsable, les intervenants, le créateur et
 * qui attribue les tiennent à jour, tâche ouverte.
 */
export function ListeSousTaches({ t, compacte = false }: { t: TacheAffichee; compacte?: boolean }) {
  const { peutRemplir, lancer, enCours } = useTaches();
  const [nouveau, setNouveau] = useState("");
  const ecrit = peutRemplir(t) && !estClose(t.statut);

  return (
    <div className={compacte ? "" : "space-y-3"}>
      {!compacte && t.sousTaches.length > 0 && <Avancement t={t} large />}
      {t.sousTaches.length === 0 && !compacte && (
        <p className="rounded-lg bg-[var(--surface-creuse)] px-3 py-2.5 text-sm text-[var(--encre-douce)]">
          Découpez la tâche en étapes précises : chacune se coche quand elle est faite, et l&apos;avancement se lit d&apos;un coup d&apos;œil.
        </p>
      )}
      <ul className={`divide-y divide-[var(--filet)] ${compacte ? "" : "rounded-xl border border-[var(--filet)]"}`}>
        {t.sousTaches.map((st) => (
          <Ligne key={`${st.id}-${st.faite}`} t={t} st={st} ecrit={ecrit} />
        ))}
      </ul>
      {ecrit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const titre = nouveau.trim();
            if (titre.length < 2) return;
            setNouveau("");
            lancer(() => ajouterSousTache(t.id, titre));
          }}
          className={`flex items-center gap-2 ${compacte ? "px-2 py-1.5" : ""}`}
        >
          <span aria-hidden className="text-[var(--encre-faible)]">
            +
          </span>
          <input
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            maxLength={TITRE_SOUS_TACHE_MAX}
            placeholder="Ajouter une sous-tâche, puis Entrée"
            aria-label={`Ajouter une sous-tâche à ${t.titre}`}
            className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-[var(--filet)] focus:border-[#1f76f0]"
          />
          {nouveau.trim().length >= 2 && (
            <button type="submit" disabled={enCours} className="h-8 rounded-md bg-[#1f76f0] px-3 text-xs font-semibold text-white disabled:opacity-50">
              Ajouter
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function Ligne({ t, st, ecrit }: { t: TacheAffichee; st: SousTacheAffichee; ecrit: boolean }) {
  const { lancer, enCours, personnesPossibles, aujourdhui } = useTaches();
  // La case suit le clic aussitôt ; la clé de la ligne (id + état) la réaligne au retour du serveur.
  const [faite, setFaite] = useState(st.faite);
  const [edition, setEdition] = useState(false);
  const date = useRef<HTMLInputElement>(null);

  return (
    <li className="group flex min-h-10 items-center gap-2.5 px-2.5 py-1">
      <input
        type="checkbox"
        checked={faite}
        disabled={!ecrit}
        aria-label={`${st.titre} : ${faite ? "faite" : "à faire"}`}
        onChange={() => {
          setFaite(!faite);
          lancer(() => cocherSousTache(st.id, !faite));
        }}
        className="size-4 shrink-0 accent-[#00c875]"
      />
      {edition ? (
        <input
          autoFocus
          defaultValue={st.titre}
          maxLength={TITRE_SOUS_TACHE_MAX}
          aria-label="Titre de la sous-tâche"
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.preventDefault();
              setEdition(false);
            }
          }}
          onBlur={(e) => {
            setEdition(false);
            const titre = e.target.value.trim();
            if (titre.length >= 2 && titre !== st.titre) lancer(() => modifierSousTache(st.id, { titre }));
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-[#1f76f0] bg-[var(--surface)] px-2 text-sm outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={!ecrit}
          onClick={() => setEdition(true)}
          className={`min-w-0 flex-1 truncate text-left text-sm ${faite ? "text-[var(--encre-faible)] line-through" : ""} ${ecrit ? "hover:text-[#1f76f0]" : ""}`}
          title={ecrit ? "Renommer" : st.titre}
        >
          {st.titre}
        </button>
      )}

      {/* Responsable de la sous-tâche */}
      <span className="h-8 w-9 shrink-0">
        {ecrit ? (
          <Deroulant
            libelle={`Responsable de « ${st.titre} »`}
            desactive={enCours}
            largeurMin={240}
            className="grid place-items-center rounded-md hover:bg-[var(--surface-creuse)]"
            declencheur={
              st.responsableNom ? (
                <Avatar nom={st.responsableNom} taille={24} />
              ) : (
                <span className="grid size-6 place-items-center rounded-full border border-dashed border-[var(--filet)] text-xs text-[var(--encre-faible)]">+</span>
              )
            }
          >
            {(fermer) => (
              <>
                {[{ ref: "", nom: "Personne", detail: "" }, ...personnesPossibles].map((p) => (
                  <button
                    key={p.ref || "aucun"}
                    type="button"
                    role="menuitemradio"
                    aria-checked={(st.responsable ?? "") === p.ref}
                    onClick={() => {
                      fermer();
                      if ((st.responsable ?? "") !== p.ref) lancer(() => modifierSousTache(st.id, { responsable: p.ref || null }));
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-creuse)] ${(st.responsable ?? "") === p.ref ? "bg-[var(--surface-creuse)]" : ""}`}
                  >
                    {p.ref ? <Avatar nom={p.nom} taille={22} /> : <span className="size-[22px]" />}
                    <span className="min-w-0 flex-1 truncate">{p.nom}</span>
                    {p.detail && <span className="truncate text-xs text-[var(--encre-faible)]">{p.detail}</span>}
                  </button>
                ))}
              </>
            )}
          </Deroulant>
        ) : (
          st.responsableNom && <Avatar nom={st.responsableNom} taille={24} />
        )}
      </span>

      {/* Échéance de la sous-tâche */}
      <span className="relative w-20 shrink-0 text-center text-xs">
        <button
          type="button"
          disabled={!ecrit || enCours}
          onClick={() => {
            try {
              date.current?.showPicker();
            } catch {
              date.current?.focus();
            }
          }}
          className={`h-8 w-full rounded-md ${ecrit ? "hover:bg-[var(--surface-creuse)]" : ""} ${st.echeance && st.echeance < aujourdhui && !faite ? "font-semibold text-danger-600" : "text-[var(--encre-douce)]"}`}
          aria-label={`Échéance de « ${st.titre} »`}
        >
          {st.echeance ? jourCourt(st.echeance) : ecrit ? <span className="text-[var(--encre-faible)] opacity-0 group-hover:opacity-100">+ date</span> : ""}
        </button>
        <input
          ref={date}
          key={st.echeance ?? ""}
          type="date"
          tabIndex={-1}
          aria-hidden
          defaultValue={st.echeance ?? ""}
          max={t.echeance ?? undefined}
          onChange={(e) => lancer(() => modifierSousTache(st.id, { echeance: e.target.value || null }))}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
        />
      </span>

      {ecrit && (
        <button
          type="button"
          disabled={enCours}
          onClick={() => {
            if (window.confirm(`Retirer la sous-tâche « ${st.titre} » ?`)) lancer(() => supprimerSousTache(st.id));
          }}
          aria-label={`Retirer « ${st.titre} »`}
          className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--encre-faible)] opacity-60 hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100"
        >
          ×
        </button>
      )}
    </li>
  );
}
