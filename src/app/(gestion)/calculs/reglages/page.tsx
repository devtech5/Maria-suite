import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { FormulaireReglagesCalculs } from "@/components/calculs/formulaire-reglages";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { reglagesCalculsDe } from "@/modules/calculs/donnees";

export const metadata: Metadata = { title: "Ratios des calculs" };

export default async function PageReglagesCalculs() {
  const a = await accesCalculs();
  if (!a.regler) return <AccesRefuse droit="calculs.regler" />;
  const r = await reglagesCalculsDe(a.session.organizationId);
  const le = r.verifieLe?.toLocaleDateString("fr-FR", { timeZone: r.fuseau });
  return (
    <>
      <EnTetePage
        titre="Ratios des calculs"
        sousTitre={r.verifie ? `Attestés le ${le}` : "À vérifier : valeurs de départ des chantiers ivoiriens, à confirmer par un conducteur de travaux"}
      />
      <FormulaireReglagesCalculs reglages={r.valeurs} verifie={r.verifie} />
    </>
  );
}
