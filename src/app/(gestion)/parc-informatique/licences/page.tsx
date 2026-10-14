import type { Metadata } from "next";
import Link from "next/link";

import { CleLicence, FormulaireLicence, RetirerLicence } from "@/components/parc-informatique/formulaires";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import type { EtatLicence } from "@/modules/parc-informatique/calcul";
import { fournisseursProposes, listerLicences } from "@/modules/parc-informatique/requetes";

export const metadata: Metadata = { title: "Licences logicielles" };

const ETAT: Record<EtatLicence, { ton: TonPastille; libelle: (j: number | null) => string }> = {
  conforme: { ton: "valide", libelle: () => "Conforme" },
  depassee: { ton: "danger", libelle: () => "Postes dépassés" },
  expiree: { ton: "danger", libelle: () => "Expirée" },
  expire_bientot: { ton: "alerte", libelle: (j) => `Expire dans ${j} j` },
};

/**
 * Licences logicielles : droits d'usage comptés par poste. Une licence
 * installée sur plus de postes qu'elle n'en couvre est ce qu'un audit
 * d'éditeur facture ; une licence expirée coupe le logiciel un lundi matin.
 */
export default async function PageLicences() {
  const session = await exigerEntreprise();
  const [licences, gerer] = await Promise.all([listerLicences(session.organizationId), peut("parc_informatique.licence.gerer")]);
  const fournisseurs = gerer ? await fournisseursProposes(session.organizationId) : [];
  const depassees = licences.filter((l) => l.etat === "depassee").length;
  const aRenouveler = licences.filter((l) => l.etat === "expiree" || l.etat === "expire_bientot").length;
  const cout = licences.reduce((s, l) => s + l.cout, 0);

  return (
    <>
      <EnTetePage titre="Licences logicielles" sousTitre="Abonnements et licences perpétuelles, postes couverts et postes installés" actions={gerer ? <FormulaireLicence fournisseurs={fournisseurs} /> : undefined} />
      {licences.length === 0 ? (
        <EtatVide titre="Aucune licence" message="Enregistrez Microsoft 365, l'antivirus, le logiciel de comptabilité… avec leurs postes et leur date de fin, puis installez-les sur les postes depuis leur fiche." />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <CarteIndicateur libelle="Licences" valeur={fmtEntier(licences.length)} precision="En vigueur" />
            <CarteIndicateur libelle="Postes dépassés" valeur={fmtEntier(depassees)} ton={depassees > 0 ? "danger" : "valide"} precision="Installées au-delà des droits" />
            <CarteIndicateur libelle="À renouveler" valeur={fmtEntier(aRenouveler)} ton={aRenouveler > 0 ? "alerte" : "valide"} precision="Expirées ou dans les 30 jours" />
            <CarteIndicateur libelle="Coût total" valeur={fmtCompact(cout)} unite="FCFA" precision="Dernière période de chaque licence" />
          </section>
          <Tableau>
            <thead>
              <tr>
                <Th>Logiciel</Th>
                <Th>Type</Th>
                <Th aligne="droite">Postes</Th>
                <Th>Installée sur</Th>
                <Th>Fin</Th>
                <Th aligne="droite">Coût</Th>
                {gerer && <Th>Clé</Th>}
                <Th>État</Th>
                {gerer && <Th>{""}</Th>}
              </tr>
            </thead>
            <tbody>
              {licences.map((l) => (
                <tr key={l.id}>
                  <Td fort>
                    {l.logiciel}
                    {(l.editeur || l.fournisseurNom) && (
                      <span className="block text-xs font-normal text-[var(--encre-douce)]">
                        {[l.editeur, l.fournisseurNom && `chez ${l.fournisseurNom}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </Td>
                  <Td>{l.type === "abonnement" ? "Abonnement" : "Perpétuelle"}</Td>
                  <Td aligne="droite" chiffres>
                    <span className={l.utilises > l.postes ? "font-semibold text-danger-600" : ""}>
                      {l.utilises} / {l.postes}
                    </span>
                  </Td>
                  <Td>
                    {l.postesInstalles.length === 0 ? (
                      <span className="text-xs text-[var(--encre-faible)]">Aucun poste</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {l.postesInstalles.map((p) => (
                          <Link key={p.actifId} href={`/parc-informatique/${p.actifId}`} className="chiffres rounded bg-[var(--surface-creuse)] px-1.5 py-0.5 text-xs hover:underline" title={p.designation}>
                            {p.code}
                          </Link>
                        ))}
                      </span>
                    )}
                  </Td>
                  <Td chiffres>{l.expireLe ?? "—"}</Td>
                  <Td aligne="droite" chiffres>
                    {fmt(l.cout)}
                  </Td>
                  {gerer && <Td>{l.cle ? <CleLicence cle={l.cle} /> : <span className="text-xs text-[var(--encre-faible)]">—</span>}</Td>}
                  <Td>
                    <Pastille ton={ETAT[l.etat].ton}>{ETAT[l.etat].libelle(l.jours)}</Pastille>
                  </Td>
                  {gerer && (
                    <Td>
                      <RetirerLicence id={l.id} logiciel={l.logiciel} />
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
