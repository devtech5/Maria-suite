"use client";

import { useState, type ReactNode } from "react";

import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import {
  ajouterPrestation,
  ajouterVoyageur,
  annulerSejour,
  enregistrerArrivee,
  enregistrerDepart,
  modifierDates,
  retirerPrestation,
  verserAcompte,
} from "@/modules/hotellerie/actions";

const MOYENS = [
  ["especes", "Espèces"],
  ["mobile_money", "Mobile money"],
  ["banque", "Banque, carte ou chèque"],
] as const;

const BOUTON = "h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50";
const BOUTON_SECONDAIRE = "h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50";

function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
      <h2 className="mb-3 text-sm font-semibold">{titre}</h2>
      {children}
    </section>
  );
}

function SelectMoyen({ name, avecCredit, defaut }: { name: string; avecCredit?: boolean; defaut?: string }) {
  return (
    <select name={name} defaultValue={defaut ?? "especes"} className={CLASSE_CHAMP}>
      {MOYENS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
      {avecCredit && <option value="credit">À crédit, sur le compte du client</option>}
    </select>
  );
}

/** Arrivée : la fiche de police d'abord, la caution s'il y en a une. */
export function PanneauArrivee({ sejourId, caution, voyageurs }: { sejourId: string; caution: number; voyageurs: number }) {
  const { resultat, enCours, lancer } = useOperation();
  return (
    <Carte titre="Arrivée du client">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const moyen = new FormData(e.currentTarget).get("moyen");
          lancer(() => enregistrerArrivee(sejourId, caution > 0 ? String(moyen) : null));
        }}
        className="flex flex-wrap items-end gap-3"
      >
        {caution > 0 && (
          <Champ libelle={`Caution à recevoir : ${fmt(caution)} F`} precision="Rendue au départ, moins une éventuelle retenue">
            <SelectMoyen name="moyen" />
          </Champ>
        )}
        <button type="submit" disabled={enCours || voyageurs === 0} className={BOUTON}>
          Installer le client
        </button>
      </form>
      {voyageurs === 0 && <p className="mt-2 text-sm text-[var(--encre-douce)]">Remplissez d&apos;abord la fiche de police ci-dessous.</p>}
      <Retour resultat={resultat} />
    </Carte>
  );
}

