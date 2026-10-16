import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { FormulaireAjustement } from "@/components/presences/formulaires";
import { EnTetePage, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { formatJours, jourLocal } from "@/modules/presences/calcul";
import { reglagesDe } from "@/modules/presences/creation";
import { soldesConges } from "@/modules/presences/requetes";

export const metadata: Metadata = { title: "Soldes de congés" };

export default async function PageSoldes({ searchParams }: PageProps<"/presences/soldes">) {
  const droits = await droitsActifs();
  if (!droits.has("presences.consulter") && !droits.has("conges.valider")) return <AccesRefuse droit="presences.consulter" />;
  const session = await exigerEntreprise();
  const r = await reglagesDe(session.organizationId);
  const aujourdhui = jourLocal(new Date(), r.fuseau);
  const soldes = await soldesConges(session.organizationId, r, aujourdhui);
  // Recherche seule : un solde se lit au jour dit, il n'a pas de date à filtrer.
  const filtres = lireFiltresListe(await searchParams);
  const affiches = soldes.filter((s) => correspond(filtres.q, [s.salarie.nom, s.salarie.matricule, s.salarie.poste]));

  return (
    <>
      <EnTetePage
        titre="Soldes de congés"
        sousTitre={`Au ${aujourdhui.split("-").reverse().join("/")} · ${formatJours(r.congesCentiemesParMois)} par mois de service${r.verifie ? "" : " · règle à vérifier dans Réglages"}`}
        actions={droits.has("conges.valider") && soldes.length > 0 ? <FormulaireAjustement salaries={soldes.map((s) => ({ id: s.salarie.id, nom: s.salarie.nom }))} aujourdhui={aujourdhui} /> : undefined}
      />
      {soldes.length > 0 && (
        <Recherche
          chemin="/presences/soldes"
          valeur={filtres.q}
          placeholder="Salarié, matricule, poste…"
          resultats={filtres.q ? `${fmtEntier(affiches.length)} sur ${fmtEntier(soldes.length)}` : undefined}
        />
      )}
      <Tableau>
        <thead>
          <tr>
            <Th>Salarié</Th>
            <Th>Décompte depuis</Th>
            <Th aligne="droite">Acquis</Th>
            <Th aligne="droite">Pris</Th>
            <Th aligne="droite">En attente</Th>
            <Th aligne="droite">Disponible</Th>
          </tr>
        </thead>
        <tbody>
          {affiches.map((s) => (
            <tr key={s.salarie.id}>
              <Td fort>
                {s.salarie.nom}
                <span className="block text-xs font-normal text-[var(--encre-faible)]">
                  {s.salarie.matricule} · {s.salarie.poste}
                </span>
              </Td>
              <Td chiffres>{s.depuis.split("-").reverse().join("/")}</Td>
              <Td aligne="droite" chiffres>
                {formatJours(s.acquis)}
              </Td>
              <Td aligne="droite" chiffres>
                {formatJours(s.pris)}
              </Td>
              <Td aligne="droite" chiffres>
                {s.enAttente ? formatJours(s.enAttente) : "—"}
              </Td>
              <Td aligne="droite" chiffres fort>
                <span className={s.solde < 0 ? "text-danger-600" : ""}>{formatJours(s.solde)}</span>
              </Td>
            </tr>
          ))}
          {affiches.length === 0 && (
            <tr>
              <Td>
                <span className="text-[var(--encre-faible)]">{soldes.length === 0 ? "Aucun salarié en poste." : "Aucun résultat : aucun salarié ne répond à cette recherche."}</span>
              </Td>
            </tr>
          )}
        </tbody>
      </Tableau>
      <p className="mt-3 text-xs text-[var(--encre-faible)]">
        Le décompte part de l&apos;embauche, ou de la dernière reprise de solde. Pour un salarié embauché avant Maria Suite, saisissez une reprise : son solde réel à une
        date.
      </p>
    </>
  );
}
