import type { Metadata } from "next";

import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { consommationParService } from "@/modules/moyens-generaux/calcul";
import { derniersMouvements } from "@/modules/moyens-generaux/creation";

export const metadata: Metadata = { title: "Entrées et remises de fournitures" };

const date = (iso: string) => iso.split("-").reverse().join("/");

/** Ce qui est entré au placard et ce qui en est sorti, et qui consomme quoi ce mois-ci. */
export default async function PageMouvementsFournitures({ searchParams }: PageProps<"/moyens-generaux/mouvements">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  // Les indicateurs du mois portent sur tout le placard ; seul le tableau suit la recherche.
  const [mouvements, trouves] = await Promise.all([
    derniersMouvements(session.organizationId),
    filtres.actif ? derniersMouvements(session.organizationId, 500, filtres) : null,
  ]);
  const lignes = trouves ?? mouvements;
  const mois = new Date().toISOString().slice(0, 7);
  const duMois = mouvements.filter((m) => m.date.startsWith(mois));
  const achatsDuMois = duMois.filter((m) => m.sens === "entree").reduce((s, m) => s + (m.cout ?? 0), 0);
  const remisesDuMois = duMois.filter((m) => m.sens === "sortie");
  const parService = consommationParService(remisesDuMois);

  return (
    <>
      <EnTetePage titre="Entrées et remises" sousTitre="Les deux cents derniers mouvements du placard, du plus récent au plus ancien." />

      {mouvements.length === 0 ? (
        <EtatVide titre="Aucun mouvement" message="Les achats et les remises de fournitures apparaissent ici dès le premier enregistrement, depuis l'onglet Fournitures." />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <CarteIndicateur libelle="Achats du mois" valeur={fmt(achatsDuMois)} unite="FCFA" ton="marque" />
            <CarteIndicateur libelle="Remises du mois" valeur={fmtEntier(remisesDuMois.length)} precision={`${fmtEntier(remisesDuMois.reduce((s, m) => s + m.quantite, 0))} unités remises`} />
            <CarteIndicateur
              libelle="Premier consommateur du mois"
              valeur={parService[0]?.service ?? "—"}
              ton="valide"
              precision={parService[0] ? `${fmtEntier(parService[0].quantite)} unités` : "Aucune remise ce mois-ci"}
            />
          </section>

          <Recherche
            chemin="/moyens-generaux/mouvements"
            valeur={filtres.q}
            placeholder="Fourniture, bénéficiaire, service, note…"
            periode={{ ...filtres.periode, libelle: "Date" }}
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} mouvement${lignes.length > 1 ? "s" : ""}` : undefined}
          />

          {lignes.length === 0 ? (
            <EtatVide titre="Aucun mouvement ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Mouvement</Th>
                  <Th>Fourniture</Th>
                  <Th aligne="droite">Quantité</Th>
                  <Th>Remise à</Th>
                  <Th aligne="droite">Coût</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((m) => (
                  <tr key={m.id}>
                    <Td chiffres>{date(m.date)}</Td>
                    <Td>
                      <Pastille ton={m.sens === "entree" ? "valide" : "neutre"}>{m.sens === "entree" ? "Entrée" : "Remise"}</Pastille>
                    </Td>
                    <Td fort>{m.fourniture}</Td>
                    <Td aligne="droite" chiffres>
                      {m.sens === "entree" ? "+" : "−"}
                      {fmtEntier(m.quantite)} <span className="text-xs text-[var(--encre-faible)]">{m.unite}</span>
                    </Td>
                    <Td>{[m.beneficiaire, m.service].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td aligne="droite" chiffres>
                      {m.cout === null ? "—" : fmt(m.cout)}
                    </Td>
                    <Td>{m.note ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          )}
        </>
      )}
    </>
  );
}
