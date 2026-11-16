import type { Metadata } from "next";

import { CalculEquerre } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { contexteCalculs } from "@/modules/calculs/donnees";

export const metadata: Metadata = { title: "Angle droit" };

export default async function Page() {
  const { session } = await accesCalculs();
  const contexte = await contexteCalculs(session.organizationId);
  return (
    <>
      <EnTetePage titre="Angle droit" sousTitre="Contrôle d'équerrage d'une implantation" />
      <CalculEquerre contexte={contexte} />
    </>
  );
}
