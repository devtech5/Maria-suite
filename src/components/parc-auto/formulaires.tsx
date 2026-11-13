"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { creerVehicule, enregistrerPlein, modifierVehicule, retirerPlein } from "@/modules/parc-auto/actions";
import { ENERGIES, USAGES } from "@/modules/parc-auto/calcul";
import { Fenetre } from "@/components/ui/fenetre";

export interface OptionConducteur {
  id: string;
  nom: string;
  matricule: string;
}

export interface FicheVehiculeAffichee {
  immatriculation: string;
  marque: string | null;
  modele: string | null;
  annee: number | null;
  energie: string | null;
  numeroChassis: string | null;
  numeroCarteGrise: string | null;
  puissanceFiscale: number | null;
  places: number | null;
  couleur: string | null;
  reservoirLitres: number | null;
  usage: string | null;
  conducteurId: string | null;
}

const VIDE: FicheVehiculeAffichee = {
  immatriculation: "",
  marque: null,
  modele: null,
  annee: null,
  energie: null,
  numeroChassis: null,
  numeroCarteGrise: null,
  puissanceFiscale: null,
  places: null,
  couleur: null,
  reservoirLitres: null,
  usage: null,
  conducteurId: null,
};

/** Champs de la carte grise et du conducteur, communs à l'ouverture et à la fiche. */
function ChampsVehicule({ initial, conducteurs }: { initial: FicheVehiculeAffichee; conducteurs: OptionConducteur[] }) {
  const v = (x: string | number | null) => (x ?? "").toString();
  return (
    <>
      <Champ libelle="Immatriculation">
        <input name="immatriculation" required defaultValue={initial.immatriculation} placeholder="1234 FX 01" className={`${CLASSE_CHAMP} chiffres uppercase`} />
      </Champ>
      <Champ libelle="Marque">
        <input name="marque" defaultValue={v(initial.marque)} placeholder="Toyota" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Modèle">
        <input name="modele" defaultValue={v(initial.modele)} placeholder="Hilux" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Énergie">
        <select name="energie" defaultValue={v(initial.energie)} className={CLASSE_CHAMP}>
          <option value="">—</option>
          {Object.entries(ENERGIES).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Année">
        <input name="annee" inputMode="numeric" defaultValue={v(initial.annee)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Conducteur attitré">
        <select name="conducteurId" defaultValue={v(initial.conducteurId)} className={CLASSE_CHAMP}>
          <option value="">Aucun</option>
          {conducteurs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} ({c.matricule})
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="N° de carte grise">
        <input name="numeroCarteGrise" defaultValue={v(initial.numeroCarteGrise)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="N° de châssis">
        <input name="numeroChassis" defaultValue={v(initial.numeroChassis)} className={`${CLASSE_CHAMP} chiffres uppercase`} />
      </Champ>
      <Champ libelle="Puissance fiscale (CV)">
        <input name="puissanceFiscale" inputMode="numeric" defaultValue={v(initial.puissanceFiscale)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Places">
        <input name="places" inputMode="numeric" defaultValue={v(initial.places)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Réservoir (litres)" precision="Borne la saisie d'un plein.">
        <input name="reservoirLitres" inputMode="numeric" defaultValue={v(initial.reservoirLitres)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Couleur">
        <input name="couleur" defaultValue={v(initial.couleur)} className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Usage">
        <select name="usage" defaultValue={v(initial.usage)} className={CLASSE_CHAMP}>
          <option value="">—</option>
          {USAGES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </Champ>
    </>
  );
}

/** Ouverture d'un véhicule, papiers en main : carte grise, kilométrage, échéances. */
export function FormulaireNouveauVehicule({ conducteurs }: { conducteurs: OptionConducteur[] }) {
  const [ouvert, setOuvert] = useState(false);
  const formulaire = useRef<HTMLFormElement>(null);
  const op = useOperation();

  return (
    <>
      <div className="flex items-center gap-3">
        {op.resultat?.ok && <span className="text-sm text-valide-600">{op.resultat.message}</span>}
        <button type="button" onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600">
          Nouveau véhicule
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouveau véhicule" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          ref={formulaire}
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            op.lancer(
              () => creerVehicule(donnees),
              () => {
                formulaire.current?.reset();
                setOuvert(false);
              },
            );
          }}
          className="space-y-4 px-5 py-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ChampsVehicule initial={VIDE} conducteurs={conducteurs} />
            <Champ libelle="Kilométrage actuel">
              <input name="kilometrage" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Date d'acquisition">
              <input name="dateAcquisition" type="date" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Valeur d'acquisition (FCFA)">
              <input name="valeurAcquisition" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Site">
              <input name="site" placeholder="Abidjan" className={CLASSE_CHAMP} />
            </Champ>
          </div>
          <fieldset className="border-t border-[var(--filet)] pt-4">
            <legend className="mb-3 text-sm font-semibold">Échéances <span className="font-normal text-[var(--encre-faible)]">— facultatives, une alerte prévient 30 jours avant</span></legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Champ libelle="Assurance valable jusqu'au">
                <input name="assuranceLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <Champ libelle="Visite technique jusqu'au">
                <input name="visiteLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <Champ libelle="Vignette jusqu'au">
                <input name="vignetteLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
            </div>
          </fieldset>
          <div className="flex items-center justify-end gap-3">
            <Retour resultat={op.resultat && !op.resultat.ok ? op.resultat : null} />
            <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
              {op.enCours ? "Enregistrement…" : "Ouvrir le véhicule"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}

/** Fiche du véhicule, modifiable. */
export function FormulaireFicheVehicule({ actifId, initial, conducteurs }: { actifId: string; initial: FicheVehiculeAffichee; conducteurs: OptionConducteur[] }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => modifierVehicule(actifId, donnees));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ChampsVehicule initial={initial} conducteurs={conducteurs} />
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

export interface OptionVehicule {
  id: string;
  libelle: string;
  conducteurId: string | null;
  kilometrage: number | null;
}

/** Saisie d'un plein : le geste du conducteur à la pompe, ticket en main. */
export function FormulairePlein({ vehicules, conducteurs, fixe = false }: { vehicules: OptionVehicule[]; conducteurs: OptionConducteur[]; fixe?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [actifId, setActifId] = useState(vehicules[0]?.id ?? "");
  const formulaire = useRef<HTMLFormElement>(null);
  const op = useOperation();
  const vehicule = vehicules.find((v) => v.id === actifId);

  return (
    <>
      <div className="flex items-center gap-3">
        {op.resultat?.ok && <span className="text-sm text-valide-600">{op.resultat.message}</span>}
        <button
          type="button"
          disabled={vehicules.length === 0}
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600 disabled:opacity-50"
        >
          Noter un plein
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Plein de carburant" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          ref={formulaire}
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            op.lancer(
              () => enregistrerPlein(donnees),
              () => {
                formulaire.current?.reset();
                setOuvert(false);
              },
            );
          }}
          className="space-y-4 px-5 py-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fixe ? (
              <input type="hidden" name="actifId" value={actifId} />
            ) : (
              <Champ libelle="Véhicule">
                <select name="actifId" value={actifId} onChange={(e) => setActifId(e.target.value)} className={CLASSE_CHAMP}>
                  {vehicules.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.libelle}
                    </option>
                  ))}
                </select>
              </Champ>
            )}
            <Champ libelle="Date">
              <input name="faitLe" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Volume (litres)">
              <input name="volume" required inputMode="decimal" placeholder="42,5" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Montant payé (FCFA)">
              <input name="montant" required inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Kilométrage au compteur" precision={vehicule?.kilometrage != null ? `Dernier relevé : ${vehicule.kilometrage.toLocaleString("fr-FR")} km` : undefined}>
              <input name="kilometrage" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
            <Champ libelle="Conducteur">
              <select key={actifId} name="conducteurId" defaultValue={vehicule?.conducteurId ?? ""} className={CLASSE_CHAMP}>
                <option value="">—</option>
                {conducteurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Station">
              <input name="station" placeholder="Total Plateau" className={CLASSE_CHAMP} />
            </Champ>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input name="complet" type="checkbox" defaultChecked className="size-4" />
              Réservoir rempli à ras
            </label>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Retour resultat={op.resultat && !op.resultat.ok ? op.resultat : null} />
            <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
              {op.enCours ? "Enregistrement…" : "Enregistrer le plein"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}

/** Bouton de retrait d'un plein saisi par erreur. */
export function RetirerPlein({ id }: { id: string }) {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const routeur = useRouter();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          if (!window.confirm("Retirer ce plein ? Le relevé de compteur qu'il a posé reste.")) return;
          demarrer(async () => {
            const r = await retirerPlein(id);
            setResultat(r.ok ? null : r);
            if (r.ok) routeur.refresh();
          });
        }}
        className="text-xs text-danger-600 hover:underline"
      >
        Retirer
      </button>
      {resultat && <span className="text-xs text-danger-600">{resultat.message}</span>}
    </span>
  );
}
