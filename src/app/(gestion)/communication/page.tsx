import type { Metadata } from "next";

import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { courrielConfigure } from "@/lib/courriel";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { whatsappConfigure } from "@/lib/whatsapp";
import { CANAUX } from "@/modules/communication/calcul";
import { listerEnvois } from "@/modules/communication/envoi";

export const metadata: Metadata = { title: "Communication" };

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

const STATUT: Record<string, { libelle: string; ton: TonPastille }> = {
  envoye: { libelle: "Envoyé", ton: "valide" },
  echec: { libelle: "Échec", ton: "danger" },
  ignore: { libelle: "Retenu", ton: "neutre" },
  en_attente: { libelle: "En attente", ton: "alerte" },
};

const ORIGINE: Record<string, string> = {
  facture: "Facture",
  devis: "Devis",
  avoir: "Avoir",
  relance: "Relance",
  campagne: "Message groupé",
  essai: "Essai",
  consultation: "Consultation",
};

/**
 * Journal des envois : chaque e-mail et chaque WhatsApp parti vers un client
 * ou un salarié, échecs et retenues compris. « Le client dit n'avoir rien
 * reçu » se vérifie ici.
 */
export default async function PageCommunication({ searchParams }: PageProps<"/communication">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  // Les indicateurs portent sur les 300 derniers envois ; seul le tableau suit la recherche.
  const [envois, trouves] = await Promise.all([
    listerEnvois(session.organizationId, 300),
    filtres.actif ? listerEnvois(session.organizationId, 300, filtres) : null,
  ]);
  const lignes = trouves ?? envois;
  const envoyes = envois.filter((e) => e.statut === "envoye").length;
  const echecs = envois.filter((e) => e.statut === "echec").length;
  const email = courrielConfigure();
  const whatsapp = whatsappConfigure();

  return (
    <>
      <EnTetePage titre="Communication" sousTitre="E-mails et messages WhatsApp envoyés aux clients et au personnel" />

      {(!email || !whatsapp) && (
        <p className="mb-5 rounded-xl border-l-4 border-alerte-500 bg-alerte-50 px-4 py-3 text-sm text-alerte-600">
          {!email && "Aucun fournisseur d'e-mails n'est configuré : les e-mails sont tracés mais ne partent pas. "}
          {!whatsapp && "WhatsApp Business n'est pas configuré : les envois WhatsApp sont refusés en le disant."} L&apos;administrateur de
          l&apos;instance règle ces accès (COURRIEL_*, WHATSAPP_*).
        </p>
      )}

      {envois.length === 0 ? (
        <EtatVide
          titre="Aucun envoi"
          message="Envoyez une facture à un client depuis Devis et factures, relancez une facture échue, ou préparez un message groupé : chaque envoi apparaîtra ici, réussi ou non."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <CarteIndicateur libelle="Envoyés" valeur={fmtEntier(envoyes)} ton="valide" precision="Acceptés par le fournisseur" />
            <CarteIndicateur libelle="Échecs" valeur={fmtEntier(echecs)} ton={echecs > 0 ? "danger" : "valide"} precision="Refusés ou injoignables" />
            <CarteIndicateur libelle="Total" valeur={fmtEntier(envois.length)} precision="Les 300 derniers" />
          </section>
          <Recherche
            chemin="/communication"
            valeur={filtres.q}
            placeholder="Destinataire, n° ou adresse, objet, origine…"
            periode={{ ...filtres.periode, libelle: "Envoi" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} envoi${lignes.length > 1 ? "s" : ""}` : undefined}
          />
          {lignes.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun envoi ne répond. Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Canal</Th>
                  <Th>Destinataire</Th>
                  <Th>Objet</Th>
                  <Th>Origine</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((e) => (
                  <tr key={e.id}>
                    <Td chiffres>{HEURE.format(e.createdAt)}</Td>
                    <Td>{CANAUX[e.canal]}</Td>
                    <Td>
                      {e.nom && <span className="block font-medium">{e.nom}</span>}
                      <span className="chiffres text-xs text-[var(--encre-douce)]">{e.destinataire}</span>
                    </Td>
                    <Td>
                      <span className="block max-w-[28ch] truncate" title={e.corps}>
                        {e.objet ?? e.corps.slice(0, 60)}
                      </span>
                    </Td>
                    <Td>{ORIGINE[e.origine] ?? e.origine}</Td>
                    <Td>
                      <Pastille ton={STATUT[e.statut].ton}>{STATUT[e.statut].libelle}</Pastille>
                      {e.raison && <span className="mt-0.5 block max-w-[30ch] text-xs text-[var(--encre-faible)]">{e.raison}</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
