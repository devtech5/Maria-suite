import type { Metadata } from "next";
import Link from "next/link";

import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { LIBELLE_STATUT_COMMANDE, type StatutCommande } from "@/modules/achats/calcul";
import { articlesAchetables, depotsActifs, fournisseursActifs, listerCommandes } from "@/modules/achats/requetes";

import { EditeurCommande } from "./editeur-commande";
import { PreparerReassort } from "./reassort";

export const metadata: Metadata = { title: "Achats" };

const TON: Record<StatutCommande, TonPastille> = {
  brouillon: "neutre",
  envoyee: "marque",
  partielle: "alerte",
  recue: "valide",
  annulee: "danger",
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const date = (iso: string) => JOUR.format(new Date(`${iso}T00:00:00Z`));

/**
 * Commandes fournisseurs. Le circuit : brouillon → envoyée → reçue (en une ou
 * plusieurs livraisons) → facturée → réglée.
 */
export default async function PageAchats({ searchParams }: PageProps<"/achats">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const gerer = await peut("achats.commande.gerer");
  // Les indicateurs portent sur les commandes en cours ; seul le tableau suit la recherche.
  const [commandes, trouvees, fournisseurs, depots, articles] = await Promise.all([
    listerCommandes(session.organizationId),
    filtres.actif ? listerCommandes(session.organizationId, filtres) : null,
    gerer ? fournisseursActifs(session.organizationId) : Promise.resolve([]),
    gerer ? depotsActifs(session.organizationId) : Promise.resolve([]),
    gerer ? articlesAchetables(session.organizationId) : Promise.resolve([]),
  ]);
  const lignes = trouvees ?? commandes;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const enCours = commandes.filter((c) => c.statut === "envoyee" || c.statut === "partielle");
  const enRetard = enCours.filter((c) => c.livraisonPrevue && c.livraisonPrevue < aujourdhui);
  const brouillons = commandes.filter((c) => c.statut === "brouillon");

  return (
    <>
      <EnTetePage
        titre="Achats"
        sousTitre="Commandes fournisseurs, de la demande à la livraison"
        actions={
          gerer ? (
            <>
              <PreparerReassort />
              {fournisseurs.length > 0 && <EditeurCommande fournisseurs={fournisseurs} depots={depots} articles={articles} aujourdhui={aujourdhui} />}
            </>
          ) : undefined
        }
      />

      {gerer && fournisseurs.length === 0 && (
        <p className="mb-5 rounded-xl border-l-4 border-alerte-500 bg-alerte-50 px-4 py-3 text-sm text-alerte-600">
          Aucun fournisseur déclaré. Créez-en un dans <Link href="/commercial/fournisseurs" className="font-semibold underline">Commercial → Fournisseurs</Link> avant de commander.
        </p>
      )}

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Brouillons" valeur={fmtEntier(brouillons.length)} precision="À relire et envoyer" />
        <CarteIndicateur libelle="En attente de livraison" valeur={fmtEntier(enCours.length)} ton="marque" precision={`${fmt(enCours.reduce((s, c) => s + c.totalTtc, 0))} F commandés`} />
        <CarteIndicateur libelle="Livraisons en retard" valeur={fmtEntier(enRetard.length)} ton={enRetard.length ? "danger" : "valide"} precision="Date de livraison dépassée" />
        <CarteIndicateur
          libelle="Reçu, pas encore facturé"
          valeur={fmtEntier(commandes.filter((c) => (c.statut === "recue" || c.statut === "partielle") && c.facture < c.totalTtc).length)}
          ton="alerte"
          precision="Facture fournisseur attendue"
        />
      </section>

      {commandes.length === 0 && !filtres.actif ? (
        <EtatVide
          titre="Aucune commande"
          message="Préparez une commande à la main, ou laissez le réassort proposer une commande par fournisseur à partir des articles passés sous leur seuil."
        />
      ) : (
        <>
          <Recherche
            chemin="/achats"
            valeur={filtres.q}
            placeholder="Numéro, fournisseur, contact, dépôt, note…"
            periode={{ ...filtres.periode, libelle: "Date de commande" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} commande${lignes.length > 1 ? "s" : ""}` : undefined}
          />

          {lignes.length === 0 ? (
            <EtatVide titre="Aucune commande ne répond" message="Élargissez la période ou retirez un mot de la recherche. La recherche couvre tout l'historique des commandes." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Commande</Th>
                  <Th>Fournisseur</Th>
                  <Th>Date</Th>
                  <Th>Livraison</Th>
                  <Th aligne="droite">Montant TTC</Th>
                  <Th aligne="droite">Facturé</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((c) => {
                  const retard = (c.statut === "envoyee" || c.statut === "partielle") && c.livraisonPrevue !== null && c.livraisonPrevue < aujourdhui;
                  return (
                    <tr key={c.id}>
                      <Td chiffres fort>
                        <Link href={`/achats/commandes/${c.id}`} className="text-marque-600 hover:underline">
                          {c.numero}
                        </Link>
                      </Td>
                      <Td>{c.fournisseur}</Td>
                      <Td chiffres>{date(c.dateCommande)}</Td>
                      <Td chiffres>
                        {c.livraisonPrevue ? <span className={retard ? "font-semibold text-danger-600" : ""}>{date(c.livraisonPrevue)}</span> : "—"}
                        {c.depot && <span className="block text-xs text-[var(--encre-faible)]">{c.depot}</span>}
                      </Td>
                      <Td aligne="droite" chiffres fort>{fmt(c.totalTtc)}</Td>
                      <Td aligne="droite" chiffres>{c.facture ? fmt(c.facture) : "—"}</Td>
                      <Td>
                        <Pastille ton={retard ? "danger" : TON[c.statut]}>{retard ? "En retard" : LIBELLE_STATUT_COMMANDE[c.statut]}</Pastille>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
