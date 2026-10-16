import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { creerConsultation } from "@/modules/marches/actions";
import { listerConsultations } from "@/modules/marches/creation";
import type { Consultation } from "@/modules/marches/schema";

export const metadata: Metadata = { title: "Consultations" };

const STATUT: Record<Consultation["statut"], { libelle: string; ton: TonPastille }> = {
  brouillon: { libelle: "Brouillon", ton: "neutre" },
  ouverte: { libelle: "Ouverte", ton: "alerte" },
  cloturee: { libelle: "Close, à attribuer", ton: "marque" },
  attribuee: { libelle: "Attribuée", ton: "valide" },
  annulee: { libelle: "Annulée", ton: "neutre" },
};

/**
 * Consultations lancées par l'entreprise : mettre plusieurs fournisseurs en
 * concurrence, comparer leurs offres sur le prix et la technique, attribuer.
 */
export default async function PageConsultations({ searchParams }: PageProps<"/marches/consultations">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [liste, gerer] = await Promise.all([listerConsultations(session.organizationId), peut("marches.consultation.gerer")]);
  const affiches = liste.filter(
    (c) => correspond(filtres.q, [c.numero, c.objet, c.description, c.criteres, c.retenue, STATUT[c.statut].libelle]) && dansPeriode(c.dateLimite, filtres.periode),
  );

  return (
    <>
      <EnTetePage
        titre="Consultations"
        sousTitre="Mettre des fournisseurs en concurrence, comparer leurs offres, attribuer"
        actions={
          gerer ? (
            <FormulaireRepliable libelle="Nouvelle consultation" titre="Consultation de fournisseurs" action={creerConsultation}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Champ libelle="Objet">
                  <input name="objet" required placeholder="Fourniture de 200 sacs de ciment" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Date limite de remise">
                  <input name="dateLimite" type="date" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Budget (FCFA, interne)">
                  <input name="budget" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Description">
                  <input name="description" placeholder="Livraison sur chantier à Bingerville" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Critères annoncés">
                  <input name="criteres" placeholder="Prix, délai de livraison, garantie" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Poids du prix (%)" precision="Le reste va à la note technique.">
                  <input name="poidsPrix" inputMode="numeric" defaultValue="60" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />
      {liste.length === 0 ? (
        <EtatVide titre="Aucune consultation" message="Pour un achat important, invitez plusieurs fournisseurs — par e-mail ou WhatsApp — puis comparez leurs offres côte à côte avant d'attribuer." />
      ) : (
        <>
          <Recherche
            chemin="/marches/consultations"
            valeur={filtres.q}
            placeholder="Numéro, objet, fournisseur retenu…"
            periode={{ ...filtres.periode, libelle: "Date limite" }}
            resultats={filtres.actif ? `${fmtEntier(affiches.length)} sur ${fmtEntier(liste.length)}` : undefined}
          />
          {affiches.length === 0 ? (
            <EtatVide titre="Aucune consultation ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>N°</Th>
                  <Th>Objet</Th>
                  <Th>Date limite</Th>
                  <Th aligne="droite">Offres</Th>
                  <Th>Retenue</Th>
                  <Th aligne="droite">Budget</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {affiches.map((c) => (
                  <tr key={c.id}>
                    <Td chiffres>{c.numero}</Td>
                    <Td fort>
                      <Link href={`/marches/consultations/${c.id}`} className="hover:underline">
                        {c.objet}
                      </Link>
                    </Td>
                    <Td chiffres>{c.dateLimite ? c.dateLimite.split("-").reverse().join("/") : "—"}</Td>
                    <Td aligne="droite" chiffres>
                      {c.recues} / {c.invitees}
                    </Td>
                    <Td>{c.retenue ?? "—"}</Td>
                    <Td aligne="droite" chiffres>
                      {c.budget !== null ? fmt(c.budget) : "—"}
                    </Td>
                    <Td>
                      <Pastille ton={STATUT[c.statut].ton}>{STATUT[c.statut].libelle}</Pastille>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
