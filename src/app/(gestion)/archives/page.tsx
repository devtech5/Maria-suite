import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ChoixFichiers } from "@/components/ui/fichiers";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, CLASSE_CHAMP, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { stockageConfigure } from "@/lib/stockage";
import { archiver } from "@/modules/archives/actions";
import {
  ACCEPT_ARCHIVES,
  DELAI_RETRAIT_HEURES,
  depotDossierPermis,
  partQuota,
  QUOTA_OCTETS,
  retraitPossible,
  tailleLisible,
} from "@/modules/archives/calcul";
import { dossiersVisibles, mesArchives } from "@/modules/archives/requetes";

import { affichee } from "./affichage";
import { ListeArchives } from "./liste-archives";

export const metadata: Metadata = { title: "Mes archives" };

export default async function PageMesArchives({ searchParams }: PageProps<"/archives">) {
  const session = await exigerEntreprise();
  // `?q=` arrive de la recherche globale ; la liste filtre ensuite sur place.
  const filtres = lireFiltresListe(await searchParams);
  const [consulter, deposer, gestionnaire] = await Promise.all([
    peut("archives.consulter"),
    peut("archives.deposer"),
    peut("archives.dossier.gerer"),
  ]);
  if (!consulter) return <AccesRefuse droit="archives.consulter" />;

  const [archives, dossiersPartages] = await Promise.all([
    mesArchives(session.organizationId, session.userId),
    dossiersVisibles(session.organizationId, session.userId, gestionnaire),
  ]);
  // Les dossiers partagés où la personne peut déposer : proposés au formulaire.
  const destinations = dossiersPartages.filter((d) =>
    depotDossierPermis(
      { visibilite: d.visibilite, depotOuvert: d.depotOuvert, designes: d.designes.map((m) => m.userId) },
      session.userId,
      gestionnaire,
    ),
  );
  const utilise = archives.reduce((s, a) => s + a.tailleOctets, 0);
  const dossiers = [...new Set(archives.map((a) => a.dossier).filter((d): d is string => Boolean(d)))].sort();
  const scellees = archives.filter((a) => !retraitPossible(a.deposeLe)).length;
  const stockageActif = stockageConfigure();

  return (
    <>
      <EnTetePage
        titre="Mes archives"
        sousTitre="Votre espace d'archivage : chaque fichier est scellé par son empreinte et chaque accès est tracé"
        actions={
          deposer && stockageActif ? (
            <FormulaireRepliable libelle="Archiver des fichiers" titre="Nouvelle archive" action={archiver}>
              <div className="space-y-3">
                <ChoixFichiers
                  libelle="Fichiers — PDF, photos, bureautique, CSV, audio, vidéo, ZIP (10 Mo par envoi)"
                  accept={ACCEPT_ARCHIVES}
                  reduirePhotos={false}
                  requis
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Titre (fichier seul)</span>
                    <input name="titre" maxLength={160} placeholder="Sinon, le nom du fichier" className={CLASSE_CHAMP} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Rubrique</span>
                    <input name="dossier" maxLength={60} list="rubriques-archives" placeholder="Contrats, Banque, Fiscal…" className={CLASSE_CHAMP} />
                    <datalist id="rubriques-archives">
                      {dossiers.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </label>
                </div>
                {destinations.length > 0 && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Partager dans un dossier</span>
                    <select name="dossierId" defaultValue="" className={CLASSE_CHAMP}>
                      <option value="">Non : mon espace seulement</option>
                      {destinations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Description</span>
                  <textarea
                    name="description"
                    maxLength={1000}
                    rows={2}
                    placeholder="Ce que contient le fichier, d'où il vient"
                    className={`${CLASSE_CHAMP} h-auto py-2`}
                  />
                </label>
                <p className="text-xs text-[var(--encre-faible)]">
                  Les photos partent telles quelles, sans réduction : une archive garde l&apos;original.
                </p>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      <p className="mb-5 rounded-xl border-l-4 border-marque-500 bg-[var(--surface)] px-4 py-3 text-sm text-[var(--encre-douce)]">
        Ce que vous archivez ici est{" "}
        <strong className="font-semibold text-[var(--encre)]">visible de l&apos;administration — propriétaire et gérant</strong> — de
        l&apos;entreprise, et chacune de leurs ouvertures vous est signalée. Vous pouvez retirer une archive pendant{" "}
        {DELAI_RETRAIT_HEURES} h ; elle disparaît alors de votre espace mais reste conservée pour eux. Passé ce délai, elle est scellée.
      </p>

      {!stockageActif && (
        <p className="mb-5 rounded-xl border-l-4 border-alerte-500 bg-alerte-50 px-4 py-3 text-sm text-alerte-600">
          <strong className="font-semibold">Dépôt de fichiers inactif.</strong> Rien ne peut être archivé tant que le
          dépôt n&apos;est pas configuré.
        </p>
      )}

      <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
        <CarteIndicateur
          libelle="Archives"
          valeur={fmtEntier(archives.length)}
          precision={`${fmtEntier(scellees)} scellée${scellees > 1 ? "s" : ""}`}
        />
        <CarteIndicateur
          libelle="Espace utilisé"
          valeur={utilise === 0 ? "0 Ko" : tailleLisible(utilise)}
          ton={partQuota(utilise) >= 90 ? "danger" : partQuota(utilise) >= 75 ? "alerte" : "neutre"}
          precision={`${partQuota(utilise)} % de ${tailleLisible(QUOTA_OCTETS)}`}
        />
        <CarteIndicateur
          libelle="Dossiers partagés"
          valeur={fmtEntier(dossiersPartages.length)}
          precision={`${fmtEntier(dossiers.length)} rubrique${dossiers.length > 1 ? "s" : ""} personnelle${dossiers.length > 1 ? "s" : ""}`}
          href="/archives/dossiers"
        />
      </section>

      {archives.length === 0 ? (
        <EtatVide
          titre="Aucune archive"
          message="Déposez ici ce que vous devez conserver : contrat reçu par message, relevé, capture d'un paiement, export. Le fichier est scellé par son empreinte dès le dépôt."
        />
      ) : (
        <ListeArchives
          archives={archives.map(affichee)}
          mode="personnel"
          peutRetirer={deposer}
          rechercheInitiale={filtres.q}
          periodeInitiale={filtres.periode}
        />
      )}
    </>
  );
}
