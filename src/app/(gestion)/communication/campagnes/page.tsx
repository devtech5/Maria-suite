import type { Metadata } from "next";

import { ActionsBrouillon, NouvelleCampagne } from "@/components/communication/campagnes";
import { EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { listerCampagnes } from "@/modules/communication/campagnes";

export const metadata: Metadata = { title: "Messages groupés" };

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });
const CANAL: Record<string, string> = { email: "E-mail", whatsapp: "WhatsApp", application: "Application" };

/**
 * Messages groupés : au personnel (dans l'application, par e-mail, WhatsApp)
 * ou aux clients (e-mail, WhatsApp). Un brouillon d'abord, l'envoi ensuite,
 * et le compte rendu reste : remis, échecs, retenus.
 */
export default async function PageCampagnes({ searchParams }: PageProps<"/communication/campagnes">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [tout, trouvees, gerer] = await Promise.all([
    listerCampagnes(session.organizationId),
    filtres.actif ? listerCampagnes(session.organizationId, filtres) : null,
    peut("communication.campagne.gerer"),
  ]);
  const liste = trouvees ?? tout;

  return (
    <>
      <EnTetePage titre="Messages groupés" sousTitre="Au personnel ou aux clients, en un envoi" actions={gerer ? <NouvelleCampagne /> : undefined} />
      {tout.length > 0 && (
        <Recherche
          chemin="/communication/campagnes"
          valeur={filtres.q}
          placeholder="Titre, numéro, objet, texte du message…"
          periode={{ ...filtres.periode, libelle: "Envoyé" }}
          resultats={filtres.actif ? `${fmtEntier(liste.length)} message${liste.length > 1 ? "s" : ""}` : undefined}
        />
      )}
      {tout.length === 0 ? (
        <EtatVide
          titre="Aucun message groupé"
          message="Prévenez tout le personnel d'une fermeture, rappelez aux clients une promotion ou leurs factures en retard. Les destinataires désinscrits ne reçoivent rien."
        />
      ) : liste.length === 0 ? (
        <EtatVide titre="Aucun résultat" message="Aucun message groupé ne répond. Un brouillon, jamais envoyé, n'a pas de date d'envoi : retirez la période pour le retrouver." />
      ) : (
        <ul className="space-y-3">
          {liste.map((c) => (
            <li key={c.id} className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {c.numero && <span className="chiffres text-[var(--encre-douce)]">{c.numero}</span>}
                    {c.titre}
                    <Pastille ton={c.statut === "envoyee" ? "valide" : "alerte"}>{c.statut === "envoyee" ? "Envoyé" : "Brouillon"}</Pastille>
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--encre-douce)]">
                    {c.public === "personnel" ? "Personnel" : "Clients"} · {c.canaux.map((k) => CANAL[k] ?? k).join(", ")}
                    {c.envoyeeLe && ` · envoyé le ${HEURE.format(c.envoyeeLe)}`}
                  </p>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-[var(--encre-douce)]">{c.corps}</p>
                </div>
                {c.statut === "envoyee" ? (
                  <dl className="chiffres grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <dt className="text-[var(--encre-faible)]">Remis</dt>
                      <dd className="text-base font-semibold text-valide-600">{c.envoyes}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--encre-faible)]">Échecs</dt>
                      <dd className={`text-base font-semibold ${c.echecs ? "text-danger-600" : ""}`}>{c.echecs}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--encre-faible)]">Retenus</dt>
                      <dd className="text-base font-semibold">{c.ignores}</dd>
                    </div>
                  </dl>
                ) : (
                  gerer && <ActionsBrouillon id={c.id} titre={c.titre} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
