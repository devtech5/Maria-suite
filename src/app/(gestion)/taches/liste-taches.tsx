"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Pastille, type TonPastille } from "@/components/ui/primitives";
import { correspond } from "@/components/ui/recherche";
import { agirSurTache, modifierTache } from "@/modules/taches/actions";
import {
  comparerTaches,
  gestesPossibles,
  joursAvantEcheance,
  LIBELLE_PRIORITE,
  LIBELLE_STATUT,
  type Geste,
  type Priorite,
  type Statut,
} from "@/modules/taches/calcul";

import { ChampsTache, valeurExecutant, type Salarie } from "./champs-tache";

export interface TacheAffichee {
  id: string;
  numero: string;
  titre: string;
  description: string | null;
  priorite: Priorite;
  statut: Statut;
  echeance: string | null;
  creeParUserId: string;
  createur: string;
  assigneeUserId: string;
  assigneeEmployeId: string | null;
  assignee: string;
  /** Salarié sans compte : l'auteur suit la tâche pour lui. */
  sansCompte: boolean;
  creeLeIso: string;
  termineeLeIso: string | null;
  terminateur: string | null;
  compteRendu: string | null;
  motifAnnulation: string | null;
}

const TON_PRIORITE: Record<Priorite, TonPastille> = { urgente: "danger", haute: "alerte", normale: "neutre", basse: "neutre" };
const TON_STATUT: Record<Statut, TonPastille> = { a_faire: "neutre", en_cours: "marque", terminee: "valide", annulee: "danger" };
const LIBELLE_GESTE: Record<Geste, string> = { demarrer: "Commencer", terminer: "Terminer", rouvrir: "Rouvrir", annuler: "Annuler" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function echeanceLisible(echeance: string, jours: number | null): { texte: string; ton: TonPastille } {
  const date = JOUR.format(new Date(`${echeance}T00:00:00Z`));
  if (jours === null) return { texte: `Pour le ${date}`, ton: "neutre" };
  if (jours < 0) return { texte: `En retard de ${-jours} j (${date})`, ton: "danger" };
  if (jours === 0) return { texte: "Pour aujourd'hui", ton: "alerte" };
  if (jours === 1) return { texte: "Pour demain", ton: "alerte" };
  return { texte: `Pour le ${date}`, ton: "neutre" };
}

type Filtre = "ouvertes" | Statut;

/**
 * Liste de tâches. Le geste se fait sur place : commencer, terminer avec un
 * compte rendu, annuler avec un motif, rouvrir. Le serveur revérifie qui a le
 * droit de quoi ; l'écran ne propose que ce qui passera.
 */
export function ListeTaches({
  taches,
  moi,
  attribue,
  personnel,
  aujourdhui,
  montrerAssignee,
}: {
  taches: TacheAffichee[];
  moi: string;
  attribue: boolean;
  personnel: Salarie[];
  /** Jour ISO du serveur : le retard se juge à la même date pour tout le monde. */
  aujourdhui: string;
  montrerAssignee: boolean;
}) {
  const [filtre, setFiltre] = useState<Filtre>("ouvertes");
  const [recherche, setRecherche] = useState("");
  const [saisie, setSaisie] = useState<{ id: string; geste: "terminer" | "annuler"; texte: string } | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const compte = (f: Filtre) =>
    taches.filter((t) => (f === "ouvertes" ? t.statut === "a_faire" || t.statut === "en_cours" : t.statut === f)).length;

  const visibles = taches
    .filter((t) => (filtre === "ouvertes" ? t.statut === "a_faire" || t.statut === "en_cours" : t.statut === filtre))
    .filter((t) => correspond(recherche, [t.titre, t.numero, t.description, t.assignee, t.createur]))
    .sort((a, b) => comparerTaches({ ...a, creeLe: a.creeLeIso }, { ...b, creeLe: b.creeLeIso }));

  function lancer(action: () => Promise<Resultat>) {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok) {
        setSaisie(null);
        setEdition(null);
      }
      routeur.refresh();
    });
  }

  function geste(t: TacheAffichee, g: Geste) {
    if (g === "terminer" || g === "annuler") setSaisie({ id: t.id, geste: g, texte: "" });
    else lancer(() => agirSurTache(t.id, g));
  }

  const filtres: Filtre[] = ["ouvertes", "terminee", "annulee"];

  return (
    <div>
      <div className="mb-3 space-y-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une tâche, une personne…"
          aria-label="Rechercher une tâche"
          className={CLASSE_CHAMP}
        />
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {filtres.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltre(f)}
              aria-pressed={filtre === f}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
                filtre === f ? "bg-marque-600 text-white" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"
              }`}
            >
              {f === "ouvertes" ? "À faire et en cours" : `${LIBELLE_STATUT[f]}s`} ({compte(f)})
            </button>
          ))}
        </div>
      </div>

      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">
          {filtre === "ouvertes" ? "Rien à faire pour l'instant." : "Aucune tâche ici."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {visibles.map((t) => {
            const jours = joursAvantEcheance(t.echeance, t.statut, aujourdhui);
            const gestes = gestesPossibles(t.statut, t, { userId: moi, attribue });
            const modifiable = (attribue || t.creeParUserId === moi) && (t.statut === "a_faire" || t.statut === "en_cours");
            const close = t.statut === "terminee" || t.statut === "annulee";
            return (
              <li key={t.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-sm font-semibold ${close ? "text-[var(--encre-faible)] line-through decoration-1" : ""}`}>
                        {t.titre}
                      </span>
                      <Pastille ton={TON_STATUT[t.statut]}>{LIBELLE_STATUT[t.statut]}</Pastille>
                      {t.priorite !== "normale" && <Pastille ton={TON_PRIORITE[t.priorite]}>{LIBELLE_PRIORITE[t.priorite]}</Pastille>}
                      {t.echeance && !close && (
                        <Pastille ton={echeanceLisible(t.echeance, jours).ton}>{echeanceLisible(t.echeance, jours).texte}</Pastille>
                      )}
                    </p>
                    <p className="chiffres mt-0.5 text-xs text-[var(--encre-faible)]">
                      {t.numero}
                      {montrerAssignee || t.assigneeUserId !== moi || t.sansCompte
                        ? ` · pour ${t.assigneeUserId === moi && !t.sansCompte ? "moi" : t.assignee}`
                        : ""}
                      {t.sansCompte && " (sans compte, suivie par son auteur)"}
                      {t.creeParUserId !== t.assigneeUserId && ` · confiée par ${t.creeParUserId === moi ? "moi" : t.createur}`}
                      {` · créée le ${MOMENT.format(new Date(t.creeLeIso))}`}
                    </p>
                    {t.description && <p className="mt-1 whitespace-pre-line text-sm text-[var(--encre-douce)]">{t.description}</p>}
                    {t.statut === "terminee" && (
                      <p className="mt-1 text-xs text-valide-600">
                        Terminée{t.terminateur ? ` par ${t.terminateur}` : ""}
                        {t.termineeLeIso ? ` le ${MOMENT.format(new Date(t.termineeLeIso))}` : ""}
                        {t.compteRendu ? ` — ${t.compteRendu}` : ""}
                      </p>
                    )}
                    {t.statut === "annulee" && t.motifAnnulation && (
                      <p className="mt-1 text-xs text-danger-600">Annulée — {t.motifAnnulation}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {gestes.map((g) => (
                      <button
                        key={g}
                        type="button"
                        disabled={enCours}
                        onClick={() => geste(t, g)}
                        className={
                          g === "terminer"
                            ? "rounded-lg bg-valide-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            : g === "demarrer"
                              ? "rounded-lg bg-marque-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              : g === "annuler"
                                ? "rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                                : "rounded-lg border border-[var(--filet)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
                        }
                      >
                        {LIBELLE_GESTE[g]}
                      </button>
                    ))}
                    {modifiable && edition !== t.id && (
                      <button
                        type="button"
                        onClick={() => setEdition(t.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
                      >
                        {attribue ? "Modifier ou réattribuer" : "Modifier"}
                      </button>
                    )}
                  </div>
                </div>

                {saisie?.id === t.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      lancer(() => agirSurTache(t.id, saisie.geste, saisie.texte));
                    }}
                    className={`mt-3 rounded-lg border p-3 ${
                      saisie.geste === "annuler" ? "border-danger-500/40 bg-danger-50" : "border-valide-500/40 bg-valide-50"
                    }`}
                  >
                    <div className="flex flex-wrap gap-2">
                      <input
                        autoFocus
                        value={saisie.texte}
                        onChange={(e) => setSaisie({ ...saisie, texte: e.target.value })}
                        placeholder={saisie.geste === "annuler" ? "Motif de l'annulation" : "Compte rendu : ce qui a été fait (facultatif)"}
                        aria-label={saisie.geste === "annuler" ? "Motif de l'annulation" : "Compte rendu"}
                        className={`${CLASSE_CHAMP} min-w-0 flex-1`}
                      />
                      <button
                        type="submit"
                        disabled={enCours || (saisie.geste === "annuler" && saisie.texte.trim().length < 3)}
                        className={`h-cible rounded-lg px-3.5 text-sm font-semibold text-white disabled:opacity-50 ${
                          saisie.geste === "annuler" ? "bg-danger-500" : "bg-valide-500"
                        }`}
                      >
                        {saisie.geste === "annuler" ? "Annuler la tâche" : "Marquer terminée"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSaisie(null)}
                        className="h-cible rounded-lg px-3 text-sm text-[var(--encre-faible)] hover:underline"
                      >
                        Retour
                      </button>
                    </div>
                  </form>
                )}

                {edition === t.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const donnees = new FormData(e.currentTarget);
                      lancer(() => modifierTache(t.id, donnees));
                    }}
                    className="mt-3 rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)] p-3"
                  >
                    <ChampsTache
                      personnel={personnel}
                      moi={moi}
                      attribue={attribue}
                      initial={{
                        titre: t.titre,
                        description: t.description,
                        priorite: t.priorite,
                        echeance: t.echeance,
                        executant: valeurExecutant(t, moi),
                        executantNom: t.assignee,
                      }}
                    />
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => setEdition(null)} className="h-cible rounded-lg px-3 text-sm text-[var(--encre-faible)] hover:underline">
                        Retour
                      </button>
                      <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
                        Enregistrer
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
