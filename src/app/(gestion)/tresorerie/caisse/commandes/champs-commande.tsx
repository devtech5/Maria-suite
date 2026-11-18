"use client";

import { CLASSE_CHAMP } from "@/components/ui/primitives";
import type { LigneCommandeInterne } from "@/modules/tresorerie/commandes-internes";
import type { FicheProposee } from "@/modules/tresorerie/requetes";

import { libelleChamp } from "../../champs";
import { ChoixBeneficiaire } from "../choix-beneficiaire";
import { LignesCommande } from "./lignes-commande";

/** Ce qu'un bon porte déjà, quand on le modifie. */
export interface ValeursCommande {
  objet: string;
  service: string | null;
  beneficiaireRef: string | null;
  beneficiaire: string | null;
  notes: string | null;
  lignes: LigneCommandeInterne[];
}

export interface ChoixCommande {
  services: string[];
  groupes: { libelle: string; fiches: FicheProposee[] }[];
}

/**
 * Les champs d'un bon de commande interne : les mêmes à la demande et à la
 * modification, pour que le serveur relise l'un et l'autre de la même façon.
 */
export function ChampsCommande({ choix, valeurs }: { choix: ChoixCommande; valeurs?: ValeursCommande }) {
  // Un service retiré du référentiel depuis la demande reste proposé, sinon il se perdrait en silence.
  const services = valeurs?.service && !choix.services.includes(valeurs.service) ? [...choix.services, valeurs.service] : choix.services;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={libelleChamp}>Objet</span>
          <input
            name="objet"
            required
            minLength={3}
            maxLength={200}
            defaultValue={valeurs?.objet}
            placeholder="Équipement — ordinateurs, téléphones et flotte Orange"
            className={CLASSE_CHAMP}
          />
        </label>
        <ChoixBeneficiaire
          libelle="Bénéficiaire"
          libelleNom="Nom et prénom du bénéficiaire"
          groupes={choix.groupes}
          exemple="Kouassi Aya"
          initiale={valeurs ? { ref: valeurs.beneficiaireRef, nom: valeurs.beneficiaire } : undefined}
        />
        <label className="block">
          <span className={libelleChamp}>Service demandeur (facultatif)</span>
          {services.length > 0 ? (
            <select name="service" defaultValue={valeurs?.service ?? ""} className={CLASSE_CHAMP}>
              <option value="">Aucun</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input name="service" maxLength={120} defaultValue={valeurs?.service ?? undefined} className={CLASSE_CHAMP} />
          )}
        </label>
      </div>
      <div className="mt-4">
        <LignesCommande initiales={valeurs?.lignes} />
      </div>
      <label className="mt-3 block">
        <span className={libelleChamp}>Observations (facultatif)</span>
        <textarea name="notes" rows={2} maxLength={1000} defaultValue={valeurs?.notes ?? undefined} className={CLASSE_CHAMP} />
      </label>
    </>
  );
}
