import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { ETATS_CONVENTION, type EtatConvention } from "@/modules/marches/calcul";
import { listerConventions } from "@/modules/marches/creation";

export const metadata: Metadata = { title: "Contrats fournisseurs" };

const TON: Record<EtatConvention, TonPastille> = { a_venir: "neutre", en_vigueur: "valide", a_renouveler: "alerte", expiree: "danger", resiliee: "neutre" };
const ORDRE: Record<EtatConvention, number> = { a_renouveler: 0, expiree: 1, a_venir: 2, en_vigueur: 3, resiliee: 4 };
const date = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/**
 * Contrats fournisseurs : les conventions au sens « Fournisseur ».
 *
 * Elles se créent et se modifient dans Marchés et conventions, qui tient
 * préavis, reconduction tacite, avenants et pièce signée ; cet écran les
 * présente échéances en tête.
 */
export default async function PageContratsFournisseurs() {
  if (!(await peut("marches.consulter"))) return <AccesRefuse droit="marches.consulter" />;
  const session = await exigerEntreprise();
  const [toutes, gerer] = await Promise.all([listerConventions(session.organizationId), peut("marches.convention.gerer")]);

  const lignes = toutes
    .filter((c) => c.sens === "fournisseur")
    .sort((a, b) => ORDRE[a.etat] - ORDRE[b.etat] || (a.finEffective ?? "9999").localeCompare(b.finEffective ?? "9999"));
  const compte = (e: EtatConvention) => lignes.filter((l) => l.etat === e).length;
  const engage = lignes
    .filter((l) => l.etat === "en_vigueur" || l.etat === "a_renouveler")
    .reduce((s, l) => s + (l.montantEffectif ?? 0), 0);

  return (
    <>
      <EnTetePage
        titre="Contrats fournisseurs"
        sousTitre="Maintenance, location, approvisionnement : échéance, préavis et reconduction."
        actions={
          gerer ? (
            <Link href="/marches/conventions" className="h-cible flex items-center rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700">
              Nouveau contrat fournisseur
            </Link>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CarteIndicateur libelle="En vigueur" valeur={fmtEntier(compte("en_vigueur"))} ton="valide" />
        <CarteIndicateur libelle="À renouveler" valeur={fmtEntier(compte("a_renouveler"))} ton="alerte" precision="Dans le délai de préavis" />
        <CarteIndicateur libelle="Expirés" valeur={fmtEntier(compte("expiree"))} ton="danger" />
        <CarteIndicateur libelle="Montant engagé" valeur={fmt(engage)} unite="FCFA" precision="Contrats en vigueur, avenants compris" />
      </div>

      {lignes.length === 0 ? (
        <EtatVide
          titre="Aucun contrat fournisseur"
          message="Un contrat fournisseur s'enregistre comme convention au sens « Fournisseur », dans Marchés et conventions : préavis, reconduction et avenants y sont suivis."
          actions={
            gerer ? (
              <Link href="/marches/conventions" className="h-cible flex items-center rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]">
                Enregistrer un contrat
              </Link>
            ) : null
          }
        />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Numéro</Th>
              <Th>Fournisseur</Th>
              <Th>Objet</Th>
              <Th>Début</Th>
              <Th>Échéance</Th>
              <Th aligne="droite">Montant</Th>
              <Th>État</Th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id}>
                <Td chiffres>
                  <Link href={`/marches/conventions/${l.id}`} className="font-semibold text-marque-600 hover:underline">
                    {l.numero}
                  </Link>
                </Td>
                <Td fort>{l.partenaire}</Td>
                <Td>
                  {l.intitule}
                  {l.reconductionTacite && <span className="block text-xs text-[var(--encre-faible)]">Reconduction tacite</span>}
                </Td>
                <Td chiffres>{date(l.debut)}</Td>
                <Td chiffres>{l.finEffective ? date(l.finEffective) : "Sans terme"}</Td>
                <Td aligne="droite" chiffres>
                  {l.montantEffectif === null ? "—" : fmt(l.montantEffectif)}
                </Td>
                <Td>
                  <Pastille ton={TON[l.etat]}>{ETATS_CONVENTION[l.etat]}</Pastille>
                  {l.jours !== null && l.etat === "a_renouveler" && (
                    <span className="block text-xs text-[var(--encre-faible)]">dans {fmtEntier(l.jours)} j</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
