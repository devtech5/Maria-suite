import type { Metadata } from "next";

import { ListeTransmissions } from "@/components/transmissions/liste-transmissions";
import { EnTetePage } from "@/components/ui/primitives";
import { accesTransmissions } from "@/modules/transmissions/acces";
import { aujourdhuiPour, transmissionsDe } from "@/modules/transmissions/requetes";

export const metadata: Metadata = { title: "Mes transmissions" };

/** Les bordereaux internes adressés à la personne : à accuser, à rendre, rendus. */
export default async function PageRecues() {
  const a = await accesTransmissions();
  const org = a.session.organizationId;
  const [ouverts, rendus, aujourdhui] = await Promise.all([
    transmissionsDe(org, { sens: "interne", destinataire: a.moi, statuts: ["transmise", "accusee"] }),
    transmissionsDe(org, { sens: "interne", destinataire: a.moi, statuts: ["traitee"], limite: 50 }),
    aujourdhuiPour(org),
  ]);
  return (
    <>
      <EnTetePage titre="Mes transmissions" sousTitre="Les pièces que vos collègues vous ont transmises" />
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">À traiter</h2>
      <ListeTransmissions liste={ouverts} aujourdhui={aujourdhui} vide="Rien en attente." />
      <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Rendues récemment</h2>
      <ListeTransmissions liste={rendus} aujourdhui={aujourdhui} vide="Rien encore." />
    </>
  );
}
