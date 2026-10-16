import type { Metadata } from "next";

import {
  CarteIndicateur,
  EnTetePage,
  EtatVide,
  Pastille,
  type TonPastille,
} from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { peut } from "@/lib/droits/garde";
import { signer } from "@/modules/documents/actions";
import {
  listerDemandesSignature,
  listerDocuments,
} from "@/modules/documents/requetes";
import type { StatutSignature } from "@/modules/documents/schema";

import { FormulaireSignature } from "./formulaire-signature";

export const metadata: Metadata = { title: "Signatures" };

const LIBELLE_SIGNATURE: Record<StatutSignature, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  partielle: "Partiellement signée",
  signee: "Signée",
  expiree: "Expirée",
  annulee: "Annulée",
};

const TON: Record<StatutSignature, TonPastille> = {
  brouillon: "neutre",
  envoyee: "marque",
  partielle: "alerte",
  signee: "valide",
  expiree: "danger",
  annulee: "neutre",
};

const dateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Demandes de signature.
 *
 * Une demande n'aboutit que lorsque TOUS les signataires ont signé : tant
 * qu'il en manque un, le document n'a aucune valeur, même partiellement signé.
 * L'écran affiche donc qui manque, pas seulement un pourcentage — on relance
 * une personne, pas une statistique.
 */
export default async function PageSignatures({ searchParams }: PageProps<"/documents/signatures">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);

  // Les indicateurs portent sur les dernières demandes ; seule la liste suit la recherche.
  const [demandes, trouvees, documents, peutSigner] = await Promise.all([
    listerDemandesSignature(session.organizationId),
    filtres.actif ? listerDemandesSignature(session.organizationId, 200, filtres) : null,
    listerDocuments(session.organizationId),
    peut("documents.signature.signer"),
  ]);

  const enAttente = demandes.filter(
    (d) => d.statut === "envoyee" || d.statut === "partielle",
  );
  const signees = demandes.filter((d) => d.statut === "signee");
  const expirees = demandes.filter((d) => d.statut === "expiree");

  const options = documents.map((doc) => ({ id: doc.id, nom: doc.nom }));
  const listees = trouvees ?? demandes;

  return (
    <>
      <EnTetePage
        titre="Signatures"
        sousTitre="Demandes envoyées et documents signés"
        actions={<FormulaireSignature documents={options} />}
      />

      <p className="mb-5 rounded-xl border-l-4 border-alerte-500 bg-alerte-50 px-4 py-3 text-sm text-alerte-600">
        <strong className="font-semibold">Trace d&apos;accord, pas signature
        qualifiée.</strong> Ce module enregistre qui a signé et quand. Il n&apos;y
        a ni certificat, ni horodatage qualifié, ni prestataire de confiance : ce
        n&apos;est pas une signature électronique au sens réglementaire, et un
        document contesté devant un tribunal ne s&apos;y appuierait pas seul.
      </p>

      {demandes.length === 0 ? (
        <EtatVide
          titre="Aucune demande"
          message={
            documents.length === 0
              ? "Déposez d'abord un document : une signature porte toujours sur une pièce."
              : "Une demande désigne ses signataires et n'aboutit que lorsque tous ont signé. Un document partiellement signé n'engage personne."
          }
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="En attente"
              valeur={fmtEntier(enAttente.length)}
              ton={enAttente.length > 0 ? "marque" : "valide"}
              precision="Signataires à relancer"
            />
            <CarteIndicateur
              libelle="Signées"
              valeur={fmtEntier(signees.length)}
              ton="valide"
              precision="Tous les signataires ont signé"
            />
            <CarteIndicateur
              libelle="Expirées"
              valeur={fmtEntier(expirees.length)}
              ton={expirees.length > 0 ? "danger" : "valide"}
              precision="À relancer depuis le début"
            />
          </section>

          <Recherche
            chemin="/documents/signatures"
            valeur={filtres.q}
            placeholder="Référence, document, signataire…"
            periode={{ ...filtres.periode, libelle: "Demandée" }}
            resultats={filtres.actif ? `${fmtEntier(listees.length)} demande${listees.length > 1 ? "s" : ""}` : undefined}
          />

          {listees.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucune demande de signature ne répond. Élargissez la période ou retirez un mot." />
          ) : (
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {listees.map((demande) => (
                <li
                  key={demande.id}
                  className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="chiffres text-xs text-[var(--encre-faible)]">
                        {demande.reference}
                      </p>
                      <p className="truncate text-sm font-semibold">
                        {demande.documentNom}
                      </p>
                    </div>
                    <Pastille ton={TON[demande.statut]}>
                      {LIBELLE_SIGNATURE[demande.statut]}
                    </Pastille>
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {demande.signataires.map((signataire) => (
                      <li key={signataire.id} className="flex items-center gap-2.5 text-sm">
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            signataire.signeLe
                              ? "bg-valide-500 text-white"
                              : "bg-[var(--surface-creuse)] text-[var(--encre-faible)]"
                          }`}
                          aria-hidden
                        >
                          {signataire.signeLe ? "✓" : "·"}
                        </span>

                        <span className="min-w-0 flex-1 truncate">
                          {signataire.nom}
                          <span className="ml-1.5 text-xs text-[var(--encre-faible)]">
                            {signataire.interne ? "interne" : "externe"}
                          </span>
                        </span>

                        {signataire.signeLe ? (
                          <span className="chiffres shrink-0 text-xs text-[var(--encre-faible)]">
                            {dateCourte.format(signataire.signeLe)}
                          </span>
                        ) : signataire.interne &&
                          peutSigner &&
                          demande.statut !== "expiree" &&
                          demande.statut !== "annulee" ? (
                          /* Seul un signataire INTERNE signe depuis l'application.
                             Un tiers extérieur signera depuis un lien reçu — page
                             publique encore à construire. */
                          <form action={signer} className="shrink-0">
                            <input
                              type="hidden"
                              name="signataireId"
                              value={signataire.id}
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-[var(--filet)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--surface-creuse)]"
                            >
                              Signer
                            </button>
                          </form>
                        ) : (
                          <span className="chiffres shrink-0 text-xs text-[var(--encre-faible)]">
                            en attente
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--filet)] pt-2.5 text-xs">
                    <span className="chiffres text-[var(--encre-faible)]">
                      Demandée le {dateCourte.format(demande.creeeLe)} · expire le {dateCourte.format(demande.expireLe)}
                    </span>

                    {/* Le code transmis de vive voix, hors du canal d'envoi, est ce
                        qui empêche un tiers ayant accès au message de signer. */}
                    {demande.codeSecurite && (
                      <Pastille ton="marque">Code à 6 chiffres</Pastille>
                    )}

                    {demande.manquants > 0 && demande.statut !== "expiree" && (
                      <span className="ml-auto font-semibold text-alerte-600">
                        {demande.manquants} signature
                        {demande.manquants > 1 ? "s" : ""} manquante
                        {demande.manquants > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
        Un document partiellement signé n&apos;engage personne. Tant qu&apos;un
        signataire manque, la demande reste ouverte — et le statut se déduit des
        signataires, il ne se saisit pas : une demande affichée « signée » alors
        qu&apos;il en manque un produirait un document sans valeur.
      </p>
    </>
  );
}
