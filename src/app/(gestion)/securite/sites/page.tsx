import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireSite } from "@/components/securite/formulaires";
import { ActionsFiche } from "@/components/ui/actions-fiche";
import { EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { LIBELLE_NATURE, debitMontant, relaisEnLigne } from "@/modules/securite/calcul";
import { sitesAvecCameras } from "@/modules/securite/requetes";

export const metadata: Metadata = { title: "Sites et caméras" };

/** Les sites surveillés : enregistreur, caméras, état du relais, débit à prévoir. */
export default async function PageSites({ searchParams }: PageProps<"/securite/sites">) {
  const session = await exigerEntreprise();
  const { q } = lireFiltresListe(await searchParams);
  const [sites, gerer, supprimer] = await Promise.all([
    sitesAvecCameras(session.organizationId),
    peut("securite.gerer"),
    peut("securite.fiche.supprimer"),
  ]);
  // Une caméra se retrouve par son nom : la recherche rend le site qui la porte.
  const affiches = sites.filter((s) =>
    correspond(q, [s.nom, LIBELLE_NATURE[s.nature], s.adresse, s.marque, s.enregistreurAdresse, ...s.cameras.map((c) => c.nom)]),
  );
  const maintenant = new Date();

  return (
    <>
      <EnTetePage
        titre="Sites et caméras"
        sousTitre={sites.length === 0 ? "Aucun site" : `${sites.length} site${sites.length > 1 ? "s" : ""}`}
        actions={gerer ? <FormulaireSite /> : undefined}
      />
      {sites.length === 0 ? (
        <EtatVide titre="Aucun site" message="Un site est un lieu qui a son enregistreur : un magasin, un entrepôt, un bureau. Déclarez-le, puis ses caméras." />
      ) : (
        <>
          <Recherche
            chemin="/securite/sites"
            valeur={q}
            placeholder="Site, adresse, enregistreur, caméra…"
            resultats={q ? `${fmtEntier(affiches.length)} sur ${fmtEntier(sites.length)}` : undefined}
          />
          {affiches.length === 0 ? (
            <EtatVide titre="Aucun site ne répond" message="Retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Site</Th>
                  <Th>Enregistreur</Th>
                  <Th aligne="droite">Caméras</Th>
                  <Th aligne="droite">Débit montant</Th>
                  <Th>Relais</Th>
                  {(gerer || supprimer) && <Th aligne="droite">Fiche</Th>}
                </tr>
              </thead>
              <tbody>
                {affiches.map((s) => {
                  const actives = s.cameras.filter((c) => c.actif);
                  const enLigne = relaisEnLigne(s.relaisVuLe, maintenant);
                  return (
                    <tr key={s.id} className={s.actif ? "" : "opacity-60"}>
                      <Td fort>
                        <Link href={`/securite/sites/${s.id}`} className="hover:underline">
                          {s.nom}
                        </Link>
                        {!s.actif && (
                          <span className="ml-1.5 align-middle">
                            <Pastille ton="alerte">En off</Pastille>
                          </span>
                        )}
                        <span className="block text-xs font-normal text-[var(--encre-faible)]">{LIBELLE_NATURE[s.nature]}</span>
                      </Td>
                      <Td>
                        <span className="capitalize">{s.marque}</span> · <span className="chiffres">{s.enregistreurAdresse}</span>
                      </Td>
                      <Td aligne="droite" chiffres>
                        {fmtEntier(actives.length)}
                      </Td>
                      <Td aligne="droite" chiffres>
                        {actives.length ? `${fmtEntier(debitMontant(actives))} kbit/s` : "—"}
                      </Td>
                      <Td>
                        {!s.relaisEmpreinte ? <Pastille>À installer</Pastille> : enLigne ? <Pastille ton="valide">En ligne</Pastille> : <Pastille ton="alerte">Hors ligne</Pastille>}
                      </Td>
                      {(gerer || supprimer) && (
                        <Td aligne="droite">
                          <ActionsFiche type="site_securite" id={s.id} libelle={s.nom} actif={s.actif} peutGerer={gerer} peutSupprimer={supprimer} />
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
