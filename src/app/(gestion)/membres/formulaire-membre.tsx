"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import type { RoleAttribuable } from "@/lib/auth/membres";
import { ajouterMembre, type EtatMembre } from "./actions";
import { MotDePasseRemis } from "./mot-de-passe-remis";

/**
 * Ouverture d'un accès.
 *
 * Trois champs, pas davantage : le nom, l'adresse e-mail, le rôle. Tout le reste —
 * poste, contrat, salaire — relève du personnel, pas du compte de connexion,
 * et le demander ici laisserait croire que créer un accès, c'est embaucher.
 */
export function FormulaireMembre({ roles }: { roles: RoleAttribuable[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action, enCours] = useActionState<EtatMembre, FormData>(
    ajouterMembre,
    {},
  );

  // Le rôle retenu est suivi ici pour que sa description accompagne le choix :
  // « Caissier » ou « Magasinier » ne dit pas ce que le rôle ouvre, et c'est
  // pourtant la seule chose que le gérant a besoin de savoir à cet instant.
  const [choisi, setChoisi] = useState<string | undefined>(undefined);
  const [dernierAjout, setDernierAjout] = useState(etat);
  const [remis, setRemis] = useState<EtatMembre | null>(null);
  if (etat !== dernierAjout) {
    setDernierAjout(etat);
    if (etat.ajoute) {
      setOuvert(false);
      if (etat.motDePasse) setRemis(etat);
    }
  }

  // Sans rôle à donner, il n'y a pas d'accès à ouvrir : un compte sans rôle
  // n'ouvrirait aucun écran. Le dire vaut mieux qu'un formulaire dont la liste
  // déroulante est vide.
  if (roles.length === 0) {
    return (
      <p className="text-sm text-[var(--encre-douce)]">
        Aucun rôle à attribuer pour l&apos;instant.
      </p>
    );
  }

  // Pas de bandeau de confirmation, contrairement aux autres formulaires de
  // l'application : la personne ajoutée apparaît aussitôt dans le tableau,
  // avec son nom et son numéro. Un message en plus survivrait aux gestes
  // suivants et finirait par annoncer « peut désormais se connecter » à côté
  // d'une ligne qu'on vient de suspendre.
  if (!ouvert) {
    if (remis?.motDePasse && remis.email && remis.ajoute) {
      return (
        <MotDePasseRemis
          nom={remis.ajoute}
          email={remis.email}
          motDePasse={remis.motDePasse}
          onFermer={() => setRemis(null)}
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
      >
        Donner un accès
      </button>
    );
  }

  // Le caissier d'abord : c'est l'accès le plus souvent ouvert, et le plus
  // étroit. Élargir se fait alors en connaissance de cause, alors qu'un rôle
  // trop large proposé par défaut ne se remarque qu'au moment du dégât.
  const parDefaut = roles.find((role) => role.cle === "caissier") ?? roles[0];
  const retenu = roles.find((role) => role.id === choisi) ?? parDefaut;

  return (
    <form
      action={action}
      className="mb-5 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 text-left"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Nouvel accès</h2>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Annuler
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Champ libelle="Nom">
          <input
            name="nom"
            autoFocus
            required
            placeholder="Awa Koné"
            className={CLASSE_CHAMP}
          />
        </Champ>

        <Champ
          libelle="Adresse e-mail"
          precision="C'est avec elle qu'elle se connectera. Seules les adresses @maria-groupe.com sont admises."
        >
          <input
            name="email"
            type="email"
            required
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="awa.kone@maria-groupe.com"
            className={CLASSE_CHAMP}
          />
        </Champ>

        <Champ libelle="Rôle" precision={retenu?.description ?? undefined}>
          <select
            name="roleId"
            value={retenu?.id}
            onChange={(evenement) => setChoisi(evenement.target.value)}
            className={CLASSE_CHAMP}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.nom}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      {etat.erreur && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
        >
          {etat.erreur}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={enCours}
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Ouvrir l'accès"}
        </button>
      </div>
    </form>
  );
}
