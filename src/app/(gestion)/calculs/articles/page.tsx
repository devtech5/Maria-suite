import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { Correspondances } from "@/components/calculs/correspondances";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { articlesPourCalculs, correspondancesDe } from "@/modules/calculs/donnees";
import { clesUsuelles, cleCarreau, libelleCle, uniteCle } from "@/modules/calculs/notes";
import { FORMATS_CARRELAGE } from "@/modules/calculs/regles";

export const metadata: Metadata = { title: "Articles des calculs" };

export default async function PageArticlesCalculs() {
  const a = await accesCalculs();
  if (!a.regler) return <AccesRefuse droit="calculs.regler" />;
  const [articles, correspondances] = await Promise.all([articlesPourCalculs(a.session.organizationId), correspondancesDe(a.session.organizationId)]);
  // Les matériaux usuels, les formats de carrelage courants, et toute clé déjà associée.
  const cles = [...new Set([...clesUsuelles(), ...FORMATS_CARRELAGE.map((f) => cleCarreau(f.longueurMm, f.largeurMm)), ...Object.keys(correspondances)])];
  return (
    <>
      <EnTetePage titre="Articles des calculs" sousTitre="L'article du catalogue qui se commande et se vend pour chaque matériau : il chiffre les notes et part sur les devis et les commandes" />
      <Correspondances
        lignes={cles.map((cle) => ({ cle, libelle: libelleCle(cle), unite: uniteCle(cle), articleId: correspondances[cle] ?? null }))}
        articles={articles}
      />
    </>
  );
}
