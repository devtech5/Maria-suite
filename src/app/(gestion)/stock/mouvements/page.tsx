import type { Metadata } from "next";

import {
  CarteIndicateur,
  EnTetePage,
  EtatVide,
  Pastille,
  type TonPastille,
} from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtEntier } from "@/lib/format";
import { formaterQuantite } from "@/lib/quantite";
import { listerArticles } from "@/modules/catalogue/requetes";
import { listerDepots, listerMouvements } from "@/modules/stock/requetes";
import type { TypeMouvement } from "@/modules/stock/schema";
import { FormulaireMouvement } from "./formulaire-mouvement";

export const metadata: Metadata = { title: "Mouvements de stock" };

const LIBELLE: Record<TypeMouvement, string> = {
  reception: "Réception",
  vente: "Vente",
  transfert: "Transfert",
  ajustement: "Ajustement",
  retour: "Retour",
};

const TON: Record<TypeMouvement, TonPastille> = {
  reception: "valide",
  vente: "neutre",
  transfert: "marque",
  ajustement: "alerte",
  retour: "neutre",
};

const horodatage = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Journal des mouvements.
 *
 * Chaque ligne porte sa pièce source — bon de réception, ticket, bon de
 * transfert, procès-verbal d'inventaire, avoir. C'est ce qui rend un écart de
 * stock explicable : sans pièce, un inventaire faux ne remonte jamais jusqu'à
 * sa cause.
 *
 * Un transfert apparaît deux fois, en sortie du dépôt d'origine et en entrée du
 * dépôt de destination. Le concurrent n'en enregistre qu'un seul, en positif,
 * ce qui crée des unités qui n'ont jamais existé.
 */
export default async function PageMouvements() {
  const session = await exigerEntreprise();

  const [mouvements, depots, catalogue] = await Promise.all([
    listerMouvements(session.organizationId),
    listerDepots(session.organizationId),
    listerArticles(session.organizationId),
  ]);

  const stockables = catalogue.filter((article) => article.suiviStock);

  const entrees = mouvements.filter((m) => m.quantite > 0).length;
  const sorties = mouvements.length - entrees;

  return (
    <>
      <EnTetePage
        titre="Mouvements"
        sousTitre="Journal des entrées et sorties"
        actions={
          <FormulaireMouvement
            depots={depots.map((d) => ({ id: d.id, nom: d.nom, code: d.code }))}
            articles={stockables.map((a) => ({
              id: a.id,
              designation: a.designation,
              unite: a.unite,
            }))}
          />
        }
      />

      {mouvements.length === 0 ? (
        <EtatVide
          titre="Aucun mouvement"
          message={
            depots.length === 0
              ? "Ouvrez d'abord un dépôt : une quantité n'existe qu'attachée à un lieu."
              : "Enregistrez une réception : chaque entrée et chaque sortie de stock apparaîtra ici."
          }
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            {/* Les trois compteurs portent sur les lignes affichées, pas sur
                tout l'historique : un magasin qui tourne dépasse le million de
                mouvements en un an, et les compter à chaque affichage coûterait
                une requête pour un chiffre que personne ne lit. */}
            <CarteIndicateur
              libelle="Mouvements affichés"
              valeur={fmtEntier(mouvements.length)}
              precision="Les plus récents d'abord"
            />
            <CarteIndicateur
              libelle="Entrées"
              valeur={fmtEntier(entrees)}
              ton="valide"
              precision="Sur les lignes affichées"
            />
            <CarteIndicateur
              libelle="Sorties"
              valeur={fmtEntier(sorties)}
              ton="alerte"
              precision="Sur les lignes affichées"
            />
          </section>

          <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
            {mouvements.map((mouvement) => {
              const entree = mouvement.quantite > 0;
              return (
                <li
                  key={mouvement.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3"
                >
                  <Pastille ton={TON[mouvement.type]}>
                    {LIBELLE[mouvement.type]}
                  </Pastille>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {mouvement.articleDesignation}
                    </p>
                    <p className="truncate text-xs text-[var(--encre-faible)]">
                      <span className="chiffres">{mouvement.piece}</span>
                      {" · "}
                      {/* La flèche suit le sens réel : la ligne de sortie part
                          d'ici, la ligne d'entrée arrive ici. */}
                      {mouvement.depotVersNom
                        ? entree
                          ? `${mouvement.depotVersNom} → ${mouvement.depotNom}`
                          : `${mouvement.depotNom} → ${mouvement.depotVersNom}`
                        : mouvement.depotNom}
                      {mouvement.motif && ` · ${mouvement.motif}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`chiffres text-sm font-bold ${
                        entree ? "text-valide-600" : "text-danger-600"
                      }`}
                    >
                      {entree ? "+" : "−"}
                      {formaterQuantite(
                        Math.abs(mouvement.quantite),
                        mouvement.articleUnite,
                      )}
                    </p>
                    <p className="text-xs text-[var(--encre-faible)]">
                      {horodatage.format(mouvement.effectueLe)}
                      {mouvement.auteur && ` · ${mouvement.auteur}`}
                      {mouvement.coutUnitaire > 0 &&
                        ` · ${fmt(mouvement.coutUnitaire)} F l'unité`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 max-w-[70ch] text-xs text-[var(--encre-faible)]">
            Un mouvement ne se modifie pas : on en enregistre un autre qui
            l&apos;annule. C&apos;est ce qui rend l&apos;inventaire explicable —
            et ce qui permettra à une caisse hors connexion de répliquer ses
            lignes sans conflit à résoudre.
          </p>
        </>
      )}
    </>
  );
}
