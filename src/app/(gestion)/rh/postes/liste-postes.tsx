"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { basculerPoste, renommerPoste } from "@/modules/personnes/actions-postes";
import { rangerPoste } from "@/modules/personnes/actions-services";
import type { LignePoste } from "@/modules/personnes/referentiel-postes";
import { LONGUEUR_MAX_POSTE } from "@/modules/personnes/postes";
import { Fenetre } from "@/components/ui/fenetre";

type ServiceChoix = { id: string; code: string; libelle: string };

/** Une ligne du référentiel : renommer sur place, ranger dans un service, retirer ou remettre. */
function LignePosteEditable({ poste, gerer, services }: { poste: LignePoste; gerer: boolean; services: ServiceChoix[] }) {
  const op = useOperation();
  const [enEdition, setEnEdition] = useState(false);
  const [libelle, setLibelle] = useState(poste.libelle);

  return (
    <tr className={poste.actif ? "" : "opacity-60"}>
      <Td fort>
        {poste.libelle}
        <Fenetre ouverte={enEdition} titre="Renommer le poste" onFermer={() => { setEnEdition(false); setLibelle(poste.libelle); }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              op.lancer(() => renommerPoste(poste.id, libelle), () => setEnEdition(false));
            }}
            className="space-y-4 px-5 py-4"
          >
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Nouveau nom du poste</span>
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              required
              autoFocus
              maxLength={LONGUEUR_MAX_POSTE}
              aria-label="Nouveau nom du poste"
              className={CLASSE_CHAMP}
            />
            </label>
            <div className="flex justify-end gap-2">
<button type="submit" disabled={op.enCours} className="text-sm font-semibold text-marque-600 hover:underline disabled:opacity-50">
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => {
                setEnEdition(false);
                setLibelle(poste.libelle);
              }}
              className="text-sm text-[var(--encre-faible)] hover:underline"
            >
              Annuler
            </button>
            </div>
          </form>
        </Fenetre>
        <Retour resultat={op.resultat} />
      </Td>
      <Td>
        {gerer ? (
          <select
            value={poste.serviceId ?? ""}
            disabled={op.enCours}
            onChange={(e) => op.lancer(() => rangerPoste(poste.id, e.target.value || null))}
            aria-label={`Service du poste ${poste.libelle}`}
            className={`${CLASSE_CHAMP_COMPACT} max-w-64`}
          >
            <option value="">— À ranger —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.libelle}
              </option>
            ))}
          </select>
        ) : (
          (services.find((s) => s.id === poste.serviceId)?.libelle ?? <span className="text-[var(--encre-faible)]">—</span>)
        )}
      </Td>
      <Td aligne="droite" chiffres>
        {poste.occupants}
      </Td>
      <Td>{poste.actif ? <Pastille ton="valide">Dans la liste</Pastille> : <Pastille ton="neutre">Retiré</Pastille>}</Td>
      {gerer && (
        <Td aligne="droite">
          <span className="flex justify-end gap-3 whitespace-nowrap">
            {!enEdition && poste.actif && (
              <button type="button" onClick={() => setEnEdition(true)} className="text-sm font-semibold text-marque-600 hover:underline">
                Renommer
              </button>
            )}
            <button
              type="button"
              disabled={op.enCours}
              onClick={() => op.lancer(() => basculerPoste(poste.id, !poste.actif))}
              className="text-sm text-[var(--encre-douce)] hover:underline disabled:opacity-50"
            >
              {poste.actif ? "Retirer" : "Remettre"}
            </button>
          </span>
        </Td>
      )}
    </tr>
  );
}

export function ListePostes({ postes, gerer, services }: { postes: LignePoste[]; gerer: boolean; services: ServiceChoix[] }) {
  return (
    <Tableau>
      <thead>
        <tr>
          <Th>Poste</Th>
          <Th>Service</Th>
          <Th aligne="droite">Collaborateurs</Th>
          <Th>État</Th>
          {gerer && <Th aligne="droite">Actions</Th>}
        </tr>
      </thead>
      <tbody>
        {postes.map((p) => (
          <LignePosteEditable key={p.id} poste={p} gerer={gerer} services={services} />
        ))}
      </tbody>
    </Tableau>
  );
}
