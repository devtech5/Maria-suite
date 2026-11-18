import { PapierEnTete, TitreDocument, PiedDocument } from "@/components/impression/entete-document";
import { FeuilleA4 } from "@/components/impression/feuille-a4";
import type { IdentiteEntreprise } from "@/lib/identite";
import { NATURES_CONGE, STATUTS_CONGE, formatJours, type NatureConge } from "@/modules/presences/calcul";
import type { CongeAImprimer } from "@/modules/presences/requetes";

const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });
const date = (iso: string) => iso.split("-").reverse().join("/");

/** Solde de congés payés au jour de l'impression, s'il est connu. */
export interface SoldeImprime {
  au: string;
  acquis: number;
  pris: number;
  solde: number;
}

/**
 * La demande de congé sur papier à en-tête : remplie depuis une demande
 * saisie dans l'application (`conge`), ou vierge (`conge` nul) pour qui la
 * remplit à la main. Même feuille dans les deux cas : le circuit papier et le
 * circuit numérique se reconnaissent l'un l'autre.
 */
export function DocumentDemandeConge({ identite, conge, solde }: { identite: IdentiteEntreprise; conge: CongeAImprimer | null; solde?: SoldeImprime | null }) {
  const c = conge;
  const cellule = "border border-black/40 px-[2.5mm] py-[2mm] align-top";
  const libelle = "w-[48mm] bg-black/[0.04] font-semibold";
  const vide = <span className="inline-block min-h-[5mm]">&nbsp;</span>;
  const titre = "mb-[2mm] mt-[6mm] text-[9.5pt] font-bold uppercase tracking-wide";

  const debut = c ? `${date(c.debut)}${c.debutDemi ? " (après-midi)" : ""}` : null;
  const fin = c ? `${date(c.fin)}${c.finDemi ? " (matin)" : ""}` : null;

  return (
    <FeuilleA4 entete={<PapierEnTete identite={identite} />} pied={<PiedDocument identite={identite} />}>
      <TitreDocument identite={identite}>
        <p className="text-[14pt] font-bold uppercase tracking-wide">Demande de congé</p>
        <p className="text-[9pt]">
          N° {c ? <span className="font-semibold">{c.numero}</span> : <span className="inline-block min-w-[32mm] border-b border-dotted border-black/50">&nbsp;</span>}
        </p>
        {c && <p className="text-[9pt]">Demandée le {JOUR.format(c.creeLe)}</p>}
      </TitreDocument>

      <p className={titre} style={{ color: identite.couleur }}>
        Le demandeur
      </p>
      <table className="w-full table-fixed border-collapse text-[9pt]">
        <tbody>
          <tr>
            <td className={`${cellule} ${libelle}`}>Nom et prénoms</td>
            <td className={cellule} colSpan={3}>
              {c ? <span className="font-semibold">{c.nom}</span> : vide}
            </td>
          </tr>
          <tr>
            <td className={`${cellule} ${libelle}`}>Matricule</td>
            <td className={cellule}>{c?.matricule ?? vide}</td>
            <td className={`${cellule} ${libelle} w-[30mm]`}>Service</td>
            <td className={cellule}>{c ? (c.service ?? "—") : vide}</td>
          </tr>
          <tr>
            <td className={`${cellule} ${libelle}`}>Fonction</td>
            <td className={cellule} colSpan={3}>
              {c?.poste ?? vide}
            </td>
          </tr>
        </tbody>
      </table>

      <p className={titre} style={{ color: identite.couleur }}>
        Le congé demandé
      </p>
      <table className="w-full table-fixed border-collapse text-[9pt]">
        <tbody>
          <tr>
            <td className={`${cellule} ${libelle}`}>Nature</td>
            <td className={cellule} colSpan={3}>
              {c ? (
                c.libelleNature
              ) : (
                <span className="grid grid-cols-3 gap-x-[4mm] gap-y-[1.5mm]">
                  {(Object.keys(NATURES_CONGE) as NatureConge[]).map((n) => (
                    <span key={n} className="flex items-center gap-[1.5mm]">
                      <span className="inline-block size-[3.2mm] border border-black/60" />
                      {NATURES_CONGE[n].libelle}
                    </span>
                  ))}
                </span>
              )}
            </td>
          </tr>
          <tr>
            <td className={`${cellule} ${libelle}`}>Du</td>
            <td className={cellule}>{debut ?? vide}</td>
            <td className={`${cellule} ${libelle} w-[30mm]`}>Au</td>
            <td className={cellule}>{fin ?? vide}</td>
          </tr>
          <tr>
            <td className={`${cellule} ${libelle}`}>Nombre de jours</td>
            <td className={cellule}>{c ? <span className="font-semibold">{formatJours(c.jours)}</span> : vide}</td>
            <td className={`${cellule} ${libelle} w-[30mm]`}>Reprise le</td>
            <td className={cellule}>{vide}</td>
          </tr>
          <tr>
            <td className={`${cellule} ${libelle}`}>Motif</td>
            <td className={`${cellule} h-[16mm]`} colSpan={3}>
              {c?.motif ?? (c ? "—" : vide)}
            </td>
          </tr>
          <tr>
            <td className={`${cellule} ${libelle}`}>Intérim assuré par</td>
            <td className={cellule} colSpan={3}>
              {vide}
            </td>
          </tr>
        </tbody>
      </table>

      <p className={titre} style={{ color: identite.couleur }}>
        Situation et décision
      </p>
      <table className="w-full table-fixed border-collapse text-[9pt]">
        <tbody>
          <tr>
            <td className={`${cellule} ${libelle}`}>Solde de congés payés</td>
            <td className={cellule} colSpan={3}>
              {solde ? (
                <>
                  Acquis {formatJours(solde.acquis)} · pris {formatJours(solde.pris)} · <span className="font-semibold">disponible {formatJours(solde.solde)}</span>
                  <span className="text-black/60"> (au {date(solde.au)})</span>
                </>
              ) : (
                vide
              )}
            </td>
          </tr>
          <tr>
            <td className={`${cellule} ${libelle}`}>Décision</td>
            <td className={cellule} colSpan={3}>
              {c && c.statut !== "demande" ? (
                <>
                  <span className="font-semibold">{STATUTS_CONGE[c.statut]}</span>
                  {c.decideParNom && ` par ${c.decideParNom}`}
                  {c.decideLe && ` le ${JOUR.format(c.decideLe)}`}
                  {c.commentaire && <span className="block text-black/70">{c.commentaire}</span>}
                </>
              ) : (
                <span className="flex gap-[8mm]">
                  {["Accordé", "Refusé"].map((d) => (
                    <span key={d} className="flex items-center gap-[1.5mm]">
                      <span className="inline-block size-[3.2mm] border border-black/60" />
                      {d}
                    </span>
                  ))}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-[7mm] grid grid-cols-3 gap-[5mm] text-[8.5pt] [break-inside:avoid]">
        {["Le demandeur", "Le responsable hiérarchique", "La direction / RH"].map((qui) => (
          <div key={qui} className="flex h-[28mm] flex-col border border-black/40 px-[2mm] py-[1.5mm]">
            <p className="font-bold">{qui}</p>
            <p className="text-[7.5pt] text-black/60">Date et signature</p>
          </div>
        ))}
      </div>
    </FeuilleA4>
  );
}
