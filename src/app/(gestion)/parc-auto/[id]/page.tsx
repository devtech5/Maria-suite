import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChangerStatut } from "@/components/actifs/changer-statut";
import { FormulaireEcheance } from "@/components/actifs/formulaire-echeance";
import { FormulaireIntervention } from "@/components/actifs/formulaire-intervention";
import { ListeEcheances } from "@/components/actifs/liste-echeances";
import { STATUT_ACTIF } from "@/components/actifs/statut";
import { FormulaireFicheVehicule, FormulairePlein, RetirerPlein } from "@/components/parc-auto/formulaires";
import { ActionsFiche } from "@/components/ui/actions-fiche";
import { CarteIndicateur, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { listerEcheances, listerInterventions } from "@/modules/actifs/requetes";
import { ENERGIES, formaterConsommation, formaterLitres, prixAuLitre } from "@/modules/parc-auto/calcul";
import { listerPleins, vehiculeDe } from "@/modules/parc-auto/requetes";
import { salariesEnPoste } from "@/modules/personnes/requetes";

export const metadata: Metadata = { title: "Véhicule" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" });

/** Fiche d'un véhicule : carte grise, conducteur, carburant, entretiens, échéances, coûts. */
export default async function PageVehicule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const vehicule = await vehiculeDe(session.organizationId, id);
  if (!vehicule) notFound();

  const [pleins, interventions, echeances, conducteurs, gerer, carburant, intervenir, echeancer, statut, supprimer] = await Promise.all([
    listerPleins(session.organizationId, id),
    listerInterventions(session.organizationId, 500),
    listerEcheances(session.organizationId),
    salariesEnPoste(session.organizationId),
    peut("parc_auto.vehicule.gerer"),
    peut("parc_auto.carburant.saisir"),
    peut("actifs.intervention.saisir"),
    peut("actifs.echeance.gerer"),
    peut("actifs.fiche.gerer"),
    peut("actifs.fiche.supprimer"),
  ]);
  const sesInterventions = interventions.filter((i) => i.actifCode === vehicule.code);
  const sesEcheances = echeances.filter((e) => e.actifId === id);
  const f = vehicule.fiche;
  const conducteurId = vehicule.employeId;
  const option = { id, libelle: `${vehicule.code} · ${f?.immatriculation ?? vehicule.designation}`, conducteurId, kilometrage: vehicule.compteur };

  return (
    <>
      <Link href="/parc-auto" className="mb-3 inline-block text-sm text-[var(--encre-douce)] hover:underline">
        ← Parc automobile
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="chiffres">{f?.immatriculation ?? vehicule.code}</span>
            {f && <span className="ml-2 text-base font-normal text-[var(--encre-douce)]">{[f.marque, f.modele].filter(Boolean).join(" ")}</span>}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--encre-douce)]">
            <span className="chiffres">{vehicule.code}</span>
            {f?.energie && <span>· {ENERGIES[f.energie]}</span>}
            <span>· Conducteur : {vehicule.affecteA ?? "aucun"}</span>
            {statut ? null : <Pastille ton={STATUT_ACTIF[vehicule.statut].ton}>{STATUT_ACTIF[vehicule.statut].libelle}</Pastille>}
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          {statut && <ChangerStatut id={id} statut={vehicule.statut} />}
          <ActionsFiche type="actif" id={id} libelle={f?.immatriculation ?? vehicule.designation} peutGerer={false} peutSupprimer={supprimer} retour="/parc-auto" />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
        <CarteIndicateur libelle="Kilométrage" valeur={vehicule.compteur !== null ? fmtEntier(vehicule.compteur) : "—"} unite="km" precision="Dernier relevé" />
        <CarteIndicateur libelle="Consommation" valeur={formaterConsommation(vehicule.consommation.mlPour100)} precision={vehicule.consommation.distance > 0 ? `Sur ${fmtEntier(vehicule.consommation.distance)} km mesurés` : "Deux pleins complets requis"} />
        <CarteIndicateur libelle="Carburant" valeur={fmtCompact(vehicule.carburantTotal)} unite="FCFA" precision={formaterLitres(vehicule.volumeTotal)} />
        <CarteIndicateur libelle="Entretien" valeur={fmtCompact(vehicule.coutMaintenance)} unite="FCFA" precision={`${vehicule.interventions} intervention${vehicule.interventions > 1 ? "s" : ""}`} />
        <CarteIndicateur libelle="Coût au km" valeur={vehicule.coutAuKm !== null ? fmt(vehicule.coutAuKm) : "—"} unite="FCFA" precision="Carburant et entretien" />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Carte grise et conducteur</h2>
        <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
          {gerer ? (
            <FormulaireFicheVehicule
              actifId={id}
              conducteurs={conducteurs}
              initial={{
                immatriculation: f?.immatriculation ?? "",
                marque: f?.marque ?? null,
                modele: f?.modele ?? null,
                annee: f?.annee ?? null,
                energie: f?.energie ?? null,
                numeroChassis: f?.numeroChassis ?? null,
                numeroCarteGrise: f?.numeroCarteGrise ?? null,
                puissanceFiscale: f?.puissanceFiscale ?? null,
                places: f?.places ?? null,
                couleur: f?.couleur ?? null,
                reservoirLitres: f?.reservoirLitres ?? null,
                usage: f?.usage ?? null,
                conducteurId,
              }}
            />
          ) : f ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {[
                ["Carte grise", f.numeroCarteGrise],
                ["Châssis", f.numeroChassis],
                ["Année", f.annee?.toString()],
                ["Puissance fiscale", f.puissanceFiscale ? `${f.puissanceFiscale} CV` : null],
                ["Places", f.places?.toString()],
                ["Réservoir", f.reservoirLitres ? `${f.reservoirLitres} L` : null],
                ["Couleur", f.couleur],
                ["Usage", f.usage],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-[var(--encre-faible)]">{l}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-[var(--encre-douce)]">Carte grise non renseignée.</p>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Carburant</h2>
          {carburant && <FormulairePlein vehicules={[option]} conducteurs={conducteurs} fixe />}
        </div>
        {pleins.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucun plein noté.</p>
        ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th aligne="droite">Volume</Th>
                <Th aligne="droite">Montant</Th>
                <Th aligne="droite">Prix au litre</Th>
                <Th aligne="droite">Kilométrage</Th>
                <Th>Conducteur</Th>
                <Th>Station</Th>
                {carburant && <Th>{""}</Th>}
              </tr>
            </thead>
            <tbody>
              {pleins.map((p) => (
                <tr key={p.id}>
                  <Td chiffres>{JOUR.format(p.faitLe)}</Td>
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
                  {carburant && (
                    <Td>
                      <RetirerPlein id={p.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tableau>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Entretiens et réparations</h2>
          {intervenir && (
            <FormulaireIntervention
              actifs={[{ id, code: vehicule.code, designation: vehicule.designation, uniteCompteur: "km", compteur: vehicule.compteur, proprietaire: null }]}
            />
          )}
        </div>
        {sesInterventions.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucune intervention.</p>
        ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>Date</Th>
                <Th>Intervention</Th>
                <Th>Prestataire</Th>
                <Th aligne="droite">Kilométrage</Th>
                <Th aligne="droite">Coût</Th>
              </tr>
            </thead>
            <tbody>
              {sesInterventions.map((i) => (
                <tr key={i.id}>
                  <Td chiffres>{i.numero}</Td>
                  <Td chiffres>{JOUR.format(i.effectueeLe)}</Td>
                  <Td fort>{i.libelle}</Td>
                  <Td>{i.prestataire ?? "—"}</Td>
                  <Td aligne="droite" chiffres>
                    {i.compteur !== null ? `${fmtEntier(i.compteur)} km` : "—"}
                  </Td>
                  <Td aligne="droite" chiffres>
                    {fmt(i.cout)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Échéances</h2>
          {echeancer && (
            <FormulaireEcheance
              actifs={[{ id, code: vehicule.code, designation: vehicule.designation, uniteCompteur: "km" }]}
              natures={["assurance", "visite", "vignette", "patente", "entretien"]}
            />
          )}
        </div>
        {sesEcheances.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucune échéance suivie : assurance, visite technique et vignette se posent ici.</p>
        ) : (
          <ListeEcheances echeances={sesEcheances} avecActif={false} />
        )}
      </section>
    </>
  );
}
