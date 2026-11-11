import type { Metadata } from "next";

import { ActionsPermission, FormulairePermission } from "@/components/presences/permissions";
import { CarteIndicateur, EnTetePage, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { ajouterJours, formatJours, jourLocal, STATUTS_CONGE } from "@/modules/presences/calcul";
import { reglagesDe, salarieDuCompte } from "@/modules/presences/creation";
import { formatDuree, REGULARISATION_JOURS, TRAITEMENTS_PERMISSION } from "@/modules/presences/permissions";
import { listerPermissions, salariesSur, type LignePermission } from "@/modules/presences/requetes";

export const metadata: Metadata = { title: "Permissions et absences" };

const TON: Record<LignePermission["statut"], TonPastille> = { demande: "alerte", approuve: "valide", refuse: "danger", annule: "neutre" };
const LIBELLE_STATUT: Record<LignePermission["statut"], string> = { ...STATUTS_CONGE, approuve: "Accordée", refuse: "Refusée", annule: "Annulée" };

const date = (j: string) => j.split("-").reverse().join("/");

function quand(p: LignePermission): string {
  if (p.genre === "heures") return `${date(p.debut)}, ${p.heureDebut} → ${p.heureFin}`;
  return p.debut === p.fin ? date(p.debut) : `${date(p.debut)} → ${date(p.fin)}`;
}

function duree(p: LignePermission): string {
  return p.genre === "heures" ? formatDuree(p.minutes) : formatJours(p.jours);
}

function TablePermissions({
  lignes,
  avecNom,
  peutDecider,
  userId,
  aujourdhui,
}: {
  lignes: LignePermission[];
  avecNom: boolean;
  peutDecider: boolean;
  userId: string;
  aujourdhui: string;
}) {
  return (
    <Tableau>
      <thead>
        <tr>
          <Th>N°</Th>
          {avecNom && <Th>Salarié</Th>}
          <Th>Motif</Th>
          <Th>Quand</Th>
          <Th aligne="droite">Durée</Th>
          <Th>Statut</Th>
          <Th aligne="droite"> </Th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((p) => {
          const sienne = p.salarieUserId === userId;
          const annulable = p.statut === "demande" || (p.statut === "approuve" && (peutDecider || (sienne && p.debut > aujourdhui)));
          return (
            <tr key={p.id}>
              <Td chiffres>{p.numero}</Td>
              {avecNom && <Td fort>{p.nom}</Td>}
              <Td>
                {p.libelleMotif}
                <span className="block text-xs text-[var(--encre-faible)]">
                  {p.genre === "heures" ? "Permission" : "Absence"}
                  {p.precision && ` · ${p.precision}`}
                </span>
              </Td>
              <Td chiffres>{quand(p)}</Td>
              <Td aligne="droite" chiffres>
                {duree(p)}
              </Td>
              <Td>
                <Pastille ton={TON[p.statut]}>{LIBELLE_STATUT[p.statut]}</Pastille>
                {p.statut === "approuve" && p.traitement && (
                  <span className="block text-xs text-[var(--encre-douce)]">
                    {TRAITEMENTS_PERMISSION[p.traitement]}
                    {p.centiemesDeduits > 0 && ` (${formatJours(p.centiemesDeduits)})`}
                  </span>
                )}
                {p.commentaire && <span className="block text-xs text-[var(--encre-faible)]">{p.commentaire}</span>}
              </Td>
              <Td aligne="droite">
                <ActionsPermission
                  id={p.id}
                  peutDecider={peutDecider && p.statut === "demande"}
                  peutAnnuler={annulable && (peutDecider || sienne)}
                  aJustificatif={p.aJustificatif}
                />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Tableau>
  );
}

/**
 * Permissions (quelques heures) et absences (journées entières) : chacun
 * demande pour soi ; le responsable décide et dit comment ce temps est traité.
 */
export default async function PagePermissions({ searchParams }: PageProps<"/presences/permissions">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const cherche = filtres.actif ? filtres : undefined;
  const droits = await droitsActifs();
  const r = await reglagesDe(session.organizationId);
  const aujourdhui = jourLocal(new Date(), r.fuseau);
  const valideur = droits.has("conges.valider");
  const moi = await salarieDuCompte(session.organizationId, session.userId);

  const [miennes, aDecider, historique, salaries] = await Promise.all([
    moi ? listerPermissions(session.organizationId, { employeeId: moi.id, filtres: cherche }) : Promise.resolve([]),
    valideur ? listerPermissions(session.organizationId, { statuts: ["demande"], filtres: cherche }) : Promise.resolve([]),
    valideur ? listerPermissions(session.organizationId, { statuts: ["approuve", "refuse", "annule"], limite: 100, filtres: cherche }) : Promise.resolve([]),
    valideur ? salariesSur(session.organizationId, aujourdhui, aujourdhui) : Promise.resolve([]),
  ]);
  const trouvees = new Set([...aDecider, ...miennes, ...historique].map((p) => p.id)).size;

  // Mon année : ce qui a été accordé depuis le 1er janvier.
  const annee = aujourdhui.slice(0, 4);
  const accordeesAnnee = miennes.filter((p) => p.statut === "approuve" && p.debut.startsWith(annee));
  const heuresAnnee = accordeesAnnee.filter((p) => p.genre === "heures").reduce((t, p) => t + p.minutes, 0);
  const joursAnnee = accordeesAnnee.filter((p) => p.genre === "journees").reduce((t, p) => t + p.jours, 0);
  const enAttente = miennes.filter((p) => p.statut === "demande").length;

  return (
    <>
      <EnTetePage
        titre="Permissions et absences"
        sousTitre="Sortir quelques heures, ou s'absenter une ou plusieurs journées, avec l'accord de votre responsable"
        actions={
          <div className="flex flex-wrap gap-2">
            {moi && droits.has("conges.demander") && <FormulairePermission aujourdhui={aujourdhui} debutMin={ajouterJours(aujourdhui, -REGULARISATION_JOURS)} />}
            {valideur && (
              <FormulairePermission salaries={salaries.map((s) => ({ id: s.id, nom: s.nom }))} aujourdhui={aujourdhui} debutMin={ajouterJours(aujourdhui, -REGULARISATION_JOURS)} />
            )}
          </div>
        }
      />

      {moi && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <CarteIndicateur libelle={`Permissions accordées en ${annee}`} valeur={formatDuree(heuresAnnee)} precision={`${fmtEntier(accordeesAnnee.filter((p) => p.genre === "heures").length)} sortie(s)`} />
          <CarteIndicateur libelle={`Absences accordées en ${annee}`} valeur={formatJours(joursAnnee)} />
          <CarteIndicateur libelle="En attente de décision" valeur={fmtEntier(enAttente)} ton={enAttente ? "alerte" : "neutre"} />
        </div>
      )}
      {!moi && !valideur && (
        <p className="mb-6 rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] p-5 text-sm text-[var(--encre-douce)]">
          Votre compte n&apos;est rattaché à aucune fiche salarié : demandez à votre responsable de vous rattacher depuis Personnel pour demander une permission.
        </p>
      )}

      {(moi || valideur) && (
        <Recherche
          chemin="/presences/permissions"
          valeur={filtres.q}
          placeholder="N°, salarié, motif, traitement…"
          periode={{ ...filtres.periode, libelle: "Permission" }}
          resultats={filtres.actif ? `${fmtEntier(trouvees)} demande${trouvees > 1 ? "s" : ""} trouvée${trouvees > 1 ? "s" : ""}` : undefined}
        />
      )}

      {valideur && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">
            À décider <span className="chiffres font-normal text-[var(--encre-faible)]">{aDecider.length}</span>
          </h2>
          {aDecider.length ? (
            <TablePermissions lignes={aDecider} avecNom peutDecider userId={session.userId} aujourdhui={aujourdhui} />
          ) : (
            <p className="text-sm text-[var(--encre-faible)]">{cherche ? "Aucun résultat parmi les demandes en attente." : "Aucune demande en attente."}</p>
          )}
        </section>
      )}

      {moi && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">Mes demandes</h2>
          {miennes.length ? (
            <TablePermissions lignes={miennes} avecNom={false} peutDecider={false} userId={session.userId} aujourdhui={aujourdhui} />
          ) : (
            <p className="text-sm text-[var(--encre-faible)]">{cherche ? "Aucun résultat parmi vos demandes." : "Aucune demande pour l'instant."}</p>
          )}
        </section>
      )}

      {valideur && (historique.length > 0 || cherche) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Historique de l&apos;équipe</h2>
          {historique.length ? (
            <TablePermissions lignes={historique} avecNom peutDecider userId={session.userId} aujourdhui={aujourdhui} />
          ) : (
            <p className="text-sm text-[var(--encre-faible)]">Aucun résultat dans l&apos;historique.</p>
          )}
        </section>
      )}
    </>
  );
}
