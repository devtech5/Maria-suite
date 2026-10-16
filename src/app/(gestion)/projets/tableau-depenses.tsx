import { Pastille, Tableau, Td, Th, type TonPastille } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { CATEGORIES_DEPENSE, categorieConnue } from "@/modules/projets/calcul";
import type { DepenseVue, PieceVue } from "@/modules/projets/requetes";
import type { StatutDepense } from "@/modules/projets/schema";

import { Visionneuse } from "@/components/ui/fichiers";
import { signerPiecesProjet } from "@/modules/projets/actions";

import { ActionsDepense, AjoutPiece } from "./outils";

const TON: Record<StatutDepense, TonPastille> = {
  demandee: "alerte",
  approuvee: "marque",
  payee: "valide",
  rejetee: "danger",
  annulee: "neutre",
};

const LIBELLE: Record<StatutDepense, string> = {
  demandee: "À approuver",
  approuvee: "Approuvée",
  payee: "Payée",
  rejetee: "Rejetée",
  annulee: "Annulée",
};

const NATURE = { photo: "Photo", preuve_paiement: "Preuve de paiement", facture: "Facture", autre: "Pièce" } as const;

const MOYEN = { especes: "espèces", mobile_money: "mobile money", banque: "banque" } as const;

const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * Le journal des dépenses, étape par étape : qui a demandé, qui a approuvé,
 * qui a payé, avec quoi, et la preuve. C'est la traçabilité en une ligne.
 */
export function TableauDepenses({
  depenses,
  pieces,
  droits,
  afficherProjet,
}: {
  depenses: DepenseVue[];
  pieces: Map<string, PieceVue[]>;
  droits: { approuver: boolean; payer: boolean; demander: boolean };
  afficherProjet: boolean;
}) {
  return (
    <Tableau>
      <thead>
        <tr>
          <Th>Dépense</Th>
          {afficherProjet && <Th>Projet</Th>}
          <Th aligne="droite">Montant</Th>
          <Th>Traçabilité</Th>
          <Th>Pièces</Th>
          <Th aligne="droite"> </Th>
        </tr>
      </thead>
      <tbody>
        {depenses.map((d) => {
          const jointes = pieces.get(d.id) ?? [];
          return (
            <tr key={d.id} className={d.statut === "rejetee" || d.statut === "annulee" ? "opacity-60" : undefined}>
              <Td>
                <span className="chiffres block text-xs text-[var(--encre-faible)]">{d.numero}</span>
                <span className="font-medium">{d.objet}</span>
                <span className="block text-xs text-[var(--encre-faible)]">
                  {categorieConnue(d.categorie) ? CATEGORIES_DEPENSE[d.categorie].libelle : d.categorie}
                  {d.fournisseur ? ` · ${d.fournisseur}` : ""}
                </span>
              </Td>
              {afficherProjet && (
                <Td>
                  <span className="text-xs text-[var(--encre-douce)]">{d.projet ?? "Hors projet"}</span>
                </Td>
              )}
              <Td aligne="droite" chiffres fort>
                {fmt(d.montant)}
                {d.tauxTva > 0 && <span className="block text-xs font-normal text-[var(--encre-faible)]">dont TVA</span>}
              </Td>
              <Td>
                <Pastille ton={TON[d.statut]}>{LIBELLE[d.statut]}</Pastille>
                <ol className="mt-1 space-y-0.5 text-xs text-[var(--encre-douce)]">
                  <li>
                    Demandée par {d.demandeur ?? "—"} · <span className="chiffres">{MOMENT.format(d.demandeeLe)}</span>
                  </li>
                  {d.approuveeLe && (
                    <li>
                      Approuvée par {d.approbateur ?? "—"} · <span className="chiffres">{MOMENT.format(d.approuveeLe)}</span>
                    </li>
                  )}
                  {d.payeeLe && (
                    <li>
                      Payée par {d.payeur ?? "—"} en {d.moyen ? MOYEN[d.moyen] : "—"} ·{" "}
                      <span className="chiffres">{MOMENT.format(d.payeeLe)}</span>
                      {d.referencePaiement && <span className="chiffres"> · réf. {d.referencePaiement}</span>}
                      {d.ecriture && <span className="chiffres"> · {d.ecriture}</span>}
                    </li>
                  )}
                  {d.motif && <li className="text-danger-600">Motif : {d.motif}</li>}
                </ol>
              </Td>
              <Td>
                {jointes.length > 0 && (
                  <Visionneuse
                    signer={signerPiecesProjet}
                    elements={jointes.map((p) => ({
                      id: p.id,
                      typeMime: p.typeMime,
                      nomFichier: p.nomFichier,
                      titre: `${NATURE[p.nature]} · ${d.numero}`,
                      sousTitre: p.legende ?? p.nomFichier,
                    }))}
                  />
                )}
                {d.statut === "payee" && d.preuves === 0 && (
                  <p className="text-xs font-medium text-danger-600">Preuve de paiement manquante</p>
                )}
                {droits.demander && d.statut !== "rejetee" && d.statut !== "annulee" && (
                  <AjoutPiece depenseId={d.id} natures={["preuve_paiement", "facture", "photo"]} libelle="Joindre" />
                )}
              </Td>
              <Td aligne="droite">
                <ActionsDepense id={d.id} statut={d.statut} droits={droits} />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Tableau>
  );
}
