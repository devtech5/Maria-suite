import type { Metadata } from "next";

import { CarteIndicateur, CLASSE_CHAMP_COMPACT, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { correspond, Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtCompact, fmtEntier } from "@/lib/format";
import { dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { listerDepenses, listerProjets, piecesParDepense } from "@/modules/projets/requetes";
import { listerTiers } from "@/modules/tiers/requetes";

import { FormulaireDepense } from "../formulaire-depense";
import { TableauDepenses } from "../tableau-depenses";

export const metadata: Metadata = { title: "Dépenses" };

/**
 * Toutes les dépenses de l'entreprise, rattachées à un projet ou non. Celles
 * qui attendent une décision remontent en tête.
 */
export default async function PageDepenses({ searchParams }: PageProps<"/projets/depenses">) {
  const session = await exigerEntreprise();
  const parametres = await searchParams;
  const filtres = lireFiltresListe(parametres);
  const statut = typeof parametres.statut === "string" ? parametres.statut : "";
  const [depenses, pieces, projets, fournisseurs, approuver, payer, demander] = await Promise.all([
    listerDepenses(session.organizationId),
    piecesParDepense(session.organizationId),
    listerProjets(session.organizationId),
    listerTiers(session.organizationId, "fournisseur"),
    peut("depense.approuver"),
    peut("depense.payer"),
    peut("depense.demander"),
  ]);

  const somme = (statut: string) => depenses.filter((d) => d.statut === statut).reduce((s, d) => s + d.montant, 0);
  const demandes = depenses.filter((d) => d.statut === "demandee").length;
  const sansPreuve = depenses.filter((d) => d.statut === "payee" && d.preuves === 0).length;
  const affichees = depenses.filter(
    (d) =>
      (!statut || d.statut === statut) &&
      correspond(filtres.q, [d.numero, d.objet, d.fournisseur, d.projet, d.demandeur, d.referencePaiement]) &&
      // La date de la dépense est celle de sa demande : approbation et paiement viennent après.
      dansPeriode(d.demandeeLe, filtres.periode),
  );
  const filtre = filtres.actif || statut !== "";
  const ouverts = projets.filter((p) => p.statut !== "termine" && p.statut !== "annule");

  return (
    <>
      <EnTetePage
        titre="Dépenses"
        sousTitre="De la demande au paiement, avec la preuve"
        actions={
          demander ? (
            <FormulaireDepense
              projets={ouverts.map((p) => ({ id: p.id, libelle: `${p.code} · ${p.nom}` }))}
              fournisseurs={fournisseurs.map((f) => ({ id: f.id, nom: f.nom }))}
            />
          ) : undefined
        }
      />

      {depenses.length === 0 ? (
        <EtatVide
          titre="Aucune dépense"
          message="Une dépense se demande, s'approuve par un autre responsable, puis se paie — preuve à l'appui. L'écriture passe au paiement."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="À approuver"
              valeur={fmtCompact(somme("demandee"))}
              unite="FCFA"
              ton={somme("demandee") > 0 ? "alerte" : "valide"}
              precision={`${demandes} demande${demandes > 1 ? "s" : ""}`}
            />
            <CarteIndicateur libelle="Approuvé, à payer" valeur={fmtCompact(somme("approuvee"))} unite="FCFA" ton="marque" />
            <CarteIndicateur libelle="Payé" valeur={fmtCompact(somme("payee"))} unite="FCFA" ton="valide" />
            <CarteIndicateur
              libelle="Payées sans preuve"
              valeur={fmtEntier(sansPreuve)}
              ton={sansPreuve > 0 ? "danger" : "valide"}
              precision="Reçu ou capture à joindre"
            />
          </section>

          <Recherche
            chemin="/projets/depenses"
            valeur={filtres.q}
            placeholder="Numéro, objet, fournisseur, projet…"
            periode={{ ...filtres.periode, libelle: "Demandée" }}
            resultats={filtre ? `${affichees.length} sur ${depenses.length}` : undefined}
            filtres={
              <select name="statut" defaultValue={statut} aria-label="Étape" className={CLASSE_CHAMP_COMPACT}>
                <option value="">Toutes les étapes</option>
                <option value="demandee">À approuver</option>
                <option value="approuvee">À payer</option>
                <option value="payee">Payées</option>
                <option value="rejetee">Rejetées</option>
                <option value="annulee">Annulées</option>
              </select>
            }
          />
          {affichees.length === 0 ? (
            <EtatVide titre="Aucune dépense ne répond" message="Élargissez la période, changez d'étape ou retirez un mot de la recherche." />
          ) : (
            <TableauDepenses depenses={affichees} pieces={pieces} droits={{ approuver, payer, demander }} afficherProjet />
          )}
        </>
      )}
    </>
  );
}
