import type { Metadata } from "next";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, CarteIndicateur, Champ, EnTetePage, EtatVide, Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { creerFourniture, enregistrerEntree, enregistrerSortie } from "@/modules/moyens-generaux/actions";
import { ETATS_FOURNITURE, type EtatFourniture } from "@/modules/moyens-generaux/calcul";
import { listerFournitures } from "@/modules/moyens-generaux/creation";
import { salariesEnPoste } from "@/modules/personnes/requetes";

export const metadata: Metadata = { title: "Fournitures de bureau" };

const TON: Record<EtatFourniture, TonPastille> = { rupture: "danger", a_racheter: "alerte", suffisant: "valide" };

/** Le placard : ce qu'il contient, ce qui manque, et les gestes du quotidien. */
export default async function PageFournitures({ searchParams }: PageProps<"/moyens-generaux">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  const [liste, gerer] = await Promise.all([listerFournitures(session.organizationId), peut("moyens_generaux.gerer")]);
  const salaries = gerer ? await salariesEnPoste(session.organizationId) : [];
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const compte = (e: EtatFourniture) => liste.filter((f) => f.etat === e).length;
  const valeur = liste.reduce((s, f) => s + (f.coutMoyen ?? 0) * Math.max(f.stock, 0), 0);
  // Les indicateurs et les formulaires portent sur tout le placard ; seul le tableau suit la recherche.
  const lignes = liste.filter((f) => correspond(filtres.q, [f.designation, f.unite, ETATS_FOURNITURE[f.etat]]));

  const choixFourniture = (
    <Champ libelle="Fourniture">
      <select name="fournitureId" required className={CLASSE_CHAMP}>
        <option value="">—</option>
        {liste.map((f) => (
          <option key={f.id} value={f.id}>
            {f.designation} ({fmtEntier(f.stock)} {f.unite})
          </option>
        ))}
      </select>
    </Champ>
  );

  return (
    <>
      <EnTetePage
        titre="Fournitures de bureau"
        sousTitre="Papier, encre, petit matériel : le stock se calcule à partir des entrées et des remises."
        actions={
          gerer ? (
            <div className="flex flex-wrap items-start gap-2">
              {liste.length > 0 && (
                <>
                  <FormulaireRepliable libelle="Remettre" titre="Remise de fournitures" action={enregistrerSortie}>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {choixFourniture}
                      <Champ libelle="Quantité">
                        <input name="quantite" type="number" min={1} step={1} required className={`${CLASSE_CHAMP} chiffres`} />
                      </Champ>
                      <Champ libelle="Date">
                        <input name="date" type="date" defaultValue={aujourdhui} required className={`${CLASSE_CHAMP} chiffres`} />
                      </Champ>
                      <Champ libelle="Remise à">
                        <select name="employeId" className={CLASSE_CHAMP}>
                          <option value="">—</option>
                          {salaries.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nom}
                            </option>
                          ))}
                        </select>
                      </Champ>
                      <Champ libelle="Service" precision="À défaut de salarié, ou en plus.">
                        <input name="service" placeholder="Comptabilité, Accueil…" className={CLASSE_CHAMP} />
                      </Champ>
                      <Champ libelle="Note">
                        <input name="note" className={CLASSE_CHAMP} />
                      </Champ>
                    </div>
                  </FormulaireRepliable>
                  <FormulaireRepliable libelle="Entrée" titre="Entrée de fournitures (achat)" action={enregistrerEntree}>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {choixFourniture}
                      <Champ libelle="Quantité">
                        <input name="quantite" type="number" min={1} step={1} required className={`${CLASSE_CHAMP} chiffres`} />
                      </Champ>
                      <Champ libelle="Date">
                        <input name="date" type="date" defaultValue={aujourdhui} required className={`${CLASSE_CHAMP} chiffres`} />
                      </Champ>
                      <Champ libelle="Coût total (FCFA)" precision="Facultatif : sert au coût moyen.">
                        <input name="cout" inputMode="numeric" placeholder="0" className={`${CLASSE_CHAMP} chiffres`} />
                      </Champ>
                      <Champ libelle="Note">
                        <input name="note" placeholder="Fournisseur, n° de facture…" className={CLASSE_CHAMP} />
                      </Champ>
                    </div>
                  </FormulaireRepliable>
                </>
              )}
              <FormulaireRepliable libelle="Nouvelle fourniture" titre="Nouvelle fourniture" action={creerFourniture}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Champ libelle="Désignation">
                    <input name="designation" required placeholder="Ramette papier A4" className={CLASSE_CHAMP} />
                  </Champ>
                  <Champ libelle="Unité">
                    <input name="unite" placeholder="ramette" className={CLASSE_CHAMP} />
                  </Champ>
                  <Champ libelle="Seuil d'alerte" precision="En dessous, la fourniture est à racheter.">
                    <input name="seuil" type="number" min={0} step={1} defaultValue={0} className={`${CLASSE_CHAMP} chiffres`} />
                  </Champ>
                </div>
              </FormulaireRepliable>
            </div>
          ) : undefined
        }
      />

      {liste.length === 0 ? (
        <EtatVide titre="Aucune fourniture au catalogue" message="Ajoutez les fournitures du placard — ramettes, cartouches, stylos — avec leur seuil d'alerte, puis enregistrez les achats et les remises." />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CarteIndicateur libelle="Fournitures suivies" valeur={fmtEntier(liste.length)} />
            <CarteIndicateur libelle="À racheter" valeur={fmtEntier(compte("a_racheter"))} ton="alerte" precision="Au seuil d'alerte ou en dessous" />
            <CarteIndicateur libelle="En rupture" valeur={fmtEntier(compte("rupture"))} ton="danger" />
            <CarteIndicateur libelle="Valeur du placard" valeur={fmt(valeur)} unite="FCFA" ton="marque" precision="Au coût moyen d'achat" />
          </section>

          <Recherche
            chemin="/moyens-generaux"
            valeur={filtres.q}
            placeholder="Ramette, cartouche, stylo, à racheter…"
            resultats={filtres.q ? `${fmtEntier(lignes.length)} sur ${fmtEntier(liste.length)}` : undefined}
          />

          {lignes.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucune fourniture ne répond à cette recherche. Retirez un mot de la recherche." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Fourniture</Th>
                  <Th aligne="droite">Stock</Th>
                  <Th aligne="droite">Seuil</Th>
                  <Th aligne="droite">Coût moyen</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((f) => (
                  <tr key={f.id}>
                    <Td fort>{f.designation}</Td>
                    <Td aligne="droite" chiffres>
                      {fmtEntier(f.stock)} <span className="text-xs text-[var(--encre-faible)]">{f.unite}</span>
                    </Td>
                    <Td aligne="droite" chiffres>
                      {f.seuil > 0 ? fmtEntier(f.seuil) : "—"}
                    </Td>
                    <Td aligne="droite" chiffres>
                      {f.coutMoyen === null ? "—" : `${fmt(f.coutMoyen)} FCFA`}
                    </Td>
                    <Td>
                      <Pastille ton={TON[f.etat]}>{ETATS_FOURNITURE[f.etat]}</Pastille>
                    </Td>
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
