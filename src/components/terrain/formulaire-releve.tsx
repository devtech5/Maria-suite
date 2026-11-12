"use client";

import { useState } from "react";

import { FormulaireRepliable } from "@/components/ui/operations";
import { PrisePhoto } from "@/components/ui/prise-photo";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { enregistrerReleve } from "@/modules/projets/terrain-actions";
import { PREUVES_MAX, libellePosition, enMicroDegres } from "@/modules/projets/terrain-regles";

export interface ChoixMembre {
  id: string;
  nom: string;
  detail: string;
}

interface PositionRelevee {
  latitude: number;
  longitude: number;
  precision: number;
  prise: string;
}

/**
 * Nouveau relevé de terrain, dans une modale centrée : ce que l'agent a
 * constaté ou fait, son avancement, et surtout les PREUVES — une ou deux
 * photos prises sur place, des captures d'écran, et la position GPS relevée
 * par l'appareil. Sans position ni preuve, le serveur refuse : c'est la
 * traçabilité.
 */
export function FormulaireReleve({ projetId, membres, parDefaut }: { projetId: string; membres: ChoixMembre[]; parDefaut: string }) {
  return (
    <FormulaireRepliable libelle="Nouveau relevé" titre="Nouveau relevé de terrain" action={(d) => enregistrerReleve(projetId, d)} presentation="ample">
      <ChampsReleve membres={membres} parDefaut={parDefaut} />
    </FormulaireRepliable>
  );
}

function ChampsReleve({ membres, parDefaut }: { membres: ChoixMembre[]; parDefaut: string }) {
  const [position, setPosition] = useState<PositionRelevee | null>(null);
  const [etat, setEtat] = useState<"attente" | "recherche" | "refus" | "indisponible">("attente");

  /** Une seule demande à la fois : le navigateur demande l'autorisation, et rend la position avec sa précision. */
  const releverPosition = () => {
    if (!navigator.geolocation) {
      setEtat("indisponible");
      return;
    }
    setEtat("recherche");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ latitude: p.coords.latitude, longitude: p.coords.longitude, precision: p.coords.accuracy, prise: new Date(p.timestamp).toISOString() });
        setEtat("attente");
      },
      (e) => setEtat(e.code === e.PERMISSION_DENIED ? "refus" : "indisponible"),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-4">
      {membres.length > 1 && (
        <Champ libelle="Relevé pour" precision="Pour un externe, qui n'a pas de compte, vous relevez à sa place : les deux noms sont gardés.">
          <select name="membreId" defaultValue={parDefaut} className={CLASSE_CHAMP}>
            {membres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom} — {m.detail}
              </option>
            ))}
          </select>
        </Champ>
      )}

      <Champ libelle="Titre du relevé">
        <input name="libelle" required minLength={3} maxLength={200} placeholder="Fondations bloc B coulées" className={CLASSE_CHAMP} />
      </Champ>

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Champ libelle="Ce qui a été constaté ou fait">
          <textarea name="note" rows={3} maxLength={2000} className={`${CLASSE_CHAMP} h-auto py-2`} />
        </Champ>
        <Champ libelle="Avancement" precision="Pourcentage, facultatif.">
          <input name="avancement" inputMode="numeric" placeholder="40" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
      </div>

      <fieldset className="rounded-xl border border-[var(--filet)] p-3">
        <legend className="px-1 text-sm font-medium">Position GPS</legend>
        <input type="hidden" name="latitude" value={position?.latitude ?? ""} />
        <input type="hidden" name="longitude" value={position?.longitude ?? ""} />
        <input type="hidden" name="precision" value={position ? Math.round(position.precision) : ""} />
        <input type="hidden" name="priseLe" value={position?.prise ?? ""} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={releverPosition} disabled={etat === "recherche"} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50">
            {etat === "recherche" ? "Recherche du signal…" : position ? "Relever à nouveau" : "Relever ma position"}
          </button>
          {position ? (
            <span className="text-sm text-valide-600">
              <span className="chiffres font-semibold">{libellePosition(enMicroDegres(position.latitude), enMicroDegres(position.longitude))}</span> · précision {Math.round(position.precision)} m
            </span>
          ) : (
            <span className="text-sm text-danger-600">
              {etat === "refus"
                ? "Autorisation refusée : autorisez la localisation dans le navigateur."
                : etat === "indisponible"
                  ? "Position introuvable : sortez à l'air libre ou activez le GPS."
                  : "Position non relevée — elle est exigée."}
            </span>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-[var(--filet)] p-3">
        <legend className="px-1 text-sm font-medium">Preuves — au moins une photo ou une capture</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <PrisePhoto nom="photo" libelle="Photo prise sur place" />
          <PrisePhoto nom="photo" libelle="Seconde photo (facultative)" />
        </div>
        <label className="mt-3 block rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface-creuse)] p-3 text-sm">
          <span className="font-medium">Captures d&apos;écran</span>
          <span className="block text-xs text-[var(--encre-faible)]">Un relevé de compteur, un message, un plan… {PREUVES_MAX} preuves au plus en tout.</span>
          <input name="capture" type="file" accept="image/png,image/jpeg,image/webp" multiple className="mt-2 block w-full text-sm" />
        </label>
      </fieldset>
    </div>
  );
}
