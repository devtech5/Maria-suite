import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { identiteEntreprise } from "@/lib/identite";

import { FormulaireIdentite } from "./formulaire";
import { FormulaireSecurite } from "./securite";

export const metadata: Metadata = { title: "Entreprise" };

/**
 * Identité de l'entreprise : raison sociale, identifiants légaux du pays,
 * coordonnées, logo, couleurs et mentions de pied de page. Tout document
 * imprimé — facture, bon de commande, bulletin, ticket — la lit ici.
 */
export default async function PageEntreprise() {
  if (!(await peut("organisation.parametres.gerer"))) return <AccesRefuse droit="organisation.parametres.gerer" />;
  const session = await exigerEntreprise();
  const i = await identiteEntreprise(session.organizationId);

  return (
    <>
      <EnTetePage titre="Entreprise" sousTitre="Identité, logo et mentions imprimées sur vos documents, sécurité des postes" />
      <FormulaireIdentite
        initial={{
          nom: i.nom,
          formeJuridique: i.formeJuridique ?? "",
          identifiantFiscal: i.identifiantFiscal ?? "",
          rccm: i.rccm ?? "",
          regimeFiscal: i.regimeFiscal ?? "",
          adresse: i.adresse ?? "",
          ville: i.ville ?? "",
          telephone: i.telephone ?? "",
          email: i.email ?? "",
          couleur: i.couleur,
          couleurSecondaire: i.couleurSecondaire,
          piedDePage: i.piedDePage ?? "",
          slogan: i.slogan ?? "",
          siteWeb: i.siteWeb ?? "",
          capitalSocial: i.capitalSocial === null ? "" : fmt(i.capitalSocial),
          logo: i.logo,
        }}
        libelles={{ identifiantFiscal: i.referentiel.identifiantFiscalLong, sigle: i.referentiel.identifiantFiscal, registre: i.referentiel.registre }}
      />
      <FormulaireSecurite delai={session.delaiVerrouillage} />
    </>
  );
}
