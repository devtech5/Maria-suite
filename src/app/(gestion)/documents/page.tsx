import type { Metadata } from "next";

import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { stockageConfigure } from "@/lib/stockage";
import { listerActifs } from "@/modules/actifs/requetes";
import { listerDocuments } from "@/modules/documents/requetes";
import { listerIntervenants, listerSalaries } from "@/modules/personnes/requetes";
import { listerTiers } from "@/modules/tiers/requetes";

import { Bibliotheque, type DocumentAffiche } from "./bibliotheque";
import { FormulaireDocument, type CibleDocument } from "./formulaire-document";

export const metadata: Metadata = { title: "Documents" };

const dateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** Au-delà, une échéance de document n'appelle pas encore d'action. */
const SEUIL_EXPIRATION_JOURS = 30;

export default async function PageDocuments({ searchParams }: PageProps<"/documents">) {
  const session = await exigerEntreprise();
  // `?q=` arrive de la recherche globale ; la bibliothèque filtre ensuite sur place.
  const filtres = lireFiltresListe(await searchParams);

  const [pieces, trouves, partenaires, salaries, intervenants, parc] = await Promise.all([
    listerDocuments(session.organizationId),
    // Une recherche par lien se fait aussi en base : une pièce plus ancienne
    // que les deux cents dernières doit répondre. Même requête, mêmes règles.
    filtres.actif ? listerDocuments(session.organizationId, new Date(), 200, filtres) : Promise.resolve([]),
    listerTiers(session.organizationId),
    listerSalaries(session.organizationId),
    listerIntervenants(session.organizationId),
    listerActifs(session.organizationId),
  ]);

  const expirants = pieces.filter(
    (doc) =>
      doc.joursAvantExpiration !== null &&
      doc.joursAvantExpiration <= SEUIL_EXPIRATION_JOURS,
  );
  const prives = pieces.filter((doc) => doc.visibilite === "prive");
  const rattaches = new Set(
    pieces.filter((doc) => doc.entiteType).map((doc) => doc.entiteType),
  ).size;

  // Les indicateurs gardent les deux cents dernières ; la liste y ajoute ce
  // que la recherche a trouvé plus loin, sans doublon.
  const dejaLa = new Set(pieces.map((doc) => doc.id));
  const listees = [...pieces, ...trouves.filter((doc) => !dejaLa.has(doc.id))];

  const affiches: DocumentAffiche[] = listees.map((doc) => ({
    id: doc.id,
    nom: doc.nom,
    categorie: doc.categorie,
    entiteType: doc.entiteType,
    entiteLibelle: doc.entiteLibelle,
    visibilite: doc.visibilite,
    avecFichier: doc.avecFichier,
    nomFichier: doc.nomFichier,
    tailleOctets: doc.tailleOctets,
    joursAvantExpiration: doc.joursAvantExpiration,
    expireLe: doc.expireLe,
    deposeLeIso: dateCourte.format(doc.deposeLe),
  }));

  const cibles: CibleDocument[] = [
    ...partenaires.map((t) => ({
      id: t.id,
      libelle: t.nom,
      type: "tiers" as const,
    })),
    ...salaries.map((s) => ({
      id: s.id,
      libelle: `${s.matricule} · ${s.nom}`,
      type: "employe" as const,
    })),
    ...intervenants.map((i) => ({
      id: i.id,
      libelle: `${i.nom} · ${i.qualification}`,
      type: "intervenant" as const,
    })),
    ...parc.map((a) => ({
      id: a.id,
      libelle: `${a.code} · ${a.designation}`,
      type: "actif" as const,
    })),
    { id: session.organizationId, libelle: "L'entreprise", type: "organisation" },
  ];

  const stockageActif = stockageConfigure();

  return (
    <>
      <EnTetePage
        titre="Documents"
        sousTitre="Pièces rattachées aux clients, employés, actifs et contrats"
        actions={
          <FormulaireDocument
            cibles={cibles}
            stockageActif={stockageActif}
            premier={pieces.length === 0}
          />
        }
      />

      {!stockageActif && (
        <p className="mb-5 rounded-xl border-l-4 border-alerte-500 bg-alerte-50 px-4 py-3 text-sm text-alerte-600">
          <strong className="font-semibold">Dépôt de fichiers inactif.</strong> Les
          fiches se créent et les échéances se suivent, mais aucune pièce ne peut
          être jointe ni ouverte. Renseignez{" "}
          <span className="chiffres">STOCKAGE_LOCAL</span> : un dossier sur un
          volume persistant et sauvegardé.
        </p>
      )}

      {pieces.length === 0 ? (
        <EtatVide
          titre="Aucun document"
          message="Un document se range par ce à quoi il se rattache : le contrat de son client, l'assurance de son véhicule, l'attestation de son salarié. Un fichier qui ne pointe vers rien n'est qu'un fichier."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Documents"
              valeur={fmtEntier(pieces.length)}
              precision={`Rattachés à ${rattaches} type${rattaches > 1 ? "s" : ""} d'entités`}
            />
            <CarteIndicateur
              libelle="Bientôt expirés"
              valeur={fmtEntier(expirants.length)}
              ton={expirants.length > 0 ? "alerte" : "valide"}
              precision="Assurances, agréments, visites"
            />
            <CarteIndicateur
              libelle="À accès privé"
              valeur={fmtEntier(prives.length)}
              precision="Pièces personnelles et RH"
            />
          </section>

          <Bibliotheque documents={affiches} rechercheInitiale={filtres.q} periodeInitiale={filtres.periode} />
        </>
      )}

      <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
        Un document se range par ce à quoi il se rattache, pas dans une
        arborescence de dossiers. Un contrat qui concerne à la fois un client et
        un véhicule n&apos;a pas à choisir son dossier : il répond à la seule
        question posée devant l&apos;écran — quelles pièces ai-je sur ce client,
        ce véhicule, cet employé. Les fichiers vivent dans un dépôt privé et ne
        s&apos;ouvrent que par une adresse signée, valable cinq minutes.
      </p>
    </>
  );
}
