import type { Metadata } from "next";
import Link from "next/link";

import { ListePv } from "@/components/pv/liste-pv";
import { CarteIndicateur, EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { listerPv } from "@/modules/pv/donnees";

export const metadata: Metadata = { title: "Procès-verbaux" };

/**
 * Procès-verbaux, comptes rendus et rapports : ce qui m'est diffusé, ce que
 * je rédige, et pour la direction ce qui attend sa validation.
 */
export default async function PagePv({ searchParams }: PageProps<"/pv">) {
  const session = await exigerEntreprise();
  const [valideur, rediger] = await Promise.all([peut("pv.valider"), peut("pv.rediger")]);
  const p = await searchParams;
  const liste = await listerPv(session.organizationId, { userId: session.userId, valideur });

  const aLire = liste.filter((l) => l.statut === "publie" && l.destinataire && l.accuseRequis && !l.luLe && !l.remplace).length;
  const aSigner = liste.filter((l) => l.aSigner && !l.remplace).length;
  const aValider = liste.filter((l) => l.statut === "a_valider").length;
  const brouillons = liste.filter((l) => l.statut !== "publie" && l.redigeParUserId === session.userId).length;

  return (
    <>
      <EnTetePage
        titre="Procès-verbaux"
        sousTitre="PV de réunion, comptes rendus et rapports, validés par la direction et diffusés au personnel"
        actions={
          rediger ? (
            <Link href="/pv/nouveau" className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700">
              Nouveau procès-verbal
            </Link>
          ) : undefined
        }
      />
      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="À lire" valeur={String(aLire)} ton={aLire ? "alerte" : "valide"} precision={aLire ? "Prise de connaissance attendue" : "Rien en attente"} />
        <CarteIndicateur libelle="À signer" valeur={String(aSigner)} ton={aSigner ? "alerte" : "valide"} precision={aSigner ? "Vous étiez présent" : "Rien en attente"} />
        {valideur && <CarteIndicateur libelle="À valider" valeur={String(aValider)} ton={aValider ? "alerte" : "neutre"} precision="Soumis par les rédacteurs" />}
        <CarteIndicateur libelle="Mes brouillons" valeur={String(brouillons)} ton="marque" />
      </section>
      <ListePv
        liste={liste.map((l) => ({ ...l, publieLeIso: l.publieLe?.toISOString() ?? null, luLeIso: l.luLe?.toISOString() ?? null }))}
        moi={session.userId}
        valideur={valideur}
        ongletInitial={typeof p.vue === "string" ? p.vue : undefined}
      />
    </>
  );
}
