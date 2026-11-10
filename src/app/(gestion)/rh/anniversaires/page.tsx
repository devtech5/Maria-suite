import type { Metadata } from "next";

import { ListeAnniversaires } from "@/components/personnes/anniversaires";
import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { anniversairesPour } from "@/modules/personnes/anniversaires-annonces";
import { RAPPEL_JOURS } from "@/modules/personnes/anniversaires";

export const metadata: Metadata = { title: "Anniversaires" };

/**
 * Les anniversaires des douze prochains mois. La direction — qui gère les
 * salariés — voit tout le monde et l'âge, et reçoit un rappel dans la cloche
 * la semaine qui précède ; les autres ne voient que ceux qui ont choisi
 * d'annoncer leur anniversaire, sans l'âge.
 */
export default async function PageAnniversaires() {
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
            : `${prochains.length} collaborateur${prochains.length > 1 ? "s" : ""} · ${semaine} anniversaire${semaine > 1 ? "s" : ""} dans les 7 jours`
        }
      />
      <p className="mb-5 max-w-[75ch] rounded-lg bg-[var(--surface-creuse)] px-3 py-2.5 text-sm text-[var(--encre-douce)]">
        {direction
          ? `Vous êtes prévenu dans la cloche ${RAPPEL_JOURS} jours avant chaque anniversaire, puis le jour même. L'équipe l'est le jour même, pour ceux qui ont choisi de l'annoncer (case sur l'état civil du dossier).`
          : "Le jour venu, toute l'équipe est prévenue dans la cloche. Seuls figurent ici ceux qui ont choisi d'annoncer leur anniversaire."}
      </p>
      {prochains.length === 0 ? (
        <EtatVide titre="Aucun anniversaire" message="Les dates de naissance se saisissent sur l'état civil du dossier de chaque salarié." />
      ) : (
        <ListeAnniversaires prochains={prochains} />
      )}
    </>
  );
}
