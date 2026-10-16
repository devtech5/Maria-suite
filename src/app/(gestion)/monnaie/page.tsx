import type { Metadata } from "next";

import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { guichetOuvert, soldesDerniereCloture } from "@/modules/monnaie/requetes";

import { BandeauFloat, Guichet, OuvertureGuichet } from "./guichet";

export const metadata: Metadata = { title: "Point de vente" };

const HEURE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export default async function PageGuichet() {
  const session = await exigerEntreprise();
  const [guichet, saisir] = await Promise.all([
    guichetOuvert(session.organizationId),
    peut("valeur_electronique.operation.saisir"),
  ]);

  if (!guichet) {
    const proposition = await soldesDerniereCloture(session.organizationId);
    return (
      <>
        <EnTetePage
          titre="Point de vente"
          sousTitre="Transfert d'argent et vente de crédit — point de vente fermé"
        />
        <OuvertureGuichet proposition={proposition} autorise={saisir} />
      </>
    );
  }

  return (
    <>
      <EnTetePage
        titre="Point de vente"
        sousTitre={`Session ${guichet.session.numero} ouverte le ${HEURE.format(guichet.session.ouverteLe)} · ${
          guichet.operations.filter((o) => !o.annulee).length
        } opérations`}
      />
      {guichet.session.apport && guichet.session.apport.montant !== 0 && (
        <p
          className={`mb-4 rounded-lg px-3 py-2.5 text-sm ${
            guichet.session.apport.montant > 0 ? "bg-marque-50" : "bg-alerte-50 text-alerte-600"
          }`}
        >
          <span className="font-semibold">
            {guichet.session.apport.montant > 0 ? "Apport de l'exploitant" : "Prélèvement de l'exploitant"} de{" "}
            {fmt(Math.abs(guichet.session.apport.montant))} F à l&apos;ouverture
          </span>
          <span className="text-[var(--encre-douce)]">
            {" "}
            — écriture <span className="chiffres">{guichet.session.apport.ecriture}</span>, compte 104.
          </span>
        </p>
      )}
      <BandeauFloat soldes={guichet.soldes} ouvertures={guichet.ouvertures} fondCaisse={guichet.session.fondCaisse} />
      <Guichet soldes={guichet.soldes} autorise={saisir} />
    </>
  );
}
