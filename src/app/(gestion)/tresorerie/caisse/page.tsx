import type { Metadata } from "next";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, CLASSE_CHAMP, EnTetePage, EtatVide, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { arreterCaisse, demanderBon, remettreAvance } from "@/modules/tresorerie/actions";
import { NATURES_BON, type NatureBon } from "@/modules/tresorerie/calcul";
import { beneficiairesProposes, listerArretes, listerAvances, listerBons, listerComptes } from "@/modules/tresorerie/requetes";

import { libelleChamp, OptionsComptes } from "../champs";
import { ListeAvances } from "./avances";
import { ListeBons } from "./bons";
import { ChampsArrete } from "./champs-arrete";
import { ChoixBeneficiaire } from "./choix-beneficiaire";

export const metadata: Metadata = { title: "Caisse de dépenses" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Caisse de dépenses : ce qui sort de la petite caisse — bons de caisse,
 * avances au personnel — et l'arrêté qui la contrôle.
 *
 * Qui ne fait que demander des bons ne voit que les siens.
 */
export default async function PageCaisseDepenses() {
  const session = await exigerEntreprise();
  const [consulter, demander, approuver, tenir] = await Promise.all([
    peut("tresorerie.consulter"),
    peut("tresorerie.bon.demander"),
    peut("tresorerie.bon.approuver"),
    peut("tresorerie.caisse.tenir"),
  ]);
  const voitTout = consulter || approuver;

  const [comptes, bons, avances, arretes, beneficiaires] = await Promise.all([
    listerComptes(session.organizationId),
    listerBons(session.organizationId, session.userId, voitTout),
    consulter ? listerAvances(session.organizationId) : Promise.resolve([]),
    consulter ? listerArretes(session.organizationId) : Promise.resolve([]),
    demander || tenir
      ? beneficiairesProposes(session.organizationId)
      : Promise.resolve({ fournisseurs: [], personnel: [], intervenants: [], comptes: [] }),
  ]);
  const choix = comptes.filter((c) => c.actif).map((c) => ({ id: c.id, nom: c.nom, nature: c.nature, solde: c.solde }));
  const caisses = choix.filter((c) => c.nature !== "banque");
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const aApprouver = bons.filter((b) => b.statut === "demande");
  const aDecaisser = bons.filter((b) => b.statut === "approuve");
  const ouvertes = avances.filter((a) => a.statut === "ouverte");

  return (
    <>
      <EnTetePage
        titre="Caisse de dépenses"
        sousTitre={voitTout ? "Bons de caisse, avances au personnel et arrêtés" : "Vos demandes de bons de caisse"}
        actions={
          <>
            {demander && caisses.length > 0 && (
              <FormulaireRepliable libelle="Demander un bon" titre="Demande de bon de caisse" action={demanderBon}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={libelleChamp}>Nature de la dépense</span>
                    <select name="nature" required defaultValue="" className={CLASSE_CHAMP}>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {(Object.keys(NATURES_BON) as NatureBon[]).map((n) => (
                        <option key={n} value={n}>
                          {NATURES_BON[n].libelle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Montant (F)</span>
                    <input name="montant" required inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                  </label>
                  <ChoixBeneficiaire
                    libelle="Payé à"
                    groupes={[
                      { libelle: "Fournisseurs", fiches: beneficiaires.fournisseurs },
                      { libelle: "Personnel", fiches: beneficiaires.personnel },
                      { libelle: "Intervenants", fiches: beneficiaires.intervenants },
                    ]}
                    exemple="Taxi, station de passage…"
                  />
                  <label className="block">
                    <span className={libelleChamp}>Caisse qui paie</span>
                    <select name="caisseId" required defaultValue={caisses.length === 1 ? caisses[0].id : ""} className={CLASSE_CHAMP}>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      <OptionsComptes comptes={caisses} sansBanque masquerSolde={!consulter} />
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={libelleChamp}>À quoi sert la dépense</span>
                    <input name="motif" required minLength={3} maxLength={500} className={CLASSE_CHAMP} />
                  </label>
                </div>
              </FormulaireRepliable>
            )}
            {tenir && caisses.length > 0 && (
              <FormulaireRepliable libelle="Remettre une avance" titre="Avance au personnel" action={remettreAvance}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoixBeneficiaire
                    libelle="Bénéficiaire"
                    groupes={[
                      { libelle: "Personnel", fiches: beneficiaires.personnel },
                      { libelle: "Comptes hors Personnel", fiches: beneficiaires.comptes },
                    ]}
                    exemple="Konan Michel, livreur"
                  />
                  <label className="block">
                    <span className={libelleChamp}>Montant (F)</span>
                    <input name="montant" required inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Caisse qui avance</span>
                    <select name="caisseId" required defaultValue={caisses.length === 1 ? caisses[0].id : ""} className={CLASSE_CHAMP}>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      <OptionsComptes comptes={caisses} sansBanque />
                    </select>
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>À régulariser avant le</span>
                    <input type="date" name="echeance" className={CLASSE_CHAMP} />
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Objet</span>
                    <input name="motif" required minLength={3} maxLength={500} placeholder="Mission Bouaké, achat de pièces…" className={CLASSE_CHAMP} />
                  </label>
                </div>
              </FormulaireRepliable>
            )}
            {tenir && caisses.length > 0 && (
              <FormulaireRepliable libelle="Arrêter une caisse" titre="Arrêté de caisse" action={arreterCaisse}>
                <ChampsArrete caisses={caisses} />
              </FormulaireRepliable>
            )}
          </>
        }
      />

      {caisses.length === 0 ? (
        <EtatVide
          titre="Aucune caisse déclarée"
          message={consulter ? "Déclarez d'abord une caisse dans l'onglet Comptes : c'est d'elle que sortiront les bons et les avances." : "Aucune caisse de dépenses n'est encore ouverte. Adressez-vous au responsable."}
        />
      ) : (
        <>
          {voitTout && (
            <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
              <CarteIndicateur libelle="Bons à approuver" valeur={fmtEntier(aApprouver.length)} ton={aApprouver.length ? "alerte" : "valide"} precision={`${fmt(aApprouver.reduce((s, b) => s + b.montant, 0))} F demandés`} />
              <CarteIndicateur libelle="Bons à décaisser" valeur={fmtEntier(aDecaisser.length)} ton={aDecaisser.length ? "marque" : "neutre"} precision={`${fmt(aDecaisser.reduce((s, b) => s + b.montant, 0))} F approuvés`} />
              <CarteIndicateur libelle="Avances ouvertes" valeur={fmtEntier(ouvertes.length)} ton={ouvertes.length ? "alerte" : "valide"} precision={`${fmt(ouvertes.reduce((s, a) => s + a.reste, 0))} F à régulariser`} />
              <CarteIndicateur libelle="En caisse" valeur={fmt(caisses.reduce((s, c) => s + c.solde, 0))} unite="FCFA" precision={`${caisses.length} caisse${caisses.length > 1 ? "s" : ""} et portefeuille${caisses.length > 1 ? "s" : ""}`} />
            </section>
          )}

          <section className="mb-6">
            <h2 className="mb-2 text-base font-semibold">Bons de caisse</h2>
            <ListeBons
              bons={bons.map((b) => ({
                id: b.id,
                numero: b.numero,
                caisse: b.caisse,
                nature: b.nature,
                montant: b.montant,
                beneficiaire: b.beneficiaire,
                beneficiaireQualite: b.beneficiaireQualite,
                motif: b.motif,
                statut: b.statut,
                demandeParUserId: b.demandeParUserId,
                demandeur: b.demandeur,
                demandeLeIso: b.demandeLe.toISOString(),
                approbateur: b.approbateur,
                motifRejet: b.motifRejet,
                decaisseLeIso: b.decaisseLe?.toISOString() ?? null,
                ecriture: b.ecriture,
                avecJustificatif: Boolean(b.justificatifChemin),
              }))}
              moi={session.userId}
              droits={{ approuver, decaisser: tenir, estProprietaire: session.estProprietaire }}
            />
          </section>

          {consulter && (
            <section className="mb-6">
              <h2 className="mb-2 text-base font-semibold">Avances au personnel</h2>
              <ListeAvances
                avances={avances.map((a) => ({
                  id: a.id,
                  numero: a.numero,
                  caisse: a.caisse,
                  beneficiaire: a.beneficiaire,
                  beneficiaireQualite: a.beneficiaireQualite,
                  montant: a.montant,
                  reste: a.reste,
                  motif: a.motif,
                  echeance: a.echeance,
                  statut: a.statut,
                  remiseLeIso: a.remiseLe.toISOString(),
                  ecriture: a.ecriture,
                  regularisations: a.regularisations.map((r) => ({ type: r.type, montant: r.montant, nature: r.nature, libelle: r.libelle, ecriture: r.ecriture })),
                }))}
                caisses={caisses}
                regulariser={tenir}
                aujourdhui={aujourdhui}
              />
            </section>
          )}

          {consulter && arretes.length > 0 && (
            <section>
              <h2 className="mb-2 text-base font-semibold">Arrêtés de caisse</h2>
              <Tableau>
                <thead>
                  <tr>
                    <Th>Arrêté</Th>
                    <Th>Caisse</Th>
                    <Th>Date</Th>
                    <Th aligne="droite">Attendu</Th>
                    <Th aligne="droite">Compté</Th>
                    <Th aligne="droite">Écart</Th>
                    <Th>Écriture</Th>
                  </tr>
                </thead>
                <tbody>
                  {arretes.map((a) => (
                    <tr key={a.id}>
                      <Td chiffres fort>{a.numero}</Td>
                      <Td>
                        {a.compte}
                        {a.auteur && <span className="block text-xs text-[var(--encre-faible)]">{a.auteur}</span>}
                      </Td>
                      <Td chiffres>{JOUR.format(new Date(`${a.date}T00:00:00Z`))}</Td>
                      <Td aligne="droite" chiffres>{fmt(a.theorique)}</Td>
                      <Td aligne="droite" chiffres>{fmt(a.constate)}</Td>
                      <Td aligne="droite" chiffres fort>
                        <span className={a.ecart === 0 ? "text-valide-600" : a.ecart < 0 ? "text-danger-600" : "text-alerte-600"}>
                          {a.ecart === 0 ? "0" : `${a.ecart > 0 ? "+" : "−"} ${fmt(Math.abs(a.ecart))}`}
                        </span>
                      </Td>
                      <Td chiffres>{a.ecriture ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tableau>
            </section>
          )}
        </>
      )}
    </>
  );
}
