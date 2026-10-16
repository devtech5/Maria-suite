import type { Metadata } from "next";

import {
  CarteIndicateur,
  Champ,
  CLASSE_CHAMP,
  EnTetePage,
  EtatVide,
  Pastille,
  Tableau,
  Td,
  Th,
} from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier, fmtPeriode } from "@/lib/format";
import { inscrireAdherent } from "@/modules/reservations/actions";
import { accesAbonnement, ajouterJours } from "@/modules/reservations/calcul";
import { listerAbonnements } from "@/modules/reservations/requetes";

import { BoutonPassage, FormulaireRepliable } from "../outils";

export const metadata: Metadata = { title: "Abonnements" };

const heure = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/**
 * Abonnements et adhésions.
 *
 * Deux régimes : au forfait, seule la date de fin compte ; à la séance, c'est
 * le solde. Un adhérent au forfait qui expire demain et un adhérent à la
 * séance à zéro entrée sont tous deux bloqués à l'accueil, mais pour des
 * raisons opposées — l'écran dit laquelle.
 */
export default async function PageAbonnements() {
  const session = await exigerEntreprise();
  const [adherents, gerer] = await Promise.all([
    listerAbonnements(session.organizationId),
    peut("reservation.abonnement.gerer"),
  ]);

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const avecAcces = adherents.map((a) => ({ ...a, acces: accesAbonnement(a, aujourdHui) }));
  const actifs = avecAcces.filter((a) => a.acces.ok);
  const bloques = avecAcces.filter((a) => !a.acces.ok && a.fin >= aujourdHui);
  const recettes = adherents
    .filter((a) => a.debut.slice(0, 7) === aujourdHui.slice(0, 7))
    .reduce((s, a) => s + a.montant, 0);

  return (
    <>
      <EnTetePage
        titre="Abonnements"
        sousTitre="Adhérents, formules et entrées"
        actions={
          gerer ? (
            <FormulaireRepliable libelle="Nouvel adhérent" titre="Inscrire un adhérent" presentation="tiroir" action={inscrireAdherent}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Champ libelle="Nom">
                  <input name="nom" required className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Téléphone">
                  <input name="telephone" inputMode="tel" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Formule">
                  <input name="formule" required placeholder="Illimité mensuel, 12 séances…" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Séances incluses" precision="Vide : accès illimité sur la période.">
                  <input name="seancesIncluses" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Du">
                  <input name="debut" type="date" required defaultValue={aujourdHui} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Au">
                  <input name="fin" type="date" required defaultValue={ajouterJours(aujourdHui, 29)} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Montant encaissé (TTC)">
                  <input name="montant" inputMode="numeric" required className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Moyen">
                  <select name="moyen" className={CLASSE_CHAMP}>
                    <option value="especes">Espèces</option>
                    <option value="mobile_money">Mobile money</option>
                    <option value="banque">Virement / chèque</option>
                  </select>
                </Champ>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {adherents.length === 0 ? (
        <EtatVide
          titre="Aucun adhérent"
          message="Inscrivez un adhérent avec sa formule : au forfait, il entre jusqu'à la date de fin ; à la séance, chaque entrée décompte son carnet."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur libelle="Adhérents actifs" valeur={fmtEntier(actifs.length)} precision={`Sur ${adherents.length} inscrits`} />
            <CarteIndicateur
              libelle="Bloqués à l'accueil"
              valeur={fmtEntier(bloques.length)}
              ton={bloques.length > 0 ? "alerte" : "valide"}
              precision="Carnet épuisé avant la date de fin"
            />
            <CarteIndicateur libelle="Formules du mois" valeur={fmtCompact(recettes)} unite="FCFA" ton="valide" />
          </section>

          <Tableau>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Adhérent</Th>
                <Th>Formule</Th>
                <Th>Validité</Th>
                <Th aligne="droite">Séances</Th>
                <Th>Accès</Th>
                <Th aligne="droite">Montant</Th>
                {gerer && <Th aligne="droite">Accueil</Th>}
              </tr>
            </thead>
            <tbody>
              {avecAcces.map((a) => (
                <tr key={a.id}>
                  <Td chiffres fort>{a.code}</Td>
                  <Td>
                    {a.nom}
                    <span className="block text-xs text-[var(--encre-faible)]">
                      {a.derniereVenue ? `Dernière venue ${heure.format(a.derniereVenue)}` : "Jamais venu"}
                    </span>
                  </Td>
                  <Td>{a.formule}</Td>
                  <Td chiffres>
                    {fmtPeriode(a.debut, a.fin)}
                  </Td>
                  <Td aligne="droite" chiffres>
                    {a.seancesIncluses === null ? `${a.seancesConsommees} · illimité` : `${a.seancesConsommees} / ${a.seancesIncluses}`}
                  </Td>
                  <Td>
                    {a.acces.ok ? (
                      <Pastille ton="valide">Autorisé</Pastille>
                    ) : (
                      <Pastille ton="danger">{a.acces.raison}</Pastille>
                    )}
                  </Td>
                  <Td aligne="droite" chiffres>{fmt(a.montant)}</Td>
                  {gerer && (
                    <Td aligne="droite">
                      <BoutonPassage id={a.id} desactive={!a.acces.ok} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tableau>
        </>
      )}
    </>
  );
}
