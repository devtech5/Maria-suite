import type { Metadata } from "next";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { ajouterPoste } from "@/modules/personnes/actions-postes";
import { LONGUEUR_MAX_POSTE } from "@/modules/personnes/postes";
import { listerPostes } from "@/modules/personnes/referentiel-postes";

import { ListePostes } from "./liste-postes";

export const metadata: Metadata = { title: "Postes" };

/**
 * Postes de travail : la liste dans laquelle se choisit le poste d'un
 * salarié, à l'embauche comme sur son dossier.
 *
 * Elle évolue avec l'entreprise : un poste s'ajoute, se renomme — les fiches
 * qui le portent suivent — ou se retire de la liste sans être retiré à qui
 * l'occupe.
 */
export default async function PagePostes() {
  const session = await exigerEntreprise();
  const [postes, gerer] = await Promise.all([listerPostes(session.organizationId), peut("personnes.salarie.gerer")]);
  const actifs = postes.filter((p) => p.actif).length;

  return (
    <>
      <EnTetePage
        titre="Postes"
        sousTitre={
          postes.length === 0
            ? "Aucun poste dans la liste"
            : `${actifs} poste${actifs > 1 ? "s" : ""} proposé${actifs > 1 ? "s" : ""} à l'embauche${
                postes.length > actifs ? ` · ${postes.length - actifs} retiré${postes.length - actifs > 1 ? "s" : ""}` : ""
              }`
        }
        actions={
          gerer ? (
            <FormulaireRepliable libelle="Ajouter un poste" titre="Ajouter un poste" action={ajouterPoste}>
              <Champ libelle="Nom du poste" precision="Il s'ajoute en fin de liste, prêt à être choisi à l'embauche.">
                <input name="libelle" required maxLength={LONGUEUR_MAX_POSTE} placeholder="Chauffeur" className={CLASSE_CHAMP} />
              </Champ>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {postes.length === 0 ? (
        <EtatVide titre="Aucun poste" message="Ajoutez les postes de l'entreprise : le poste d'un salarié se choisit dans cette liste." />
      ) : (
        <ListePostes postes={postes} gerer={gerer} />
      )}
    </>
  );
}
