import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { LIBELLE_PRIORITE, type Priorite } from "@/modules/taches/calcul";

import type { PersonnePossible } from "./types";

/** Un collaborateur du Personnel, avec sa fonction. */
export interface Salarie {
  id: string;
  nom: string;
  poste: string;
  userId: string | null;
}

/**
 * Exécutant tel que le formulaire l'envoie : vide pour soi, `e:<collaborateur>`
 * pour le Personnel, `u:<compte>` pour une tâche d'avant le Personnel.
 */
export function valeurExecutant(t: { assigneeEmployeId: string | null; assigneeUserId: string }, moi: string): string {
  if (t.assigneeEmployeId) return `e:${t.assigneeEmployeId}`;
  return t.assigneeUserId === moi ? "" : `u:${t.assigneeUserId}`;
}

/**
 * Champs d'une tâche, pour la créer comme pour la modifier.
 *
 * L'exécutant se choisit dans le Personnel, avec sa fonction. Sans le droit
 * d'attribuer, pas de choix : la tâche est pour soi.
 */
export function ChampsTache({
  personnel,
  moi,
  attribue,
  initial,
  personnesPossibles,
}: {
  personnel: Salarie[];
  moi: string;
  attribue: boolean;
  /** À la création seulement : les intervenants se cochent d'emblée. Ensuite, ils se gèrent dans la cellule. */
  personnesPossibles?: PersonnePossible[];
  initial?: {
    titre: string;
    description: string | null;
    priorite: Priorite;
    echeance: string | null;
    dateDebut: string | null;
    executant: string;
    /** Nom de l'exécutant actuel, s'il n'est plus dans la liste. */
    executantNom: string;
  };
}) {
  const libelle = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";
  // Soi-même en tête : sa propre fiche du Personnel, si on en a une.
  const monSalarie = personnel.find((p) => p.userId === moi);
  const valeurMoi = monSalarie ? `e:${monSalarie.id}` : "";
  const autres = personnel.filter((p) => p !== monSalarie);
  const actuel = initial?.executant ?? valeurMoi;
  const horsListe = actuel !== "" && actuel !== valeurMoi && !autres.some((p) => `e:${p.id}` === actuel);
  return (
    <div className="space-y-3">
      <label className="block">
        <span className={libelle}>Ce qu&apos;il faut faire</span>
        <input
          name="titre"
          required
          minLength={3}
          maxLength={160}
          defaultValue={initial?.titre}
          placeholder="Relancer le client Kouassi, inventaire du rayon peinture…"
          className={CLASSE_CHAMP}
        />
      </label>
      <label className="block">
        <span className={libelle}>Précisions</span>
        <textarea
          name="description"
          maxLength={2000}
          rows={2}
          defaultValue={initial?.description ?? ""}
          className={`${CLASSE_CHAMP} h-auto py-2`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={libelle}>Priorité</span>
          <select name="priorite" defaultValue={initial?.priorite ?? "normale"} className={CLASSE_CHAMP}>
            {(Object.keys(LIBELLE_PRIORITE) as Priorite[]).map((p) => (
              <option key={p} value={p}>
                {LIBELLE_PRIORITE[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={libelle}>Début prévu</span>
          <input type="date" name="dateDebut" defaultValue={initial?.dateDebut ?? ""} className={CLASSE_CHAMP} />
        </label>
        <label className="block">
          <span className={libelle}>Échéance</span>
          <input type="date" name="echeance" defaultValue={initial?.echeance ?? ""} className={CLASSE_CHAMP} />
        </label>
        {attribue ? (
          <label className="block">
            <span className={libelle}>Exécutée par</span>
            <select name="executant" defaultValue={actuel} className={CLASSE_CHAMP}>
              <option value={valeurMoi}>Moi</option>
              {horsListe && <option value={actuel}>{initial?.executantNom}</option>}
              {autres.map((p) => (
                <option key={p.id} value={`e:${p.id}`}>
                  {p.nom} — {p.poste}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="executant" value={initial?.executant ?? ""} />
        )}
      </div>
      {personnesPossibles && personnesPossibles.length > 0 && (
        <fieldset>
          <legend className={libelle}>Intervenants (facultatif) — ceux qui y travaillent avec le responsable</legend>
          <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--filet)] p-1.5">
            {(["collaborateur", "intervenant"] as const).map((nature) => {
              const liste = personnesPossibles.filter((p) => p.nature === nature);
              if (liste.length === 0) return null;
              return (
                <div key={nature}>
                  <p className="px-1.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--encre-faible)]">
                    {nature === "collaborateur" ? "Collaborateurs" : "Intervenants"}
                  </p>
                  {liste.map((p) => (
                    <label key={p.ref} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--surface-creuse)]">
                      <input type="checkbox" name="intervenants" value={p.ref} className="size-4" />
                      <span className="font-medium">{p.nom}</span>
                      {p.detail && <span className="text-xs text-[var(--encre-faible)]">{p.detail}</span>}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
