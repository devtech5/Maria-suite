import type { Metadata } from "next";

import Link from "next/link";

import { CarteIndicateur, EnTetePage, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { apercuActif, moduleOuvert } from "@/lib/modules/garde";
import { droitsActifs } from "@/lib/droits/garde";
import type { Droit } from "@/lib/droits/catalogue";
import {
  listerActifs,
  listerEcheances,
  resumeParc,
} from "@/modules/actifs/requetes";
import { etatMissions } from "@/modules/missions/requetes";
import { etatDepenses } from "@/modules/projets/requetes";
import { LIBELLE_PRIORITE, joursAvantEcheance } from "@/modules/taches/calcul";
import { tachesEnRetard } from "@/modules/taches/requetes";
import { etatTresorerie, planDeTresorerie } from "@/modules/tresorerie/requetes";
import { etatAchats } from "@/modules/achats/requetes";
import { etatPaie } from "@/modules/paie/requetes";
import { etatMarches } from "@/modules/marches/creation";
import { etatLicences } from "@/modules/parc-informatique/requetes";
import { etatDossiers } from "@/modules/personnes/dossier";
import { etatPresences } from "@/modules/presences/requetes";
import { etatFiscalite } from "@/modules/fiscalite/requetes";
import { etatFacturation } from "@/modules/facturation/requetes";
import { soldesParCompte } from "@/modules/comptabilite/requetes";
import { soldesParAuxiliaire } from "@/modules/tiers/requetes";
import {
  alertesReapprovisionnement,
  joursRestants,
  resumeStock,
} from "@/modules/stock/requetes";
import {
  alertes,
  ORDRE_GRAVITE,
  tresorerie,
  type Gravite,
} from "@/lib/tableau-de-bord";

export const metadata: Metadata = { title: "Tableau de bord" };

const TON: Record<Gravite, "danger" | "alerte" | "neutre"> = {
  critique: "danger",
  attention: "alerte",
  information: "neutre",
};

const LIBELLE: Record<Gravite, string> = {
  critique: "Critique",
  attention: "À traiter",
  information: "Pour information",
};

/**
 * Tableau de bord.
 *
 * Trois temps, dans cet ordre : où est l'argent, ce que la journée a produit,
 * ce qui demande une décision. Le constat d'abord, l'action ensuite — les
 * alertes ferment la page parce qu'on les lit pour agir, et qu'on agit après
 * avoir vu où on en est.
 *
 * Les alertes sont classées par gravité et non par module. Quelqu'un qui ouvre
 * son application le matin veut savoir ce qui brûle, pas parcourir un sommaire.
 *
 * Une seule grille pour les trois sections — quatre colonnes en grand écran,
 * deux au-delà du téléphone, le même écart. Trois rythmes différents sur une
 * même page donnent l'impression de trois écrans collés bout à bout.
 */
const GRILLE = "grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2";
/** Les alertes portent un titre et une phrase : sur téléphone, une par ligne. */
const GRILLE_ALERTES = "grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4";

/**
 * Délai de réaction : au-delà, une commande passée aujourd'hui arrive trop
 * tard. Trois jours couvrent le délai courant d'un fournisseur d'Abidjan.
 */
const DELAI_REACTION_JOURS = 3;

/**
 * Droit de consultation qu'exige chaque destination d'alerte.
 *
 * Le tableau de bord traverse tous les modules : sans ce filtre, un caissier
 * y lirait les soldes bancaires et les échéances du parc qu'aucun de ses
 * écrans ne lui montre. L'alerte suit le droit de l'écran vers lequel elle
 * mène — la plus longue racine l'emporte (/commercial/factures avant
 * /commercial).
 */
const DROIT_PAR_RACINE: [string, Droit][] = [
  ["/commercial/factures", "commercial.piece.consulter"],
  ["/commercial", "tiers.fiche.consulter"],
  ["/stock", "stock.article.consulter"],
  ["/comptabilite", "comptabilite.ecriture.consulter"],
  ["/actifs", "actifs.consulter"],
  ["/parc-auto", "parc_auto.consulter"],
  ["/marches", "marches.consulter"],
  ["/parc-informatique", "parc_informatique.consulter"],
  ["/missions", "missions.consulter"],
  ["/projets", "projet.consulter"],
  ["/rh", "personnes.consulter"],
  ["/documents", "documents.consulter"],
  ["/taches", "taches.consulter"],
  ["/tresorerie", "tresorerie.consulter"],
  ["/achats", "achats.consulter"],
];

function droitRequis(href: string): Droit | null {
  const entree = DROIT_PAR_RACINE.find(([racine]) => href === racine || href.startsWith(`${racine}/`));
  return entree ? entree[1] : null;
}

export default async function PageTableauDeBord() {
  const session = await exigerEntreprise();

  const droits = await droitsActifs();
  // Les tâches de l'équipe ne se lisent qu'avec le droit d'attribuer ; sans
  // celui de consulter, aucune tâche du tout.
  const voitSesTaches = moduleOuvert("taches") && droits.has("taches.consulter");
  const voitLEquipe = voitSesTaches && droits.has("taches.attribuer");
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const voitLaTresorerieInterne = moduleOuvert("tresorerie") && droits.has("tresorerie.consulter");

  const [
    facturation,
    resume,
    aCommander,
    soldesComptes,
    auxiliaires,
    parc,
    echeances,
    missions,
    depenses,
    retards,
    caisses,
    plan,
    achats,
    paie,
    fiscalite,
    dossiers,
    licences,
    marches,
    presencesEtat,
  ] = await Promise.all([
    etatFacturation(session.organizationId),
    resumeStock(session.organizationId),
    alertesReapprovisionnement(session.organizationId),
    soldesParCompte(session.organizationId),
    soldesParAuxiliaire(session.organizationId),
    listerActifs(session.organizationId),
    listerEcheances(session.organizationId),
    etatMissions(session.organizationId),
    etatDepenses(session.organizationId),
    voitSesTaches
      ? tachesEnRetard(session.organizationId, session.userId, voitLEquipe, aujourdhui)
      : Promise.resolve({ liste: [], miennes: 0, autres: 0 }),
    voitLaTresorerieInterne ? etatTresorerie(session.organizationId) : Promise.resolve(null),
    voitLaTresorerieInterne ? planDeTresorerie(session.organizationId, aujourdhui) : Promise.resolve(null),
    moduleOuvert("achats") && droits.has("achats.consulter") ? etatAchats(session.organizationId) : Promise.resolve(undefined),
    droits.has("personnes.paie.payer") || droits.has("personnes.paie.valider") ? etatPaie(session.organizationId, aujourdhui) : Promise.resolve(undefined),
    droits.has("comptabilite.fiscalite.declarer") ? etatFiscalite(session.organizationId, aujourdhui) : Promise.resolve(undefined),
    moduleOuvert("personnes") && droits.has("personnes.dossier.consulter") ? etatDossiers(session.organizationId, aujourdhui) : Promise.resolve(null),
    moduleOuvert("parc_informatique") && droits.has("parc_informatique.consulter") ? etatLicences(session.organizationId) : Promise.resolve(null),
    moduleOuvert("marches") && droits.has("marches.consulter") ? etatMarches(session.organizationId) : Promise.resolve(null),
    moduleOuvert("presences") && droits.has("conges.valider") ? etatPresences(session.organizationId, aujourdhui) : Promise.resolve(null),
  ]);

  const toutesLesAlertes = alertes(facturation, {
    ruptures: resume.ruptures,
    aCommanderVite: aCommander.filter(
      (alerte) => joursRestants(alerte) <= DELAI_REACTION_JOURS,
    ).length,
    valeur: resume.valeur,
  }, {
    echeancesDepassees: echeances.filter((e) => e.gravite === "depassee").length,
    indisponibles: resumeParc(parc).indisponibles,
  }, missions, depenses, {
    miennesEnRetard: retards.miennes,
    equipeEnRetard: retards.autres,
  }, caisses
    ? { ...caisses, premierDecouvert: plan && plan.comptes > 0 ? plan.premierDecouvert : null }
    : undefined, achats, paie, fiscalite);

  // Pièces du personnel : un permis expiré met un chauffeur hors la loi, une
  // CMU échue le prive de soins. Seule la pièce en vigueur compte.
  if (dossiers && dossiers.expirees + dossiers.bientot > 0) {
    toutesLesAlertes.push({
      id: "pieces-personnel",
      gravite: dossiers.expirees > 0 ? "critique" : "attention",
      source: "base",
      module: "Personnel",
      titre: dossiers.expirees > 0 ? "Pièces du personnel expirées" : "Pièces du personnel bientôt expirées",
      detail: [
        dossiers.expirees > 0 && `${dossiers.expirees} expirée${dossiers.expirees > 1 ? "s" : ""}`,
        dossiers.bientot > 0 && `${dossiers.bientot} dans les 30 jours`,
      ]
        .filter(Boolean)
        .join(" · ") + ` — ${dossiers.salaries} salarié${dossiers.salaries > 1 ? "s" : ""}`,
      href: "/rh",
      nombre: dossiers.expirees + dossiers.bientot,
    });
  }

  // Congés à décider : un salarié qui attend sa réponse ne peut rien réserver.
  if (presencesEtat && presencesEtat.demandesEnAttente > 0) {
    const n = presencesEtat.demandesEnAttente;
    toutesLesAlertes.push({
      id: "conges-a-decider",
      gravite: "attention",
      source: "base",
      module: "Présences",
      titre: n > 1 ? `${n} demandes de congé à décider` : "Une demande de congé à décider",
      detail: `${presencesEtat.presentsAujourdhui} présent${presencesEtat.presentsAujourdhui > 1 ? "s" : ""} aujourd'hui sur ${presencesEtat.salaries} salarié${presencesEtat.salaries > 1 ? "s" : ""}`,
      href: "/presences/conges",
      nombre: n,
    });
  }

  // Licences : un poste installé au-delà des droits se facture à l'audit de
  // l'éditeur ; une licence expirée coupe le logiciel un lundi matin.
  if (licences && licences.depassees + licences.expirees + licences.bientot > 0) {
    const graves = licences.depassees + licences.expirees;
    toutesLesAlertes.push({
      id: "licences-logicielles",
      gravite: graves > 0 ? "critique" : "attention",
      source: "base",
      module: "Parc informatique",
      titre: graves > 0 ? "Licences logicielles en défaut" : "Licences logicielles à renouveler",
      detail: [
        licences.depassees > 0 && `${licences.depassees} au-delà de ses postes`,
        licences.expirees > 0 && `${licences.expirees} expirée${licences.expirees > 1 ? "s" : ""}`,
        licences.bientot > 0 && `${licences.bientot} dans les 30 jours`,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/parc-informatique/licences",
      nombre: licences.depassees + licences.expirees + licences.bientot,
    });
  }
  // Marchés : un dossier incomplet à la date limite est un dossier rejeté ;
  // une convention qui entre dans son préavis se renégocie maintenant ou se subit.
  if (marches && marches.soumissionsEnDanger > 0) {
    toutesLesAlertes.push({
      id: "soumissions-en-danger",
      gravite: "critique",
      source: "base",
      module: "Marchés",
      titre: "Appel d'offres : date limite proche, dossier incomplet",
      detail: `${marches.soumissionsEnDanger} soumission${marches.soumissionsEnDanger > 1 ? "s" : ""} à compléter`,
      href: "/marches",
      nombre: marches.soumissionsEnDanger,
    });
  }
  if (marches && marches.conventionsARenouveler + marches.conventionsExpireesRecemment > 0) {
    toutesLesAlertes.push({
      id: "conventions-echeance",
      gravite: marches.conventionsExpireesRecemment > 0 ? "critique" : "attention",
      source: "base",
      module: "Marchés",
      titre: marches.conventionsExpireesRecemment > 0 ? "Conventions expirées" : "Conventions à renouveler",
      detail: [
        marches.conventionsARenouveler > 0 && `${marches.conventionsARenouveler} dans leur préavis`,
        marches.conventionsExpireesRecemment > 0 && `${marches.conventionsExpireesRecemment} expirée${marches.conventionsExpireesRecemment > 1 ? "s" : ""} ce mois-ci`,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/marches/conventions",
      nombre: marches.conventionsARenouveler + marches.conventionsExpireesRecemment,
    });
  }
  toutesLesAlertes.sort((a, b) => ORDRE_GRAVITE[a.gravite] - ORDRE_GRAVITE[b.gravite]);

  // Une alerte encore calculée sur un jeu d'essai ne sort pas d'ici. Elle
  // enverrait l'exploitant relancer une facture qui n'existe pas. Et une
  // alerte ne s'affiche qu'à qui peut ouvrir l'écran vers lequel elle mène.
  const voitLaTresorerie = droits.has("comptabilite.ecriture.consulter");
  const liste = (
    apercuActif()
      ? toutesLesAlertes
      : toutesLesAlertes.filter((alerte) => alerte.source === "base")
  ).filter((alerte) => {
    const droit = droitRequis(alerte.href);
    return droit === null || droits.has(droit);
  });

  // Les créances sont la somme des encours non lettrés, tous clients
  // confondus : ce que l'entreprise a facturé et n'a pas encore reçu.
  const creances = [...auxiliaires.values()].reduce(
    (somme, solde) => somme + solde.encoursClient,
    0,
  );

  const activite = { creances, valeurStock: resume.valeur };
  const soldes = tresorerie(soldesComptes);

  const critiques = liste.filter((a) => a.gravite === "critique");
  const total = soldes.reduce((somme, s) => somme + s.montant, 0);

  return (
    <>
      <EnTetePage
        titre="Tableau de bord"
        sousTitre={
          critiques.length > 0
            ? `${critiques.length} point${critiques.length > 1 ? "s" : ""} critique${critiques.length > 1 ? "s" : ""} à traiter`
            : "Rien de critique aujourd'hui"
        }
      />

      {/* ------------------------------------------------------ trésorerie */}
      {/* Les soldes et l'activité chiffrée relèvent de la comptabilité : un
          caissier n'a pas à lire le solde bancaire de son employeur. */}
      {voitLaTresorerie && (
        <section className="mb-6">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Où est l&apos;argent</h2>
            <span className="chiffres text-sm font-bold">
              {fmt(total)}{" "}
              <span className="text-xs font-medium text-[var(--encre-faible)]">
                FCFA au total
              </span>
            </span>
          </div>

          <div className={GRILLE}>
            {soldes.map((solde) => (
              <CarteIndicateur
                key={solde.libelle}
                libelle={solde.libelle}
                valeur={fmt(solde.montant)}
                unite="FCFA"
                precision={solde.detail}
              />
            ))}
          </div>

          <p className="mt-2 max-w-[70ch] text-xs text-[var(--encre-faible)]">
            Ces montants sont la somme de vos écritures, pas un solde tenu à part.
            Ce qui n&apos;est pas passé en comptabilité n&apos;y figure pas.
          </p>
        </section>

      )}

      {/* -------------------------------------------------------- activité */}
      {voitLaTresorerie && (
        <section className="mb-6">
          <h2 className="mb-2.5 text-base font-semibold">Activité</h2>
          <div className={GRILLE}>
            <CarteIndicateur
              libelle="Créances clients"
              valeur={fmtCompact(activite.creances)}
              unite="FCFA"
              ton={activite.creances > 0 ? "alerte" : "valide"}
              precision="Facturé, pas encore encaissé"
            />
            <CarteIndicateur
              libelle="Valeur du stock"
              valeur={fmtCompact(activite.valeurStock)}
              unite="FCFA"
              precision="Au coût moyen pondéré"
            />
          </div>
        </section>

      )}

      {/* --------------------------------------------------------- à faire */}
      <section>
        <h2 className="mb-2.5 text-base font-semibold">Ce qui demande une décision</h2>

        {liste.length === 0 ? (
          <p className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--encre-douce)]">
            Rien à signaler. Tout est à jour.
          </p>
        ) : (
          <div className={GRILLE_ALERTES}>
            {liste.map((alerte) => (
              // Le nombre occupe la place de la valeur : c'est lui qui dit
              // l'ampleur avant même qu'on lise le libellé, comme un montant
              // dans un indicateur.
              //
              // La gravité passe dans le libellé de tête plutôt que dans une
              // pastille. La couleur seule ne suffit pas — un exploitant
              // daltonien lirait quatre cartes identiques — et l'écrire là
              // évite d'ajouter une ligne à une carte qui doit rester
              // superposable à celles d'à côté.
              <CarteIndicateur
                key={alerte.id}
                href={alerte.href}
                libelle={`${LIBELLE[alerte.gravite]} · ${alerte.module}`}
                valeur={alerte.nombre !== undefined ? fmtEntier(alerte.nombre) : "—"}
                ton={TON[alerte.gravite]}
                precision={
                  <>
                    <span className="block text-sm font-semibold text-[var(--encre)]">
                      {alerte.titre}
                    </span>
                    <span className="mt-0.5 block">{alerte.detail}</span>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- tâches en retard */}
      {retards.liste.length > 0 && (
        <section className="mt-6">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Tâches en retard</h2>
            <Link href={voitLEquipe ? "/taches?vue=toutes" : "/taches"} className="text-sm font-semibold text-marque-600 hover:underline">
              Toutes les tâches →
            </Link>
          </div>
          <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
            {retards.liste.slice(0, 6).map((t) => {
              const jours = -(joursAvantEcheance(t.echeance, "a_faire", aujourdhui) ?? 0);
              return (
                <li key={t.id}>
                  <Link
                    href={t.mienne ? "/taches" : "/taches?vue=toutes"}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-[var(--surface-creuse)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.titre}</span>
                      <span className="chiffres block text-xs text-[var(--encre-faible)]">
                        {t.numero} · {t.mienne ? "pour vous" : `pour ${t.assignee}`}
                      </span>
                    </span>
                    {t.priorite !== "normale" && (
                      <Pastille ton={t.priorite === "urgente" ? "danger" : t.priorite === "haute" ? "alerte" : "neutre"}>
                        {LIBELLE_PRIORITE[t.priorite]}
                      </Pastille>
                    )}
                    <Pastille ton="danger">
                      {jours} jour{jours > 1 ? "s" : ""} de retard
                    </Pastille>
                  </Link>
                </li>
              );
            })}
          </ul>
          {retards.liste.length > 6 && (
            <p className="mt-2 text-xs text-[var(--encre-faible)]">
              Et {retards.liste.length - 6} autre{retards.liste.length - 6 > 1 ? "s" : ""}.
            </p>
          )}
        </section>
      )}
    </>
  );
}
