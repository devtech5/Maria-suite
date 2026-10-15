import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireRepliable } from "@/components/ui/operations";
import {
  CarteIndicateur,
  Champ,
  CLASSE_CHAMP,
  EnTetePage,
  EtatVide,
  Pastille,
  type TonPastille,
} from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { creerProjet } from "@/modules/projets/actions";
import { LIBELLE_STATUT_PROJET, tauxReussitePortefeuille } from "@/modules/projets/calcul";
import { listerProjets, membresActifs } from "@/modules/projets/requetes";
import type { StatutProjet } from "@/modules/projets/schema";
import { listerTiers } from "@/modules/tiers/requetes";

export const metadata: Metadata = { title: "Projets" };

const TON: Record<StatutProjet, TonPastille> = {
  preparation: "neutre",
  en_cours: "marque",
  suspendu: "alerte",
  termine: "valide",
  annule: "neutre",
};

/**
 * Projets : à quoi l'argent a servi. Chaque carte dit le budget, ce qui est
 * engagé, ce qui est payé et ce qui attend une signature.
 */
export default async function PageProjets({ searchParams }: PageProps<"/projets">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [projets, gerer, membres, clients] = await Promise.all([
    listerProjets(session.organizationId),
    peut("projet.gerer"),
    membresActifs(session.organizationId),
    listerTiers(session.organizationId, "client"),
  ]);

  const actifs = projets.filter((p) => p.statut === "en_cours" || p.statut === "preparation");
  const engage = actifs.reduce((s, p) => s + p.suivi.engage, 0);
  const enAttente = projets.reduce((s, p) => s + p.suivi.enAttente, 0);
  const depasses = actifs.filter((p) => p.suivi.reste !== null && p.suivi.reste < 0).length;
  const resultatCumule = projets.filter((p) => p.statut !== "annule").reduce((s, p) => s + p.bilan.resultat, 0);
  const portefeuille = tauxReussitePortefeuille(projets);
  // Les indicateurs portent sur tout le portefeuille ; seules les cartes suivent la recherche.
  const affiches = projets.filter(
    (p) =>
      correspond(filtres.q, [p.code, p.nom, p.client, p.responsable, p.description]) && dansPeriode(p.debut, filtres.periode),
  );

  return (
    <>
      <EnTetePage
        titre="Projets"
        sousTitre="Budget, dépenses et preuves, projet par projet"
        actions={
          gerer ? (
            <div className="flex flex-col items-end gap-2">
              <FormulaireRepliable libelle="Nouveau projet" titre="Nouveau projet" presentation="tiroir" action={creerProjet}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Champ libelle="Nom du projet">
                    <input name="nom" required placeholder="Ouverture boutique Yopougon" className={CLASSE_CHAMP} />
                  </Champ>
                  <Champ libelle="Responsable" precision="Il suit le projet et en rend compte.">
                    <select name="responsableUserId" className={CLASSE_CHAMP}>
                      <option value="">Non affecté</option>
                      {membres.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>
                  <Champ libelle="Client (facultatif)">
                    <select name="clientId" className={CLASSE_CHAMP}>
                      <option value="">Projet interne</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>
                  <Champ libelle="Budget TTC" precision="Vide : pas de plafond.">
                    <input name="budget" inputMode="numeric" placeholder="2 500 000" className={`${CLASSE_CHAMP} chiffres`} />
                  </Champ>
                  <Champ libelle="Prix de vente HT" precision="Ce que le client paiera. Vide : projet interne.">
                    <input name="prixVente" inputMode="numeric" placeholder="3 200 000" className={`${CLASSE_CHAMP} chiffres`} />
                  </Champ>
                  <Champ libelle="Début">
                    <input name="debut" type="date" className={CLASSE_CHAMP} />
                  </Champ>
                  <Champ libelle="Fin prévue">
                    <input name="fin" type="date" className={CLASSE_CHAMP} />
                  </Champ>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Champ libelle="Description">
                      <textarea name="description" rows={2} className={`${CLASSE_CHAMP} h-auto py-2`} />
                    </Champ>
                  </div>
                </div>
              </FormulaireRepliable>
            </div>
          ) : undefined
        }
      />

      {projets.length === 0 ? (
        <EtatVide
          titre="Aucun projet"
          message="Un projet regroupe des dépenses : un chantier, une ouverture de boutique, un aménagement. Chaque achat s'y rattache avec sa preuve."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Projets actifs"
              valeur={fmtEntier(actifs.length)}
              precision={`${projets.length} au total${depasses > 0 ? ` · ${depasses} hors budget` : ""}`}
              ton={depasses > 0 ? "alerte" : "neutre"}
            />
            <CarteIndicateur
              libelle={resultatCumule >= 0 ? "Résultat à date : bénéfice" : "Résultat à date : perte"}
              valeur={`${resultatCumule < 0 ? "− " : ""}${fmtCompact(Math.abs(resultatCumule))}`}
              unite="FCFA"
              ton={resultatCumule >= 0 ? "valide" : "danger"}
              precision={`Facturé moins coûts engagés, HT · ${fmtCompact(engage)} F engagés sur les projets actifs`}
            />
            <CarteIndicateur
              libelle="Taux de réussite"
              valeur={portefeuille.taux === null ? "—" : `${portefeuille.taux}`}
              unite={portefeuille.taux === null ? undefined : "%"}
              ton={portefeuille.taux === null ? "neutre" : portefeuille.taux >= 70 ? "valide" : "alerte"}
              precision={
                portefeuille.evalues === 0
                  ? "Aucun projet terminé à juger"
                  : `${portefeuille.reussis} sur ${portefeuille.evalues} projets terminés ont tenu tous leurs critères`
              }
            />
            <CarteIndicateur
              libelle="Demandes à approuver"
              valeur={fmtCompact(enAttente)}
              unite="FCFA"
              ton={enAttente > 0 ? "alerte" : "valide"}
            />

          </section>

          <Recherche
            chemin="/projets"
            valeur={filtres.q}
            placeholder="Code, nom, client, responsable…"
            periode={{ ...filtres.periode, libelle: "Début" }}
            resultats={filtres.actif ? `${fmtEntier(affiches.length)} sur ${fmtEntier(projets.length)}` : undefined}
          />

          {affiches.length === 0 ? (
            <EtatVide titre="Aucun projet ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {affiches.map((p) => {
                const taux = p.suivi.taux ?? 0;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/projets/${p.id}`}
                      className="block rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 hover:border-marque-400"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="chiffres text-xs text-[var(--encre-faible)]">
                            {p.code}
                            {p.client ? ` · ${p.client}` : ""}
                          </p>
                          <p className="truncate text-sm font-semibold">{p.nom}</p>
                        </div>
                        <Pastille ton={TON[p.statut]}>{LIBELLE_STATUT_PROJET[p.statut]}</Pastille>
                      </div>
                      <p className="mt-1 text-xs text-[var(--encre-douce)]">
                        {p.responsable ? `Responsable : ${p.responsable}` : "Non affecté"} · {p.depenses} dépense
                        {p.depenses > 1 ? "s" : ""} · {p.photos} photo{p.photos > 1 ? "s" : ""}
                      </p>

                      <div className="mt-3">
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="text-[var(--encre-faible)]">
                            {fmt(p.suivi.engage)} engagés{p.budget !== null ? ` sur ${fmt(p.budget)}` : ""} · {fmt(p.suivi.paye)} payés
                          </span>
                          {p.suivi.taux !== null && <span className="chiffres font-semibold">{taux} %</span>}
                        </div>
                        {p.budget !== null && (
                          <div
                            className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-creuse)]"
                            role="progressbar"
                            aria-valuenow={taux}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Budget consommé du projet ${p.code}`}
                          >
                            <div
                              className={`h-full rounded-full ${taux > 100 ? "bg-danger-500" : taux >= 85 ? "bg-alerte-500" : "bg-marque-600"}`}
                              style={{ width: `${Math.min(100, taux)}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--filet)] pt-2 text-xs">
                        {p.statut !== "termine" && p.bilan.resultatPrevu !== null ? (
                          // En cours, le prix convenu dit ce que le projet rapportera ;
                          // le facturé à date n'en est qu'une partie.
                          <span className="text-[var(--encre-douce)]">
                            <span className={`chiffres font-semibold ${p.bilan.resultatPrevu >= 0 ? "text-valide-600" : "text-danger-600"}`}>
                              {p.bilan.resultatPrevu >= 0 ? "Bénéfice prévu " : "Perte prévue "}
                              {fmt(Math.abs(p.bilan.resultatPrevu))} HT
                            </span>
                            {p.facture > 0 && <span className="chiffres"> · facturé {fmt(p.facture)}</span>}
                          </span>
                        ) : p.facture > 0 || p.prixVente !== null ? (
                          <span className={`chiffres font-semibold ${p.bilan.resultat >= 0 ? "text-valide-600" : "text-danger-600"}`}>
                            {p.bilan.resultat >= 0 ? "Bénéfice " : "Perte "}
                            {fmt(Math.abs(p.bilan.resultat))} HT
                          </span>
                        ) : (
                          <span className="text-[var(--encre-faible)]">Projet interne · coût {fmt(p.coutEngageHt)} HT</span>
                        )}
                        {p.bilan.tauxReussite !== null && (
                          <span className="text-[var(--encre-douce)]">
                            Réussite{" "}
                            <span
                              className={`chiffres font-semibold ${
                                p.bilan.tauxReussite === 100 ? "text-valide-600" : p.bilan.tauxReussite >= 50 ? "text-alerte-600" : "text-danger-600"
                              }`}
                            >
                              {p.bilan.tauxReussite} %
                            </span>
                          </span>
                        )}
                      </div>
                      {p.suivi.enAttente > 0 && (
                        <p className="mt-2 text-xs font-medium text-alerte-600">{fmt(p.suivi.enAttente)} F en attente d&apos;approbation</p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
