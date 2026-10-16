import type { Metadata } from "next";

import {
  CarteIndicateur,
  Champ,
  CLASSE_CHAMP,
  EnTetePage,
  EtatVide,
  Pastille,
  Tableau,
  Td,
  Th,
} from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { creerRessource } from "@/modules/reservations/actions";
import { listerRessources } from "@/modules/reservations/requetes";
import type { TypeRessource } from "@/modules/reservations/schema";

import { ChangerEtatRessource, FormulaireRepliable } from "../outils";

export const metadata: Metadata = { title: "Ressources" };

const LIBELLE_TYPE: Record<TypeRessource, string> = {
  equipement: "Équipement",
  chambre: "Chambre",
  salle: "Salle",
  creneau: "Créneau",
};

/**
 * Le parc louable : ce qui se réserve, combien d'exemplaires, à quel prix.
 *
 * « Loué » n'est pas un état qu'on coche : c'est ce que disent les contrats
 * en cours. Seuls la maintenance et le retrait se posent à la main.
 */
export default async function PageRessources() {
  const session = await exigerEntreprise();
  const [parc, gerer] = await Promise.all([
    listerRessources(session.organizationId),
    peut("reservation.ressource.gerer"),
  ]);

  const louables = parc.filter((r) => r.statut === "active");
  const capacite = louables.reduce((s, r) => s + r.quantite, 0);
  const sortis = louables.reduce((s, r) => s + r.sortis, 0);
  const maintenance = parc.filter((r) => r.statut === "maintenance").length;

  return (
    <>
      <EnTetePage
        titre="Ressources"
        sousTitre="Matériel, chambres et salles qui se louent"
        actions={
          gerer ? (
            <FormulaireRepliable libelle="Nouvelle ressource" titre="Nouvelle ressource" presentation="tiroir" action={creerRessource}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Champ libelle="Désignation">
                  <input name="designation" required placeholder="Bétonnière 350 L" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Nature">
                  <select name="type" className={CLASSE_CHAMP}>
                    {Object.entries(LIBELLE_TYPE).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Catégorie">
                  <input name="categorie" placeholder="BTP, Événementiel…" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Exemplaires" precision="Une chambre : 1. Des lots de chaises : leur nombre.">
                  <input name="quantite" type="number" min={1} defaultValue={1} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Tarif jour (TTC)">
                  <input name="tarifJour" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Tarif semaine">
                  <input name="tarifSemaine" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Tarif mois">
                  <input name="tarifMois" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Caution par exemplaire">
                  <input name="caution" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {parc.length === 0 ? (
        <EtatVide
          titre="Aucune ressource"
          message="Une ressource est ce qui se loue : une bétonnière, un lot de chaises, un studio meublé. Sa grille de tarifs bascule au forfait semaine ou mois dès qu'il s'applique."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur libelle="Capacité louable" valeur={fmtEntier(capacite)} precision={`${louables.length} ressources actives`} />
            <CarteIndicateur
              libelle="Sortis aujourd'hui"
              valeur={fmtEntier(sortis)}
              precision={capacite > 0 ? `${Math.round((sortis * 100) / capacite)} % du parc` : undefined}
            />
            <CarteIndicateur
              libelle="En maintenance"
              valeur={fmtEntier(maintenance)}
              ton={maintenance > 0 ? "alerte" : "valide"}
            />
          </section>

          <Tableau>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Ressource</Th>
                <Th aligne="droite">Exemplaires</Th>
                <Th aligne="droite">Jour</Th>
                <Th aligne="droite">Semaine</Th>
                <Th aligne="droite">Mois</Th>
                <Th aligne="droite">Caution</Th>
                <Th>État</Th>
              </tr>
            </thead>
            <tbody>
              {parc.map((r) => (
                <tr key={r.id}>
                  <Td chiffres fort>{r.code}</Td>
                  <Td>
                    {r.designation}
                    <span className="block text-xs text-[var(--encre-faible)]">
                      {LIBELLE_TYPE[r.type]}
                      {r.categorie ? ` · ${r.categorie}` : ""}
                    </span>
                  </Td>
                  <Td aligne="droite" chiffres>
                    {r.quantite - r.sortis} / {r.quantite}
                    <span className="block text-xs text-[var(--encre-faible)]">libres aujourd&apos;hui</span>
                  </Td>
                  <Td aligne="droite" chiffres>{r.tarifJour === null ? "—" : fmt(r.tarifJour)}</Td>
                  <Td aligne="droite" chiffres>{r.tarifSemaine === null ? "—" : fmt(r.tarifSemaine)}</Td>
                  <Td aligne="droite" chiffres>{r.tarifMois === null ? "—" : fmt(r.tarifMois)}</Td>
                  <Td aligne="droite" chiffres>{fmt(r.caution)}</Td>
                  <Td>
                    {gerer ? (
                      <ChangerEtatRessource id={r.id} statut={r.statut} />
                    ) : (
                      <Pastille ton={r.statut === "active" ? "valide" : "alerte"}>{r.statut}</Pastille>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        </>
      )}
    </>
  );
}
