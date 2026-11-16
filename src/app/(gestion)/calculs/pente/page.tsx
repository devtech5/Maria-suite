import type { Metadata } from "next";

import { CalculPente } from "@/components/calculs/calculateurs";
import { EnTetePage } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Pente" };

export default function Page() {
  return (
    <>
      <EnTetePage titre="Pente" sousTitre="Terrasse, dallage, caniveau, toiture, rampe" />
      <CalculPente />
    </>
  );
}
