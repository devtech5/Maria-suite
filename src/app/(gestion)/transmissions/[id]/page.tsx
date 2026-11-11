import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Accuser, Annuler, PreuveJointe, Recevoir, Traiter, Transmettre } from "@/components/transmissions/gestes-transmission";
import { TON_STATUT, trajet } from "@/components/transmissions/liste-transmissions";
import { EnTetePage, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { accesTransmissions } from "@/modules/transmissions/acces";
import { AVIS, LIBELLE_SENS, LIBELLE_STATUT, MENTIONS, MOYENS, enRetard, passagePermis, totalExemplaires, valide } from "@/modules/transmissions/regles";
import { aujourdhuiPour, transmissionDe } from "@/modules/transmissions/requetes";

export const metadata: Metadata = { title: "Transmission" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUAND = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });

/** La fiche d'un bordereau : les pièces, le trajet, et le geste suivant selon qui regarde. */
export default async function PageTransmission({ params }: PageProps<"/transmissions/[id]">) {
  const a = await accesTransmissions();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const org = a.session.organizationId;
  const t = await transmissionDe(org, id);
  if (!t || !a.voit(t)) notFound();
  const aujourdhui = await aujourdhuiPour(org);
  const gere = a.gere(t);
  const destinataire = t.sens === "interne" && t.destinataireUserId === a.moi;
  const technique = t.pieces.some((p) => p.indice) || t.mention === "visa" || t.mention === "avis";

  const lignes: [string, string][] = [
    ["Sens", LIBELLE_SENS[t.sens]],
    ["Trajet", trajet(t)],
    ["Mention", valide(MENTIONS, t.mention) ? MENTIONS[t.mention] : t.mention],
  ];
  if (t.contact) lignes.push(["Contact", t.contact]);
  if (t.responsableNom && t.sens !== "interne") lignes.push(["Suivi par", t.responsableNom]);
  if (t.dateLimite) lignes.push(["Date limite", `${t.dateLimite.split("-").reverse().join("/")}${enRetard(t, aujourdhui) ? " · en retard" : ""}`]);
  if (t.moyen) lignes.push(["Moyen", valide(MOYENS, t.moyen) ? MOYENS[t.moyen] : t.moyen]);
  if (t.transmiseLe) lignes.push(["Transmis le", QUAND.format(t.transmiseLe)]);
  if (t.recueLe) lignes.push(["Reçu le", QUAND.format(t.recueLe)]);
  if (t.accuseLe) lignes.push(["Réception accusée", `${QUAND.format(t.accuseLe)}${t.accusePar ? ` · ${t.accusePar}` : ""}`]);
  if (t.traiteeLe) lignes.push(["Retour le", `${QUAND.format(t.traiteeLe)}${t.avis ? ` · ${AVIS[t.avis]}` : ""}${t.note ? ` · ${t.note}` : ""}`]);

  const section = "mb-6 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm";
  return (
    <div className="mx-auto max-w-4xl">
      <EnTetePage
        titre={t.objet}
        sousTitre={t.numero}
        actions={
          <Link href={`/imprimer/bordereau/${t.id}`} target="_blank" className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
            Imprimer le bordereau
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Pastille ton={TON_STATUT[t.statut]}>{LIBELLE_STATUT[t.statut]}</Pastille>
        {t.avis && <Pastille ton={t.avis === "refuse" ? "danger" : t.avis === "vise_observations" ? "alerte" : "valide"}>{AVIS[t.avis]}</Pastille>}
      </div>

      <dl className="mb-6 divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] text-sm shadow-sm">
        {lignes.map(([terme, valeur]) => (
          <div key={terme} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2.5">
            <dt className="text-[var(--encre-faible)]">{terme}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">
        Pièces · {t.pieces.length} ({totalExemplaires(t.pieces)} exemplaires)
      </h2>
      <div className="mb-6">
        <Tableau>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Pièce</Th>
              <Th>Référence</Th>
              <Th>Indice</Th>
              <Th aligne="droite">Ex.</Th>
              <Th>Nature</Th>
              <Th>Avis</Th>
            </tr>
          </thead>
          <tbody>
            {t.pieces.map((p, i) => (
              <tr key={i}>
                <Td chiffres>{i + 1}</Td>
                <Td fort>
                  {p.designation}
                  {p.observation && <span className="block text-xs font-normal text-[var(--encre-faible)]">{p.observation}</span>}
                </Td>
                <Td>{p.reference || "—"}</Td>
                <Td>{p.indice || "—"}</Td>
                <Td aligne="droite" chiffres>
                  {p.exemplaires}
                </Td>
                <Td>{p.original ? "Original" : "Copie"}</Td>
                <Td>{p.avis ? AVIS[p.avis] : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      </div>

      {(gere || destinataire) && (
        <section className={section}>
          <h2 className="mb-2 font-bold">Preuve</h2>
          <PreuveJointe id={t.id} presente={Boolean(t.preuve)} joindre={gere || destinataire} />
        </section>
      )}

      {gere && t.statut === "a_transmettre" && (
        <section className={section}>
          <h2 className="mb-3 font-bold">Transmettre</h2>
          <Transmettre id={t.id} />
        </section>
      )}
      {gere && t.statut === "attendue" && (
        <section className={section}>
          <h2 className="mb-3 font-bold">L&apos;entreprise a transmis</h2>
          <Recevoir id={t.id} />
        </section>
      )}
      {((destinataire && t.statut === "transmise") || (gere && t.sens === "sortante" && t.statut === "transmise")) && (
        <section className={section}>
          <h2 className="mb-3 font-bold">{t.sens === "sortante" ? "Accusé de réception de l'entreprise" : "Accuser réception"}</h2>
          <Accuser id={t.id} externe={t.sens === "sortante"} />
        </section>
      )}
      {((destinataire && t.statut === "accusee") || (gere && t.sens !== "interne" && ["transmise", "accusee", "recue"].includes(t.statut))) && (
        <section className={section}>
          <h2 className="mb-3 font-bold">{t.sens === "entrante" ? "Traiter" : "Retour"}</h2>
          <Traiter id={t.id} pieces={t.pieces} technique={technique} />
        </section>
      )}
      {gere && passagePermis(t.sens, t.statut, "annulee") && <Annuler id={t.id} />}

      <p className="mt-6 text-sm">
        <Link href={destinataire ? "/transmissions/recues" : `/transmissions?sens=${t.sens}`} className="font-semibold text-marque-600 hover:underline">
          ← Retour
        </Link>
      </p>
    </div>
  );
}
