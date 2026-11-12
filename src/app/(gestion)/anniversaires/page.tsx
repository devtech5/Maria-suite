import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { ListeAnniversaires } from "@/components/personnes/anniversaires";
import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";
import { anniversairesPour } from "@/modules/personnes/anniversaires-annonces";
import { RAPPEL_JOURS } from "@/modules/personnes/anniversaires";

export const metadata: Metadata = { title: "Anniversaires" };

/**
 * Les anniversaires des douze prochains mois, ouverts à toute l'équipe :
 * chacun voit ceux de ses collègues et en est prévenu dans la cloche, la
 * semaine qui précède puis le jour même. La direction — qui gère les
 * collaborateurs — voit en plus l'âge, et ceux qui ont choisi de ne pas annoncer
 * leur anniversaire.
 */
export default async function PageAnniversaires() {
  if (!moduleOuvert("personnes")) return <ModuleEnPreparation cle="personnes" />;
  if (!(await peut("planning.utiliser"))) return <AccesRefuse droit="planning.utiliser" />;
  const session = await exigerEntreprise();
  const direction = await peut("personnes.salarie.gerer");
  const { prochains } = await anniversairesPour(session.organizationId, { direction, horizon: 366 });
  const semaine = prochains.filter((a) => a.dans <= 7).length;

  return (
    <>
      <EnTetePage
        titre="Anniversaires"
        sousTitre={
          prochains.length === 0
            ? "Aucune date de naissance renseignée"
            : `${prochains.length} collaborateur${prochains.length > 1 ? "s" : ""} · ${semaine} anniversaire${semaine > 1 ? "s" : ""} dans les ${RAPPEL_JOURS} jours`
        }
      />
      <p className="mb-5 max-w-[75ch] rounded-lg bg-[var(--surface-creuse)] px-3 py-2.5 text-sm text-[var(--encre-douce)]">
        {`Tout le monde est prévenu dans la cloche dans les ${RAPPEL_JOURS} jours qui précèdent un anniversaire, puis le jour même.`}
        {direction
          ? " Vous voyez aussi l'âge et ceux qui ont choisi de ne pas annoncer leur anniversaire (case sur l'état civil du dossier) : l'équipe, elle, ne les voit pas."
          : " Pour ne pas annoncer le vôtre, demandez aux ressources humaines de décocher la case sur votre dossier."}
      </p>
      {prochains.length === 0 ? (
        <EtatVide titre="Aucun anniversaire" message="Les dates de naissance se saisissent sur l'état civil du dossier de chaque collaborateur." />
      ) : (
        <ListeAnniversaires prochains={prochains} />
      )}
    </>
  );
}
