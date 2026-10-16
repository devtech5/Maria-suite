import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { ALERTE_TERME_JOURS, ETATS_CONTRAT_SALARIE, etatContratSalarie, type EtatContratSalarie } from "@/modules/personnes/calcul";
import { listerSalaries } from "@/modules/personnes/requetes";

export const metadata: Metadata = { title: "Contrats des salariés" };

const CONTRAT: Record<string, string> = { cdi: "CDI", cdd: "CDD", stage: "Stage", essai: "Essai" };
const TON: Record<EtatContratSalarie, TonPastille> = { a_venir: "neutre", en_cours: "valide", a_echeance: "alerte", echu: "danger", sorti: "neutre" };
/** Les contrats qui demandent une décision passent devant. */
const ORDRE: Record<EtatContratSalarie, number> = { echu: 0, a_echeance: 1, a_venir: 2, en_cours: 3, sorti: 4 };
const date = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

function delai(etat: EtatContratSalarie, jours: number | null): string | null {
  if (jours === null) return null;
  if (etat === "echu") return `depuis ${fmtEntier(-jours)} j`;
  if (etat === "a_venir") return `dans ${fmtEntier(jours)} j`;
  if (etat === "a_echeance") return jours === 0 ? "aujourd'hui" : `dans ${fmtEntier(jours)} j`;
  return null;
}

/** Contrats de travail des salariés en poste, échéances en tête. */
export default async function PageContratsSalaries({ searchParams }: PageProps<"/contrats">) {
  if (!(await peut("personnes.consulter"))) return <AccesRefuse droit="personnes.consulter" />;
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const lignes = (await listerSalaries(session.organizationId))
    .map((s) => ({ ...s, ...etatContratSalarie(s, aujourdhui), essaiEnCours: Boolean(s.finPeriodeEssai && s.finPeriodeEssai >= aujourdhui) }))
    .sort((a, b) => ORDRE[a.etat] - ORDRE[b.etat] || (a.fin ?? "9999").localeCompare(b.fin ?? "9999") || a.nom.localeCompare(b.nom));

  const compte = (e: EtatContratSalarie) => lignes.filter((l) => l.etat === e).length;
  const essais = lignes.filter((l) => l.essaiEnCours).length;
  // Les indicateurs portent sur tous les contrats ; seul le tableau suit la recherche.
  // La période porte sur le terme : un contrat sans terme n'y entre pas.
  const affiches = lignes.filter(
    (l) => correspond(filtres.q, [l.nom, l.matricule, l.poste, CONTRAT[l.contrat], ETATS_CONTRAT_SALARIE[l.etat]]) && dansPeriode(l.fin, filtres.periode),
  );

  return (
    <>
      <EnTetePage
        titre="Contrats des salariés"
        sousTitre={`Type, entrée, terme et période d'essai. Un terme s'annonce ${ALERTE_TERME_JOURS} jours à l'avance.`}
        actions={
          <Link href="/rh" className="h-cible flex items-center rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700">
            Embaucher
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CarteIndicateur libelle="En cours" valeur={fmtEntier(compte("en_cours"))} ton="valide" precision={`${fmtEntier(lignes.filter((l) => !l.fin).length)} CDI`} />
        <CarteIndicateur libelle="À échéance" valeur={fmtEntier(compte("a_echeance"))} ton="alerte" precision={`Terme sous ${ALERTE_TERME_JOURS} jours`} />
        <CarteIndicateur libelle="Échus" valeur={fmtEntier(compte("echu"))} ton="danger" precision="Terme passé, salarié encore en poste" />
        <CarteIndicateur libelle="En période d'essai" valeur={fmtEntier(essais)} ton="marque" />
      </div>

      {lignes.length === 0 ? (
        <EtatVide titre="Aucun salarié en poste" message="Les contrats apparaissent ici dès la première embauche, depuis le module Personnel." />
      ) : (
        <>
          <Recherche
            chemin="/contrats"
            valeur={filtres.q}
            placeholder="Nom, matricule, fonction, CDD…"
            periode={{ ...filtres.periode, libelle: "Terme" }}
            resultats={filtres.actif ? `${fmtEntier(affiches.length)} sur ${fmtEntier(lignes.length)}` : undefined}
          />
          {affiches.length === 0 ? (
            <EtatVide titre="Aucun contrat ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Salarié</Th>
                  <Th>Fonction</Th>
                  <Th>Contrat</Th>
                  <Th>Entrée</Th>
                  <Th>Terme</Th>
                  <Th>Fin d&apos;essai</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {affiches.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <Link href={`/rh/salaries/${l.id}`} className="font-semibold text-marque-600 hover:underline">
                        {l.nom}
                      </Link>
                      <span className="chiffres block text-xs text-[var(--encre-faible)]">{l.matricule}</span>
                    </Td>
                    <Td>{l.poste}</Td>
                    <Td>{CONTRAT[l.contrat]}</Td>
                    <Td chiffres>{date(l.debut)}</Td>
                    <Td chiffres>{l.fin ? date(l.fin) : "Sans terme"}</Td>
                    <Td chiffres>
                      {l.finPeriodeEssai ? (
                        <>
                          {date(l.finPeriodeEssai)}
                          {l.essaiEnCours && <span className="block text-xs text-alerte-600">en cours</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Pastille ton={TON[l.etat]}>{ETATS_CONTRAT_SALARIE[l.etat]}</Pastille>
                      {delai(l.etat, l.jours) && <span className="block text-xs text-[var(--encre-faible)]">{delai(l.etat, l.jours)}</span>}
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
