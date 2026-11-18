import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, CLASSE_CHAMP, EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";
import { servicesActifs } from "@/modules/personnes/referentiel-services";
import { demanderCommandeInterne } from "@/modules/tresorerie/actions-commandes-internes";
import { beneficiairesProposes } from "@/modules/tresorerie/requetes";
import { listerCommandesInternes } from "@/modules/tresorerie/requetes-commandes-internes";

import { libelleChamp } from "../../champs";
import { ChoixBeneficiaire } from "../choix-beneficiaire";
import { OngletsCaisse } from "../onglets-caisse";
import { LignesCommande } from "./lignes-commande";
import { ListeCommandes } from "./liste-commandes";

export const metadata: Metadata = { title: "Bons de commande internes" };

/**
 * Bons de commande internes : le personnel chiffre un besoin (équipement,
 * fournitures, abonnements), la direction l'approuve ou le refuse, le bon
 * s'imprime avec les visas. Le bon de commande fournisseur reste dans Achats.
 *
 * Mêmes droits que les bons de caisse : qui ne fait que demander ne voit que
 * les siens.
 */
export default async function PageCommandesInternes() {
  const session = await exigerEntreprise();
  const [consulter, demander, approuver] = await Promise.all([peut("tresorerie.consulter"), peut("tresorerie.bon.demander"), peut("tresorerie.bon.approuver")]);
  if (!demander && !consulter && !approuver) return <AccesRefuse droit="tresorerie.bon.demander" />;
  const voitTout = consulter || approuver;

  const [commandes, services, identite, beneficiaires] = await Promise.all([
    listerCommandesInternes(session.organizationId, session.userId, voitTout),
    demander ? servicesActifs(session.organizationId) : Promise.resolve([]),
    demander ? identiteEntreprise(session.organizationId) : Promise.resolve(null),
    demander ? beneficiairesProposes(session.organizationId) : Promise.resolve({ fournisseurs: [], personnel: [], intervenants: [], comptes: [] }),
  ]);
  // Livraison au siège par défaut : l'adresse de l'en-tête des documents.
  const adresseSiege = identite ? [identite.adresse, identite.ville].filter(Boolean).join(", ") : "";
  const siege = adresseSiege ? `Siège — ${adresseSiege}` : "Siège";
  const aApprouver = commandes.filter((c) => c.statut === "demande");
  const approuvees = commandes.filter((c) => c.statut === "approuve");

  return (
    <>
      <OngletsCaisse actif="/tresorerie/caisse/commandes" />
      <EnTetePage
        titre="Bons de commande internes"
        sousTitre={voitTout ? "Besoins chiffrés du personnel, à approuver" : "Vos demandes de bons de commande internes"}
        actions={
          demander && (
            <FormulaireRepliable libelle="Nouveau bon de commande" titre="Bon de commande interne" action={demanderCommandeInterne}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={libelleChamp}>Objet</span>
                  <input name="objet" required minLength={3} maxLength={200} placeholder="Équipement — ordinateurs, téléphones et flotte Orange" className={CLASSE_CHAMP} />
                </label>
                <ChoixBeneficiaire
                  libelle="Bénéficiaire"
                  libelleNom="Nom et prénom du bénéficiaire"
                  groupes={[
                    { libelle: "Personnel", fiches: beneficiaires.personnel },
                    { libelle: "Comptes hors Personnel", fiches: beneficiaires.comptes },
                  ]}
                  exemple="Kouassi Aya"
                />
                <label className="block">
                  <span className={libelleChamp}>Service demandeur (facultatif)</span>
                  {services.length > 0 ? (
                    <select name="service" defaultValue="" className={CLASSE_CHAMP}>
                      <option value="">Aucun</option>
                      {services.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input name="service" maxLength={120} className={CLASSE_CHAMP} />
                  )}
                </label>
                <label className="block">
                  <span className={libelleChamp}>Lieu de livraison</span>
                  <input name="lieuLivraison" maxLength={200} defaultValue={siege} className={CLASSE_CHAMP} />
                </label>
              </div>
              <div className="mt-4">
                <LignesCommande />
              </div>
              <label className="mt-3 block">
                <span className={libelleChamp}>Observations (facultatif)</span>
                <textarea name="notes" rows={2} maxLength={1000} placeholder="Tarif : 5 000 F / numéro / mois, ensuite 55 000 F / mois" className={CLASSE_CHAMP} />
              </label>
            </FormulaireRepliable>
          )
        }
      />

      {voitTout && (
        <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3">
          <CarteIndicateur libelle="À approuver" valeur={fmtEntier(aApprouver.length)} ton={aApprouver.length ? "alerte" : "valide"} precision={`${fmt(aApprouver.reduce((s, c) => s + c.total, 0))} F demandés`} />
          <CarteIndicateur libelle="Approuvés" valeur={fmtEntier(approuvees.length)} ton="neutre" precision={`${fmt(approuvees.reduce((s, c) => s + c.total, 0))} F engagés`} />
        </section>
      )}

      <ListeCommandes
        commandes={commandes.map((c) => ({
          id: c.id,
          numero: c.numero,
          objet: c.objet,
          service: c.service,
          beneficiaire: c.beneficiaire,
          nombreLignes: c.lignes.length,
          total: c.total,
          statut: c.statut,
          demandeParUserId: c.demandeParUserId,
          demandeur: c.demandeur,
          demandeLeIso: c.demandeLe.toISOString(),
          approbateur: c.approbateur,
          motifRejet: c.motifRejet,
        }))}
        moi={session.userId}
        droits={{ approuver, estProprietaire: session.estProprietaire }}
      />
    </>
  );
}
