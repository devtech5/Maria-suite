import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteIndicateur, EnTetePage } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtCompact, fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { resteDu } from "@/modules/facturation/calcul";
import { detailsPieces, listerPieces, optionsPiece } from "@/modules/facturation/requetes";

import { PiecesCommerciales } from "./pieces";

export const metadata: Metadata = { title: "Devis et factures" };

/**
 * Devis, factures et avoirs.
 *
 * Trois états d'un même flux sur un seul écran : un devis devient une
 * facture, une facture se corrige par un avoir. Les séparer en trois onglets
 * obligerait à traverser l'application pour suivre une seule affaire.
 */
export default async function PageFactures({ searchParams }: PageProps<"/commercial/factures">) {
  const session = await exigerEntreprise();
  // Depuis la fiche client : « Devis » ou « Facture » ouvre l'éditeur déjà
  // adressé au client, au lieu de laisser chercher son nom une seconde fois.
  const demande = await searchParams;
  const filtres = lireFiltresListe(demande);
  const nouvelle =
    (demande.nouvelle === "devis" || demande.nouvelle === "facture") &&
    typeof demande.client === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(demande.client)
      ? { nature: demande.nouvelle as "devis" | "facture", clientId: demande.client }
      : undefined;

  if (!(await peut("commercial.piece.consulter"))) {
    return <AccesRefuse droit="commercial.piece.consulter" />;
  }

  const [pieces, details, options, gerer, annuler, encaisser, envoyer] = await Promise.all([
    listerPieces(session.organizationId),
    detailsPieces(session.organizationId),
    optionsPiece(session.organizationId, session.userId),
    peut("commercial.piece.gerer"),
    peut("commercial.piece.annuler"),
    peut("commercial.reglement.encaisser"),
    peut("communication.client.notifier"),
  ]);

  // Toutes les pièces sont déjà là, sans limite : la recherche filtre la liste en
  // mémoire, les indicateurs restent ceux de toute l'entreprise.
  const trouvees = filtres.actif
    ? pieces.filter(
        (p) =>
          correspond(filtres.q, [p.numero, p.clientNom, p.contactNom, p.origineNumero, p.ecritureNumero, p.notes]) &&
          dansPeriode(p.datePiece, filtres.periode),
      )
    : pieces;

  const factures = pieces.filter((p) => p.nature === "facture" && p.statut === "emise");
  const aEncaisser = factures.reduce((s, f) => s + resteDu(f.totalTtc, f.regle), 0);
  const enRetard = factures.filter((f) => f.enRetard);
  const montantRetard = enRetard.reduce((s, f) => s + resteDu(f.totalTtc, f.regle), 0);
  const devisOuverts = pieces.filter(
    (p) => p.nature === "devis" && (p.statut === "emise" || p.statut === "acceptee"),
  );
  const brouillons = pieces.filter((p) => p.statut === "brouillon").length;

  // La date du jour vient du serveur, en UTC (l'heure d'Abidjan) : le
  // navigateur ne décide pas de la date d'une pièce.
  const aujourdHui = new Date().toISOString().slice(0, 10);

  return (
    <>
      <EnTetePage titre="Devis et factures" sousTitre="Du devis à l'encaissement, sur un seul écran" />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
        <CarteIndicateur
          libelle="À encaisser"
          valeur={fmtCompact(aEncaisser)}
          unite="FCFA"
          precision={`${factures.length} facture${factures.length > 1 ? "s" : ""} émise${factures.length > 1 ? "s" : ""}`}
        />
        <CarteIndicateur
          libelle="En retard"
          valeur={fmtCompact(montantRetard)}
          unite="FCFA"
          ton={enRetard.length > 0 ? "danger" : "valide"}
          precision={`${enRetard.length} à relancer`}
        />
        <CarteIndicateur
          libelle="Devis en cours"
          valeur={fmtEntier(devisOuverts.length)}
          precision="Envoyés ou acceptés, pas encore facturés"
        />
        <CarteIndicateur
          libelle="Brouillons"
          valeur={fmtEntier(brouillons)}
          ton={brouillons > 0 ? "alerte" : "neutre"}
          precision="Sans numéro tant qu'ils ne sont pas émis"
        />
      </section>

      <PiecesCommerciales
        pieces={trouvees}
        filtrees={filtres.actif}
        recherche={
          pieces.length > 0 || filtres.actif ? (
            <Recherche
              chemin="/commercial/factures"
              valeur={filtres.q}
              placeholder="Numéro, client, contact, note…"
              periode={{ ...filtres.periode, libelle: "Date de pièce" }}
              resultats={filtres.actif ? `${fmtEntier(trouvees.length)} sur ${fmtEntier(pieces.length)}` : undefined}
            />
          ) : undefined
        }
        lignes={Object.fromEntries(details.lignes)}
        reglements={Object.fromEntries(details.reglements)}
        options={options}
        aujourdHui={aujourdHui}
        droits={{ gerer, annuler, encaisser, envoyer }}
        ouvrir={gerer ? nouvelle : undefined}
      />
    </>
  );
}
