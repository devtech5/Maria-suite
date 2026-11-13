import { EnTeteDocument, PiedDocument } from "@/components/impression/entete-document";
import { FeuilleA4 } from "@/components/impression/feuille-a4";
import { CorpsMessage } from "@/components/ui/texte-mis-en-forme";
import type { IdentiteEntreprise } from "@/lib/identite";
import { dateEnLettres } from "@/modules/documents/courriers-calcul";
import { LIBELLE_PRESENCE, LIBELLE_TYPE, referencePv, type Participant, type Point, type TypePv } from "@/modules/pv/regles";

export interface ContenuPv {
  numero: string | null;
  revision: number;
  type: TypePv;
  objet: string;
  dateSeance: string;
  lieu: string | null;
  participants: Participant[];
  points: Point[];
  conclusion: string | null;
  confidentiel: boolean;
  redacteur: string;
  publiePar: string | null;
  publieLe: Date | null;
  actions: { libelle: string; responsable: string | null; echeance: string | null }[];
}

const MOMENT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Le procès-verbal sur le papier à en-tête, tel qu'il s'imprime : référence,
 * participants par présence, points avec leurs décisions, actions, et la
 * validation de la direction. Le même composant sert à l'écran et à
 * l'impression. Le texte est mis en forme en éléments, jamais en HTML.
 */
export function DocumentPv({ pv, identite }: { pv: ContenuPv; identite: IdentiteEntreprise }) {
  const parPresence = (p: Participant["presence"]) => pv.participants.filter((x) => x.presence === p);
  return (
    <FeuilleA4 pied={<PiedDocument identite={identite} />}>
      <EnTeteDocument identite={identite}>
        <p className="mt-[7mm] text-[9pt] font-medium">{dateEnLettres(pv.dateSeance)}</p>
      </EnTeteDocument>

      <div style={{ color: identite.couleur }} className="text-[9pt] leading-[1.55]">
        <div className="mt-[7mm] text-center">
          {pv.confidentiel && <p className="mb-[2mm] text-[8pt] font-bold tracking-[0.3em] text-[#b42318]">CONFIDENTIEL</p>}
          <p className="text-[13pt] font-bold uppercase tracking-wide">{LIBELLE_TYPE[pv.type]}</p>
          <p className="mt-[1mm] text-[10.5pt] font-semibold">{pv.objet}</p>
          <p className="mt-[1mm] text-[8pt] text-[#5b6b7c]">
            {referencePv(pv.numero, pv.revision)} · {dateEnLettres(pv.dateSeance)}
            {pv.lieu ? ` · ${pv.lieu}` : ""}
          </p>
        </div>

        {pv.participants.length > 0 && (
          <section className="mt-[6mm] [break-inside:avoid]">
            <h2 className="mb-[1.5mm] border-b border-[#c9a96e] pb-[0.5mm] text-[9.5pt] font-bold uppercase">Participants</h2>
            {(["present", "excuse", "absent"] as const).map((p) =>
              parPresence(p).length ? (
                <p key={p} className="mb-[1mm]">
                  <span className="font-semibold">{LIBELLE_PRESENCE[p]}s : </span>
                  {parPresence(p)
                    .map((x) => (x.qualite ? `${x.nom} (${x.qualite})` : x.nom))
                    .join(" ; ")}
                </p>
              ) : null,
            )}
          </section>
        )}

        {pv.points.map((point, rang) => (
          <section key={rang} className="mt-[5mm]">
            <h2 className="mb-[1.5mm] border-b border-[#c9a96e] pb-[0.5mm] text-[9.5pt] font-bold uppercase">
              {rang + 1}. {point.titre || "Point"}
            </h2>
            {point.texte && (
              <div className="text-justify [&_p]:mb-[1mm]">
                <CorpsMessage corps={point.texte} />
              </div>
            )}
            {point.decisions.length > 0 && (
              <div className="mt-[2mm] rounded-[1.5mm] border-l-[1mm] border-[#c9a96e] bg-[#faf6ee] px-[3mm] py-[1.5mm] [break-inside:avoid]">
                <p className="text-[8pt] font-bold uppercase tracking-wide">Décision{point.decisions.length > 1 ? "s" : ""}</p>
                <ul className="list-disc pl-[4mm]">
                  {point.decisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}

        {pv.actions.length > 0 && (
          <section className="mt-[5mm] [break-inside:avoid]">
            <h2 className="mb-[1.5mm] border-b border-[#c9a96e] pb-[0.5mm] text-[9.5pt] font-bold uppercase">Actions à mener</h2>
            <table className="w-full border-collapse text-[8.5pt]">
              <thead>
                <tr className="text-left">
                  <th className="border-b border-[#d8dee6] py-[1mm] pr-[2mm] font-semibold">Action</th>
                  <th className="w-[45mm] border-b border-[#d8dee6] py-[1mm] pr-[2mm] font-semibold">Responsable</th>
                  <th className="w-[28mm] border-b border-[#d8dee6] py-[1mm] font-semibold">Échéance</th>
                </tr>
              </thead>
              <tbody>
                {pv.actions.map((a, i) => (
                  <tr key={i}>
                    <td className="border-b border-[#eef1f5] py-[1mm] pr-[2mm] align-top">{a.libelle}</td>
                    <td className="border-b border-[#eef1f5] py-[1mm] pr-[2mm] align-top">{a.responsable ?? "—"}</td>
                    <td className="border-b border-[#eef1f5] py-[1mm] align-top">{a.echeance ? dateEnLettres(a.echeance) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {pv.conclusion && (
          <section className="mt-[5mm]">
            <h2 className="mb-[1.5mm] border-b border-[#c9a96e] pb-[0.5mm] text-[9.5pt] font-bold uppercase">Conclusion</h2>
            <p className="whitespace-pre-line text-justify">{pv.conclusion}</p>
          </section>
        )}

        <div className="mt-[8mm] flex justify-between gap-[10mm] text-[8.5pt] [break-inside:avoid]">
          <div>
            <p className="font-semibold">Rédigé par</p>
            <p>{pv.redacteur}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Validé et publié par</p>
            {pv.publiePar && pv.publieLe ? (
              <>
                <p>{pv.publiePar}</p>
                <p className="text-[#5b6b7c]">le {MOMENT.format(pv.publieLe)}</p>
              </>
            ) : (
              <p className="text-[#b42318]">Non validé — document de travail</p>
            )}
          </div>
        </div>
      </div>
    </FeuilleA4>
  );
}
