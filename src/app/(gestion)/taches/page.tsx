import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { creerTache } from "@/modules/taches/actions";
import { enRetard } from "@/modules/taches/calcul";
import { listerTaches, personnelActif, type VueTaches } from "@/modules/taches/requetes";

import { ChampsTache } from "./champs-tache";
import { ListeTaches, type TacheAffichee } from "./liste-taches";

export const metadata: Metadata = { title: "Tâches" };

const ONGLETS: { vue: VueTaches; libelle: string }[] = [
  { vue: "miennes", libelle: "Mes tâches" },
  { vue: "confiees", libelle: "Confiées à d'autres" },
  { vue: "toutes", libelle: "Toute l'équipe" },
];

/**
 * Tâches.
 *
 * Chacun tient sa liste et l'exécute. Qui porte le droit d'attribuer confie
 * des tâches aux autres, les réattribue et voit celles de toute l'équipe.
 */
export default async function PageTaches({ searchParams }: PageProps<"/taches">) {
  const session = await exigerEntreprise();
  const [executer, attribue] = await Promise.all([peut("taches.executer"), peut("taches.attribuer")]);

  const { vue: demandee } = await searchParams;
  const vue: VueTaches =
    demandee === "confiees" ? "confiees" : demandee === "toutes" && attribue ? "toutes" : "miennes";

  const [taches, personnel] = await Promise.all([
    listerTaches(session.organizationId, session.userId, vue),
    attribue ? personnelActif(session.organizationId) : Promise.resolve([]),
  ]);

  // Le jour se juge à Abidjan, en UTC : une échéance n'a pas d'heure.
  const aujourdhui = new Date().toISOString().slice(0, 10);
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
    creeParUserId: t.creeParUserId,
    createur: t.createur,
    assigneeUserId: t.assigneeUserId,
    assigneeEmployeId: t.assigneeEmployeId,
    assignee: t.assignee,
    sansCompte: t.sansCompte,
    creeLeIso: t.creeLe.toISOString(),
    termineeLeIso: t.termineeLe?.toISOString() ?? null,
    terminateur: t.terminateur,
    compteRendu: t.compteRendu,
    motifAnnulation: t.motifAnnulation,
  }));

  return (
    <>
      <EnTetePage
        titre="Tâches"
        sousTitre={attribue ? "Vos tâches, et celles que vous confiez à l'équipe" : "Votre liste de tâches"}
        actions={
          executer ? (
            <FormulaireRepliable libelle="Nouvelle tâche" titre={attribue ? "Nouvelle tâche, pour vous ou un membre du personnel" : "Nouvelle tâche"} action={creerTache}>
              <ChampsTache personnel={personnel} moi={session.userId} attribue={attribue} />
            </FormulaireRepliable>
          ) : undefined
        }
      />

      <nav aria-label="Vues" className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--filet)] pb-2">
        {ONGLETS.filter((o) => o.vue !== "toutes" || attribue).map((o) => (
          <Link
            key={o.vue}
            href={o.vue === "miennes" ? "/taches" : `/taches?vue=${o.vue}`}
            aria-current={vue === o.vue ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              vue === o.vue ? "bg-[var(--surface-creuse)] text-[var(--encre)]" : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
            }`}
          >
            {o.libelle}
          </Link>
        ))}
      </nav>

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

      {taches.length === 0 ? (
        <EtatVide
          titre={vue === "confiees" ? "Aucune tâche confiée" : "Aucune tâche"}
          message={
            vue === "confiees"
              ? "Les tâches que vous confiez au personnel apparaîtront ici, avec leur avancement."
              : "Notez ce que vous avez à faire : chaque tâche se commence, se termine avec un compte rendu, et reste tracée au journal."
          }
        />
      ) : (
        <ListeTaches
          taches={affichees}
          moi={session.userId}
          attribue={attribue}
          personnel={personnel}
          aujourdhui={aujourdhui}
          montrerAssignee={vue !== "miennes"}
        />
      )}
    </>
  );
}
