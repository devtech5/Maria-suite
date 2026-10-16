import { ChoixFichiers } from "@/components/ui/fichiers";
import { FormulaireRepliable } from "@/components/ui/operations";
import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { demanderDepense } from "@/modules/projets/actions";
import { CATEGORIES_DEPENSE } from "@/modules/projets/calcul";

/**
 * Demande de dépense. Le devis du fournisseur se joint dès la demande :
 * celui qui approuve voit ce qu'il signe.
 */
export function FormulaireDepense({
  projets,
  projetId,
  fournisseurs,
}: {
  projets: { id: string; libelle: string }[];
  projetId?: string;
  fournisseurs: { id: string; nom: string }[];
}) {
  return (
    <FormulaireRepliable libelle="Nouvelle dépense" titre="Demander une dépense" presentation="tiroir" action={demanderDepense}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Objet de l'achat">
          <input name="objet" required placeholder="Ciment CPJ 45 — 40 sacs" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Nature">
          <select name="categorie" className={CLASSE_CHAMP}>
            {Object.entries(CATEGORIES_DEPENSE).map(([cle, c]) => (
              <option key={cle} value={cle}>
                {c.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Montant TTC">
          <input name="montant" required inputMode="numeric" placeholder="236 000" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        {projetId ? (
          <input type="hidden" name="projetId" value={projetId} />
        ) : (
          <Champ libelle="Projet">
            <select name="projetId" className={CLASSE_CHAMP}>
              <option value="">Hors projet (frais généraux)</option>
              {projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle}
                </option>
              ))}
            </select>
          </Champ>
        )}
        <Champ libelle="Fournisseur">
          <select name="fournisseurId" className={CLASSE_CHAMP}>
            <option value="">Fournisseur de passage</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Nom du fournisseur de passage">
          <input name="fournisseurLibelle" placeholder="Quincaillerie du carrefour" className={CLASSE_CHAMP} />
        </Champ>
        <div className="sm:col-span-2">
          <ChoixFichiers libelle="Devis ou facture du fournisseur (photos, PDF)" />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input name="avecTva" type="checkbox" />
          Facture normalisée avec TVA 18 % (récupérable)
        </label>
      </div>
    </FormulaireRepliable>
  );
}
