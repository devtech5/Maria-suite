import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IconeDossier } from "@/components/archives/icones";
import { ChoixFichiers } from "@/components/ui/fichiers";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { stockageConfigure } from "@/lib/stockage";
import { archiver, modifierDossier } from "@/modules/archives/actions";
import { ACCEPT_ARCHIVES, depotDossierPermis, resumeDepot, resumeVisibilite } from "@/modules/archives/calcul";
import { archivesDuDossier, dossiersVisibles, membresEntreprise } from "@/modules/archives/requetes";

import { affichee } from "../../affichage";
import { ListeArchives } from "../../liste-archives";
import { ChampsDossier } from "../champs-dossier";
import { SupprimerDossier } from "./supprimer-dossier";

export const metadata: Metadata = { title: "Dossier partagé" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageDossier({ params }: PageProps<"/archives/dossiers/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const session = await exigerEntreprise();
  const [gestionnaire, deposer] = await Promise.all([peut("archives.dossier.gerer"), peut("archives.deposer")]);

  // Un dossier masqué pour cette personne n'existe pas pour elle : 404, pas « accès refusé ».
  const dossier = (await dossiersVisibles(session.organizationId, session.userId, gestionnaire)).find((d) => d.id === id);
  if (!dossier) notFound();

  const [contenu, membres] = await Promise.all([
    archivesDuDossier(session.organizationId, id),
    gestionnaire ? membresEntreprise(session.organizationId) : Promise.resolve([]),
  ]);

  const regle = { visibilite: dossier.visibilite, depotOuvert: dossier.depotOuvert, designes: dossier.designes.map((m) => m.userId), deposants: dossier.deposants.map((m) => m.userId) };
  const depotPermis = (deposer || gestionnaire) && depotDossierPermis(regle, session.userId, gestionnaire) && stockageConfigure();
  const masque = dossier.visibilite === "selection" && dossier.designes.length === 0;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/archives/dossiers" className="text-marque-600 hover:underline">
          ← Dossiers partagés
        </Link>
      </p>

      <EnTetePage
        titre={dossier.nom}
        sousTitre={dossier.description ?? undefined}
        actions={
          <>
            {depotPermis && (
              <FormulaireRepliable libelle="Déposer ici" titre={`Déposer dans « ${dossier.nom} »`} action={archiver}>
                <input type="hidden" name="dossierId" value={dossier.id} />
                <div className="space-y-3">
                  <ChoixFichiers libelle="Fichiers (10 Mo par envoi)" accept={ACCEPT_ARCHIVES} reduirePhotos={false} requis />
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Titre (fichier seul)</span>
                    <input name="titre" maxLength={160} placeholder="Sinon, le nom du fichier" className={CLASSE_CHAMP} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Description</span>
                    <input name="description" maxLength={1000} className={CLASSE_CHAMP} />
                  </label>
                </div>
              </FormulaireRepliable>
            )}
            {gestionnaire && (
              <FormulaireRepliable
                libelle="Visibilité et réglages"
                titre="Réglages du dossier"
                action={modifierDossier.bind(null, dossier.id)}
              >
                <ChampsDossier
                  membres={membres}
                  initial={{
                    nom: dossier.nom,
                    description: dossier.description,
                    visibilite: dossier.visibilite,
                    depotOuvert: dossier.depotOuvert,
                    designes: regle.designes,
                    deposants: regle.deposants,
                  }}
                />
              </FormulaireRepliable>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <IconeDossier id={dossier.id} masque={masque} vide={contenu.length === 0} className="mr-1 h-9 w-auto" />
        {gestionnaire && (
          <Pastille ton={masque ? "danger" : dossier.visibilite === "tous" ? "valide" : "neutre"}>
            {resumeVisibilite(regle)}
          </Pastille>
        )}
        <Pastille ton={dossier.depotOuvert || dossier.deposants.length > 0 ? "marque" : "neutre"}>{resumeDepot(regle)}</Pastille>
        {depotPermis && !gestionnaire && <Pastille ton="valide">Vous pouvez y déposer</Pastille>}
        {!depotPermis && !gestionnaire && <Pastille>Lecture seule pour vous</Pastille>}
        {gestionnaire && dossier.deposants.length > 0 && !dossier.depotOuvert && (
          <span className="text-xs text-[var(--encre-douce)]">Déposent : {dossier.deposants.map((m) => m.nom).join(", ")}</span>
        )}
        {gestionnaire && dossier.visibilite === "selection" && dossier.designes.length > 0 && (
          <span className="text-xs text-[var(--encre-douce)]">Ouvert à : {dossier.designes.map((m) => m.nom).join(", ")}</span>
        )}
      </div>

      {contenu.length === 0 ? (
        <EtatVide
          titre="Dossier vide"
          message={depotPermis ? "Déposez-y les fichiers à partager avec les membres qui voient ce dossier." : "Rien n'a encore été déposé dans ce dossier."}
          actions={gestionnaire ? <SupprimerDossier dossierId={dossier.id} nom={dossier.nom} /> : undefined}
        />
      ) : (
        <ListeArchives archives={contenu.map(affichee)} mode="dossier" moi={session.userId} peutRetirer={deposer} />
      )}

      <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
        Chaque ouverture d&apos;une archive est journalisée. Masquer le dossier à un membre lui retire l&apos;accès aux
        archives des autres ; celles qu&apos;il y a lui-même déposées restent dans son espace.
      </p>
    </>
  );
}
