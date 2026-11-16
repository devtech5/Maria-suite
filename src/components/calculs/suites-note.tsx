"use client";

import { useMemo, useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { annulerNote, commandeDepuisNote, devisDepuisNote } from "@/modules/calculs/actions";
import { chiffrer, quantiteLisible, type ArticleChiffrage, type Materiau } from "@/modules/calculs/notes";

const BOUTON = "h-cible rounded-lg px-3.5 text-sm font-semibold disabled:opacity-50";
const PRINCIPAL = `${BOUTON} bg-marque-600 text-white hover:bg-marque-700`;
const SECONDAIRE = `${BOUTON} border border-[var(--filet)] bg-[var(--surface)] font-medium hover:bg-[var(--surface-creuse)]`;

type Article = ArticleChiffrage & { reference: string };

/**
 * Les matériaux de la note, chiffrés, et leur passage sur une pièce. Chaque
 * ligne prend l'article associé au matériau (page « Articles »), ou un autre
 * choisi ici, de la même unité. Le serveur revérifie tout : note active,
 * matériau présent, article de l'entreprise, unité compatible.
 */
export function SuitesNote({
  noteId,
  materiaux,
  articles,
  correspondances,
  fournisseurs,
  peutDevis,
  peutCommande,
  clientNom,
  active,
}: {
  noteId: string;
  materiaux: Materiau[];
  articles: Article[];
  correspondances: Record<string, string>;
  fournisseurs: { id: string; nom: string }[];
  peutDevis: boolean;
  peutCommande: boolean;
  clientNom: string | null;
  active: boolean;
}) {
  const op = useOperation();
  const [choix, setChoix] = useState<Record<string, string>>(() => Object.fromEntries(materiaux.map((m) => [m.cle, correspondances[m.cle] ?? ""])));
  const [retenus, setRetenus] = useState<Record<string, boolean>>(() => Object.fromEntries(materiaux.map((m) => [m.cle, true])));
  const [fournisseurId, setFournisseurId] = useState("");
  const parId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const articleDe = (cle: string) => parId.get(choix[cle] ?? "") ?? null;
  const vente = chiffrer(materiaux, articleDe, "vente");
  const achat = chiffrer(materiaux, articleDe, "achat");
  const lignesRetenues = vente.lignes.filter((l) => retenus[l.materiau.cle]);
  const bloquees = lignesRetenues.filter((l) => l.refus);
  const envoi = lignesRetenues.map((l) => ({ cle: l.materiau.cle, articleId: choix[l.materiau.cle] }));
  const pret = active && lignesRetenues.length > 0 && bloquees.length === 0;
  const totalRetenu = (c: typeof vente) => c.lignes.filter((l) => retenus[l.materiau.cle]).reduce((t, l) => t + l.montant, 0);

  if (materiaux.length === 0) {
    return <p className="text-sm text-[var(--encre-faible)]">Ce calcul ne donne pas de matériaux à acheter.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--encre-faible)]">
              <th className="w-8 py-1" aria-label="Retenir" />
              <th className="py-1 pr-2 font-medium">Matériau</th>
              <th className="px-2 text-right font-medium">Quantité</th>
              <th className="px-2 font-medium">Article du catalogue</th>
              <th className="px-2 text-right font-medium">Achat</th>
              <th className="px-2 text-right font-medium">Vente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--filet)]">
            {vente.lignes.map((l, i) => {
              const m = l.materiau;
              const compatibles = articles.filter((a) => a.unite === m.unite);
              return (
                <tr key={m.cle} className={retenus[m.cle] ? "" : "opacity-50"}>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      aria-label={`Retenir ${m.designation}`}
                      checked={retenus[m.cle]}
                      disabled={!active}
                      onChange={(e) => setRetenus((r) => ({ ...r, [m.cle]: e.target.checked }))}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    {m.designation}
                    {l.refus && retenus[m.cle] && <span className="block text-xs text-alerte-600">{l.refus}</span>}
                  </td>
                  <td className="chiffres whitespace-nowrap px-2 text-right">{quantiteLisible(m)}</td>
                  <td className="px-2 py-1">
                    <select
                      aria-label={`Article pour ${m.designation}`}
                      value={choix[m.cle]}
                      disabled={!active}
                      onChange={(e) => setChoix((c) => ({ ...c, [m.cle]: e.target.value }))}
                      className={`${CLASSE_CHAMP} min-w-[14rem]`}
                    >
                      <option value="">— Aucun article —</option>
                      {compatibles.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.designation} ({a.reference})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="chiffres whitespace-nowrap px-2 text-right">{achat.lignes[i].montant ? formatMoney(achat.lignes[i].montant) : "—"}</td>
                  <td className="chiffres whitespace-nowrap px-2 text-right">{l.montant ? formatMoney(l.montant) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--filet)] font-semibold">
              <td colSpan={4} className="py-2 text-right">
                Total HT des lignes retenues
              </td>
              <td className="chiffres whitespace-nowrap px-2 text-right">{formatMoney(totalRetenu(achat))}</td>
              <td className="chiffres whitespace-nowrap px-2 text-right">{formatMoney(totalRetenu(vente))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-[var(--encre-faible)]">
        Prix du catalogue, hors taxes ; la TVA et le compte viennent de l&apos;article. Les quantités sont celles de la note, pertes comprises, arrondies au-dessus.
      </p>

      {active && (peutDevis || peutCommande) && (
        <div className="grid gap-4 border-t border-[var(--filet)] pt-4 md:grid-cols-2">
          {peutDevis && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Devis au client</h3>
              <p className="text-xs text-[var(--encre-faible)]">
                {clientNom ? `Brouillon pour ${clientNom}, au prix de vente.` : "Le projet n'a pas de client : renseignez-le sur la fiche du projet."}
              </p>
              <button type="button" disabled={!pret || !clientNom || op.enCours} onClick={() => op.lancer(() => devisDepuisNote(noteId, envoi))} className={PRINCIPAL}>
                Préparer le devis
              </button>
            </div>
          )}
          {peutCommande && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Commande au fournisseur</h3>
              <Champ libelle="Fournisseur">
                <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className={CLASSE_CHAMP}>
                  <option value="">— Choisir —</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
                </select>
              </Champ>
              <button
                type="button"
                disabled={!pret || !fournisseurId || op.enCours}
                onClick={() => op.lancer(() => commandeDepuisNote(noteId, fournisseurId, envoi))}
                className={PRINCIPAL}
              >
                Préparer la commande
              </button>
            </div>
          )}
          {bloquees.length > 0 && (
            <p className="text-sm text-alerte-600 md:col-span-2">
              {bloquees.length} ligne{bloquees.length > 1 ? "s" : ""} sans article de la bonne unité : choisissez un article ou décochez la ligne.
            </p>
          )}
        </div>
      )}
      <Retour resultat={op.resultat} />
    </div>
  );
}

export function AnnulerNote({ noteId }: { noteId: string }) {
  const op = useOperation();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={SECONDAIRE}>
        Annuler la note
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        op.lancer(() => annulerNote(noteId, motif));
      }}
    >
      <Champ libelle="Motif de l'annulation">
        <input value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} maxLength={300} className={CLASSE_CHAMP} />
      </Champ>
      <button type="submit" disabled={op.enCours} className={PRINCIPAL}>
        Confirmer
      </button>
      <button type="button" onClick={() => setOuvert(false)} className={SECONDAIRE}>
        Garder la note
      </button>
      <Retour resultat={op.resultat} />
    </form>
  );
}
