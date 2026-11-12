import type { Metadata } from "next";

import { BarreRecherche } from "@/components/contacts/barre-recherche";
import { NumerosCollaborateur } from "@/components/contacts/numeros-collaborateur";
import { EtatVide, EnTetePage, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { accesContacts } from "@/modules/contacts/acces";
import { filtrerAnnuaire, formaterNumero, NATURES_NUMERO } from "@/modules/contacts/regles";
import { annuaireDe, servicesDe } from "@/modules/contacts/requetes";

export const metadata: Metadata = { title: "Contacts" };

/**
 * L'annuaire du personnel : nom et prénoms, service, poste, adresses
 * e-mail professionnelles et numéros de téléphone. Les numéros personnels ne
 * sortent de la requête que pour qui tient l'annuaire.
 */
export default async function PageContacts({ searchParams }: PageProps<"/contacts">) {
  const a = await accesContacts();
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q : "";
  const service = typeof p.service === "string" ? p.service : "";
  const org = a.session.organizationId;
  const [fiches, services] = await Promise.all([annuaireDe(org, a.gerer), servicesDe(org)]);
  const liste = filtrerAnnuaire(fiches, { q, service });

  return (
    <>
      <EnTetePage titre="Contacts" sousTitre={`${liste.length} collaborateur${liste.length > 1 ? "s" : ""} sur ${fiches.length}`} />
      <BarreRecherche
        q={q}
        placeholder="Nom, service, poste, adresse e-mail, numéro…"
        filtres={[{ nom: "service", valeur: service, toutes: "Tous les services", options: services.filter((s) => s.actif).map((s) => ({ valeur: s.libelle, libelle: s.libelle })) }]}
      />
      {liste.length === 0 ? (
        <EtatVide
          titre={fiches.length === 0 ? "Aucun collaborateur" : "Aucun résultat"}
          message={fiches.length === 0 ? "L'annuaire se remplit avec les dossiers du personnel (Personnel › Collaborateurs)." : "Aucun collaborateur ne correspond à cette recherche."}
        />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Nom et prénoms</Th>
              <Th>Service</Th>
              <Th>Poste</Th>
              <Th>Adresses e-mail</Th>
              <Th>Téléphones</Th>
              {a.gerer && <Th aligne="droite">Numéros</Th>}
            </tr>
          </thead>
          <tbody>
            {liste.map((l) => (
              <tr key={l.id} className="align-top">
                <Td fort>
                  {l.nom}
                  <span className="block text-xs font-normal text-[var(--encre-faible)]">{l.matricule}</span>
                </Td>
                <Td>{l.service ?? "—"}</Td>
                <Td>{l.poste}</Td>
                <Td>
                  {l.emails.length === 0 ? (
                    l.emailPersonnel ? null : <span className="text-[var(--encre-faible)]">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {l.emails.map((e) => (
                        <li key={e}>
                          <a href={`mailto:${e}`} className="text-marque-600 hover:underline">
                            {e}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {l.emailPersonnel && (
                    <p className="mt-0.5">
                      <a href={`mailto:${l.emailPersonnel}`} className="text-marque-600 hover:underline">
                        {l.emailPersonnel}
                      </a>{" "}
                      <Pastille ton="alerte">Personnel</Pastille>
                    </p>
                  )}
                </Td>
                <Td>
                  {l.numeros.length === 0 ? (
                    <span className="text-[var(--encre-faible)]">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {l.numeros.map((n) => (
                        <li key={`${n.numero}-${n.origine}`} className="whitespace-nowrap">
                          <a href={`tel:+${n.numero.replace(/\D/g, "")}`} className="chiffres hover:underline">
                            {formaterNumero(n.numero)}
                          </a>{" "}
                          <span className="text-xs text-[var(--encre-faible)]">{NATURES_NUMERO[n.nature]}</span>{" "}
                          {n.usage === "personnel" && <Pastille ton="alerte">Personnel</Pastille>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                {a.gerer && (
                  <Td aligne="droite">
                    <NumerosCollaborateur employeeId={l.id} nom={l.nom} numeros={l.numeros} />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
