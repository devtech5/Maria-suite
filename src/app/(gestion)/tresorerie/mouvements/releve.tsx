"use client";

import { saisir } from "@/components/ui/dialogues";
import { Retour, useOperation } from "@/components/ui/operations";
import { Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { annulerMouvement } from "@/modules/tresorerie/actions-mouvements";
import { NATURES_MOUVEMENT } from "@/modules/tresorerie/mouvements";
import type { LigneReleveVue } from "@/modules/tresorerie/requetes-mouvements";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** D'où vient l'opération : le module qui l'a passée, dit simplement. */
const ORIGINE: Record<string, string> = {
  mouvement: "Mouvement",
  reglement: "Encaissement de facture",
  facture: "Facture",
  achat: "Facture fournisseur",
  bon_caisse: "Bon de caisse",
  avance: "Avance",
  virement: "Virement interne",
  arrete_caisse: "Arrêté de caisse",
  releve: "Relevé bancaire",
  paie: "Paie",
  bon_paiement: "Intervenant",
  vente_pos: "Ventes en caisse",
  tva: "TVA",
  commission: "Commission",
  prestation: "Prestataire",
  reprise: "Reprise",
  saisie: "Saisie comptable",
};

/**
 * Relevé d'un compte, du plus ancien au plus récent, solde après chaque ligne.
 * Un mouvement libre s'annule d'ici ; un paiement par banque imprime son ordre
 * de virement.
 */
export function Releve({
  lignes,
  ouverture,
  annuler,
  banque,
}: {
  lignes: LigneReleveVue[];
  ouverture: number;
  annuler: boolean;
  banque: boolean;
}) {
  const { resultat, enCours, lancer } = useOperation();

  return (
    <>
      <Retour resultat={resultat} />
      <Tableau>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Pièce</Th>
            <Th>Libellé</Th>
            <Th aligne="droite">Entrée</Th>
            <Th aligne="droite">Sortie</Th>
            <Th aligne="droite">Solde</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>{""}</Td>
            <Td>{""}</Td>
            <Td>
              <span className="text-[var(--encre-douce)]">Solde au début de la période</span>
            </Td>
            <Td>{""}</Td>
            <Td>{""}</Td>
            <Td aligne="droite" chiffres fort>
              {fmt(ouverture)}
            </Td>
            <Td>{""}</Td>
          </tr>
          {lignes.map((l, i) => {
            const m = l.mouvement;
            const sortieTiers = m && NATURES_MOUVEMENT[m.nature].sens === "sortie" && "tiers" in NATURES_MOUVEMENT[m.nature].contrepartie;
            return (
              <tr key={`${l.piece}-${i}`} className={m?.statut === "annule" ? "opacity-60" : undefined}>
                <Td chiffres>{DATE.format(new Date(`${l.date}T00:00:00Z`))}</Td>
                <Td chiffres>{l.piece}</Td>
                <Td>
                  {l.libelle}
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--encre-faible)]">
                    {m ? NATURES_MOUVEMENT[m.nature].libelle : (ORIGINE[l.origine] ?? l.origine)}
                    {m?.statut === "annule" && <Pastille>Annulé</Pastille>}
                  </span>
                </Td>
                <Td aligne="droite" chiffres>
                  {l.entree ? <span className="text-valide-600">{fmt(l.entree)}</span> : ""}
                </Td>
                <Td aligne="droite" chiffres>
                  {l.sortie ? <span className="text-danger-600">{fmt(l.sortie)}</span> : ""}
                </Td>
                <Td aligne="droite" chiffres fort>
                  <span className={l.solde < 0 ? "text-danger-600" : ""}>{fmt(l.solde)}</span>
                </Td>
                <Td>
                  {m && m.statut === "valide" && (
                    <span className="flex justify-end gap-1.5 whitespace-nowrap">
                      {banque && sortieTiers && (
                        <a
                          href={`/imprimer/ordre-virement/${m.id}`}
                          target="_blank"
                          rel="noopener"
                          className="rounded-lg border border-[var(--filet)] px-2 py-1 text-xs font-semibold hover:bg-[var(--surface-creuse)]"
                        >
                          Ordre de virement
                        </a>
                      )}
                      {annuler && (
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={async () => {
                            const motif = await saisir({
                              titre: `Annuler ${m.numero} ?`,
                              detail: "L'écriture sera contre-passée.",
                              libelle: "Motif",
                              action: "Annuler l'écriture",
                            });
                            if (motif) lancer(() => annulerMouvement(m.id, motif));
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                        >
                          Annuler
                        </button>
                      )}
                    </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Tableau>
    </>
  );
}
