import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, CarteIndicateur, Champ, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { creerSoumission } from "@/modules/marches/actions";
import { STATUTS_SOUMISSION, TYPES_MARCHE, joursRestants, type StatutSoumission } from "@/modules/marches/calcul";
import { listerSoumissions } from "@/modules/marches/creation";

export const metadata: Metadata = { title: "Appels d'offres" };

const TON: Record<StatutSoumission, TonPastille> = {
  veille: "neutre",
  en_preparation: "alerte",
  deposee: "marque",
  gagnee: "valide",
  perdue: "danger",
  abandonnee: "neutre",
};

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Appels d'offres auxquels l'entreprise répond : de la veille au résultat,
 * avec le dossier administratif à compléter avant la date limite.
 */
export default async function PageAppelsOffres() {
  const session = await exigerEntreprise();
  const [liste, gerer] = await Promise.all([listerSoumissions(session.organizationId), peut("marches.soumission.gerer")]);
  const maintenant = new Date();
  const enCours = liste.filter((s) => s.statut === "veille" || s.statut === "en_preparation");
  const deposees = liste.filter((s) => s.statut === "deposee");
  const tranchees = liste.filter((s) => s.statut === "gagnee" || s.statut === "perdue");
  const gagnees = liste.filter((s) => s.statut === "gagnee");
  const tauxSucces = tranchees.length > 0 ? Math.round((gagnees.length * 100) / tranchees.length) : null;

  return (
    <>
      <EnTetePage
        titre="Appels d'offres"
        sousTitre="Marchés publics, privés et bailleurs auxquels vous répondez"
        actions={
          gerer ? (
            <FormulaireRepliable libelle="Nouvel appel d'offres" titre="Appel d'offres repéré" presentation="tiroir" action={creerSoumission}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Champ libelle="Objet du marché">
                  <input name="intitule" required placeholder="Fourniture de matériel informatique" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Autorité contractante">
                  <input name="autorite" required placeholder="Mairie de Cocody" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Référence de l'avis">
                  <input name="reference" placeholder="DAO n° 2026/014" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Type">
                  <select name="type" className={CLASSE_CHAMP}>
                    {Object.entries(TYPES_MARCHE).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Date limite de dépôt">
                  <input name="dateLimite" type="datetime-local" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Lots">
                  <input name="lots" placeholder="Lot 2 — ordinateurs portables" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Budget estimé (FCFA)">
                  <input name="budgetEstime" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Caution de soumission (FCFA)">
                  <input name="caution" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Remarques">
                  <input name="notes" className={CLASSE_CHAMP} />
                </Champ>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {liste.length === 0 ? (
        <EtatVide
          titre="Aucun appel d'offres suivi"
          message="Notez chaque avis repéré : la date limite, la caution, le dossier administratif type (attestations DGI et CNPS, RCCM, DFE…) se prépare pièce par pièce, et une alerte prévient si la date approche avec un dossier incomplet."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <CarteIndicateur libelle="En préparation" valeur={fmtEntier(enCours.length)} ton={enCours.some((s) => s.enDanger) ? "danger" : undefined} precision={`${enCours.filter((s) => s.enDanger).length} en danger`} />
            <CarteIndicateur libelle="Déposées" valeur={fmtEntier(deposees.length)} precision="En attente du résultat" />
            <CarteIndicateur libelle="Taux de succès" valeur={tauxSucces === null ? "—" : `${tauxSucces} %`} precision={`${gagnees.length} gagnée${gagnees.length > 1 ? "s" : ""} sur ${tranchees.length}`} />
            <CarteIndicateur libelle="Montant gagné" valeur={fmtCompact(gagnees.reduce((s, x) => s + (x.montantPropose ?? 0), 0))} unite="FCFA" precision="Offres retenues" />
          </section>
          <Tableau>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>Marché</Th>
                <Th>Date limite</Th>
                <Th>Dossier</Th>
                <Th aligne="droite">Offre</Th>
                <Th>État</Th>
              </tr>
            </thead>
            <tbody>
              {liste.map((s) => {
                const j = s.dateLimite ? joursRestants(s.dateLimite, maintenant) : null;
                return (
                  <tr key={s.id}>
                    <Td chiffres>{s.numero}</Td>
                    <Td fort>
                      <Link href={`/marches/soumissions/${s.id}`} className="hover:underline">
                        {s.intitule}
                      </Link>
                      <span className="block text-xs font-normal text-[var(--encre-douce)]">
                        {s.autorite} · {TYPES_MARCHE[s.type]}
                        {s.reference ? ` · ${s.reference}` : ""}
                      </span>
                    </Td>
                    <Td chiffres>
                      {s.dateLimite ? (
                        <>
                          {HEURE.format(s.dateLimite)}
                          {(s.statut === "veille" || s.statut === "en_preparation") && j !== null && (
                            <span className={`block text-xs ${j < 0 ? "text-danger-600" : j <= 7 ? "text-alerte-600" : "text-[var(--encre-faible)]"}`}>{j < 0 ? "Dépassée" : `Dans ${j} j`}</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      {s.manquantes === 0 ? <Pastille ton="valide">Complet</Pastille> : <Pastille ton={s.enDanger ? "danger" : "alerte"}>{s.manquantes} manquante{s.manquantes > 1 ? "s" : ""}</Pastille>}
                    </Td>
                    <Td aligne="droite" chiffres>
                      {s.montantPropose !== null ? fmt(s.montantPropose) : "—"}
                    </Td>
                    <Td>
                      <Pastille ton={TON[s.statut]}>{STATUTS_SOUMISSION[s.statut]}</Pastille>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tableau>
        </>
      )}
    </>
  );
}
