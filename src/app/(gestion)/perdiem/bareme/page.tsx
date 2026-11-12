import type { Metadata } from "next";

import { AjoutBareme, GestesBareme } from "@/components/perdiem/gestes";
import { EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt } from "@/lib/format";
import { listerBareme } from "@/modules/perdiem/requetes";

export const metadata: Metadata = { title: "Barème des perdiem" };

/** Le barème : la grille des montants par jour. La comptable y ajoute, modifie et supprime ; les autres le consultent. */
export default async function PageBareme() {
  const session = await exigerEntreprise();
  const [gerer, lignes] = await Promise.all([peut("perdiem.gerer"), listerBareme(session.organizationId)]);
  return (
    <>
      <EnTetePage titre="Barème des perdiem" sousTitre="Le montant par jour selon la destination ou la situation" actions={gerer && <AjoutBareme />} />
      {lignes.length === 0 ? (
        <EtatVide
          titre="Le barème est vide"
          message={gerer ? "Ajoutez les montants par jour — Abidjan, Intérieur du pays, International… — puis attribuez les perdiem aux collaborateurs." : "La comptable n'a pas encore fixé de montant."}
        />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Libellé</Th>
              <Th aligne="droite">Montant par jour</Th>
              <Th>Notes</Th>
              <Th aligne="droite">Utilisée</Th>
              {gerer && <Th aligne="droite">Gestes</Th>}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className={l.actif ? "" : "opacity-60"}>
                <Td fort>
                  {l.libelle}
                  {!l.actif && (
                    <span className="ml-1.5 align-middle">
                      <Pastille ton="alerte">Hors barème</Pastille>
                    </span>
                  )}
                </Td>
                <Td aligne="droite" chiffres fort>
                  {fmt(l.montantJournalier)} F
                </Td>
                <Td>
                  <span className="text-xs text-[var(--encre-douce)]">{l.notes ?? "—"}</span>
                </Td>
                <Td aligne="droite" chiffres>
                  {l.utilisations}
                </Td>
                {gerer && (
                  <Td aligne="droite">
                    <GestesBareme ligne={l} />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
      <p className="mt-4 max-w-[75ch] text-xs text-[var(--encre-faible)]">
        Modifier un montant ne réécrit pas les perdiem déjà attribués : ils gardent le montant du jour qu&apos;ils avaient. Une ligne qui a déjà servi ne s&apos;efface pas, elle se retire du barème.
      </p>
    </>
  );
}
