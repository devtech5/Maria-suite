import type { Metadata } from "next";
import Link from "next/link";

import {
  CarteIndicateur,
  EnTetePage,
  EtatVide,
  Pastille,
} from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import {
  alertesReapprovisionnement,
  depotsValorises,
  joursRestants,
  resumeStock,
} from "@/modules/stock/requetes";
import { FormulaireDepot } from "./formulaire-depot";

export const metadata: Metadata = { title: "Stock" };

const NATURE_DEPOT = {
  depot: "Dépôt",
  magasin: "Magasin",
  vehicule: "Véhicule",
} as const;

export default async function PageStock() {
  const session = await exigerEntreprise();

  const [resume, lieux, alertes] = await Promise.all([
    resumeStock(session.organizationId),
    depotsValorises(session.organizationId),
    alertesReapprovisionnement(session.organizationId),
  ]);

  const urgentes = [...alertes]
    .sort((a, b) => joursRestants(a) - joursRestants(b))
    .slice(0, 4);

  return (
    <>
      <EnTetePage
        titre="Stock"
        sousTitre={
          lieux.length === 0
            ? "Aucun dépôt ouvert"
            : `${lieux.length} lieu${lieux.length > 1 ? "x" : ""} de stockage · ${fmtEntier(resume.references)} références suivies`
        }
        actions={<FormulaireDepot premier={lieux.length === 0} />}
      />

      {lieux.length === 0 ? (
        <EtatVide
          titre="Aucun dépôt"
          message="Le stock se compte par lieu, jamais globalement : ouvrez d'abord un dépôt ou un magasin."
        />
      ) : (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CarteIndicateur
              libelle="Valeur du stock"
              valeur={fmtCompact(resume.valeur)}
              unite="FCFA"
              precision={`${fmt(resume.valeur)} au coût moyen pondéré`}
            />
            <CarteIndicateur
              libelle="Références suivies"
              valeur={fmtEntier(resume.references)}
              precision="Prestations exclues"
            />
            <CarteIndicateur
              libelle="En rupture"
              valeur={fmtEntier(resume.ruptures)}
              ton={resume.ruptures > 0 ? "danger" : "valide"}
              precision="Aucune vente possible"
            />
            <CarteIndicateur
              libelle="Sous le seuil"
              valeur={fmtEntier(resume.sousSeuil)}
              ton={resume.sousSeuil > 0 ? "alerte" : "valide"}
              precision="À commander avant la rupture"
            />
          </section>

          {/* ---------------------------------------------- alertes en tête */}
          {urgentes.length > 0 && (
            <section className="mb-6">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">À commander en priorité</h2>
                <Link
                  href="/stock/reapprovisionnement"
                  className="text-sm font-medium text-marque-600 hover:underline"
                >
                  Voir les {alertes.length} alertes
                </Link>
              </div>

              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {urgentes.map((alerte) => {
                  const jours = joursRestants(alerte);
                  return (
                    <li
                      key={alerte.articleId}
                      className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">
                          {alerte.designation}
                        </p>
                        {/* Un article qui ne s'est pas vendu depuis un mois n'a
                            pas d'échéance : annoncer « 0 jour » le ferait
                            remonter avant des ruptures réelles. */}
                        <Pastille
                          ton={
                            alerte.quantite <= 0
                              ? "danger"
                              : Number.isFinite(jours)
                                ? "alerte"
                                : "neutre"
                          }
                        >
                          {alerte.quantite <= 0
                            ? "Rupture"
                            : Number.isFinite(jours)
                              ? `${jours} jour${jours > 1 ? "s" : ""}`
                              : "Sans rotation"}
                        </Pastille>
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--encre-faible)]">
                        {alerte.fournisseurNom ?? "Sans fournisseur habituel"}
                        {alerte.delaiJours > 0 &&
                          ` · livre en ${alerte.delaiJours} jour${alerte.delaiJours > 1 ? "s" : ""}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* -------------------------------------------- valeur par dépôt */}
          <section>
            <h2 className="mb-2.5 text-base font-semibold">Valeur par dépôt</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {lieux.map((lieu) => (
                <li
                  key={lieu.id}
                  className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{lieu.nom}</p>
                      <p className="chiffres text-xs text-[var(--encre-faible)]">
                        {lieu.code}
                        {lieu.ville && ` · ${lieu.ville}`}
                      </p>
                    </div>
                    {lieu.parDefaut ? (
                      <Pastille ton="marque">Par défaut</Pastille>
                    ) : (
                      lieu.type !== "depot" && (
                        <Pastille>{NATURE_DEPOT[lieu.type]}</Pastille>
                      )
                    )}
                  </div>

                  <p className="chiffres mt-3 text-lg font-bold">
                    {fmtCompact(lieu.valeur)}
                    <span className="ml-1 text-xs font-medium text-[var(--encre-faible)]">
                      FCFA
                    </span>
                  </p>
                  <p className="chiffres mt-0.5 text-xs text-[var(--encre-faible)]">
                    {lieu.references === 0
                      ? "Vide"
                      : `${fmtEntier(lieu.references)} référence${lieu.references > 1 ? "s" : ""} détenue${lieu.references > 1 ? "s" : ""}`}
                  </p>
                </li>
              ))}
            </ul>

            {/* Les quantités ne s'additionnent pas d'une unité à l'autre : un
                total mêlant des kilos et des bouteilles ne veut rien dire.
                D'où un décompte de références, et une valeur en francs. */}
            <p className="mt-3 max-w-[70ch] text-xs text-[var(--encre-faible)]">
              Le stock est la somme des mouvements, jamais un compteur tenu à
              part : il ne peut pas diverger de son journal. La valeur est celle
              du coût moyen pondéré constaté à chaque sortie.
              {resume.ruptures > 0 &&
                ` ${fmtEntier(resume.ruptures)} référence${resume.ruptures > 1 ? "s sont" : " est"} à zéro ou en négatif — un négatif signale une sortie enregistrée avant son entrée, pas une erreur de calcul.`}
            </p>
          </section>

          {alertes.length > 0 && urgentes.length === 0 && (
            <p className="mt-4 text-sm text-[var(--encre-faible)]">
              Aucune rupture imminente.{" "}
              <Link
                href="/stock/reapprovisionnement"
                className="font-medium text-marque-600 hover:underline"
              >
                Voir le réapprovisionnement
              </Link>
            </p>
          )}
        </>
      )}
    </>
  );
}
