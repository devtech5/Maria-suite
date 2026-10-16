import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { FeuilleA4 } from "@/components/impression/feuille-a4";
import type { IdentiteEntreprise } from "@/lib/identite";
import { lieuEtDate, lignesDe, paragraphesDe } from "@/modules/documents/courriers-calcul";

export interface ContenuCourrier {
  /** Absent tant que le courrier n'est pas enregistré : l'aperçu de saisie n'a pas encore de numéro. */
  numero?: string | null;
  lieu: string;
  dateCourrier: string;
  destinataire: string | null;
  objet: string;
  corps: string;
  signataire: string;
  fonction: string | null;
}

/**
 * Un courrier officiel sur le papier à en-tête (modèle « En-tête élégant » de
 * MARIA GROUP) : lieu et date à droite sous le filet, objet en gras, corps
 * justifié, signataire et fonction à droite, devise et mentions légales en
 * pied.
 *
 * Le corps est du texte : chaque ligne devient un paragraphe, rendu comme
 * texte par React. Rien de ce qui est saisi n'est interprété comme du HTML.
 *
 * Sans dépendance serveur : le même composant sert à l'aperçu pendant la
 * saisie et à l'impression.
 */
export function CourrierDocument({ courrier, identite }: { courrier: ContenuCourrier; identite: IdentiteEntreprise }) {
  const destinataire = lignesDe(courrier.destinataire);
  const paragraphes = paragraphesDe(courrier.corps);

  return (
    <FeuilleA4 pied={<PiedDocument identite={identite} />}>
      <EnTeteDocument identite={identite}>
        <p className="mt-[7mm] text-[9pt] font-medium">{lieuEtDate(courrier.lieu, courrier.dateCourrier)}</p>
      </EnTeteDocument>

      <div style={{ color: identite.couleur }}>
        {destinataire.length > 0 && (
          <address className="ml-auto mt-[8mm] w-[78mm] text-[9pt] not-italic leading-[1.5]">
            {destinataire.map((ligne, rang) => (
              <p key={rang} className={rang === 0 ? "font-semibold" : undefined}>
                {ligne}
              </p>
            ))}
          </address>
        )}

        {courrier.numero && <p className="mt-[8mm] text-[8pt] font-medium text-[#5b6b7c]">N/Réf. : {courrier.numero}</p>}

        <p className={`${courrier.numero ? "mt-[3mm]" : "mt-[10.5mm]"} text-[9pt] font-bold`}>
          Objet : {courrier.objet || "…"}
        </p>

        <div lang="fr" className="mt-[7.5mm] text-justify text-[8.65pt] font-medium leading-[1.65] hyphens-auto [&>p]:mb-[3.2mm]">
          {paragraphes.map((paragraphe, rang) => (
            <p key={rang}>{paragraphe}</p>
          ))}
        </div>

        <div className="ml-auto mt-[7.5mm] w-fit min-w-[53mm] max-w-[90mm] text-center text-[8.65pt] font-semibold [break-inside:avoid]">
          <p>{courrier.signataire}</p>
          {courrier.fonction && <p className="font-medium text-[#5b6b7c]">{courrier.fonction}</p>}
        </div>
      </div>
    </FeuilleA4>
  );
}