export function FormulairePrestation({ sejourId }: { sejourId: string }) {
  return (
    <FormulaireRepliable libelle="Porter sur la note" titre="Consommation du client" action={(d) => ajouterPrestation(sejourId, d)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Champ libelle="Désignation">
          <input name="libelle" required maxLength={120} list="prestations-courantes" placeholder="Petit-déjeuner" className={CLASSE_CHAMP} />
          <datalist id="prestations-courantes">
            {["Petit-déjeuner", "Déjeuner", "Dîner", "Boisson", "Minibar", "Blanchisserie", "Navette aéroport", "Téléphone", "Lit supplémentaire"].map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Champ>
        <Champ libelle="Nature" precision="Marchandise : boissons, minibar">
          <select name="nature" defaultValue="service" className={CLASSE_CHAMP}>
            <option value="service">Service</option>
            <option value="marchandise">Marchandise</option>
          </select>
        </Champ>
        <Champ libelle="Quantité">
          <input name="quantite" inputMode="numeric" defaultValue={1} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Prix unitaire" precision="TTC">
          <input name="prixUnitaire" required inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="TVA">
          <select name="tauxTva" defaultValue="1800" className={CLASSE_CHAMP}>
            <option value="1800">18 %</option>
            <option value="0">Exonéré</option>
          </select>
        </Champ>
      </div>
    </FormulaireRepliable>
  );
}

export function RetirerPrestation({ id }: { id: string }) {
  const { resultat, enCours, lancer } = useOperation();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={enCours}
        onClick={() => window.confirm("Retirer cette ligne de la note ?") && lancer(() => retirerPrestation(id))}
        className="text-xs font-medium text-danger-600 hover:underline disabled:opacity-50"
      >
        Retirer
      </button>
      {resultat && !resultat.ok && <Retour resultat={resultat} />}
    </span>
  );
}

export function FormulaireAcompte({ sejourId }: { sejourId: string }) {
  return (
    <FormulaireRepliable libelle="Recevoir un acompte" titre="Acompte" action={(d) => verserAcompte(sejourId, d)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Montant">
          <input name="montant" required inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Moyen">
          <SelectMoyen name="moyen" />
        </Champ>
      </div>
    </FormulaireRepliable>
  );
}

export function FormulaireDates({ sejourId, arrivee, depart, arrive }: { sejourId: string; arrivee: string; depart: string; arrive: boolean }) {
  return (
    <FormulaireRepliable libelle={arrive ? "Prolonger ou avancer le départ" : "Changer les dates"} titre="Dates du séjour" action={(d) => modifierDates(sejourId, d)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Arrivée" precision={arrive ? "Le client est arrivé : elle ne change plus" : undefined}>
          <input name="arrivee" type="date" required defaultValue={arrivee} readOnly={arrive} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Départ">
          <input name="depart" type="date" required defaultValue={depart} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
      </div>
      <p className="mt-2 text-xs text-[var(--encre-faible)]">L&apos;hébergement est recalculé ; la chambre doit être libre sur les nouvelles nuits.</p>
    </FormulaireRepliable>
  );
}

/** Départ : le reste de la note se règle, la caution se rend, la chambre part au ménage. */
export function PanneauDepart({
  sejourId,
  reste,
  caution,
  aUnCompte,
  departPrevu,
  nuitsPrevues,
  nuitsAujourdhui,
}: {
  sejourId: string;
  reste: number;
  caution: number;
  aUnCompte: boolean;
  departPrevu: string;
  nuitsPrevues: number;
  /** Nuits facturées si le client part aujourd'hui. */
  nuitsAujourdhui: number;
}) {
  const { resultat, enCours, lancer } = useOperation();
  const [retenue, setRetenue] = useState("");
  const decale = nuitsAujourdhui !== nuitsPrevues;
  return (
    <Carte titre="Départ">
      {decale && (
        <p className="mb-3 rounded-lg bg-alerte-50 px-3 py-2 text-sm text-alerte-600">
          Départ prévu le {new Date(`${departPrevu}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })} : un départ aujourd&apos;hui
          facture {nuitsAujourdhui} nuit{nuitsAujourdhui > 1 ? "s" : ""} au lieu de {nuitsPrevues}.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          if (!window.confirm("Solder la note et libérer la chambre ?")) return;
          lancer(() =>
            enregistrerDepart(sejourId, {
              moyen: d.get("moyen") ? String(d.get("moyen")) : null,
              etat: String(d.get("etat") ?? "bon"),
              retenue: retenue.trim() === "" ? 0 : Number(retenue.replace(/[\s  ]/g, "")),
            }),
          );
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Champ libelle={reste < 0 ? "Moyen pour rendre le trop-perçu" : "Moyen de règlement du solde"} precision={decale ? "Le solde exact s'affiche après le départ" : `Solde actuel : ${fmt(reste)} F`}>
          <SelectMoyen name="moyen" avecCredit={aUnCompte && reste > 0} />
        </Champ>
        {caution > 0 && (
          <>
            <Champ libelle="État de la chambre">
              <select name="etat" defaultValue="bon" className={CLASSE_CHAMP}>
                <option value="bon">Bon état</option>
                <option value="endommage">Endommagée</option>
                <option value="perdu">Équipement manquant</option>
              </select>
            </Champ>
            <Champ libelle="Retenue sur la caution" precision={`Caution de ${fmt(caution)} F ; vide : rendue en entier`}>
              <input value={retenue} onChange={(e) => setRetenue(e.target.value)} inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
          </>
        )}
        <div className="flex items-end">
          <button type="submit" disabled={enCours} className={BOUTON}>
            Solder et libérer la chambre
          </button>
        </div>
      </form>
      <Retour resultat={resultat} />
    </Carte>
  );
}

export function PanneauAnnulation({ sejourId, acomptes }: { sejourId: string; acomptes: number }) {
  const { resultat, enCours, lancer } = useOperation();
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={BOUTON_SECONDAIRE}>
        Annuler la réservation
      </button>
    );
  }
  return (
    <Carte titre="Annuler la réservation">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          lancer(() => annulerSejour(sejourId, String(d.get("motif") ?? ""), acomptes > 0 ? String(d.get("sort")) : null));
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Champ libelle="Motif">
          <input name="motif" required minLength={3} maxLength={200} placeholder="Client absent, vol annulé…" className={CLASSE_CHAMP} />
        </Champ>
        {acomptes > 0 && (
          <Champ libelle={`Acomptes reçus : ${fmt(acomptes)} F`}>
            <select name="sort" defaultValue="especes" className={CLASSE_CHAMP}>
              {MOYENS.map(([v, l]) => (
                <option key={v} value={v}>
                  Rendre — {l}
                </option>
              ))}
              <option value="conserver">Conserver (dédit)</option>
            </select>
          </Champ>
        )}
        <div className="flex items-end gap-2">
          <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
            Confirmer l&apos;annulation
          </button>
          <button type="button" onClick={() => setOuvert(false)} className={BOUTON_SECONDAIRE}>
            Retour
          </button>
        </div>
      </form>
      <Retour resultat={resultat} />
    </Carte>
  );
}

/** Fiche de police : identité, pièce, provenance et destination. */
export function FormulaireVoyageur({ sejourId, premier }: { sejourId: string; premier: boolean }) {
  return (
    <FormulaireRepliable libelle={premier ? "Remplir la fiche de police" : "Ajouter un voyageur"} titre="Fiche de police" presentation="tiroir" action={(d) => ajouterVoyageur(sejourId, d)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Nom">
          <input name="nom" required maxLength={80} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Prénoms">
          <input name="prenoms" maxLength={120} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Né(e) le">
          <input name="dateNaissance" type="date" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="À">
          <input name="lieuNaissance" maxLength={80} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Nationalité">
          <input name="nationalite" required maxLength={60} list="nationalites" className={CLASSE_CHAMP} />
          <datalist id="nationalites">
            {["Ivoirienne", "Burkinabè", "Malienne", "Guinéenne", "Sénégalaise", "Ghanéenne", "Nigériane", "Togolaise", "Béninoise", "Française"].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Champ>
        <Champ libelle="Profession">
          <input name="profession" maxLength={80} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Domicile habituel">
          <input name="domicile" maxLength={160} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Téléphone">
          <input name="telephone" type="tel" maxLength={30} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Pièce d'identité">
          <input name="pieceNature" required maxLength={60} list="pieces" placeholder="CNI, passeport…" className={CLASSE_CHAMP} />
          <datalist id="pieces">
            {["CNI", "Passeport", "Carte consulaire", "Permis de conduire", "Attestation d'identité", "Carte de séjour"].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Champ>
        <Champ libelle="Numéro de la pièce">
          <input name="pieceNumero" required maxLength={60} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Délivrée le">
          <input name="pieceDelivreeLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Venant de">
            <input name="provenance" maxLength={80} className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Allant à">
            <input name="destination" maxLength={80} className={CLASSE_CHAMP} />
          </Champ>
        </div>
      </div>
    </FormulaireRepliable>
  );
}
