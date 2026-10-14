import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, CarteIndicateur, Champ, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { creerConvention } from "@/modules/marches/actions";
import { ETATS_CONVENTION, type EtatConvention } from "@/modules/marches/calcul";
import { listerConventions } from "@/modules/marches/creation";
import { listerTiers } from "@/modules/tiers/requetes";

export const metadata: Metadata = { title: "Conventions" };


const TON: Record<EtatConvention, TonPastille> = { a_venir: "neutre", en_vigueur: "valide", a_renouveler: "alerte", expiree: "danger", resiliee: "neutre" };
const SENS = { client: "Client", fournisseur: "Fournisseur", partenariat: "Partenariat" } as const;
const date = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Conventions et contrats-cadres : échéance, préavis, reconduction, avenants. */
export default async function PageConventions() {
  const session = await exigerEntreprise();
  const [liste, gerer] = await Promise.all([listerConventions(session.organizationId), peut("marches.convention.gerer")]);
  const partenaires = gerer ? await listerTiers(session.organizationId) : [];
  const aRenouveler = liste.filter((c) => c.etat === "a_renouveler").length;
  const enVigueur = liste.filter((c) => c.etat === "en_vigueur" || c.etat === "a_renouveler").length;

  return (
    <>
      <EnTetePage
        titre="Conventions"
        sousTitre="Contrats-cadres avec vos clients, fournisseurs et partenaires"
        actions={
          gerer ? (
            <FormulaireRepliable libelle="Nouvelle convention" titre="Convention" action={creerConvention}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Champ libelle="Intitulé">
                  <input name="intitule" required placeholder="Contrat de maintenance annuel" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Sens">
                  <select name="sens" className={CLASSE_CHAMP}>
                    {Object.entries(SENS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Partenaire">
                  <input name="partenaire" required placeholder="SODECI" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Fiche tiers (facultatif)">
                  <select name="tiersId" className={CLASSE_CHAMP}>
                    <option value="">—</option>
                    {partenaires.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nom}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Début">
                  <input name="debut" type="date" required className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Fin (vide si durée indéterminée)">
                  <input name="fin" type="date" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Préavis (jours)">
                  <input name="preavisJours" inputMode="numeric" defaultValue="30" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Montant annuel ou plafond HT (FCFA)">
                  <input name="montant" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Objet">
                  <input name="objet" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Document signé">
                  <input name="fichier" type="file" accept="application/pdf,image/*,.doc,.docx" className="block w-full text-sm" />
                </Champ>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" name="reconductionTacite" className="size-4" />
                  Reconduction tacite
                </label>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />
      {liste.length === 0 ? (
        <EtatVide titre="Aucune convention" message="Enregistrez vos contrats de maintenance, d'approvisionnement, de partenariat : une alerte prévient quand le préavis de renouvellement ou de dénonciation commence." />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <CarteIndicateur libelle="En vigueur" valeur={fmtEntier(enVigueur)} precision="Conventions actives" />
            <CarteIndicateur libelle="À renouveler" valeur={fmtEntier(aRenouveler)} ton={aRenouveler > 0 ? "alerte" : "valide"} precision="Dans leur préavis" />
            <CarteIndicateur libelle="Total" valeur={fmtEntier(liste.length)} precision="Toutes conventions" />
          </section>
          <Tableau>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>Convention</Th>
                <Th>Partenaire</Th>
                <Th>Période</Th>
                <Th aligne="droite">Montant</Th>
                <Th>État</Th>
              </tr>
            </thead>
            <tbody>
              {liste.map((c) => (
                <tr key={c.id}>
                  <Td chiffres>{c.numero}</Td>
                  <Td fort>
                    <Link href={`/marches/conventions/${c.id}`} className="hover:underline">
                      {c.intitule}
                    </Link>
                    {c.avenants.length > 0 && <span className="block text-xs font-normal text-[var(--encre-douce)]">{c.avenants.length} avenant{c.avenants.length > 1 ? "s" : ""}</span>}
                  </Td>
                  <Td>
                    {c.partenaire}
                    <span className="block text-xs text-[var(--encre-faible)]">{SENS[c.sens]}</span>
                  </Td>
                  <Td chiffres>
                    {date(c.debut)} → {c.finEffective ? date(c.finEffective) : "indéterminée"}
                    {c.reconductionTacite && <span className="block text-xs text-[var(--encre-faible)]">reconduction tacite</span>}
                  </Td>
                  <Td aligne="droite" chiffres>
                    {c.montantEffectif !== null ? fmt(c.montantEffectif) : "—"}
                  </Td>
                  <Td>
                    <Pastille ton={TON[c.etat]}>{ETATS_CONVENTION[c.etat]}</Pastille>
                    {c.etat === "a_renouveler" && c.jours !== null && <span className="block text-xs text-alerte-600">Fin dans {c.jours} j</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        </>
      )}
    </>
  );
}
