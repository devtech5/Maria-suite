"use client";

import { useState, type ReactNode } from "react";

import type { Resultat } from "@/components/ui/operations";
import { modifierTache } from "@/modules/taches/actions";
import { LIBELLE_PRIORITE, LIBELLE_STATUT } from "@/modules/taches/calcul";
import { COULEUR_PRIORITE, COULEUR_STATUT } from "@/modules/taches/vues";

import { ChampsTache, valeurExecutant } from "./champs-tache";
import { CelluleChamp } from "./colonnes-ui";
import { CelluleIntervenants } from "./intervenants-ui";
import { useTaches } from "./contexte";
import { Avatar, depuis, jourLong, LIBELLE_GESTE, TexteEcheance } from "./elements";
import type { TacheAffichee } from "./types";

const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });

/**
 * La fiche d'une tâche, ouverte depuis n'importe quelle vue : tout ce qu'on
 * sait d'elle, ses gestes, et le formulaire pour la modifier ou la réattribuer.
 */
export function FicheTache({ tache: t, lancer }: { tache: TacheAffichee; lancer: (action: () => Promise<Resultat>, apres?: () => void) => void }) {
  const { moi, attribue, personnel, aujourdhui, maintenantIso, enCours, gestes, geste, modifiable, colonnes } = useTaches();
  const [edition, setEdition] = useState(false);
  const possibles = gestes(t);

  if (edition) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const donnees = new FormData(e.currentTarget);
          lancer(() => modifierTache(t.id, donnees), () => setEdition(false));
        }}
        className="px-5 py-4"
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
            dateDebut: t.dateDebut,
            executant: valeurExecutant(t, moi),
            executantNom: t.assignee,
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setEdition(false)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
            Retour
          </button>
          <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
            Enregistrer
          </button>
        </div>
      </form>
    );
  }

  const ligne = (libelle: string, valeur: ReactNode, cle?: string) => (
    <div key={cle ?? libelle} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 border-b border-[var(--filet)] py-2.5 text-sm last:border-0">
      <dt className="text-[var(--encre-faible)]">{libelle}</dt>
      <dd className="min-w-0">{valeur}</dd>
    </div>
  );

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ background: COULEUR_STATUT[t.statut] }}>
          {LIBELLE_STATUT[t.statut]}
        </span>
        <span className="rounded-md px-3 py-1.5 text-sm font-semibold text-white" style={{ background: COULEUR_PRIORITE[t.priorite] }}>
          Priorité {LIBELLE_PRIORITE[t.priorite].toLowerCase()}
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {possibles.map((g) => (
            <button
              key={g}
              type="button"
              disabled={enCours}
              onClick={() => geste(t, g)}
              className={
                g === "terminer"
                  ? "h-cible rounded-lg bg-valide-500 px-3.5 text-sm font-semibold text-white disabled:opacity-50"
                  : g === "demarrer"
                    ? "h-cible rounded-lg bg-[#fdab3d] px-3.5 text-sm font-semibold text-white disabled:opacity-50"
                    : g === "annuler"
                      ? "h-cible rounded-lg px-3 text-sm font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                      : "h-cible rounded-lg border border-[var(--filet)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
              }
            >
              {LIBELLE_GESTE[g]}
            </button>
          ))}
          {modifiable(t) && (
            <button
              type="button"
              onClick={() => setEdition(true)}
              className="h-cible rounded-lg border border-[var(--filet)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
            >
              {attribue ? "Modifier ou réattribuer" : "Modifier"}
            </button>
          )}
        </span>
      </div>

      {t.description && <p className="whitespace-pre-line rounded-lg bg-[var(--surface-creuse)] p-3 text-sm">{t.description}</p>}

      <dl>
        {ligne(
          "Responsable",
          <span className="flex items-center gap-2">
            <Avatar nom={t.assignee} taille={24} sansCompte={t.sansCompte} />
            {t.assigneeUserId === moi && !t.sansCompte ? "Moi" : t.assignee}
            {t.sansCompte && <span className="text-xs text-[var(--encre-faible)]">(sans compte, suivie par son auteur)</span>}
          </span>,
        )}
        {ligne(
          "Intervenants",
          <span className="flex flex-wrap items-center gap-2">
            {t.intervenants.map((i) => (
              <span key={i.ref} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-creuse)] py-0.5 pl-0.5 pr-2.5 text-xs">
                <Avatar nom={i.nom} taille={20} />
                {i.nom}
                {i.detail && <span className="text-[var(--encre-faible)]">· {i.detail}</span>}
              </span>
            ))}
            {modifiable(t) ? (
              <span className="inline-block h-8 rounded-full border border-dashed border-[var(--filet)]">
                <CelluleIntervenants t={t} />
              </span>
            ) : (
              t.intervenants.length === 0 && "—"
            )}
          </span>,
        )}
        {t.creeParUserId !== t.assigneeUserId && ligne("Confiée par", t.creeParUserId === moi ? "Moi" : t.createur)}
        {ligne("Début prévu", t.dateDebut ? jourLong(t.dateDebut) : "—")}
        {ligne(
          "Échéance",
          t.echeance ? (
            <span className="flex flex-wrap items-center gap-2">
              <TexteEcheance t={t} aujourdhui={aujourdhui} />
              <span className="text-[var(--encre-faible)]">{jourLong(t.echeance)}</span>
            </span>
          ) : (
            "—"
          ),
        )}
        {ligne("Créée", MOMENT.format(new Date(t.creeLeIso)))}
        {ligne("Mise à jour", depuis(t.majLeIso, maintenantIso))}
        {t.statut === "terminee" &&
          ligne(
            "Terminée",
            <>
              {t.terminateur ? `Par ${t.terminateur}` : ""}
              {t.termineeLeIso ? ` le ${MOMENT.format(new Date(t.termineeLeIso))}` : ""}
              {t.compteRendu && <p className="mt-1 whitespace-pre-line text-[var(--encre-douce)]">{t.compteRendu}</p>}
            </>,
          )}
        {t.statut === "annulee" && t.motifAnnulation && ligne("Motif d'annulation", <span className="text-danger-600">{t.motifAnnulation}</span>)}
        {colonnes.map((c) =>
          ligne(
            c.libelle,
            <span className="flex h-9 max-w-[18rem] items-stretch overflow-hidden rounded bg-[var(--surface-creuse)]">
              <CelluleChamp t={t} colonne={c} />
            </span>,
            c.id,
          ),
        )}
      </dl>
    </div>
  );
}
