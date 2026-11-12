import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormulaireReleve } from "@/components/terrain/formulaire-releve";
import { ListeReleves } from "@/components/terrain/liste-releves";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { LIBELLE_STATUT_PROJET } from "@/modules/projets/calcul";
import { equipeDuProjet, projetDuTerrain, relevesDuProjet } from "@/modules/projets/terrain";
import { LIBELLE_ROLE, estChef, peutExaminer, peutReleverSur, peutSaisirPour, projetOuvertAuTerrain, type Acteur } from "@/modules/projets/terrain-regles";

export const metadata: Metadata = { title: "Terrain" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un projet vu du terrain. L'agent relève et voit ses relevés ; le
 * superviseur et le chef de projet voient ceux de toute l'équipe et les
 * examinent. Quiconque n'est ni en poste ni chef ni encadrement n'y entre pas.
 */
export default async function PageTerrainProjet({ params }: PageProps<"/terrain/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const org = session.organizationId;
  const [projet, equipe, gestionnaire] = await Promise.all([projetDuTerrain(org, id), equipeDuProjet(org, id), peut("projet.gerer")]);
  if (!projet) notFound();
  const acteur: Acteur = { userId: session.userId, gestionnaire };
  const examine = peutExaminer(acteur, projet, equipe);
  const releve = peutReleverSur(acteur, equipe);
  if (!examine && !releve) notFound();

  const releves = await relevesDuProjet(org, id, examine ? {} : { deUserId: session.userId });
  const moi = equipe.find((m) => m.userId === session.userId);
  // Pour qui je peux relever : moi, les externes de l'équipe, et — pour l'encadrement — tout membre.
  const choix = equipe
    .filter((m) => peutSaisirPour(acteur, projet, equipe, { userId: m.userId, origine: m.origine }))
    .map((m) => ({ id: m.id, nom: m.nom, detail: `${LIBELLE_ROLE[m.role]}${m.origine === "externe" ? " · externe" : ""}` }));
  const aExaminer = releves.filter((r) => r.statut === "soumis").length;
  const ouvert = projetOuvertAuTerrain(projet.statut);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/terrain" className="font-semibold text-marque-600 hover:underline">
          ← Mon terrain
        </Link>
      </p>
      <EnTetePage
        titre={projet.nom}
        sousTitre={`${projet.code} · ${LIBELLE_STATUT_PROJET[projet.statut]}`}
        actions={
          <>
            {gestionnaire && (
              <Link href={`/projets/${id}`} className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
                Fiche du projet
              </Link>
            )}
            {releve && ouvert && choix.length > 0 && <FormulaireReleve projetId={id} membres={choix} parDefaut={moi?.id ?? choix[0].id} />}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        {moi && <Pastille ton={moi.role === "superviseur" ? "valide" : "neutre"}>Vous : {LIBELLE_ROLE[moi.role]}</Pastille>}
        {estChef(acteur, projet) && <Pastille ton="marque">Chef de projet</Pastille>}
        <span className="text-[var(--encre-faible)]">
          Équipe : {equipe.map((m) => `${m.nom} (${LIBELLE_ROLE[m.role].toLowerCase()}${m.origine === "externe" ? ", externe" : ""})`).join(" · ") || "—"}
        </span>
      </div>

      {examine && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <CarteIndicateur libelle="Relevés" valeur={String(releves.length)} />
          <CarteIndicateur libelle="À examiner" valeur={String(aExaminer)} ton={aExaminer ? "alerte" : "valide"} />
          <CarteIndicateur libelle="Validés" valeur={String(releves.filter((r) => r.statut === "valide").length)} ton="valide" />
        </div>
      )}
      {!ouvert && <p className="mb-4 rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm">Ce projet n&apos;est plus en cours : les relevés se consultent, on n&apos;en ajoute plus.</p>}

      {releves.length === 0 ? (
        <EtatVide
          titre="Aucun relevé pour l'instant"
          message="Un relevé dit ce qui a été constaté ou fait sur place, avec une photo, la position GPS de l'appareil et, au besoin, des captures d'écran. Il remonte au superviseur et au chef de projet."
        />
      ) : (
        <ListeReleves
          projetId={id}
          peutExaminer={examine}
          releves={releves.map((r) => ({
            id: r.id,
            auteur: r.auteur,
            saisiPar: r.saisiPar,
            libelle: r.libelle,
            note: r.note,
            avancement: r.avancement,
            latitudeMicro: r.latitudeMicro,
            longitudeMicro: r.longitudeMicro,
            precisionM: r.precisionM,
            priseLe: r.priseLe.toISOString(),
            statut: r.statut,
            commentaire: r.commentaire,
            revisePar: r.revisePar,
            preuves: r.preuves.map((p) => ({ id: p.id, nature: p.nature, nomFichier: p.nomFichier })),
          }))}
        />
      )}
    </>
  );
}
