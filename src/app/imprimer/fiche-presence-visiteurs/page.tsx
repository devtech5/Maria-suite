import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { PapierEnTete, TitreDocument, PiedDocument } from "@/components/impression/entete-document";
import { ApercuA4, FeuilleA4 } from "@/components/impression/feuille-a4";
import { BoutonImprimer } from "@/components/ui/bouton-imprimer";
import { BoutonRetour } from "@/components/ui/bouton-retour";
import { identiteEntreprise } from "@/lib/identite";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { accueilsDe } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Fiche de présence des visiteurs" };

/** Lignes vierges par défaut : une feuille paysage les tient sous l'en-tête. */
const LIGNES_PAR_DEFAUT = 8;
const LIGNES_MAX = 40;

/**
 * Fiche de présence VIERGE, sur papier à en-tête, en A4 paysage : le
 * visiteur y écrit à la main nom et prénoms, fonction, e-mail, contact, et
 * signe. Pour une réunion, une formation, une visite de chantier — là où le
 * registre numérique de l'accueil n'est pas sous la main.
 *
 * `?accueil=` pré-remplit le lieu avec le point d'accueil (s'il est tenu),
 * `?lignes=` règle le nombre de lignes ; au-delà d'une feuille, le tableau
 * continue sur la suivante avec ses titres de colonnes.
 */
export default async function FichePresenceVisiteurs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!moduleOuvert("visiteurs")) notFound();
  const acces = await accesVisiteurs();
  if (!acces.accueillir && !acces.annoncer) return <AccesRefuse droit="visiteurs.accueillir" />;
  const p = await searchParams;
  const org = acces.session.organizationId;
  const demande = Number.parseInt(typeof p.lignes === "string" ? p.lignes : "", 10);
  const nombre = Number.isInteger(demande) && demande > 0 ? Math.min(demande, LIGNES_MAX) : LIGNES_PAR_DEFAUT;
  const idAccueil = typeof p.accueil === "string" ? p.accueil : "";

  const [identite, accueils] = await Promise.all([identiteEntreprise(org), idAccueil ? accueilsDe(org) : Promise.resolve([])]);
  const accueil = accueils.find((a) => a.id === idAccueil && acces.accueilPermis(a.id));
  const lieu = accueil ? [accueil.nom, accueil.lieu].filter(Boolean).join(" — ") : "";

  const cellule = "border border-black/40 px-[2mm] align-middle";
  const champ = "inline-block min-w-[48mm] border-b border-dotted border-black/50 align-bottom";

  return (
    <main className="min-h-dvh bg-[var(--fond)] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-between gap-3 px-4 print:hidden">
        <BoutonRetour href={accueil ? `/visiteurs?accueil=${accueil.id}` : "/visiteurs"}>
          Visiteurs
        </BoutonRetour>
        <BoutonImprimer />
      </div>
      <ApercuA4>
        <FeuilleA4 entete={<PapierEnTete identite={identite} />} paysage pied={<PiedDocument identite={identite} />}>
          <TitreDocument identite={identite}>
            <p className="text-[14pt] font-bold uppercase tracking-wide">Fiche de présence — Visiteurs</p>
          </TitreDocument>

          <div className="mt-[4mm] flex flex-wrap gap-x-[10mm] gap-y-[2mm] text-[9pt]">
            <p>
              Date : <span className={champ}>&nbsp;</span>
            </p>
            <p>
              Lieu : <span className={champ}>{lieu || " "}</span>
            </p>
            <p className="flex-1">
              Objet : <span className={`${champ} w-[calc(100%-14mm)]`}>&nbsp;</span>
            </p>
          </div>

          <table className="mt-[4mm] w-full table-fixed border-collapse text-[9pt]">
            <thead className="[display:table-header-group]">
              <tr className="text-left text-white" style={{ background: identite.couleur }}>
                <th className={`${cellule} w-[10mm] py-[2mm] text-center`}>N°</th>
                <th className={`${cellule} w-[68mm] py-[2mm]`}>Nom et prénoms</th>
                <th className={`${cellule} w-[45mm] py-[2mm]`}>Fonction</th>
                <th className={`${cellule} py-[2mm]`}>E-mail</th>
                <th className={`${cellule} w-[36mm] py-[2mm]`}>Contact</th>
                <th className={`${cellule} w-[40mm] py-[2mm]`}>Signature</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: nombre }, (_, i) => (
                <tr key={i} className="h-[10mm] [break-inside:avoid]">
                  <td className={`${cellule} text-center text-black/60`}>{i + 1}</td>
                  <td className={cellule} />
                  <td className={cellule} />
                  <td className={cellule} />
                  <td className={cellule} />
                  <td className={cellule} />
                </tr>
              ))}
            </tbody>
          </table>
        </FeuilleA4>
      </ApercuA4>
    </main>
  );
}
