import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { Qr } from "@/components/visiteurs/qr";
import { urlAbsolue } from "@/lib/liens-publics";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { visiteDe } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Badge visiteur" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });

/**
 * Badge du visiteur, au format carte (85,6 × 54 mm). Son QR mène à la fiche
 * de la visite pour l'accueil qui le scanne à la sortie ; il ne porte qu'un
 * jeton, rien de la personne.
 */
export default async function BadgeVisiteur({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const acces = await accesVisiteurs();
  const v = await visiteDe(acces.session.organizationId, id);
  if (!v || !acces.accueillir || !acces.accueilPermis(v.accueilId)) notFound();

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <style>{"@page { size: 85.6mm 54mm; margin: 0 } @media print { body { margin: 0 } }"}</style>
      <div className="mx-auto mb-4 flex w-[85.6mm] justify-end print:hidden">
        <BoutonImprimer />
      </div>
      <article className="mx-auto flex h-[54mm] w-[85.6mm] overflow-hidden rounded-[3mm] border border-[var(--filet)] bg-white text-black shadow-md print:rounded-none print:border-0 print:shadow-none">
        <div className="flex w-[9mm] items-center justify-center bg-nuit">
          <span className="-rotate-90 whitespace-nowrap text-[3.2mm] font-bold tracking-[0.35em] text-or">VISITEUR</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-[3mm] py-[2.5mm]">
          <p className="text-[2.4mm] font-semibold uppercase tracking-wider text-neutral-500">{acces.session.organizationNom}</p>
          <p className="mt-[1mm] text-[4.6mm] font-bold leading-tight">{v.nom}</p>
          {v.societe && <p className="text-[2.8mm] leading-tight">{v.societe}</p>}
          <p className="mt-auto text-[2.5mm] leading-snug text-neutral-700">
            {(v.visiteNom || v.visiteLibelle) && (
              <>
                Pour : {v.visiteNom ?? v.visiteLibelle}
                <br />
              </>
            )}
            {v.accueil} · {JOUR.format(v.arriveeLe ?? new Date())}
            <br />
            <span className="font-mono">{v.numero}</span>
          </p>
        </div>
        <div className="flex w-[27mm] items-center justify-center pr-[2mm]">
          <Qr texte={urlAbsolue(`/visiteurs/badge/${v.jetonBadge}`)} titre="QR du badge" className="size-[25mm] [&_svg]:size-full" />
        </div>
      </article>
      <p className="mx-auto mt-3 w-[85.6mm] text-center text-xs text-[var(--encre-faible)] print:hidden">À rendre à l&apos;accueil en sortant : le scan du QR enregistre la sortie.</p>
    </main>
  );
}
