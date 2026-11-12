"use client";

import { useState } from "react";

import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Champ, Pastille } from "@/components/ui/primitives";
import { changerRoleMembre, confierMembre, retirerMembre } from "@/modules/projets/terrain-actions";
import { LIBELLE_ROLE, ROLES_EQUIPE, estRole, type OrigineMembre, type RoleEquipe } from "@/modules/projets/terrain-regles";

export interface MembreAffiche {
  id: string;
  nom: string;
  role: RoleEquipe;
  origine: OrigineMembre;
  detail: string | null;
  telephone: string | null;
  organisme: string | null;
  /** Un compte : il a l'interface terrain. */
  avecCompte: boolean;
}

export interface PersonnelAffiche {
  cle: string;
  nom: string;
  detail: string | null;
  pris: boolean;
  avecCompte: boolean;
}

/**
 * L'équipe d'un projet : qui l'exerce, qui le supervise. Le chef de projet
 * (ou l'encadrement) confie du personnel — interne, choisi dans la liste
 * complète, ou externe, enregistré sur place — et nomme le superviseur.
 */
export function EquipeProjet({ projetId, membres, personnel, peutGerer }: { projetId: string; membres: MembreAffiche[]; personnel: PersonnelAffiche[]; peutGerer: boolean }) {
  const superviseur = membres.find((m) => m.role === "superviseur");
  return (
    <section className="mb-6 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Équipe du projet</h2>
          <p className="text-xs text-[var(--encre-faible)]">
            {membres.length === 0
              ? "Personne n'est encore confié à ce projet."
              : `${membres.length} personne${membres.length > 1 ? "s" : ""} · ${libelleSuperviseur(superviseur)}`}
          </p>
        </div>
        {peutGerer && (
          <FormulaireRepliable libelle="Confier du personnel" titre="Confier du personnel au projet" action={(d) => confierMembre(projetId, d)} presentation="ample">
            <ChampsMembre personnel={personnel} aSuperviseur={Boolean(superviseur)} />
          </FormulaireRepliable>
        )}
      </div>

      {membres.length > 0 && (
        <ul className="divide-y divide-[var(--filet)] rounded-lg border border-[var(--filet)]">
          {membres.map((m) => (
            <LigneMembre key={m.id} projetId={projetId} m={m} peutGerer={peutGerer} />
          ))}
        </ul>
      )}
    </section>
  );
}

const libelleSuperviseur = (s: MembreAffiche | undefined) => (s ? `superviseur : ${s.nom}` : "pas de superviseur nommé");

function LigneMembre({ projetId, m, peutGerer }: { projetId: string; m: MembreAffiche; peutGerer: boolean }) {
  const op = useOperation();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{m.nom}</span>
        <span className="block text-xs text-[var(--encre-faible)]">
          {[m.detail, m.organisme, m.telephone].filter(Boolean).join(" · ") || (m.origine === "interne" ? "Personnel de l'entreprise" : "Externe")}
          {!m.avecCompte && " · sans compte : un agent relève pour lui"}
        </span>
      </span>
      <Pastille ton={m.origine === "interne" ? "marque" : "alerte"}>{m.origine === "interne" ? "Interne" : "Externe"}</Pastille>
      {peutGerer ? (
        <select
          value={m.role}
          disabled={op.enCours}
          aria-label={`Rôle de ${m.nom}`}
          onChange={(e) => estRole(e.target.value) && op.lancer(() => changerRoleMembre(projetId, m.id, e.target.value))}
          className={`${CLASSE_CHAMP_COMPACT} h-8 text-xs`}
        >
          {ROLES_EQUIPE.map((r) => (
            <option key={r} value={r}>
              {LIBELLE_ROLE[r]}
            </option>
          ))}
        </select>
      ) : (
        <Pastille ton={m.role === "superviseur" ? "valide" : "neutre"}>{LIBELLE_ROLE[m.role]}</Pastille>
      )}
      {peutGerer && (
        <button
          type="button"
          disabled={op.enCours}
          onClick={() => window.confirm(`Retirer ${m.nom} du projet ? Ses relevés restent.`) && op.lancer(() => retirerMembre(projetId, m.id))}
          className="text-xs font-semibold text-[var(--encre-faible)] hover:text-danger-600 hover:underline"
        >
          Retirer
        </button>
      )}
      {op.resultat && !op.resultat.ok && (
        <span className="basis-full">
          <Retour resultat={op.resultat} />
        </span>
      )}
    </li>
  );
}

function ChampsMembre({ personnel, aSuperviseur }: { personnel: PersonnelAffiche[]; aSuperviseur: boolean }) {
  const [origine, setOrigine] = useState<OrigineMembre>("interne");
  const [role, setRole] = useState<RoleEquipe>("agent");
  const [personne, setPersonne] = useState("");
  const choisie = personnel.find((p) => p.cle === personne);
  const externe = origine === "externe";
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">La personne est</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["interne", "Interne", "Du personnel de l'entreprise : on la choisit dans la liste."],
            ["externe", "Externe", "Sous-traitant, prestataire, apporteur : on l'enregistre ici."],
          ] as const).map(([valeur, titre, aide]) => (
            <label key={valeur} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${origine === valeur ? "border-marque-600 bg-[var(--surface-creuse)]" : "border-[var(--filet)]"}`}>
              <input type="radio" name="origine" value={valeur} checked={origine === valeur}
                onChange={() => {
                  setOrigine(valeur);
                  // Un externe n'a pas de compte : il ne peut pas superviser.
                  if (valeur === "externe") setRole("agent");
                }}
                className="mt-1 accent-marque-600"
              />
              <span>
                <span className="block text-sm font-semibold">{titre}</span>
                <span className="block text-xs text-[var(--encre-faible)]">{aide}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {externe ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ libelle="Nom et prénom">
            <input name="nom" required minLength={2} className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Téléphone">
            <input name="telephone" inputMode="tel" className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Structure">
            <input name="organisme" placeholder="Entreprise, cabinet, indépendant…" className={CLASSE_CHAMP} />
          </Champ>
        </div>
      ) : (
        <Champ libelle="Personnel" precision={choisie && !choisie.avecCompte ? "Sans compte : il n'aura pas d'interface, un agent relèvera pour lui." : undefined}>
          <select name="personne" required value={personne} onChange={(e) => setPersonne(e.target.value)} className={CLASSE_CHAMP}>
            <option value="" disabled>
              — Choisir dans le personnel —
            </option>
            {personnel.map((p) => (
              <option key={p.cle} value={p.cle} disabled={p.pris || (role === "superviseur" && !p.avecCompte)}>
                {p.nom}
                {p.detail ? ` — ${p.detail}` : ""}
                {p.pris ? " (déjà au projet)" : !p.avecCompte ? " (sans compte)" : ""}
              </option>
            ))}
          </select>
        </Champ>
      )}

      <Champ
        libelle="Rôle sur le projet"
        precision={
          role === "superviseur"
            ? aSuperviseur
              ? "Un seul superviseur : l'actuel passe agent."
              : "Il examine les relevés des agents, avec le chef de projet."
            : "L'agent exerce le projet et relève ce qu'il constate, avec photo et position GPS."
        }
      >
        <select name="role" value={role} onChange={(e) => estRole(e.target.value) && setRole(e.target.value)} className={CLASSE_CHAMP}>
          <option value="agent">Agent</option>
          {!externe && <option value="superviseur">Superviseur</option>}
        </select>
      </Champ>
    </div>
  );
}
