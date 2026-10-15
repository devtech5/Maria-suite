import type { Metadata } from "next";

import {
  CarteIndicateur,
  CLASSE_CHAMP_COMPACT,
  EnTetePage,
  EtatVide,
  Pastille,
  Tableau,
  Td,
  Th,
} from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtCompact, fmtTauxBp } from "@/lib/format";
import { formaterQuantite, UNITES } from "@/lib/quantite";
import {
  codesParArticle,
  listerArticles,
  listerFamilles,
} from "@/modules/catalogue/requetes";
import { stocksParArticle } from "@/modules/stock/requetes";
import { listerTiers } from "@/modules/tiers/requetes";
import { correspond, Recherche } from "@/components/ui/recherche";

import { FormulaireArticle } from "./formulaire-article";

export const metadata: Metadata = { title: "Articles" };

export default async function PageArticles({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; famille?: string }>;
}) {
  const session = await exigerEntreprise();
  const { q = "", famille = "" } = await searchParams;

  const [catalogue, familles, fournisseurs, codes, stocks] = await Promise.all([
    listerArticles(session.organizationId),
    listerFamilles(session.organizationId),
    listerTiers(session.organizationId, "fournisseur"),
    codesParArticle(session.organizationId),
    stocksParArticle(session.organizationId),
  ]);

  const marchandises = catalogue.filter((a) => a.type === "marchandise");
  // Le code-barres se cherche aussi : scanner un article au clavier le retrouve.
  const affiches = catalogue.filter(
    (a) =>
      (!famille || a.familleNom === famille) &&
      correspond(q, [a.designation, a.reference, a.familleNom, ...(codes.get(a.id) ?? [])]),
  );
  const filtre = q.trim() !== "" || famille !== "";
  const services = catalogue.length - marchandises.length;

  /**
   * Marge brute moyenne, en points de base, sur les seuls articles dont le
   * prix d'achat est connu. Ceux qui n'en ont pas la fausseraient : une marge
   * de 100 % sur un article dont on ignore le coût n'est pas une marge, c'est
   * une information manquante.
   */
  const valorises = catalogue.filter((a) => a.prixAchat > 0);
  const margeMoyenne =
    valorises.length === 0
      ? null
      : Math.round(
          valorises.reduce(
            (somme, a) =>
              somme + ((a.prixVente - a.prixAchat) * 10_000) / a.prixVente,
            0,
          ) / valorises.length,
        );

  return (
    <>
      <EnTetePage
        titre="Articles"
        sousTitre={
          catalogue.length === 0
            ? "Le catalogue est vide"
            : `${marchandises.length} marchandises · ${services} prestations · ${familles.length} familles`
        }
        actions={
          <FormulaireArticle
            familles={familles.map((f) => ({ id: f.id, nom: f.nom }))}
            fournisseurs={fournisseurs.map((f) => ({ id: f.id, nom: f.nom }))}
          />
        }
      />

      {catalogue.length === 0 ? (
        <EtatVide
          titre="Aucun article"
          message="Créez votre premier article : désignation, prix, unité de vente et code-barres."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Références"
              valeur={String(catalogue.length)}
              precision={`dont ${services} prestations`}
            />
            <CarteIndicateur
              libelle="Prix de vente moyen"
              valeur={fmtCompact(
                Math.round(
                  catalogue.reduce((somme, a) => somme + a.prixVente, 0) /
                    catalogue.length,
                ),
              )}
              unite="FCFA"
            />
            <CarteIndicateur
              libelle="Marge brute moyenne"
              valeur={margeMoyenne === null ? "—" : fmtTauxBp(margeMoyenne)}
              precision={
                margeMoyenne === null
                  ? "Aucun prix d'achat renseigné"
                  : `Sur ${valorises.length} articles au prix d'achat connu`
              }
            />
          </section>

          <Recherche
            chemin="/stock/articles"
            valeur={q}
            placeholder="Désignation, référence ou code-barres"
            resultats={filtre ? `${affiches.length} sur ${catalogue.length}` : undefined}
            filtres={
              <select name="famille" defaultValue={famille} aria-label="Famille" className={CLASSE_CHAMP_COMPACT}>
                <option value="">Toutes les familles</option>
                {familles.map((f) => (
                  <option key={f.id} value={f.nom}>
                    {f.nom}
                  </option>
                ))}
              </select>
            }
          />

          {affiches.length === 0 ? (
            <p className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--encre-douce)]">
              Aucun article ne correspond à cette recherche.
            </p>
          ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>Désignation</Th>
                <Th>Référence</Th>
                <Th>Famille</Th>
                <Th aligne="droite">Prix de vente</Th>
                <Th aligne="droite">TVA</Th>
                <Th aligne="droite">En stock</Th>
                <Th aligne="droite">Seuil</Th>
                <Th>Fournisseur</Th>
              </tr>
            </thead>
            <tbody>
              {affiches.map((article) => (
                <tr key={article.id}>
                  <Td fort>
                    {article.designation}
                    {/* Une prestation se signale : elle ne se stocke pas, et
                        elle ne se ventile pas sur le même compte. */}
                    {article.type === "service" && (
                      <span className="ml-2 align-middle">
                        <Pastille ton="marque">Service</Pastille>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="chiffres text-xs text-[var(--encre-faible)]">
                      {article.reference}
                    </span>
                    {codes.get(article.id)?.map((code) => (
                      <span
                        key={code}
                        className="chiffres block text-xs text-[var(--encre-faible)]"
                      >
                        {code}
                      </span>
                    ))}
                  </Td>
                  <Td>
                    <span className="text-xs text-[var(--encre-douce)]">
                      {article.familleNom ?? "—"}
                    </span>
                  </Td>
                  <Td aligne="droite" chiffres>
                    {fmt(article.prixVente)}
                    {/* Un prix au kilo doit le dire : « 4 500 » sur du poisson
                        ne veut rien dire sans son unité. */}
                    {UNITES[article.unite].fractionnable && (
                      <span className="text-xs text-[var(--encre-faible)]">
                        {" "}
                        / {UNITES[article.unite].abrege}
                      </span>
                    )}
                  </Td>
                  <Td aligne="droite" chiffres>
                    {article.tauxTvaEffectif === 0 ? (
                      <Pastille>Exonéré</Pastille>
                    ) : (
                      fmtTauxBp(article.tauxTvaEffectif)
                    )}
                  </Td>
                  {/* Le stock n'est pas une colonne de l'article : c'est la
                      somme de ses mouvements, tous dépôts confondus. Le détail
                      par lieu est sur l'écran Stock. */}
                  <Td aligne="droite" chiffres>
                    {(() => {
                      if (!article.suiviStock) return "—";
                      const detenu = stocks.get(article.id)?.quantite ?? 0;
                      return (
                        <span
                          className={
                            detenu <= 0
                              ? "font-semibold text-danger-600"
                              : detenu <= article.seuilAlerte &&
                                  article.seuilAlerte > 0
                                ? "font-semibold text-alerte-600"
                                : ""
                          }
                        >
                          {formaterQuantite(detenu, article.unite)}
                        </span>
                      );
                    })()}
                  </Td>
                  <Td aligne="droite" chiffres>
                    {article.suiviStock
                      ? formaterQuantite(article.seuilAlerte, article.unite)
                      : "—"}
                  </Td>
                  <Td>
                    <span className="text-xs text-[var(--encre-douce)]">
                      {article.fournisseurNom ?? "—"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tableau>
          )}

          <p className="mt-3 max-w-[70ch] text-xs text-[var(--encre-faible)]">
            La colonne « en stock » totalise tous les dépôts. Le détail par lieu
            est sur l&apos;écran Stock : une quantité n&apos;a de sens
            qu&apos;attachée à l&apos;endroit où la marchandise se trouve.
          </p>
        </>
      )}
    </>
  );
}
