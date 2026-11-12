import type { Metadata } from "next";

import { BarreRecherche } from "@/components/contacts/barre-recherche";
import { EtatVide, EnTetePage, Pastille } from "@/components/ui/primitives";
import { accesContacts } from "@/modules/contacts/acces";
import { correspond, formaterNumero } from "@/modules/contacts/regles";
import { adressesDe, annuaireDe, servicesDe } from "@/modules/contacts/requetes";
import { appartientAuService } from "@/modules/contacts/regles";

export const metadata: Metadata = { title: "Contacts par service" };

/**
 * L'annuaire rangé par service : les adresses du service (communes ou
 * nominatives) et son personnel, avec ses adresses et ses numéros.
 */
export default async function PageContactsParService({ searchParams }: PageProps<"/contacts/services">) {
  const a = await accesContacts();
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q : "";
  const org = a.session.organizationId;
  const [services, adresses, fiches] = await Promise.all([servicesDe(org), adressesDe(org), annuaireDe(org, a.gerer)]);

  const groupes = services
    .map((s) => ({
      service: s,
      adresses: adresses.filter((x) => x.actif && x.serviceId === s.id),
      personnel: fiches.filter((f) => appartientAuService(f, s)),
    }))
    .filter((g) => g.adresses.length + g.personnel.length > 0)
    .filter((g) =>
      correspond(
        [g.service.libelle, g.service.code, ...g.adresses.flatMap((x) => [x.adresse, x.libelle ?? "", x.titulaire ?? ""]), ...g.personnel.flatMap((f) => [f.nom, f.poste, ...f.emails, ...f.numeros.map((n) => n.numero)])].join(" "),
        q,
      ),
    );

  return (
    <>
      <EnTetePage titre="Contacts par service" sousTitre="Les adresses de chaque service et les personnes qui le composent" />
      <BarreRecherche q={q} placeholder="Service, personne, adresse, numéro…" />
      {groupes.length === 0 ? (
        <EtatVide titre="Aucun résultat" message="Aucun service ne correspond à cette recherche, ou aucun n'a encore de personnel ni d'adresse." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groupes.map(({ service, adresses: boites, personnel }) => (
            <article key={service.id} className={`rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm ${service.actif ? "" : "opacity-70"}`}>
              <header className="flex items-start gap-2">
                <h2 className="min-w-0 flex-1 font-semibold">{service.libelle}</h2>
                <Pastille ton="marque">{service.code}</Pastille>
              </header>

              <h3 className="mt-3 text-xs font-bold uppercase tracking-wider text-[var(--encre-faible)]">Adresses du service</h3>
              {boites.length === 0 ? (
                <p className="mt-1 text-sm text-[var(--encre-faible)]">Aucune adresse affectée.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {boites.map((x) => (
                    <li key={x.id}>
                      <a href={`mailto:${x.adresse}`} className="font-medium text-marque-600 hover:underline">
                        {x.adresse}
                      </a>
                      <span className="text-[var(--encre-douce)]"> — {x.titulaire ?? x.libelle ?? "commune au service"}</span>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="mt-3 text-xs font-bold uppercase tracking-wider text-[var(--encre-faible)]">Personnel ({personnel.length})</h3>
              {personnel.length === 0 ? (
                <p className="mt-1 text-sm text-[var(--encre-faible)]">Personne dans ce service.</p>
              ) : (
                <ul className="mt-1 divide-y divide-[var(--filet)] text-sm">
                  {personnel.map((f) => (
                    <li key={f.id} className="py-1.5">
                      <span className="font-semibold">{f.nom}</span> <span className="text-[var(--encre-douce)]">· {f.poste}</span>
                      {f.emails.map((e) => (
                        <a key={e} href={`mailto:${e}`} className="block text-marque-600 hover:underline">
                          {e}
                        </a>
                      ))}
                      {f.numeros.length > 0 && (
                        <span className="block">
                          {f.numeros.map((n) => (
                            <span key={`${n.numero}-${n.origine}`} className="chiffres mr-3 whitespace-nowrap text-[var(--encre-douce)]">
                              {formaterNumero(n.numero)}
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
