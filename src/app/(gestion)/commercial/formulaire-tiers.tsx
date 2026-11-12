"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerTiers, type EtatTiers } from "@/modules/tiers/actions";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS } from "@/modules/tiers/natures";

/**
 * Création d'un tiers, dépliée sous l'en-tête plutôt que dans une fenêtre
 * modale.
 *
 * Une modale sur un téléphone d'entrée de gamme couvre l'écran, se ferme au
 * moindre retour arrière et fait perdre la saisie. Un panneau qui pousse la
 * liste vers le bas se scrolle, survit à la rotation, et laisse la liste
 * visible pendant qu'on vérifie qu'un client n'est pas déjà enregistré.
 */
export function FormulaireTiers({
  role,
}: {
  /** Le rôle prérempli, selon l'écran d'où l'on crée. */
  role: "client" | "fournisseur";
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action, enCours] = useActionState<EtatTiers, FormData>(
    creerTiers,
    {},
  );

  // Refermer une fois le tiers créé : la liste rechargée derrière porte déjà
  // la confirmation, un formulaire qui reste ouvert invite au doublon.
  //
  // L'ajustement se fait pendant le rendu, et non dans un effet. Un effet
  // rendrait d'abord le formulaire encore ouvert, puis le refermerait au
  // passage suivant — deux rendus et un clignotement pour une décision que
  // React sait prendre tout de suite.
  const [dernierCree, setDernierCree] = useState(etat.cree);
  if (etat.cree !== dernierCree) {
    setDernierCree(etat.cree);
    if (etat.cree) setOuvert(false);
  }

  const libelle = role === "client" ? "client" : "fournisseur";

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {etat.cree && (
          <span className="text-sm text-valide-600">
            {role === "client" ? "Client" : "Fournisseur"} {etat.cree} enregistré.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          Nouveau {libelle}
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mb-5 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Nouveau {libelle}</h2>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Annuler
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Nom">
          <input
            name="nom"
            autoFocus
            required
            placeholder={role === "client" ? "Pharmacie du Plateau" : "Nestlé CI"}
            className={CLASSE_CHAMP}
          />
        </Champ>

        <Champ libelle={role === "client" ? "Type de client" : "Nature"}>
          <select name="nature" defaultValue="entreprise" className={CLASSE_CHAMP}>
            {NATURES_TIERS.map((n) => (
              <option key={n} value={n}>
                {LIBELLE_NATURE_TIERS[n]}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="Téléphone">
          <input
            name="telephone"
            inputMode="tel"
            placeholder="+225 07 00 00 00 00"
            className={CLASSE_CHAMP}
          />
        </Champ>

        <Champ libelle="E-mail">
          <input name="email" type="email" className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle="Ville">
          <input name="ville" placeholder="Abidjan" className={CLASSE_CHAMP} />
        </Champ>

        {/* Le libellé de l'identifiant fiscal suit le pays de l'entreprise.
            « NCC » ici parce que la Côte d'Ivoire est le marché de départ,
            jamais parce qu'il serait figé dans le produit. */}
        <Champ libelle="N° compte contribuable" precision="Identifiant fiscal (NCC)">
          <input
            name="identifiantFiscal"
            placeholder="CI-2020-0000000 A"
            className={CLASSE_CHAMP}
          />
        </Champ>

        <Champ libelle="Secteur">
          <input
            name="secteur"
            placeholder={role === "client" ? "Pharmacie" : "Alimentaire"}
            className={CLASSE_CHAMP}
          />
        </Champ>

        {role === "client" ? (
          <>
            <Champ
              libelle="Encours autorisé"
              precision="Zéro = paiement comptant, le cas par défaut."
            >
              <input
                name="plafondEncours"
                inputMode="numeric"
                defaultValue="0"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>
            <Champ libelle="Délai de règlement" precision="En jours.">
              <input
                name="delaiReglementJours"
                inputMode="numeric"
                defaultValue="0"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>
          </>
        ) : (
          <Champ
            libelle="Délai de livraison"
            precision="En jours. Sert au calcul du réapprovisionnement."
          >
            <input
              name="delaiLivraisonJours"
              inputMode="numeric"
              defaultValue="0"
              className={`${CLASSE_CHAMP} chiffres`}
            />
          </Champ>
        )}
      </div>

      {/* Les deux rôles sont indépendants : le grossiste qui livre la boutique
          lui rachète parfois ses invendus. Une seule fiche, deux comptes. */}
      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-medium">Rôles</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="estClient"
              defaultChecked={role === "client"}
              className="size-4 accent-marque-600"
            />
            Client — compte 411
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="estFournisseur"
              defaultChecked={role === "fournisseur"}
              className="size-4 accent-marque-600"
            />
            Fournisseur — compte 401
          </label>
        </div>
      </fieldset>

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
          {enCours ? "Enregistrement…" : `Enregistrer le ${libelle}`}
        </button>
      </div>
    </form>
  );
}
