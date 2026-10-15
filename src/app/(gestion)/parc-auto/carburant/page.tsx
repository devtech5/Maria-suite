import type { Metadata } from "next";

import { FormulairePlein, RetirerPlein } from "@/components/parc-auto/formulaires";
import { CarteIndicateur, EnTetePage, EtatVide, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lireFiltresListe } from "@/lib/recherche";
import { formaterLitres, prixAuLitre } from "@/modules/parc-auto/calcul";
import { listerPleins, listerVehicules } from "@/modules/parc-auto/requetes";
import { salariesEnPoste } from "@/modules/personnes/requetes";

export const metadata: Metadata = { title: "Carburant" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" });

/** Carnet de carburant de tout le parc : ce qui a été mis, où, par qui, à quel prix. */
export default async function PageCarburant({ searchParams }: PageProps<"/parc-auto/carburant">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [pleins, vehicules, conducteurs, saisir] = await Promise.all([
    listerPleins(session.organizationId),
    listerVehicules(session.organizationId),
    salariesEnPoste(session.organizationId),
    peut("parc_auto.carburant.saisir"),
  ]);

  const aujourdhui = new Date();
  const debutMois = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), 1));
  const duMois = pleins.filter((p) => p.faitLe >= debutMois);
  const montantMois = duMois.reduce((s, p) => s + p.montant, 0);
  const volumeMois = duMois.reduce((s, p) => s + p.volume, 0);
  // Les indicateurs du mois portent sur tout le carnet ; seul le tableau suit la recherche.
  const immatriculations = new Map(vehicules.map((v) => [v.id, v.fiche?.immatriculation]));
  const lignes = pleins.filter(
    (p) =>
      dansPeriode(p.faitLe, filtres.periode) &&
      correspond(filtres.q, [p.vehicule, immatriculations.get(p.actifId), p.conducteur, p.station, p.notes]),
  );
  const options = vehicules
    .filter((v) => v.statut !== "cede")
    .map((v) => ({ id: v.id, libelle: `${v.code} · ${v.fiche?.immatriculation ?? v.designation}`, conducteurId: v.employeId, kilometrage: v.compteur }));

  return (
    <>
      <EnTetePage
        titre="Carburant"
        sousTitre="Pleins de tout le parc, du plus récent au plus ancien"
        actions={saisir ? <FormulairePlein vehicules={options} conducteurs={conducteurs} /> : undefined}
      />
      {pleins.length === 0 ? (
        <EtatVide
          titre="Aucun plein"
          message="Notez chaque plein avec son kilométrage : c'est le relevé le plus fréquent d'un véhicule, il nourrit le compteur, la consommation et le coût au kilomètre."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <CarteIndicateur libelle="Dépense du mois" valeur={fmtCompact(montantMois)} unite="FCFA" precision={`${duMois.length} plein${duMois.length > 1 ? "s" : ""}`} />
            <CarteIndicateur libelle="Volume du mois" valeur={formaterLitres(volumeMois)} precision="Tous véhicules" />
            <CarteIndicateur libelle="Prix moyen du litre" valeur={volumeMois > 0 ? fmt(prixAuLitre(montantMois, volumeMois)) : "—"} unite="FCFA" precision="Ce mois" />
            <CarteIndicateur libelle="Pleins notés" valeur={fmtEntier(pleins.length)} precision="Depuis l'origine" />
          </section>
          <Recherche
            chemin="/parc-auto/carburant"
            valeur={filtres.q}
            placeholder="Véhicule, immatriculation, conducteur, station…"
            periode={{ ...filtres.periode, libelle: "Date du plein" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} sur ${fmtEntier(pleins.length)}` : undefined}
          />
          {lignes.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun plein ne répond. Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Véhicule</Th>
                  <Th aligne="droite">Volume</Th>
                  <Th aligne="droite">Montant</Th>
                  <Th aligne="droite">Prix au litre</Th>
                  <Th aligne="droite">Kilométrage</Th>
                  <Th>Conducteur</Th>
                  <Th>Station</Th>
                  {saisir && <Th>{""}</Th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map((p) => (
                  <tr key={p.id}>
                    <Td chiffres>{JOUR.format(p.faitLe)}</Td>
                    <Td>{p.vehicule}</Td>
                    <Td aligne="droite" chiffres>
                      {formaterLitres(p.volume)}
                      {!p.complet && <span className="ml-1 text-xs text-[var(--encre-faible)]">(appoint)</span>}
                    </Td>
                    <Td aligne="droite" chiffres fort>
                      {fmt(p.montant)}
                    </Td>
                    <Td aligne="droite" chiffres>
                      {fmt(prixAuLitre(p.montant, p.volume))} F
                    </Td>
                    <Td aligne="droite" chiffres>
                      {p.kilometrage !== null ? `${fmtEntier(p.kilometrage)} km` : "—"}
                    </Td>
                    <Td>{p.conducteur ?? "—"}</Td>
                    <Td>{p.station ?? "—"}</Td>
                    {saisir && (
                      <Td>
                        <RetirerPlein id={p.id} />
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}
          <p className="mt-4 max-w-[75ch] text-xs text-[var(--encre-faible)]">
            Le plein se paie par la trésorerie (bon de caisse, carte carburant), qui porte la charge en comptabilité.
            Ce carnet suit la consommation sans passer d&apos;écriture : le carburant ne compte qu&apos;une fois au résultat.
          </p>
        </>
      )}
    </>
  );
}
