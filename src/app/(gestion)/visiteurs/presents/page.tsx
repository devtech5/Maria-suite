import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { EnTetePage, Tableau, Td, Th } from "@/components/ui/primitives";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { dureeLisible, dureeMinutes } from "@/modules/visiteurs/regles";
import { presents } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Présents" };

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });
const HORODATAGE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Les visiteurs présents à l'instant, par point d'accueil : la liste
 * d'appel en cas d'évacuation. S'imprime d'un geste.
 */
export default async function PagePresents() {
  const acces = await accesVisiteurs();
  if (!acces.accueillir) redirect("/visiteurs/rendez-vous");
  const maintenant = new Date();
  const lignes = await presents(acces.session.organizationId, acces.permis);
  const parAccueil = new Map<string, typeof lignes>();
  for (const l of lignes) parAccueil.set(l.accueil, [...(parAccueil.get(l.accueil) ?? []), l]);

  return (
    <>
      <EnTetePage titre="Visiteurs présents" sousTitre={`${lignes.length} personne${lignes.length > 1 ? "s" : ""} sur place · ${HORODATAGE.format(maintenant)}`} actions={<BoutonImprimer />} />
      {lignes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--filet)] px-4 py-8 text-center text-sm text-[var(--encre-douce)]">Aucun visiteur sur place.</p>
      ) : (
        <div className="space-y-6">
          {[...parAccueil].map(([accueil, visites]) => (
            <section key={accueil} className="break-inside-avoid">
              <h2 className="mb-2 font-bold">
                {accueil} · {visites.length}
              </h2>
              <Tableau>
                <thead>
                  <tr>
                    <Th>Visiteur</Th>
                    <Th>Société</Th>
                    <Th>Pour</Th>
                    <Th>Téléphone</Th>
                    <Th aligne="droite">Arrivé</Th>
                    <Th>Présent ✓</Th>
                  </tr>
                </thead>
                <tbody>
                  {visites.map((v) => (
                    <tr key={v.id}>
                      <Td fort>{v.nom}</Td>
                      <Td>{v.societe ?? "—"}</Td>
                      <Td>{v.visiteNom ?? v.visiteLibelle ?? "—"}</Td>
                      <Td chiffres>{v.telephone ?? "—"}</Td>
                      <Td aligne="droite" chiffres>
                        {v.arriveeLe ? `${HEURE.format(v.arriveeLe)} (${dureeLisible(dureeMinutes(v.arriveeLe, null, maintenant))})` : "—"}
                      </Td>
                      <Td>
                        <span className="inline-block size-4 rounded border border-[var(--encre-faible)]" aria-hidden />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tableau>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
