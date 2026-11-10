import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteIndicateur, EnTetePage, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { suiviGuide } from "@/modules/guide/requetes";

export const metadata: Metadata = { title: "Suivi du guide" };

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Abidjan" });

/**
 * Où en est chacun : chapitres lus, quiz réussi. Le parcours est terminé
 * quand le quiz est réussi — il ne s'ouvre qu'une fois tout lu.
 */
export default async function PageSuiviGuide() {
  if (!(await peut("guide.suivre"))) return <AccesRefuse droit="guide.suivre" />;
  const session = await exigerEntreprise();
  const lignes = await suiviGuide(session.organizationId);
  const termines = lignes.filter((l) => l.reussiLe).length;
  const commences = lignes.filter((l) => !l.reussiLe && l.lus > 0).length;

  return (
    <>
      <EnTetePage titre="Suivi de l'équipe" sousTitre={`${lignes.length} compte${lignes.length > 1 ? "s" : ""} actif${lignes.length > 1 ? "s" : ""}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CarteIndicateur libelle="Parcours terminé" valeur={String(termines)} ton="valide" />
        <CarteIndicateur libelle="En cours" valeur={String(commences)} ton="marque" />
        <CarteIndicateur libelle="Pas commencé" valeur={String(lignes.length - termines - commences)} ton={lignes.length - termines - commences > 0 ? "alerte" : "neutre"} />
      </div>
      <Tableau>
        <thead>
          <tr>
            <Th>Nom</Th>
            <Th aligne="droite">Chapitres lus</Th>
            <Th>Dernière lecture</Th>
            <Th>Quiz</Th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.userId}>
              <Td fort>{l.nom}</Td>
              <Td aligne="droite" chiffres>
                {l.lus}
              </Td>
              <Td chiffres>{l.derniereLecture ? DATE.format(l.derniereLecture) : "—"}</Td>
              <Td>
                {l.reussiLe ? (
                  <Pastille ton="valide">Réussi le {DATE.format(l.reussiLe)}</Pastille>
                ) : l.meilleur ? (
                  <Pastille ton="alerte">
                    Meilleur essai {l.meilleur.bonnes}/{l.meilleur.total}
                  </Pastille>
                ) : (
                  <Pastille>Pas encore passé</Pastille>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Tableau>
    </>
  );
}
