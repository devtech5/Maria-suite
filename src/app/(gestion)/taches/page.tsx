import type { Metadata } from "next";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { creerTache } from "@/modules/taches/actions";
import { enRetard } from "@/modules/taches/calcul";
import { listerColonnes, valeursDe } from "@/modules/taches/colonnes-base";
import { intervenantsActifs, intervenantsDe } from "@/modules/taches/intervenants";
import { listerTaches, personnelActif, type VueTaches } from "@/modules/taches/requetes";
import { lireAffichage } from "@/modules/taches/vues";

import { ChampsTache } from "./champs-tache";
import type { PersonnePossible, TacheAffichee } from "./types";
import { VuesTaches } from "./vues-taches";

export const metadata: Metadata = { title: "Tâches" };

/**
 * Tâches.
 *
 * Chacun tient sa liste et l'exécute. Qui porte le droit d'attribuer confie
 * des tâches aux autres, les réattribue et voit celles de toute l'équipe.
 * Six affichages des mêmes tâches : Tableur, Fiches, Calendrier, Kanban,
 * Gantt, Échéancier (`?affichage=`).
 */
export default async function PageTaches({ searchParams }: PageProps<"/taches">) {
  const session = await exigerEntreprise();
  const [executer, attribue] = await Promise.all([peut("taches.executer"), peut("taches.attribuer")]);

  const parametres = await searchParams;
  const { vue: demandee, affichage } = parametres;
  // `?q=` arrive de la recherche globale ; la liste filtre ensuite sur place.
  const filtres = lireFiltresListe(parametres);
  const vue: VueTaches =
    demandee === "confiees" ? "confiees" : demandee === "toutes" && attribue ? "toutes" : "miennes";

  // Le Personnel sert au choix du responsable (qui attribue) et des intervenants (qui crée une tâche).
  const [taches, personnel, ouvriers, colonnes] = await Promise.all([
    listerTaches(session.organizationId, session.userId, vue),
    executer ? personnelActif(session.organizationId) : Promise.resolve([]),
    executer ? intervenantsActifs(session.organizationId) : Promise.resolve([]),
    listerColonnes(session.organizationId),
  ]);
  const ids = taches.map((t) => t.id);
  const [valeurs, intervenants] = await Promise.all([valeursDe(session.organizationId, ids), intervenantsDe(session.organizationId, ids)]);
  const personnesPossibles: PersonnePossible[] = [
    ...personnel.map((p) => ({ ref: `e:${p.id}`, nom: p.nom, detail: p.poste, nature: "collaborateur" as const })),
    ...ouvriers.map((w) => ({ ref: `w:${w.id}`, nom: w.nom, detail: w.qualification, nature: "intervenant" as const })),
  ];

  // Le jour se juge à Abidjan, en UTC : une échéance n'a pas d'heure.
  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const ouvertes = taches.filter((t) => t.statut === "a_faire" || t.statut === "en_cours");
  const retard = ouvertes.filter((t) => enRetard(t.echeance, t.statut, aujourdhui)).length;
  const terminees = taches.filter((t) => t.statut === "terminee").length;

  const affichees: TacheAffichee[] = taches.map((t) => ({
    id: t.id,
    numero: t.numero,
    titre: t.titre,
    description: t.description,
    priorite: t.priorite,
    statut: t.statut,
    echeance: t.echeance,
    dateDebut: t.dateDebut,
    creeParUserId: t.creeParUserId,
    createur: t.createur,
    assigneeUserId: t.assigneeUserId,
    assigneeEmployeId: t.assigneeEmployeId,
    assignee: t.assignee,
    sansCompte: t.sansCompte,
    creeLeIso: t.creeLe.toISOString(),
    majLeIso: t.majLe.toISOString(),
    termineeLeIso: t.termineeLe?.toISOString() ?? null,
    terminateur: t.terminateur,
    compteRendu: t.compteRendu,
    motifAnnulation: t.motifAnnulation,
    valeurs: valeurs.get(t.id) ?? {},
    intervenants: intervenants.get(t.id) ?? [],
  }));

  return (
    <>
      <EnTetePage
        titre="Tâches"
        sousTitre={attribue ? "Vos tâches, et celles que vous confiez à l'équipe" : "Votre liste de tâches"}
        actions={
          executer ? (
            <FormulaireRepliable libelle="Nouvelle tâche" titre={attribue ? "Nouvelle tâche, pour vous ou un membre du personnel" : "Nouvelle tâche"} action={creerTache}>
              <ChampsTache personnel={personnel} moi={session.userId} attribue={attribue} personnesPossibles={personnesPossibles} />
            </FormulaireRepliable>
          ) : undefined
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="À faire" valeur={fmtEntier(ouvertes.filter((t) => t.statut === "a_faire").length)} />
        <CarteIndicateur libelle="En cours" valeur={fmtEntier(ouvertes.filter((t) => t.statut === "en_cours").length)} ton="marque" />
        <CarteIndicateur
          libelle="En retard"
          valeur={fmtEntier(retard)}
          ton={retard > 0 ? "danger" : "valide"}
          precision={retard > 0 ? "Échéance dépassée" : "Aucune échéance dépassée"}
        />
        <CarteIndicateur libelle="Terminées" valeur={fmtEntier(terminees)} ton="valide" precision="Sur les 30 derniers jours" />
      </section>

      <VuesTaches
        vide={
          <EtatVide
          titre={vue === "confiees" ? "Aucune tâche confiée" : "Aucune tâche"}
          message={
            vue === "confiees"
              ? "Les tâches que vous confiez au personnel apparaîtront ici, avec leur avancement."
              : "Notez ce que vous avez à faire : chaque tâche se commence, se termine avec un compte rendu, et reste tracée au journal."
            }
          />
        }
        taches={affichees}
        colonnes={colonnes}
        personnesPossibles={personnesPossibles}
        perimetre={vue}
        perimetres={attribue ? ["miennes", "confiees", "toutes"] : ["miennes", "confiees"]}
        affichageInitial={lireAffichage(affichage)}
        moi={session.userId}
        attribue={attribue}
        executer={executer}
        personnel={personnel}
        aujourdhui={aujourdhui}
        maintenantIso={maintenant.toISOString()}
        rechercheInitiale={filtres.q}
        periodeInitiale={filtres.periode}
      />
    </>
  );
}
