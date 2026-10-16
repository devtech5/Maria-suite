import type { Metadata } from "next";

import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { etatDette } from "@/modules/achats/calcul";
import { listerFactures } from "@/modules/achats/requetes";
import { listerComptes } from "@/modules/tresorerie/requetes";

import { ListeDettes } from "./liste";

export const metadata: Metadata = { title: "Dettes fournisseurs" };

/**
 * Échéancier des dettes fournisseurs : ce qui est dû, à qui, pour quand, et
 * le règlement qui l'éteint — depuis la caisse, la banque ou le mobile money.
 */
export default async function PageDettes({ searchParams }: PageProps<"/achats/dettes">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const payer = await peut("achats.reglement.payer");
  // Les indicateurs portent sur toutes les dettes ; seul l'échéancier suit la recherche.
  const [factures, trouvees, comptes] = await Promise.all([
    listerFactures(session.organizationId, { ouvertesSeulement: true }),
    filtres.actif ? listerFactures(session.organizationId, { ouvertesSeulement: true, recherche: filtres, periodeSur: "echeance" }) : null,
    payer ? listerComptes(session.organizationId) : Promise.resolve([]),
  ]);
  const lignes = trouvees ?? factures;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const etats = factures.map((f) => ({ f, etat: etatDette(f.reste, f.echeance, aujourdhui) }));
  const somme = (e: string) => etats.filter((x) => x.etat === e).reduce((s, x) => s + x.f.reste, 0);
  const total = factures.reduce((s, f) => s + f.reste, 0);

  return (
    <>
      <EnTetePage titre="Dettes fournisseurs" sousTitre="Ce que l'entreprise doit, à qui, et pour quand" />
      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="Total dû" valeur={fmt(total)} unite="FCFA" precision={`${fmtEntier(factures.length)} facture${factures.length > 1 ? "s" : ""} ouverte${factures.length > 1 ? "s" : ""}`} />
        <CarteIndicateur libelle="Échu" valeur={fmt(somme("echue"))} unite="FCFA" ton={somme("echue") > 0 ? "danger" : "valide"} precision="Échéance dépassée" />
        <CarteIndicateur libelle="Sous sept jours" valeur={fmt(somme("bientot"))} unite="FCFA" ton={somme("bientot") > 0 ? "alerte" : "neutre"} />
        <CarteIndicateur libelle="Plus tard" valeur={fmt(somme("a_payer"))} unite="FCFA" />
      </section>
      {factures.length === 0 ? (
        <EtatVide titre="Aucune dette" message="Toutes les factures fournisseurs sont réglées." />
      ) : (
        <>
          <Recherche
            chemin="/achats/dettes"
            valeur={filtres.q}
            placeholder="Fournisseur, numéro, n° du fournisseur…"
            periode={{ ...filtres.periode, libelle: "Échéance" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} sur ${fmtEntier(factures.length)}` : undefined}
          />
          {lignes.length === 0 ? (
            <EtatVide titre="Aucune dette ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <ListeDettes
              factures={lignes}
              comptes={comptes.filter((c) => c.actif).map((c) => ({ id: c.id, nom: c.nom, nature: c.nature, solde: c.solde }))}
              payer={payer}
              aujourdhui={aujourdhui}
            />
          )}
        </>
      )}
    </>
  );
}
