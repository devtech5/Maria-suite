import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { envoyerVirement } from "@/modules/tresorerie/actions";
import { listerComptes, listerVirements } from "@/modules/tresorerie/requetes";

import { libelleChamp, OptionsComptes } from "../champs";
import { ListeVirements } from "./liste";

export const metadata: Metadata = { title: "Virements internes" };

/**
 * Virements internes : alimenter une caisse, verser en banque, recharger un
 * portefeuille. L'argent passe par le 585 tant qu'il n'est pas arrivé.
 */
export default async function PageVirements({ searchParams }: PageProps<"/tresorerie/virements">) {
  const session = await exigerEntreprise();
  if (!(await peut("tresorerie.consulter"))) redirect("/tresorerie/caisse");
  const saisir = await peut("tresorerie.virement.saisir");
  const filtres = lireFiltresListe(await searchParams);
  const [comptes, virements, trouves] = await Promise.all([
    listerComptes(session.organizationId),
    listerVirements(session.organizationId),
    filtres.actif ? listerVirements(session.organizationId, 500, filtres) : null,
  ]);
  const lignes = trouves ?? virements;
  const actifs = comptes.filter((c) => c.actif).map((c) => ({ id: c.id, nom: c.nom, nature: c.nature, solde: c.solde }));
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <>
      <EnTetePage
        titre="Virements internes"
        sousTitre="L'argent qui passe d'une caisse, d'une banque ou d'un portefeuille à l'autre"
        actions={
          saisir && actifs.length >= 2 ? (
            <FormulaireRepliable libelle="Nouveau virement" titre="Nouveau virement interne" action={envoyerVirement}>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={libelleChamp}>D&apos;où part l&apos;argent</span>
                    <select name="sourceId" required defaultValue="" className={CLASSE_CHAMP}>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      <OptionsComptes comptes={actifs} />
                    </select>
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Où il arrive</span>
                    <select name="destinationId" required defaultValue="" className={CLASSE_CHAMP}>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      <OptionsComptes comptes={actifs} />
                    </select>
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Montant (F)</span>
                    <input name="montant" required inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Frais d&apos;envoi (F)</span>
                    <input name="frais" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Date</span>
                    <input type="date" name="date" defaultValue={aujourdhui} className={CLASSE_CHAMP} />
                  </label>
                  <label className="block">
                    <span className={libelleChamp}>Référence</span>
                    <input name="reference" maxLength={80} placeholder="N° de bordereau, de chèque, de transaction" className={CLASSE_CHAMP} />
                  </label>
                </div>
                <label className="block">
                  <span className={libelleChamp}>Motif</span>
                  <input name="motif" maxLength={300} placeholder="Alimentation de la caisse de Bouaké, versement de la recette…" className={CLASSE_CHAMP} />
                </label>
                <label className="flex items-start gap-2.5 text-sm">
                  <input type="checkbox" name="recuImmediat" className="mt-0.5 accent-marque-600" />
                  <span>
                    <span className="block font-medium">Déjà arrivé</span>
                    <span className="block text-xs text-[var(--encre-faible)]">
                      Remise de main à main entre deux caisses, transfert Wave instantané. Décoché, le virement reste en
                      route jusqu&apos;à ce que vous constatiez l&apos;arrivée — un versement en banque est souvent crédité le
                      lendemain.
                    </span>
                  </span>
                </label>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {actifs.length < 2 ? (
        <EtatVide titre="Il faut deux comptes" message="Un virement interne va d'un compte de trésorerie à un autre. Déclarez au moins deux comptes dans l'onglet Comptes." />
      ) : virements.length === 0 ? (
        <EtatVide titre="Aucun virement" message="Alimentez une caisse depuis la banque, versez la recette en banque, rechargez un portefeuille mobile money : chaque mouvement est numéroté et passe son écriture." />
      ) : (
        <>
          <Recherche
            chemin="/tresorerie/virements"
            valeur={filtres.q}
            placeholder="Numéro, compte, référence, motif…"
            periode={{ ...filtres.periode, libelle: "Envoyé" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} virement${lignes.length > 1 ? "s" : ""}` : undefined}
          />
          {lignes.length === 0 ? (
            <EtatVide titre="Aucun virement ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <ListeVirements virements={lignes.map((v) => ({ ...v }))} saisir={saisir} aujourdhui={aujourdhui} />
          )}
        </>
      )}
    </>
  );
}
