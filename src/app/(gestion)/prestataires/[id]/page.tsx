import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListePrestations } from "@/components/prestataires/liste-prestations";
import { Etoiles, FormulairePrestation, FormulaireProfil } from "@/components/prestataires/formulaires";
import { CarteIndicateur, Pastille } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtCompact, fmtEntier } from "@/lib/format";
import { compteParDefaut } from "@/modules/prestataires/calcul";
import { referentielPays } from "@/lib/pays";
import { listerPrestataires, listerPrestations } from "@/modules/prestataires/creation";
import { LIBELLE_NATURE_TIERS } from "@/modules/tiers/natures";
import { nomPays, origineDe } from "@/modules/tiers/origine";
import { paysEntreprise } from "@/modules/tiers/requetes";
import { comptesDisponibles } from "@/modules/tresorerie/actions";

export const metadata: Metadata = { title: "Prestataire" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fiche d'un prestataire : profil, prestations confiées, avis, paiements. */
export default async function PagePrestataire({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();
  const [tous, pays] = await Promise.all([listerPrestataires(session.organizationId), paysEntreprise(session.organizationId)]);
  const p = tous.find((x) => x.id === id);
  if (!p) notFound();
  const [liste, gerer, payer] = await Promise.all([listerPrestations(session.organizationId, id), peut("prestataires.gerer"), peut("prestataires.payer")]);
  const comptes = payer ? await comptesDisponibles() : [];
  const enCours = liste.filter((x) => x.statut === "demandee" || x.statut === "confirmee").length;
  const aPayer = liste.filter((x) => x.statut === "realisee").length;

  return (
    <>
      <Link href="/prestataires" className="mb-3 inline-block text-sm text-[var(--encre-douce)] hover:underline">
        ← Prestataires
      </Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            {p.nom}
            {!p.disponible && <Pastille ton="neutre">Indisponible</Pastille>}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-[var(--encre-douce)]">
            {p.metiers.join(" · ")}
            <Pastille ton="marque">{LIBELLE_NATURE_TIERS[p.nature]}</Pastille>
            <Pastille ton={origineDe(p.paysCode, pays) === "local" ? "valide" : "alerte"}>{origineDe(p.paysCode, pays) === "local" ? "Local" : `International · ${nomPays(p.paysCode)}`}</Pastille>
          </p>
          <p className="mt-1 text-sm text-[var(--encre-douce)]">
            {[p.telephone, p.email, p.ville, p.identifiantFiscal ? `${referentielPays(p.paysCode ?? pays).identifiantFiscal} ${p.identifiantFiscal}` : null, p.mobileMoney ? `Mobile money ${p.mobileMoney}` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2">
            <Etoiles dixiemes={p.note} />
          </div>
        </div>
        {gerer && <FormulairePrestation prestataires={[{ id: p.id, nom: p.nom }]} fixe={p.id} />}
      </header>

      <section className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Prestations réalisées" valeur={fmtEntier(p.realisees)} precision={`${liste.length} confiée${liste.length > 1 ? "s" : ""}`} />
        <CarteIndicateur libelle="En cours" valeur={fmtEntier(enCours)} precision="Demandées ou confirmées" />
        <CarteIndicateur libelle="À payer" valeur={fmtEntier(aPayer)} ton={aPayer > 0 ? "alerte" : "valide"} precision="Réalisées, non réglées" />
        <CarteIndicateur libelle="Total payé" valeur={fmtCompact(p.totalPaye)} unite="FCFA" precision="Depuis l'origine" />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Prestations</h2>
        <ListePrestations
          prestations={liste}
          compteDefaut={compteParDefaut(p.metiers[0])}
          comptes={comptes.map((c) => ({ id: c.id, nom: c.nom }))}
          peutGerer={gerer}
          peutPayer={payer}
          avecPrestataire={false}
        />
      </section>

      {gerer && (
        <section>
          <h2 className="mb-3 text-base font-semibold">Profil</h2>
          <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
            <FormulaireProfil
              id={p.id}
              initial={{
                metiers: p.metiers,
                specialites: p.specialites,
                zone: p.zone,
                tarif: p.tarif,
                uniteTarif: p.uniteTarif,
                formel: p.formel,
                mobileMoney: p.mobileMoney,
                disponible: p.disponible,
                notes: p.notes,
              }}
            />
          </div>
        </section>
      )}
    </>
  );
}
