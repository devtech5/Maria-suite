import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { notFound } from "next/navigation";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { LOGO_MARQUE } from "@/components/impression/entete-document";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { Qr } from "@/components/visiteurs/qr";
import { tracer } from "@/lib/audit";
import { identiteEntreprise } from "@/lib/identite";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesContacts } from "@/modules/contacts/acces";
import { formaterNumero, NATURES_NUMERO, numerosDeCarte, vcardCollaborateur } from "@/modules/contacts/regles";
import { annuaireDe } from "@/modules/contacts/requetes";

export const metadata: Metadata = { title: "Carte de visite" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Police du papier à en-tête (Montserrat, servie par l'application). */
const montserrat = localFont({
  src: [
    { path: "../../../../components/impression/polices/montserrat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../../../components/impression/polices/montserrat-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../../../components/impression/polices/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

/**
 * Carte de visite d'un collaborateur, au format 85 × 55 mm : le recto porte
 * nom, poste, service et coordonnées PROFESSIONNELLES ; le verso, le logo et
 * un QR (vCard) qui ajoute la personne aux contacts d'un téléphone. Deux
 * pages, recto puis verso, pour une imprimante de cartes ou un imprimeur.
 * Les numéros personnels n'y figurent jamais, quel que soit le droit.
 */
export default async function CarteDeVisite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !moduleOuvert("contacts")) notFound();
  const a = await accesContacts();
  if (!a.consulter) return <AccesRefuse droit="contacts.consulter" />;
  const org = a.session.organizationId;
  // Lue sans les données personnelles, même pour qui tient l'annuaire.
  const [fiches, identite] = await Promise.all([annuaireDe(org, false), identiteEntreprise(org)]);
  const c = fiches.find((f) => f.id === id);
  if (!c) notFound();
  const numeros = numerosDeCarte(c.numeros);
  const siteWeb = identite.siteWeb?.replace(/^https?:\/\//, "") ?? null;
  const adresse = [identite.adresse, identite.ville].filter(Boolean).join(", ") || null;
  const vcard = vcardCollaborateur({ nom: c.nom, poste: c.poste, service: c.service, entreprise: identite.nom, emails: c.emails, numeros, adresse, siteWeb });
  await tracer({ action: "contacts.carte_imprimer", entite: "collaborateur", entiteId: c.id });

  const face = "relative mx-auto flex h-[55mm] w-[85mm] overflow-hidden rounded-[2.5mm] bg-white text-black shadow-md [break-after:page] [print-color-adjust:exact] print:rounded-none print:shadow-none";

  return (
    <main className={`${montserrat.className} min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0`}>
      <style>{"@page { size: 85mm 55mm; margin: 0 } @media print { body { margin: 0 } }"}</style>
      <div className="mx-auto mb-4 flex w-[85mm] items-center justify-between gap-3 print:hidden">
        <Link href="/contacts" className="text-sm text-[var(--encre-douce)] hover:underline">
          ← Contacts
        </Link>
        <BoutonImprimer />
      </div>

      {/* Recto */}
      <article className={face} aria-label="Recto">
        <div className="w-[2.2mm]" style={{ background: identite.couleur }} />
        <div className="flex min-w-0 flex-1 flex-col px-[4.5mm] py-[4mm]">
          <div className="flex items-start justify-between gap-[3mm]">
            <div className="min-w-0">
              <p className="text-[4.4mm] font-bold leading-[5mm]" style={{ color: identite.couleur }}>
                {c.nom}
              </p>
              <p className="mt-[0.6mm] text-[2.7mm] font-semibold leading-[3.3mm]">{c.poste}</p>
              {c.service && <p className="text-[2.4mm] leading-[3mm] text-black/60">{c.service}</p>}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL ou SVG statique */}
            <img src={identite.logo ?? LOGO_MARQUE} alt={identite.nom} className="max-h-[13mm] max-w-[22mm] shrink-0 object-contain" />
          </div>
          <div className="my-[2.5mm] h-[0.4mm] w-[14mm]" style={{ background: identite.couleurSecondaire }} />
          <div className="mt-auto space-y-[0.5mm] text-[2.45mm] leading-[3.1mm]">
            {numeros.map((n) => (
              <p key={n.numero} className="whitespace-nowrap">
                <span className="inline-block w-[13mm] text-black/55">{NATURES_NUMERO[n.nature]}</span>
                {formaterNumero(n.numero)}
              </p>
            ))}
            {c.emails.map((e) => (
              <p key={e} className="truncate">
                <span className="inline-block w-[13mm] text-black/55">E-mail</span>
                {e}
              </p>
            ))}
            <p className="truncate pt-[0.8mm] text-[2.3mm] font-semibold uppercase tracking-[0.08em]" style={{ color: identite.couleur }}>
              {identite.nom}
              {siteWeb && <span className="font-medium normal-case tracking-normal text-black/60"> · {siteWeb}</span>}
            </p>
          </div>
        </div>
      </article>

      <p className="mx-auto my-3 w-[85mm] text-center text-xs text-[var(--encre-faible)] print:hidden">Verso</p>

      {/* Verso */}
      <article className={face} aria-label="Verso" style={{ background: identite.couleur }}>
        <div className="flex flex-1 items-center justify-between gap-[4mm] px-[6mm]">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-[2mm] text-center">
            <div className="rounded-[1.5mm] bg-white px-[3mm] py-[2mm]">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL ou SVG statique */}
              <img src={identite.logo ?? LOGO_MARQUE} alt={identite.nom} className="max-h-[17mm] max-w-[30mm] object-contain" />
            </div>
            {identite.slogan && (
              <p className="text-[2.4mm] font-semibold italic leading-[3mm]" style={{ color: identite.couleurSecondaire }}>
                {identite.slogan}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-[1mm]">
            <Qr texte={vcard} titre="QR : ajouter aux contacts" className="size-[27mm] rounded-[1mm] bg-white p-[1.2mm] [&_svg]:size-full" />
            <p className="text-[2mm] font-medium text-white/85">Scannez pour enregistrer</p>
          </div>
        </div>
      </article>
      <p className="mx-auto mt-3 w-[85mm] text-center text-xs text-[var(--encre-faible)] print:hidden">
        Format 85 × 55 mm, recto puis verso. Seules les coordonnées professionnelles y figurent.
      </p>
    </main>
  );
}
