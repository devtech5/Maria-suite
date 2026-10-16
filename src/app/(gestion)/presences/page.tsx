import type { Metadata } from "next";

import { BoutonDepart, FormulairePointage } from "@/components/presences/formulaires";
import { CarteIndicateur, EnTetePage, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { NATURES_CONGE, formatJours, heureLocale, jourLocal, jourSemaine, retardMinutes } from "@/modules/presences/calcul";
import { reglagesDe, salarieDuCompte } from "@/modules/presences/creation";
import { absencesAVenir, maPresence, presencesDuJour, salariesSur, soldesConges } from "@/modules/presences/requetes";

export const metadata: Metadata = { title: "Présences" };

function fmtJour(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Aujourd'hui : mon pointage, mon solde ; pour l'équipe, qui est là et qui manque. */
export default async function PagePresences({ searchParams }: PageProps<"/presences">) {
  const session = await exigerEntreprise();
  // Recherche seule : l'écran est celui du jour, le registre tient l'historique.
  const filtres = lireFiltresListe(await searchParams);
  const droits = await droitsActifs();
  const r = await reglagesDe(session.organizationId);
  const maintenant = new Date();
  const aujourdhui = jourLocal(maintenant, r.fuseau);
  const heure = heureLocale(maintenant, r.fuseau);
  const equipe = droits.has("presences.consulter");

  const [moi, salarie] = await Promise.all([maPresence(session.organizationId, session.userId, aujourdhui, r.fuseau), salarieDuCompte(session.organizationId, session.userId)]);
  const [monSolde] = salarie ? await soldesConges(session.organizationId, r, aujourdhui, [salarie.id]) : [];
  const [presents, salaries, absences] = equipe
    ? await Promise.all([presencesDuJour(session.organizationId, aujourdhui, r.fuseau), salariesSur(session.organizationId, aujourdhui, aujourdhui), absencesAVenir(session.organizationId, aujourdhui)])
    : [[], [], []];

  const presentsIds = new Set(presents.map((p) => p.employeeId).filter(Boolean));
  const enConge = new Map(absences.filter((a) => a.debut <= aujourdhui && a.fin >= aujourdhui).map((a) => [a.employeeId, a]));
  const travaille = r.joursTravailles.includes(jourSemaine(aujourdhui));
  const attendus = travaille && heure > r.heureArrivee;
  const manquants = salaries.filter((s) => !presentsIds.has(s.id) && !enConge.has(s.id));
  const retards = presents.filter((p) => retardMinutes(p.arrivee, r.heureArrivee, r.toleranceMinutes) > 0);
  // Les compteurs restent ceux de toute l'équipe ; seul le tableau « Qui est là » suit la recherche.
  const affiches = presents.filter((p) => correspond(filtres.q, [p.nom, p.poste, p.motif]));

  return (
    <>
      <EnTetePage titre="Présences" sousTitre={`${fmtJour(aujourdhui)} · horaires ${r.heureArrivee} – ${r.heureDepart}`} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 sm:col-span-2">
          <p className="text-xs font-medium text-[var(--encre-faible)]">Mon pointage du jour</p>
          {moi ? (
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="chiffres text-xl font-bold">
                  Arrivé à {moi.arrivee}
                  {retardMinutes(moi.arrivee, r.heureArrivee, r.toleranceMinutes) > 0 && (
                    <span className="ml-2 align-middle">
                      <Pastille ton="alerte">retard {retardMinutes(moi.arrivee, r.heureArrivee, r.toleranceMinutes)} min</Pastille>
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--encre-faible)]">{moi.depart ? `Départ pointé à ${moi.depart}` : `Dernière activité ${moi.derniere} · pointé automatiquement à la connexion`}</p>
              </div>
              {!moi.depart && <BoutonDepart />}
            </div>
          ) : (
            <p className="mt-1 text-sm text-[var(--encre-douce)]">
              {r.pointageAuto ? "Votre arrivée s'enregistre dans un instant : le pointage se fait à l'ouverture de la plateforme." : "Le pointage automatique est désactivé dans cette entreprise."}
            </p>
          )}
        </div>
        {monSolde ? (
          <CarteIndicateur libelle="Mon solde de congés" valeur={formatJours(monSolde.solde)} precision={monSolde.enAttente ? `${formatJours(monSolde.enAttente)} en attente de décision` : `Acquis depuis le ${monSolde.depuis.split("-").reverse().join("/")}`} ton="marque" href="/presences/conges" />
        ) : (
          <CarteIndicateur libelle="Mon solde de congés" valeur="—" precision="Compte non rattaché à une fiche salarié" />
        )}
        {equipe && <CarteIndicateur libelle="Présents aujourd'hui" valeur={`${presents.length}`} precision={`${retards.length} retard(s) · ${salaries.length} salarié(s) en poste`} />}
      </div>

      {equipe && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Qui est là</h2>
            {droits.has("presences.gerer") && <FormulairePointage salaries={salaries.map((s) => ({ id: s.id, nom: s.nom }))} aujourdhui={aujourdhui} />}
          </div>
          {presents.length > 0 && (
            <Recherche
              chemin="/presences"
              valeur={filtres.q}
              placeholder="Nom, poste, motif…"
              resultats={filtres.q ? `${fmtEntier(affiches.length)} sur ${fmtEntier(presents.length)}` : undefined}
            />
          )}
          <Tableau>
            <thead>
              <tr>
                <Th>Personne</Th>
                <Th>Arrivée</Th>
                <Th>Dernière activité</Th>
                <Th>Départ</Th>
                <Th>Pointage</Th>
              </tr>
            </thead>
            <tbody>
              {affiches.map((p) => {
                const retard = retardMinutes(p.arrivee, r.heureArrivee, r.toleranceMinutes);
                return (
                  <tr key={p.id}>
                    <Td fort>
                      {p.nom}
                      {p.poste && <span className="block text-xs font-normal text-[var(--encre-faible)]">{p.poste}</span>}
                    </Td>
                    <Td chiffres>
                      {p.arrivee} {retard > 0 && <Pastille ton="alerte">+{retard} min</Pastille>}
                    </Td>
                    <Td chiffres>{p.derniere}</Td>
                    <Td chiffres>{p.depart ?? "—"}</Td>
                    <Td>
                      {p.source === "automatique" ? <Pastille ton="valide">automatique</Pastille> : <Pastille ton="neutre">manuel</Pastille>}
                      {p.motif && <span className="block text-xs text-[var(--encre-faible)]">{p.motif}</span>}
                    </Td>
                  </tr>
                );
              })}
              {affiches.length === 0 && (
                <tr>
                  <Td>
                    <span className="text-[var(--encre-faible)]">
                      {presents.length === 0 ? "Personne n'est encore pointé aujourd'hui." : "Aucun résultat : personne de pointé ne répond à cette recherche."}
                    </span>
                  </Td>
                </tr>
              )}
            </tbody>
          </Tableau>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
              <h2 className="text-sm font-semibold">{attendus ? "Non pointés" : "Pas encore arrivés"}</h2>
              <p className="text-xs text-[var(--encre-faible)]">Salariés en poste, ni pointés ni en congé aujourd&apos;hui{travaille ? "" : " (jour non travaillé)"}.</p>
              <ul className="mt-2 divide-y divide-[var(--filet)] text-sm">
                {manquants.map((s) => (
                  <li key={s.id} className="flex justify-between py-1.5">
                    <span>{s.nom}</span>
                    <span className="text-xs text-[var(--encre-faible)]">{s.userId ? s.poste : `${s.poste} · sans compte`}</span>
                  </li>
                ))}
                {manquants.length === 0 && <li className="py-1.5 text-[var(--encre-faible)]">Tout le monde est là.</li>}
              </ul>
            </section>
            <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
              <h2 className="text-sm font-semibold">Absences des sept prochains jours</h2>
              <ul className="mt-2 divide-y divide-[var(--filet)] text-sm">
                {absences.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {a.nom} <span className="text-xs text-[var(--encre-faible)]">· {NATURES_CONGE[a.nature].libelle}</span>
                    </span>
                    <span className="chiffres text-xs text-[var(--encre-faible)]">
                      {a.debut.slice(8)}/{a.debut.slice(5, 7)} → {a.fin.slice(8)}/{a.fin.slice(5, 7)}
                    </span>
                  </li>
                ))}
                {absences.length === 0 && <li className="py-1.5 text-[var(--encre-faible)]">Aucune absence prévue.</li>}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
