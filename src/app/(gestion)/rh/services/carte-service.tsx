"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ, Pastille } from "@/components/ui/primitives";
import { basculerService, modifierService } from "@/modules/personnes/actions-services";
import type { LigneService } from "@/modules/personnes/referentiel-services";
import { LISTE_POLES, LONGUEUR_MAX_CODE_SERVICE, LONGUEUR_MAX_SERVICE, POLES } from "@/modules/personnes/services";
import { Fenetre } from "@/components/ui/fenetre";

/** Un service : sigle, mission, postes rangés, effectif ; modifier ou retirer sur place. */
export function CarteService({ service: s, gerer }: { service: LigneService; gerer: boolean }) {
  const op = useOperation();
  const [edition, setEdition] = useState(false);

  return (
    <article className={`flex flex-col rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm ${s.actif ? "" : "opacity-60"}`}>
        <>
          <div className="flex items-start gap-3">
            <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg bg-marque-600/10 px-2 text-xs font-bold tracking-wide text-marque-600">{s.code}</span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold leading-tight">{s.libelle}</h3>
              <p className="mt-0.5 text-xs text-[var(--encre-douce)]">
                {s.effectif} collaborateur{s.effectif > 1 ? "s" : ""} · {s.postes.length} poste{s.postes.length > 1 ? "s" : ""}
              </p>
            </div>
            {!s.actif && <Pastille>Retiré</Pastille>}
          </div>
          {s.mission && <p className="mt-2 text-sm text-[var(--encre-douce)]">{s.mission}</p>}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {s.postes.length === 0 && <li className="text-xs text-[var(--encre-faible)]">Aucun poste rangé ici : choisissez le service d&apos;un poste dans l&apos;onglet Postes.</li>}
            {s.postes.map((p) => (
              <li key={p.id} className={`rounded-full bg-[var(--surface-creuse)] px-2.5 py-0.5 text-xs ${p.actif ? "" : "line-through opacity-60"}`}>
                {p.libelle}
              </li>
            ))}
          </ul>
          {gerer && (
            <div className="mt-auto flex justify-end gap-3 pt-3">
              {s.actif && (
                <button type="button" onClick={() => setEdition(true)} className="text-sm font-semibold text-marque-600 hover:underline">
                  Modifier
                </button>
              )}
              <button
                type="button"
                disabled={op.enCours}
                onClick={() => op.lancer(() => basculerService(s.id, !s.actif))}
                className="text-sm text-[var(--encre-douce)] hover:underline disabled:opacity-50"
              >
                {s.actif ? "Retirer" : "Remettre"}
              </button>
            </div>
          )}
        </>
      <Fenetre ouverte={edition} titre="Modifier le service" onFermer={() => setEdition(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            op.lancer(() => modifierService(s.id, donnees), () => setEdition(false));
          }}
          className="space-y-3 px-5 py-4"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
            <Champ libelle="Nom">
              <input name="libelle" required defaultValue={s.libelle} maxLength={LONGUEUR_MAX_SERVICE} className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Sigle">
              <input name="code" required defaultValue={s.code} maxLength={LONGUEUR_MAX_CODE_SERVICE} className={`${CLASSE_CHAMP} uppercase`} />
            </Champ>
          </div>
          <Champ libelle="Pôle">
            <select name="pole" defaultValue={s.pole} className={CLASSE_CHAMP}>
              {LISTE_POLES.map((p) => (
                <option key={p} value={p}>
                  {POLES[p].libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Mission">
            <textarea name="mission" rows={2} defaultValue={s.mission ?? ""} maxLength={300} className={`${CLASSE_CHAMP} h-auto py-2`} />
          </Champ>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEdition(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
              Annuler
            </button>
            <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
              Enregistrer
            </button>
          </div>
        </form>
      </Fenetre>
      <Retour resultat={op.resultat} />
    </article>
  );
}

/** Champs communs à l'ajout et à la modification d'un service. */
export function ChampsService({ valeurs }: { valeurs?: { libelle: string; code: string; pole: string; mission: string | null } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
      <Champ libelle="Nom du service">
        <input name="libelle" required defaultValue={valeurs?.libelle} maxLength={LONGUEUR_MAX_SERVICE} placeholder="Logistique" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Sigle">
        <input name="code" required defaultValue={valeurs?.code} maxLength={LONGUEUR_MAX_CODE_SERVICE} placeholder="LOG" className={`${CLASSE_CHAMP} uppercase`} />
      </Champ>
      <div className="sm:col-span-2">
        <Champ libelle="Pôle">
          <select name="pole" defaultValue={valeurs?.pole ?? "support"} className={CLASSE_CHAMP}>
            {LISTE_POLES.map((p) => (
              <option key={p} value={p}>
                {POLES[p].libelle}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <div className="sm:col-span-2">
        <Champ libelle="Mission" precision="Ce dont le service répond, en une phrase.">
          <textarea name="mission" rows={2} defaultValue={valeurs?.mission ?? ""} maxLength={300} className={`${CLASSE_CHAMP} h-auto py-2`} />
        </Champ>
      </div>
    </div>
  );
}
