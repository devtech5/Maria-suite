import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { regleImpotDe } from "@/modules/fiscalite/exercice";
import { regleImpotDuPays } from "@/modules/fiscalite/resultat";

import { EditeurRegleImpot } from "./editeur";

export const metadata: Metadata = { title: "Impôt sur les bénéfices" };

export default async function PageRegleImpot() {
  const session = await exigerEntreprise();
  if (!(await peut("comptabilite.exercice.cloturer"))) return <AccesRefuse droit="comptabilite.exercice.cloturer" />;
  const { regle, verifie, verifieLe, pays } = await regleImpotDe(session.organizationId);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/comptabilite/fiscalite" className="text-marque-600 hover:underline">
          ← Fiscalité
        </Link>
      </p>
      <EnTetePage
        titre="Impôt sur les bénéfices"
        sousTitre={verifie && verifieLe ? `Règle attestée vérifiée le ${verifieLe.toLocaleDateString("fr-FR")}` : "Non vérifiée : aucun impôt ne peut être constaté"}
      />
      <EditeurRegleImpot initial={regle} sourcePays={regleImpotDuPays(pays).source} />
    </>
  );
}
