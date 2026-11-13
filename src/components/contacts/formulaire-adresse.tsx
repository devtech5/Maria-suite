"use client";

import { useState } from "react";

import { Fenetre } from "@/components/ui/fenetre";
import { Retour, useOperation, FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { affecterAdresse, basculerAdresse, enregistrerAdresse, retirerAdresse } from "@/modules/contacts/actions";
import { DOMAINE_AUTORISE } from "@/lib/auth/identifiants";
import type { LigneAdresse } from "@/modules/contacts/regles";

import { ChampsAffectation, type CollaborateurChoisi, type ServiceChoisi } from "./champs-affectation";

interface Choix {
  services: ServiceChoisi[];
  collaborateurs: CollaborateurChoisi[];
}

function ChampsAdresse({ a, choix }: { a?: LigneAdresse; choix: Choix }) {
  return (
    <div className="space-y-3">
      <Champ libelle="Adresse e-mail" precision={`Du domaine @${DOMAINE_AUTORISE} : aucune autre n'est admise.`}>
        <input name="adresse" type="email" required defaultValue={a?.adresse} placeholder={`prenom.nom@${DOMAINE_AUTORISE}`} className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="À quoi elle sert (facultatif)">
        <input name="libelle" maxLength={120} defaultValue={a?.libelle ?? ""} placeholder="Boîte de la comptabilité, contact clients…" className={CLASSE_CHAMP} />
      </Champ>
      <ChampsAffectation services={choix.services} collaborateurs={choix.collaborateurs} serviceId={a?.serviceId} employeeId={a?.employeeId} />
    </div>
  );
}

/** « Nouvelle adresse » : une modale, le service puis la personne. */
export function NouvelleAdresse({ choix }: { choix: Choix }) {
  return (
    <FormulaireRepliable libelle="Nouvelle adresse" titre="Nouvelle adresse professionnelle" action={enregistrerAdresse}>
      <ChampsAdresse choix={choix} />
    </FormulaireRepliable>
  );
}

/** Ce qu'on fait d'une adresse de la liste : l'affecter, la modifier, la fermer, la retirer. */
export function ActionsAdresse({ adresse: a, choix }: { adresse: LigneAdresse; choix: Choix }) {
  const op = useOperation();
  const [fenetre, setFenetre] = useState<"affecter" | "modifier" | null>(null);

  const formulaire = (action: (d: FormData) => Promise<{ ok: boolean; message: string }>, enfants: React.ReactNode, libelle: string) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => action(d), () => setFenetre(null));
      }}
      className="space-y-4 px-5 py-4"
    >
      {enfants}
      <Retour resultat={op.resultat} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setFenetre(null)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
          Annuler
        </button>
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          {libelle}
        </button>
      </div>
    </form>
  );

  const lien = "text-sm font-semibold text-marque-600 hover:underline disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <button type="button" onClick={() => setFenetre("affecter")} className={lien}>
        Affecter
      </button>
      <button type="button" onClick={() => setFenetre("modifier")} className={lien}>
        Modifier
      </button>
      <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => basculerAdresse(a.id, !a.actif))} className={lien}>
        {a.actif ? "Fermer" : "Rouvrir"}
      </button>
      <button
        type="button"
        disabled={op.enCours}
        onClick={() => {
          if (window.confirm(`Retirer ${a.adresse} de l'annuaire ?`)) op.lancer(() => retirerAdresse(a.id));
        }}
        className="text-sm font-semibold text-danger-600 hover:underline disabled:opacity-50"
      >
        Retirer
      </button>

      <Fenetre ouverte={fenetre === "affecter"} titre="Affecter l'adresse" sousTitre={a.adresse} onFermer={() => setFenetre(null)}>
        {formulaire((d) => affecterAdresse(a.id, d), <ChampsAffectation services={choix.services} collaborateurs={choix.collaborateurs} serviceId={a.serviceId} employeeId={a.employeeId} />, "Affecter")}
      </Fenetre>
      <Fenetre ouverte={fenetre === "modifier"} titre="Modifier l'adresse" sousTitre={a.adresse} onFermer={() => setFenetre(null)}>
        {formulaire(
          enregistrerAdresse,
          <>
            <input type="hidden" name="id" value={a.id} />
            <ChampsAdresse a={a} choix={choix} />
          </>,
          "Enregistrer",
        )}
      </Fenetre>
      {op.resultat && !op.resultat.ok && fenetre === null && <Retour resultat={op.resultat} />}
    </div>
  );
}
