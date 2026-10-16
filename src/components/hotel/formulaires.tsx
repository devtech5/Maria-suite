"use client";

import { useState } from "react";

import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { creerChambre, mettreEnService, reglerChambre, reglerMenage, reserverSejour } from "@/modules/hotellerie/actions";

const CLASSE_LIEN = "font-medium text-marque-600 hover:underline disabled:opacity-50";

export function FormulaireChambre() {
  return (
    <FormulaireRepliable libelle="Ajouter une chambre" titre="Nouvelle chambre" presentation="tiroir" action={creerChambre}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Numéro" precision="Celui de la porte">
          <input name="numero" required maxLength={20} placeholder="101" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Type" precision="Facultatif">
          <input name="categorie" maxLength={60} placeholder="Climatisée, suite, studio…" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Étage" precision="Facultatif">
          <input name="etage" maxLength={30} placeholder="1er" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Capacité" precision="Personnes, enfants compris">
          <input name="capacite" inputMode="numeric" defaultValue={2} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Prix de la nuit" precision="TTC, en francs">
          <input name="tarifNuit" inputMode="numeric" placeholder="25 000" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Prix de la semaine" precision="Facultatif : forfait 7 nuits">
          <input name="tarifSemaine" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Prix du mois" precision="Facultatif : résidence, 30 nuits">
          <input name="tarifMois" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Caution" precision="Résidence : versée à l'arrivée, rendue au départ">
          <input name="caution" inputMode="numeric" placeholder="0" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
      </div>
    </FormulaireRepliable>
  );
}

/** Le geste du ménage : chambre faite, ou à refaire. */
export function BoutonMenage({ ressourceId, menage }: { ressourceId: string; menage: "propre" | "a_faire" }) {
  const { resultat, enCours, lancer } = useOperation();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={enCours}
        onClick={() => lancer(() => reglerMenage(ressourceId, menage === "propre" ? "a_faire" : "propre"))}
        className={menage === "a_faire"
          ? "h-9 rounded-lg bg-valide-600 px-3 text-xs font-semibold text-white hover:bg-valide-500 disabled:opacity-50"
          : `text-xs ${CLASSE_LIEN}`}
      >
        {menage === "a_faire" ? "Chambre faite" : "À refaire"}
      </button>
      {resultat && !resultat.ok && <Retour resultat={resultat} />}
    </span>
  );
}

export function ReglageChambre({ ressourceId, enService, etage, capacite }: { ressourceId: string; enService: boolean; etage: string | null; capacite: number }) {
  const { resultat, enCours, lancer } = useOperation();
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <div className="flex gap-3">
        <button type="button" onClick={() => setOuvert(!ouvert)} className={CLASSE_LIEN}>
          Régler
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => {
            if (enService && !window.confirm("La chambre ne pourra plus être réservée. Continuer ?")) return;
            lancer(() => mettreEnService(ressourceId, !enService));
          }}
          className={CLASSE_LIEN}
        >
          {enService ? "Mettre hors service" : "Remettre en service"}
        </button>
      </div>
      {ouvert && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            lancer(() => reglerChambre(ressourceId, donnees), () => setOuvert(false));
          }}
          className="flex items-end gap-2"
        >
          <label className="text-left">
            <span className="block text-[var(--encre-faible)]">Étage</span>
            <input name="etage" defaultValue={etage ?? ""} maxLength={30} className="h-9 w-20 rounded-md border border-[var(--filet)] bg-[var(--surface)] px-2" />
          </label>
          <label className="text-left">
            <span className="block text-[var(--encre-faible)]">Capacité</span>
            <input name="capacite" defaultValue={capacite} inputMode="numeric" className="chiffres h-9 w-16 rounded-md border border-[var(--filet)] bg-[var(--surface)] px-2" />
          </label>
          <button type="submit" disabled={enCours} className="h-9 rounded-md bg-marque-600 px-3 font-semibold text-white disabled:opacity-50">
            OK
          </button>
        </form>
      )}
      {resultat && !resultat.ok && <Retour resultat={resultat} />}
    </div>
  );
}

export interface ChambreReservable {
  id: string;
  code: string;
  libelle: string;
  capacite: number;
}

/** Réservation : chambre, dates, personnes, et un client existant ou créé sur place. */
export function FormulaireSejour({
  chambres,
  clients,
  aujourdHui,
  demain,
}: {
  chambres: ChambreReservable[];
  clients: { id: string; nom: string }[];
  aujourdHui: string;
  demain: string;
}) {
  const [client, setClient] = useState(clients.length > 0 ? "" : "nouveau");
  return (
    <FormulaireRepliable libelle="Nouvelle réservation" titre="Réserver une chambre" presentation="tiroir" action={reserverSejour} desactive={chambres.length === 0}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Chambre">
          <select name="ressourceId" required className={CLASSE_CHAMP}>
            {chambres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.libelle} ({c.capacite} pers.)
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Arrivée">
          <input name="arrivee" type="date" required defaultValue={aujourdHui} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Départ" precision="Jour où la chambre se libère">
          <input name="depart" type="date" required defaultValue={demain} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Adultes">
            <input name="adultes" inputMode="numeric" defaultValue={1} className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
          <Champ libelle="Enfants">
            <input name="enfants" inputMode="numeric" defaultValue={0} className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
        </div>
        <Champ libelle="Client">
          <select name="clientId" value={client} onChange={(e) => setClient(e.target.value)} required className={CLASSE_CHAMP}>
            <option value="" disabled>
              Choisir…
            </option>
            <option value="nouveau">+ Nouveau client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>
        {client === "nouveau" && (
          <>
            <Champ libelle="Nom du client">
              <input name="nouveauClient" required maxLength={120} placeholder="Ama Kouassi" className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Téléphone" precision="Facultatif">
              <input name="telephone" type="tel" maxLength={30} className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
          </>
        )}
        <Champ libelle="Tarif négocié" precision="Par nuit ; vide : la grille de la chambre">
          <input name="prixNuit" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Note" precision="Facultatif">
          <input name="notes" maxLength={300} placeholder="Arrivée tardive, lit bébé…" className={CLASSE_CHAMP} />
        </Champ>
      </div>
    </FormulaireRepliable>
  );
}
