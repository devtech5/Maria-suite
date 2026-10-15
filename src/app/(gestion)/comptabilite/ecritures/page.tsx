import type { Metadata } from "next";

import { EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { fmt, fmtDateIso, fmtEntier } from "@/lib/format";
import { lireFiltresListe } from "@/lib/recherche";
import { journalEcritures } from "@/modules/comptabilite/requetes";
import { SaisieEcriture } from "./saisie";

export const metadata: Metadata = { title: "Écritures" };

/** D'où vient l'écriture. Une saisie manuelle se distingue d'un ticket. */
const ORIGINES: Record<string, string> = {
  facture: "Facture",
  avoir: "Avoir",
  reglement: "Règlement",
  achat: "Achat",
  bon_caisse: "Bon de caisse",
  vente_pos: "Caisse",
  saisie: "Saisie",
  bon_paiement: "Bon de paiement",
  virement: "Virement",
  avance: "Avance",
  arrete_caisse: "Arrêté de caisse",
  releve: "Relevé bancaire",
  paie: "Paie",
  tva: "TVA",
  cloture: "Clôture",
  reprise: "Reprise",
  commission: "Commission",
  prestation: "Prestation",
};

export default async function PageEcritures({ searchParams }: PageProps<"/comptabilite/ecritures">) {
  const session = await exigerEntreprise();
  const filtres = lireFiltresListe(await searchParams);
  // Sans filtre, les trente dernières ; une recherche porte sur tout le journal, en base.
  const ecritures = await journalEcritures(
    session.organizationId,
    filtres.actif ? { limite: 200, filtres } : { limite: 30 },
  );

  return (
    <>
      <EnTetePage
        titre="Écritures"
        sousTitre="Saisie guidée, partie double automatique"
      />

      <SaisieEcriture />

      <section className="mt-6">
        <h2 className="mb-2.5 text-base font-semibold">Journal</h2>

        {(ecritures.length > 0 || filtres.actif) && (
          <Recherche
            chemin="/comptabilite/ecritures"
            valeur={filtres.q}
            placeholder="Numéro, pièce, libellé, compte, tiers…"
            periode={{ ...filtres.periode, libelle: "Date d'écriture" }}
            resultats={
              filtres.actif
                ? `${fmtEntier(ecritures.length)} écriture${ecritures.length > 1 ? "s" : ""}${ecritures.length === 200 ? " (les 200 plus récentes)" : ""}`
                : undefined
            }
          />
        )}

        {ecritures.length === 0 && filtres.actif ? (
          <EtatVide titre="Aucune écriture ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
        ) : ecritures.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] px-6 py-10 text-center text-sm text-[var(--encre-douce)]">
            Aucune écriture pour l&apos;instant. Elles arriveront d&apos;elles-mêmes
            dès la première vente encaissée, ou par la saisie ci-dessus.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--encre-douce)]">
              {filtres.actif
                ? "Écritures qui répondent à la recherche, de la plus récente à la plus ancienne."
                : ecritures.length === 1
                ? "La seule écriture de l'exercice."
                : `Les ${ecritures.length} dernières écritures, de la plus récente à la plus ancienne.`}{" "}
              Chacune porte la pièce qui l&apos;a produite : un solde qu&apos;on
              ne sait pas rattacher à un document est un solde qu&apos;on ne sait
              pas justifier devant un contrôle.
            </p>

            <Tableau>
              <thead>
                <tr>
                  <Th>Écriture</Th>
                  <Th>Date</Th>
                  <Th>Libellé</Th>
                  <Th>Comptes</Th>
                  <Th aligne="droite">Montant</Th>
                </tr>
              </thead>
              <tbody>
                {ecritures.map((ecriture) => {
                  const montant = ecriture.lignes.reduce((s, l) => s + l.debit, 0);

                  return (
                    <tr key={ecriture.id}>
                      <Td>
                        <span className="chiffres block font-semibold">
                          {ecriture.numero}
                        </span>
                        <span className="block text-xs text-[var(--encre-faible)]">
                          {ORIGINES[ecriture.origine] ?? ecriture.origine} ·{" "}
                          {ecriture.pieceNumero}
                        </span>
                      </Td>
                      <Td chiffres>{fmtDateIso(ecriture.date)}</Td>
                      <Td>
                        {ecriture.libelle}
                        {ecriture.statut !== "validee" && (
                          <span className="ml-2 inline-block align-middle">
                            <Pastille
                              ton={ecriture.statut === "brouillon" ? "alerte" : "neutre"}
                            >
                              {ecriture.statut === "brouillon" ? "Brouillon" : "Verrouillée"}
                            </Pastille>
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="chiffres text-xs text-[var(--encre-douce)]">
                          {ecriture.lignes
                            .map((ligne) => ligne.compte)
                            .join(" · ")}
                        </span>
                      </Td>
                      <Td aligne="droite" chiffres fort>
                        {fmt(montant)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tableau>
          </>
        )}
      </section>
    </>
  );
}
