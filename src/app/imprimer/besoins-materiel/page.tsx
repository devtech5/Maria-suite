import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { ApercuA4, FeuilleA4 } from "@/components/impression/feuille-a4";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { identiteEntreprise } from "@/lib/identite";
import { moduleOuvert } from "@/lib/modules/garde";
import { ficheProjet } from "@/modules/projets/requetes";

export const metadata: Metadata = { title: "Fiche de besoins en matériel" };

/** Lignes vierges par défaut : une feuille portrait les tient avec les visas. */
const LIGNES_PAR_DEFAUT = 12;
const LIGNES_MAX = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fiche VIERGE d'expression de besoins en matériel, sur papier à en-tête :
 * le chef de chantier ou le service y écrit à la main désignations, prix
 * unitaires, quantités et prix totaux, puis la fait viser. Rien n'est
 * calculé ici : la commande, elle, se saisit dans Achats.
 *
 * Ouverte depuis Achats (`achats.consulter`) ou depuis un projet
 * (`projet.consulter`, `?projet=` pré-remplit le chantier). `?lignes=` règle
 * le nombre de lignes ; au-delà d'une feuille, le tableau continue sur la
 * suivante avec ses titres de colonnes.
 */
export default async function FicheBesoinsMateriel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await exigerEntreprise();
  const [achats, projets] = await Promise.all([
    moduleOuvert("achats") ? peut("achats.consulter") : Promise.resolve(false),
    moduleOuvert("projet") ? peut("projet.consulter") : Promise.resolve(false),
  ]);
  if (!moduleOuvert("achats") && !moduleOuvert("projet")) notFound();
  if (!achats && !projets) return <AccesRefuse droit="achats.consulter" />;

  const p = await searchParams;
  const org = session.organizationId;
  const demande = Number.parseInt(typeof p.lignes === "string" ? p.lignes : "", 10);
  const nombre = Number.isInteger(demande) && demande > 0 ? Math.min(demande, LIGNES_MAX) : LIGNES_PAR_DEFAUT;
  const idProjet = projets && typeof p.projet === "string" && UUID.test(p.projet) ? p.projet : null;

  const [identite, fiche] = await Promise.all([identiteEntreprise(org), idProjet ? ficheProjet(org, idProjet) : Promise.resolve(null)]);
  const projet = fiche?.projet ?? null;
  const chantier = projet ? [projet.code, projet.nom].filter(Boolean).join(" — ") : "";
  const retour = projet ? { href: `/projets/${projet.id}`, libelle: "← Projet" } : achats ? { href: "/achats", libelle: "← Achats" } : { href: "/projets", libelle: "← Projets" };

  const cellule = "border border-black/40 px-[2mm] align-middle";
  const champ = "inline-block min-w-[50mm] border-b border-dotted border-black/50 align-bottom";

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href={retour.href} className="text-sm text-[var(--encre-douce)] hover:underline">
          {retour.libelle}
        </Link>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <FeuilleA4 pied={<PiedDocument identite={identite} />}>
          <EnTeteDocument identite={identite}>
            <p className="text-[14pt] font-bold uppercase tracking-wide">Besoins en matériel</p>
            <p className="text-[9pt]">
              N° <span className="inline-block min-w-[30mm] border-b border-dotted border-black/50">&nbsp;</span>
            </p>
          </EnTeteDocument>

          <div className="mt-[4mm] grid grid-cols-2 gap-x-[8mm] gap-y-[2.5mm] text-[9pt]">
            <p>
              Date : <span className={champ}>&nbsp;</span>
            </p>
            <p>
              Projet / chantier : <span className={champ}>{chantier || " "}</span>
            </p>
            <p>
              Demandeur : <span className={champ}>&nbsp;</span>
            </p>
            <p>
              Service : <span className={champ}>&nbsp;</span>
            </p>
          </div>

          <table className="mt-[5mm] w-full table-fixed border-collapse text-[9pt]">
            <thead className="[display:table-header-group]">
              <tr className="text-left text-white" style={{ background: identite.couleur }}>
                <th className={`${cellule} w-[11mm] py-[2mm] text-center`}>N°</th>
                <th className={`${cellule} py-[2mm]`}>Désignation</th>
                <th className={`${cellule} w-[30mm] py-[2mm] text-right`}>Prix unitaire (FCFA)</th>
                <th className={`${cellule} w-[20mm] py-[2mm] text-right`}>Quantité</th>
                <th className={`${cellule} w-[34mm] py-[2mm] text-right`}>Prix total (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nombre }, (_, i) => (
                <tr key={i} className="h-[9mm] [break-inside:avoid]">
                  <td className={`${cellule} text-center text-black/60`}>{i + 1}</td>
                  <td className={cellule} />
                  <td className={cellule} />
                  <td className={cellule} />
                  <td className={cellule} />
                </tr>
              ))}
            </tbody>
            <tfoot className="[display:table-row-group]">
              <tr className="h-[9mm] [break-inside:avoid]">
                <td colSpan={4} className={`${cellule} text-right font-bold uppercase`}>
                  Total général
                </td>
                <td className={`${cellule} bg-black/5`} />
              </tr>
            </tfoot>
          </table>

          <div className="mt-[6mm] grid grid-cols-3 gap-[5mm] text-[8.5pt] [break-inside:avoid]">
            {["Le demandeur", "Le responsable", "La direction"].map((qui) => (
              <div key={qui} className="flex h-[24mm] flex-col border border-black/40 px-[2mm] py-[1.5mm]">
                <p className="font-bold">{qui}</p>
                <p className="text-[7.5pt] text-black/60">Nom, date et signature</p>
              </div>
            ))}
          </div>
        </FeuilleA4>
      </ApercuA4>
    </main>
  );
}
