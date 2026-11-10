import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { BoutonNouvelleVersion } from "@/components/reglement/bouton-nouvelle-version";
import { TON_ETAT } from "@/components/reglement/etat";
import { EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { LIBELLE_ETAT, dateLongue, etatVersion } from "@/modules/reglement/regles";
import { aujourdhuiPour, suiviDe, versionsDe } from "@/modules/reglement/requetes";

export const metadata: Metadata = { title: "Versions du règlement" };

/**
 * Les versions du règlement, du brouillon aux versions remplacées, avec pour
 * chacune la part de l'équipe qui l'a lue et acceptée.
 */
export default async function PageVersionsReglement() {
  if (!(await peut("reglement.gerer"))) return <AccesRefuse droit="reglement.gerer" />;
  const session = await exigerEntreprise();
  const [versions, aujourdhui] = await Promise.all([versionsDe(session.organizationId), aujourdhuiPour(session.organizationId)]);
  const publiees = versions.filter((v) => v.statut === "publie");
  const suivis = new Map(await Promise.all(publiees.map(async (v) => [v.id, await suiviDe(session.organizationId, v.id)] as const)));
  const brouillon = versions.find((v) => v.statut === "brouillon");

  return (
    <>
      <EnTetePage
        titre="Versions et lectures"
        sousTitre={publiees.length === 0 ? "Aucune version publiée" : `${publiees.length} version${publiees.length > 1 ? "s" : ""} publiée${publiees.length > 1 ? "s" : ""}`}
        actions={<BoutonNouvelleVersion libelle={brouillon ? "Reprendre le brouillon" : versions.length === 0 ? "Rédiger le règlement" : "Rédiger une nouvelle version"} />}
      />
      <p className="mb-5 max-w-[75ch] rounded-lg bg-[var(--surface-creuse)] px-3 py-2.5 text-sm text-[var(--encre-douce)]">
        Une version publiée ne se modifie plus : son texte est celui que chacun a accepté. Pour corriger, rédigez une nouvelle version — elle reprend le texte de la dernière. À sa date
        d&apos;effet, chaque compte devra la lire et l&apos;accepter avant d&apos;ouvrir le logiciel.
      </p>

      {versions.length === 0 ? (
        <EtatVide titre="Aucun règlement" message="Rédigez le règlement intérieur article par article, puis publiez-le avec sa date d'effet." />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Version</Th>
              <Th>Titre</Th>
              <Th>Date d&apos;effet</Th>
              <Th>État</Th>
              <Th aligne="droite">Lu et accepté</Th>
              <Th aligne="droite"> </Th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => {
              const etat = etatVersion(v, publiees, aujourdhui);
              const suivi = suivis.get(v.id);
              return (
                <tr key={v.id}>
                  <Td fort>{v.numero ?? "—"}</Td>
                  <Td>
                    {v.titre}
                    <span className="block text-xs text-[var(--encre-faible)]">
                      {v.articles} article{v.articles > 1 ? "s" : ""}
                    </span>
                  </Td>
                  <Td chiffres>{v.dateEffet ? dateLongue(v.dateEffet) : "—"}</Td>
                  <Td>
                    <Pastille ton={TON_ETAT[etat]}>{LIBELLE_ETAT[etat]}</Pastille>
                  </Td>
                  <Td aligne="droite" chiffres>
                    {suivi ? `${suivi.lus} / ${suivi.total} · ${suivi.pourcent} %` : "—"}
                  </Td>
                  <Td aligne="droite">
                    <Link href={`/reglement/versions/${v.id}`} className="text-sm font-semibold text-marque-600 hover:underline">
                      {v.statut === "brouillon" ? "Rédiger" : "Suivi"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
