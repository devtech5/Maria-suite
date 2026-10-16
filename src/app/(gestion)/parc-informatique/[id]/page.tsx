import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChangerStatut } from "@/components/actifs/changer-statut";
import { FormulaireEcheance } from "@/components/actifs/formulaire-echeance";
import { FormulaireIntervention } from "@/components/actifs/formulaire-intervention";
import { ListeEcheances } from "@/components/actifs/liste-echeances";
import { STATUT_ACTIF } from "@/components/actifs/statut";
import { DesinstallerLicence, FormulaireFicheEquipement, InstallerLicence } from "@/components/parc-informatique/formulaires";
import { ActionsFiche } from "@/components/ui/actions-fiche";
import { CarteIndicateur, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact } from "@/lib/format";
import { listerEcheances, listerInterventions } from "@/modules/actifs/requetes";
import { salariesEnPoste } from "@/modules/personnes/requetes";
import { CATEGORIES_EQUIPEMENT } from "@/modules/parc-informatique/calcul";
import { equipementDe, listerLicences } from "@/modules/parc-informatique/requetes";

export const metadata: Metadata = { title: "Équipement informatique" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Abidjan" });

/** Fiche d'un équipement : fiche technique, utilisateur, pannes, garantie, licences installées. */
export default async function PageEquipement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const equipement = await equipementDe(session.organizationId, id);
  if (!equipement) notFound();

  const [interventions, echeances, licences, utilisateurs, gerer, gererLicences, intervenir, echeancer, statut, supprimer] = await Promise.all([
    listerInterventions(session.organizationId, 500),
    listerEcheances(session.organizationId),
    listerLicences(session.organizationId),
    salariesEnPoste(session.organizationId),
    peut("parc_informatique.equipement.gerer"),
    peut("parc_informatique.licence.gerer"),
    peut("actifs.intervention.saisir"),
    peut("actifs.echeance.gerer"),
    peut("actifs.fiche.gerer"),
    peut("actifs.fiche.supprimer"),
  ]);
  const f = equipement.fiche;
  const sesInterventions = interventions.filter((i) => i.actifCode === equipement.code);
  const sesEcheances = echeances.filter((e) => e.actifId === id);
  const installees = licences.filter((l) => l.postesInstalles.some((p) => p.actifId === id));
  const installables = licences
    .filter((l) => !l.postesInstalles.some((p) => p.actifId === id))
    .map((l) => ({ id: l.id, libelle: `${l.logiciel} (${l.utilises}/${l.postes} postes)` }));

  return (
    <>
      <Link href="/parc-informatique" className="mb-3 inline-block text-sm text-[var(--encre-douce)] hover:underline">
        ← Parc informatique
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{equipement.designation}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--encre-douce)]">
            <span className="chiffres">{equipement.code}</span>
            {f && <span>· {CATEGORIES_EQUIPEMENT[f.categorie]}</span>}
            <span>· Utilisateur : {equipement.affecteA ?? "non attribué"}</span>
            {statut ? null : <Pastille ton={STATUT_ACTIF[equipement.statut].ton}>{STATUT_ACTIF[equipement.statut].libelle}</Pastille>}
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          {statut && <ChangerStatut id={id} statut={equipement.statut} />}
          <ActionsFiche type="actif" id={id} libelle={equipement.designation} peutGerer={false} peutSupprimer={supprimer} retour="/parc-informatique" />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Valeur d'achat" valeur={fmtCompact(equipement.valeurAcquisition)} unite="FCFA" precision={equipement.dateAcquisition ? `Acheté le ${JOUR.format(new Date(`${equipement.dateAcquisition}T12:00:00Z`))}` : "Date d'achat inconnue"} />
        <CarteIndicateur libelle="Réparations" valeur={fmtCompact(equipement.coutMaintenance)} unite="FCFA" precision={`${equipement.interventions} intervention${equipement.interventions > 1 ? "s" : ""}`} />
        <CarteIndicateur libelle="Garantie" valeur={equipement.garantie ? (equipement.garantie.gravite === "depassee" ? "Échue" : "En cours") : "—"} ton={equipement.garantie?.gravite === "depassee" ? "alerte" : undefined} precision={equipement.garantie?.echeanceLe ?? "Non renseignée"} />
        <CarteIndicateur libelle="Licences installées" valeur={String(installees.length)} precision="Logiciels sous licence" />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Fiche technique et utilisateur</h2>
        <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
          {gerer ? (
            <FormulaireFicheEquipement
              actifId={id}
              utilisateurs={utilisateurs}
              initial={{
                categorie: f?.categorie ?? "portable",
                marque: f?.marque ?? null,
                modele: f?.modele ?? null,
                numeroSerie: f?.numeroSerie ?? null,
                systeme: f?.systeme ?? null,
                processeur: f?.processeur ?? null,
                memoireGo: f?.memoireGo ?? null,
                stockageGo: f?.stockageGo ?? null,
                nomReseau: f?.nomReseau ?? null,
                adresseIp: f?.adresseIp ?? null,
                adresseMac: f?.adresseMac ?? null,
                accessoires: f?.accessoires ?? null,
                utilisateurId: equipement.employeId,
              }}
            />
          ) : f ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {[
                ["Marque et modèle", [f.marque, f.modele].filter(Boolean).join(" ")],
                ["N° de série", f.numeroSerie],
                ["Système", f.systeme],
                ["Processeur", f.processeur],
                ["Mémoire", f.memoireGo ? `${f.memoireGo} Go` : null],
                ["Stockage", f.stockageGo ? `${f.stockageGo} Go` : null],
                ["Nom réseau", f.nomReseau],
                ["Adresse IP", f.adresseIp],
                ["Adresse MAC", f.adresseMac],
                ["Accessoires", f.accessoires],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-[var(--encre-faible)]">{l}</dt>
                  <dd className="chiffres">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-[var(--encre-douce)]">Fiche technique non renseignée.</p>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Licences installées</h2>
          {gererLicences && <InstallerLicence actifId={id} licences={installables} />}
        </div>
        {installees.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucune licence suivie sur ce poste.</p>
        ) : (
          <ul className="divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
            {installees.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{l.logiciel}</span>
                  {l.editeur && <span className="text-[var(--encre-douce)]"> · {l.editeur}</span>}
                  {l.expireLe && <span className="chiffres text-xs text-[var(--encre-faible)]"> · jusqu&apos;au {l.expireLe}</span>}
                </span>
                {gererLicences && <DesinstallerLicence licenceId={l.id} actifId={id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Pannes et interventions</h2>
          {intervenir && (
            <FormulaireIntervention actifs={[{ id, code: equipement.code, designation: equipement.designation, uniteCompteur: null, compteur: null, proprietaire: null }]} />
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
            <FormulaireEcheance actifs={[{ id, code: equipement.code, designation: equipement.designation, uniteCompteur: null }]} natures={["garantie", "entretien"]} />
          )}
        </div>
        {sesEcheances.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">Aucune échéance suivie.</p>
        ) : (
          <ListeEcheances echeances={sesEcheances} avecActif={false} />
        )}
      </section>
    </>
  );
}
