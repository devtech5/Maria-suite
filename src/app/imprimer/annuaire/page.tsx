import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { ApercuA4, FeuilleA4 } from "@/components/impression/feuille-a4";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { tracer } from "@/lib/audit";
import { identiteEntreprise } from "@/lib/identite";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesContacts } from "@/modules/contacts/acces";
import { annuaireParService, filtrerAnnuaire, formaterNumero, NATURES_NUMERO } from "@/modules/contacts/regles";
import { annuaireDe, servicesDe } from "@/modules/contacts/requetes";

export const metadata: Metadata = { title: "Annuaire de l'entreprise" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });

/**
 * L'annuaire sur papier à en-tête de l'entreprise, rangé par service, avec la
 * recherche et le filtre de l'écran. « Imprimer ou enregistrer en PDF » passe
 * par la boîte d'impression du navigateur, comme toutes les pièces A4.
 * Mêmes droits que l'écran : l'e-mail et les numéros personnels n'y figurent
 * que pour qui tient l'annuaire. L'impression se trace.
 */
export default async function ImpressionAnnuaire({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!moduleOuvert("contacts")) notFound();
  const a = await accesContacts();
  if (!a.consulter) return <AccesRefuse droit="contacts.consulter" />;
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q : "";
  const service = typeof p.service === "string" ? p.service : "";
  const org = a.session.organizationId;
  const [fiches, services, identite] = await Promise.all([annuaireDe(org, a.gerer), servicesDe(org), identiteEntreprise(org)]);
  const lignes = filtrerAnnuaire(fiches, { q, service });
  const groupes = annuaireParService(lignes, services.map((s) => s.libelle));
  await tracer({ action: "contacts.imprimer", entite: "annuaire", apres: { lignes: lignes.length, q: q || undefined, service: service || undefined, personnels: a.gerer } });

  const retour = `/contacts${q || service ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(service ? { service } : {}) })}` : ""}`;
  const cellule = "border border-black/30 px-[1.8mm] py-[1.2mm] align-top";
  const filtre = [service && `Service : ${service}`, q && `Recherche : « ${q} »`].filter(Boolean).join(" · ");

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href={retour} className="text-sm text-[var(--encre-douce)] hover:underline">
          ← Contacts
        </Link>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <FeuilleA4 pied={<PiedDocument identite={identite} />}>
          <EnTeteDocument identite={identite}>
            <p className="text-[14pt] font-bold uppercase tracking-wide">Annuaire du personnel</p>
            <p className="text-[9pt]">Au {JOUR.format(new Date())}</p>
            <p className="text-[9pt]">
              {lignes.length} collaborateur{lignes.length > 1 ? "s" : ""}
              {filtre ? ` — ${filtre}` : ""}
            </p>
          </EnTeteDocument>

          {groupes.length === 0 ? (
            <p className="mt-[8mm] text-center text-[10pt] text-black/60">Aucun collaborateur ne correspond.</p>
          ) : (
            <table className="mt-[6mm] w-full border-collapse text-[8pt] leading-[10.5pt]">
              <thead className="[display:table-header-group]">
                <tr className="bg-black/5 text-left">
                  <th className={`${cellule} w-[44mm]`}>Nom et prénoms</th>
                  <th className={`${cellule} w-[34mm]`}>Poste</th>
                  <th className={cellule}>Adresses e-mail</th>
                  <th className={`${cellule} w-[42mm]`}>Téléphones</th>
                </tr>
              </thead>
              {groupes.map((g) => (
                <tbody key={g.service ?? "—"} className="[break-inside:auto]">
                  <tr className="[break-after:avoid]">
                    <td colSpan={4} className={`${cellule} bg-black/[0.03] font-bold uppercase tracking-wide`} style={{ color: identite.couleur }}>
                      {g.service ?? "Sans service"} <span className="font-medium normal-case text-black/60">({g.lignes.length})</span>
                    </td>
                  </tr>
                  {g.lignes.map((l) => (
                    <tr key={l.id} className="[break-inside:avoid]">
                      <td className={cellule}>
                        <span className="font-semibold">{l.nom}</span>
                        <span className="block text-[7pt] text-black/60">{l.matricule}</span>
                      </td>
                      <td className={cellule}>{l.poste}</td>
                      <td className={`${cellule} break-all`}>
                        {l.emails.map((e) => (
                          <span key={e} className="block">
                            {e}
                          </span>
                        ))}
                        {l.emailPersonnel && <span className="block italic text-black/70">{l.emailPersonnel} (perso)</span>}
                        {l.emails.length === 0 && !l.emailPersonnel && "—"}
                      </td>
                      <td className={`${cellule} whitespace-nowrap`}>
                        {l.numeros.map((n) => (
                          <span key={`${n.numero}-${n.origine}`} className={`block ${n.usage === "personnel" ? "italic text-black/70" : ""}`}>
                            {formaterNumero(n.numero)} <span className="text-[7pt] text-black/60">{n.usage === "personnel" ? "perso" : NATURES_NUMERO[n.nature].toLowerCase()}</span>
                          </span>
                        ))}
                        {l.numeros.length === 0 && "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )}
          {a.gerer && <p className="mt-[3mm] text-[7pt] italic text-black/60">Document interne. Les coordonnées marquées « perso » sont des données personnelles : ne pas diffuser.</p>}
        </FeuilleA4>
      </ApercuA4>
    </main>
  );
}
