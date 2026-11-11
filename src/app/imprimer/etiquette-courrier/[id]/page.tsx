import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { Qr } from "@/components/visiteurs/qr";
import { urlAbsolue } from "@/lib/liens-publics";
import { accesCourrier } from "@/modules/courrier/acces";
import { NATURES, natureValide } from "@/modules/courrier/regles";
import { jetonEtiquette, pliDe } from "@/modules/courrier/requetes";

export const metadata: Metadata = { title: "Étiquette" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });

/**
 * Étiquette d'un pli ou d'un colis (100 × 60 mm) : numéro du registre et QR.
 * Le QR ne porte qu'un jeton (`entity_codes`) : scanné, il ouvre la fiche à
 * qui peut la voir. L'objet n'y figure pas — une étiquette se lit de loin.
 */
export default async function EtiquetteCourrier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const a = await accesCourrier();
  if (!a.enregistrer) notFound();
  const [p, jeton] = await Promise.all([pliDe(a.session.organizationId, id), jetonEtiquette(a.session.organizationId, id)]);
  if (!p || !jeton) notFound();

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <style>{"@page { size: 100mm 60mm; margin: 0 } @media print { body { margin: 0 } }"}</style>
      <div className="mx-auto mb-4 flex w-[100mm] justify-end print:hidden">
        <BoutonImprimer />
      </div>
      <article className="mx-auto flex h-[60mm] w-[100mm] gap-[3mm] overflow-hidden rounded-[2mm] border border-[var(--filet)] bg-white p-[4mm] text-black shadow-md print:rounded-none print:border-0 print:shadow-none">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-[2.6mm] font-semibold uppercase tracking-wider text-neutral-500">{a.session.organizationNom} · {p.sens === "arrivee" ? "Arrivée" : "Départ"}</p>
          <p className="mt-[1mm] font-mono text-[6mm] font-bold leading-none">{p.numero}</p>
          <p className="mt-[2mm] text-[3.2mm] leading-tight">
            {p.sens === "arrivee" ? "De : " : "À : "}
            <span className="font-semibold">{p.correspondant}</span>
          </p>
          <p className="mt-auto text-[2.8mm] leading-snug text-neutral-700">
            {natureValide(p.nature) ? NATURES[p.nature] : p.nature} · {DATE.format(p.enregistreLe)}
            {p.imputeNom && (
              <>
                <br />
                Pour : {p.imputeNom}
              </>
            )}
          </p>
        </div>
        <Qr texte={urlAbsolue(`/courrier/code/${jeton}`)} titre="QR du pli" className="size-[40mm] shrink-0 self-center [&_svg]:size-full" />
      </article>
    </main>
  );
}
