import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { FeuilleA4 } from "@/components/impression/feuille-a4";
import type { IdentiteEntreprise } from "@/lib/identite";
import {
  estPoliceCourrier,
  lieuEtDate,
  lignesDe,
  paragraphesDe,
  POLICES_COURRIER,
  TAILLE_PAR_DEFAUT,
  taillesCourrier,
} from "@/modules/documents/courriers-calcul";

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
  /** Police du texte (`POLICES_COURRIER`) ; absente ou inconnue, celle de la charte. */
  police?: string | null;
  /** Taille du corps en centièmes de point (865 = 8,65 pt). */
  taillePolice?: number | null;
}

/**
 * Un courrier officiel sur le papier à en-tête (modèle « En-tête élégant » de
 * MARIA GROUP) : lieu et date à droite sous le filet, objet en gras, corps
 * justifié, signataire et fonction à droite, devise et mentions légales en
 * pied.
 *
 * Police et taille s'appliquent au texte de la lettre — date, destinataire,
 * objet, corps, signature —, jamais à l'en-tête ni au pied, qui sont le
 * papier de l'entreprise. Les autres tailles suivent celle du corps.
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
  const pile = estPoliceCourrier(courrier.police) ? POLICES_COURRIER[courrier.police].pile : null;
  const tailles = taillesCourrier(courrier.taillePolice ?? TAILLE_PAR_DEFAUT);
  const police = pile ? { fontFamily: pile } : undefined;

  return (
    <FeuilleA4 pied={<PiedDocument identite={identite} />}>
      <EnTeteDocument identite={identite}>
        <p className="mt-[7mm] font-medium" style={{ ...police, fontSize: tailles.titre }}>
          {lieuEtDate(courrier.lieu, courrier.dateCourrier)}
        </p>
      </EnTeteDocument>

      <div style={{ color: identite.couleur, ...police }}>
        {destinataire.length > 0 && (
          <address className="ml-auto mt-[8mm] w-[78mm] not-italic leading-[1.5]" style={{ fontSize: tailles.titre }}>
            {destinataire.map((ligne, rang) => (
              <p key={rang} className={rang === 0 ? "font-semibold" : undefined}>
                {ligne}
              </p>
            ))}
          </address>
        )}

        {courrier.numero && (
          <p className="mt-[8mm] font-medium text-[#5b6b7c]" style={{ fontSize: tailles.reference }}>
            N/Réf. : {courrier.numero}
          </p>
        )}

        <p className={`${courrier.numero ? "mt-[3mm]" : "mt-[10.5mm]"} font-bold`} style={{ fontSize: tailles.titre }}>
          Objet : {courrier.objet || "…"}
        </p>

        <div
          lang="fr"
          className="mt-[7.5mm] text-justify font-medium leading-[1.65] hyphens-auto [&>p]:mb-[3.2mm]"
          style={{ fontSize: tailles.corps }}
        >
          {paragraphes.map((paragraphe, rang) => (
            <p key={rang}>{paragraphe}</p>
          ))}
        </div>

        <div
          className="ml-auto mt-[7.5mm] w-fit min-w-[53mm] max-w-[90mm] text-center font-semibold [break-inside:avoid]"
          style={{ fontSize: tailles.corps }}
        >
          <p>{courrier.signataire}</p>
          {courrier.fonction && <p className="font-medium text-[#5b6b7c]">{courrier.fonction}</p>}
        </div>
      </div>
    </FeuilleA4>
  );
}
