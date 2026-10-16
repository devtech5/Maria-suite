import type { Metadata } from "next";

import {
  CarteIndicateur,
  Champ,
  CLASSE_CHAMP,
  EnTetePage,
  EtatVide,
  Pastille,
  type TonPastille,
} from "@/components/ui/primitives";
import { FormulaireRepliable } from "@/components/ui/operations";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier } from "@/lib/format";
import { programmerDepart } from "@/modules/billetterie/actions";
import { capacite, formaterDuree, tauxRemplissage } from "@/modules/billetterie/calcul";
import { listerDeparts, listerLignes } from "@/modules/billetterie/requetes";
import type { StatutDepart } from "@/modules/billetterie/schema";

import { ActionsDepart } from "./outils";

export const metadata: Metadata = { title: "Départs" };

const TON: Record<StatutDepart | "complet", TonPastille> = {
  ouvert: "valide",
  complet: "alerte",
  embarquement: "marque",
  parti: "neutre",
  annule: "danger",
};

const LIBELLE: Record<StatutDepart | "complet", string> = {
  ouvert: "Ouvert",
  complet: "Complet",
  embarquement: "Embarquement",
  parti: "Parti",
  annule: "Annulé",
};

// Abidjan vit en UTC toute l'année : l'heure affichée est celle de la gare.
const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * Départs programmés : remplissage, recette, et le geste qui fait avancer
 * chaque départ — embarquement, départ, annulation.
 */
export default async function PageDeparts() {
  const session = await exigerEntreprise();
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);

  const [departs, lignes, gerer, annuler] = await Promise.all([
    listerDeparts(session.organizationId, debutJour),
    listerLignes(session.organizationId),
    peut("billetterie.depart.gerer"),
    peut("billetterie.billet.annuler"),
  ]);

  const finJour = new Date(debutJour.getTime() + 24 * 3600 * 1000);
  const duJour = departs.filter((d) => d.partLe < finJour && d.statut !== "annule");
  const vendusJour = duJour.reduce((s, d) => s + d.vendus, 0);
  const offertesJour = duJour.reduce((s, d) => s + capacite(d.rangees), 0);
  const recetteJour = duJour.reduce((s, d) => s + d.recette, 0);

  const parJour = new Map<string, typeof departs>();
  for (const d of departs) {
    const cle = d.partLe.toISOString().slice(0, 10);
    parJour.set(cle, [...(parJour.get(cle) ?? []), d]);
  }

  const demain = new Date(debutJour.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const lignesActives = lignes.filter((l) => l.active);

  return (
    <>
      <EnTetePage
        titre="Départs"
        sousTitre="Remplissage et recette des cars programmés"
        actions={
          gerer && lignesActives.length > 0 ? (
            <FormulaireRepliable libelle="Programmer un départ" titre="Programmer un départ" action={programmerDepart}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Champ libelle="Ligne">
                  <select name="ligneId" required className={CLASSE_CHAMP}>
                    {lignesActives.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.depart} → {l.arrivee} · {fmt(l.tarif)} F
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Date">
                  <input name="date" type="date" required defaultValue={demain} className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Heure">
                  <input name="heure" type="time" required defaultValue="07:00" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Véhicule">
                  <input name="vehicule" required placeholder="Car 60 — 4521 AB 01" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Rangées" precision="Quatre sièges par rangée : 15 pour un car de 60.">
                  <input name="rangees" type="number" min={1} max={30} defaultValue={15} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {departs.length === 0 ? (
        <EtatVide
          titre="Aucun départ programmé"
          message={
            lignesActives.length === 0
              ? "Ouvrez d'abord une ligne dans l'onglet Lignes : un trajet, sa durée et son tarif."
              : "Programmez un départ : une ligne, une date, une heure, un véhicule. Ses sièges se vendent au plan."
          }
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Départs du jour"
              valeur={fmtEntier(duJour.length)}
              precision={`${departs.length - duJour.length} programmés ensuite`}
            />
            <CarteIndicateur
              libelle="Places vendues aujourd'hui"
              valeur={fmtEntier(vendusJour)}
              precision={`Sur ${fmtEntier(offertesJour)} offertes`}
            />
            <CarteIndicateur
              libelle="Taux de remplissage"
              valeur={offertesJour > 0 ? `${Math.round((vendusJour / offertesJour) * 100)}` : "—"}
              unite={offertesJour > 0 ? "%" : undefined}
              ton={offertesJour > 0 && vendusJour / offertesJour > 0.7 ? "valide" : "alerte"}
            />
            <CarteIndicateur libelle="Recette du jour" valeur={fmtCompact(recetteJour)} unite="FCFA" ton="valide" />
          </section>

          {[...parJour.entries()].map(([jour, liste]) => (
            <section key={jour} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-[var(--encre-douce)] first-letter:uppercase">
                {JOUR.format(new Date(`${jour}T12:00:00Z`))}
              </h2>
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {liste.map((depart) => {
                  const places = capacite(depart.rangees);
                  const taux = tauxRemplissage(depart.vendus, depart.rangees);
                  const libres = places - depart.vendus;
                  const etat = depart.statut === "ouvert" && libres === 0 ? "complet" : depart.statut;

                  return (
                    <li key={depart.id} className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="chiffres text-xs text-[var(--encre-faible)]">
                            {depart.reference} · {depart.codeLigne}
                          </p>
                          <p className="text-sm font-semibold">
                            {depart.villeDepart} → {depart.villeArrivee}
                          </p>
                        </div>
                        <Pastille ton={TON[etat]}>{LIBELLE[etat]}</Pastille>
                      </div>

                      <p className="chiffres mt-1.5 text-xs text-[var(--encre-douce)]">
                        {HEURE.format(depart.partLe)} · {formaterDuree(depart.dureeMinutes)} · {depart.vehicule} ·{" "}
                        {fmt(depart.tarif)} F la place
                      </p>

                      <div className="mt-3">
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="text-[var(--encre-faible)]">
                            {depart.vendus} / {places} places
                            {depart.statut === "embarquement" && ` · ${depart.embarques} à bord`}
                          </span>
                          <span className="chiffres font-semibold">{taux} %</span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-creuse)]"
                          role="progressbar"
                          aria-valuenow={taux}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Remplissage du départ ${depart.reference}`}
                        >
                          <div
                            className={`h-full rounded-full ${taux >= 90 ? "bg-alerte-500" : "bg-marque-600"}`}
                            style={{ width: `${taux}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
                        <span className="text-[var(--encre-faible)]">
                          {depart.statut === "parti"
                            ? "Départ effectué"
                            : depart.statut === "annule"
                              ? `Annulé : ${depart.motif ?? ""}`
                              : `${libres} place${libres > 1 ? "s" : ""} libre${libres > 1 ? "s" : ""}`}
                        </span>
                        <span className="chiffres ml-auto font-semibold">{fmt(depart.recette)} FCFA</span>
                      </div>

                      <ActionsDepart id={depart.id} statut={depart.statut} gerer={gerer} annuler={annuler} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
