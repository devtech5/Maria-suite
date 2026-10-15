import type { Metadata } from "next";

import { ActionsConge, FormulaireConge } from "@/components/presences/formulaires";
import { CarteIndicateur, EnTetePage, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { STATUTS_CONGE, formatJours, jourLocal } from "@/modules/presences/calcul";
import { reglagesDe, salarieDuCompte } from "@/modules/presences/creation";
import { listerConges, salariesSur, soldesConges, type LigneConge } from "@/modules/presences/requetes";

export const metadata: Metadata = { title: "Congés" };

const TON: Record<LigneConge["statut"], TonPastille> = { demande: "alerte", approuve: "valide", refuse: "danger", annule: "neutre" };

function periode(c: LigneConge): string {
  const f = (j: string) => j.split("-").reverse().join("/");
  const d = `${f(c.debut)}${c.debutDemi ? " (après-midi)" : ""}`;
  return c.debut === c.fin ? d : `${d} → ${f(c.fin)}${c.finDemi ? " (matin)" : ""}`;
}

function TableConges({ lignes, avecNom, peutDecider, userId, aujourdhui }: { lignes: LigneConge[]; avecNom: boolean; peutDecider: boolean; userId: string; aujourdhui: string }) {
  return (
    <Tableau>
      <thead>
        <tr>
          <Th>N°</Th>
          {avecNom && <Th>Salarié</Th>}
          <Th>Nature</Th>
          <Th>Période</Th>
          <Th aligne="droite">Jours</Th>
          <Th>Statut</Th>
          <Th aligne="droite"> </Th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((c) => {
          const sienne = c.salarieUserId === userId;
          const enCours = c.statut === "demande" || c.statut === "approuve";
          return (
            <tr key={c.id}>
              <Td chiffres>{c.numero}</Td>
              {avecNom && <Td fort>{c.nom}</Td>}
              <Td>
                {c.libelleNature}
                {c.motif && <span className="block text-xs text-[var(--encre-faible)]">{c.motif}</span>}
              </Td>
              <Td chiffres>{periode(c)}</Td>
              <Td aligne="droite" chiffres>
                {formatJours(c.jours)}
              </Td>
              <Td>
                <Pastille ton={TON[c.statut]}>{STATUTS_CONGE[c.statut]}</Pastille>
                {c.commentaire && <span className="block text-xs text-[var(--encre-faible)]">{c.commentaire}</span>}
              </Td>
              <Td aligne="droite">
                <ActionsConge
                  id={c.id}
                  peutDecider={peutDecider && c.statut === "demande"}
                  peutAnnuler={enCours && (peutDecider || (sienne && c.debut > aujourdhui))}
                  aJustificatif={c.aJustificatif}
                />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Tableau>
  );
}

export default async function PageConges({ searchParams }: PageProps<"/presences/conges">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  // Recherche et période valent pour les trois listes ; le solde, lui, reste entier.
  const cherche = filtres.actif ? filtres : undefined;
  const droits = await droitsActifs();
  const r = await reglagesDe(session.organizationId);
  const aujourdhui = jourLocal(new Date(), r.fuseau);
  const valideur = droits.has("conges.valider");
  const moi = await salarieDuCompte(session.organizationId, session.userId);

  const [mesConges, [monSolde], aDecider, tous, salaries] = await Promise.all([
    moi ? listerConges(session.organizationId, { employeeId: moi.id, filtres: cherche }) : Promise.resolve([]),
    moi ? soldesConges(session.organizationId, r, aujourdhui, [moi.id]) : Promise.resolve([]),
    valideur ? listerConges(session.organizationId, { statuts: ["demande"], filtres: cherche }) : Promise.resolve([]),
    valideur ? listerConges(session.organizationId, { statuts: ["approuve", "refuse", "annule"], limite: 100, filtres: cherche }) : Promise.resolve([]),
    valideur ? salariesSur(session.organizationId, aujourdhui, aujourdhui) : Promise.resolve([]),
  ]);

  // Une demande à moi en attente figure dans deux listes : comptée une fois.
  const trouvees = new Set([...aDecider, ...mesConges, ...tous].map((c) => c.id)).size;

  return (
    <>
      <EnTetePage
        titre="Congés"
        sousTitre={`${formatJours(r.congesCentiemesParMois)} acquis par mois de service · décompte en jours ${r.decompte === "ouvrables" ? "ouvrables" : "travaillés"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {moi && droits.has("conges.demander") && <FormulaireConge aujourdhui={aujourdhui} pourMoi />}
            {valideur && <FormulaireConge salaries={salaries.map((s) => ({ id: s.id, nom: s.nom }))} aujourdhui={aujourdhui} pourMoi={false} />}
          </div>
        }
      />

      {moi && monSolde && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CarteIndicateur libelle="Disponible" valeur={formatJours(monSolde.solde)} ton="marque" precision={`Depuis le ${monSolde.depuis.split("-").reverse().join("/")}`} />
          <CarteIndicateur libelle="Acquis" valeur={formatJours(monSolde.acquis)} />
          <CarteIndicateur libelle="Pris" valeur={formatJours(monSolde.pris)} />
          <CarteIndicateur libelle="En attente" valeur={formatJours(monSolde.enAttente)} ton={monSolde.enAttente ? "alerte" : "neutre"} />
        </div>
      )}
      {!moi && !valideur && (
        <p className="mb-6 rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] p-5 text-sm text-[var(--encre-douce)]">
          Votre compte n&apos;est rattaché à aucune fiche salarié : demandez à votre responsable de vous rattacher depuis Personnel pour demander vos congés.
        </p>
      )}

      {(moi || valideur) && (
        <Recherche
          chemin="/presences/conges"
          valeur={filtres.q}
          placeholder="N°, salarié, nature, motif…"
          periode={{ ...filtres.periode, libelle: "Congé" }}
          resultats={filtres.actif ? `${fmtEntier(trouvees)} demande${trouvees > 1 ? "s" : ""} trouvée${trouvees > 1 ? "s" : ""}` : undefined}
        />
      )}

      {valideur && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">
            À décider <span className="chiffres font-normal text-[var(--encre-faible)]">{aDecider.length}</span>
          </h2>
          {aDecider.length ? (
            <TableConges lignes={aDecider} avecNom peutDecider userId={session.userId} aujourdhui={aujourdhui} />
          ) : (
            <p className="text-sm text-[var(--encre-faible)]">{cherche ? "Aucun résultat parmi les demandes en attente." : "Aucune demande en attente."}</p>
          )}
        </section>
      )}

      {moi && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold">Mes demandes</h2>
          {mesConges.length ? (
            <TableConges lignes={mesConges} avecNom={false} peutDecider={false} userId={session.userId} aujourdhui={aujourdhui} />
          ) : (
            <p className="text-sm text-[var(--encre-faible)]">{cherche ? "Aucun résultat parmi vos demandes." : "Aucune demande pour l'instant."}</p>
          )}
        </section>
      )}

      {valideur && (tous.length > 0 || cherche) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Historique de l&apos;équipe</h2>
          {tous.length ? (
            <TableConges lignes={tous} avecNom peutDecider userId={session.userId} aujourdhui={aujourdhui} />
          ) : (
            <p className="text-sm text-[var(--encre-faible)]">Aucun résultat dans l&apos;historique.</p>
          )}
        </section>
      )}
    </>
  );
}
