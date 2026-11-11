"use client";

import { useState, useTransition } from "react";

import { PrisePhoto } from "@/components/ui/prise-photo";
import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { accuserReception, expedierPli, joindrePiece, ouvrirPiece, remettrePli, traiterPli } from "@/modules/courrier/actions";

const BOUTON = "h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50";

export function AccuserReception({ id }: { id: string }) {
  const op = useOperation();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => accuserReception(id))} className={BOUTON}>
        Accuser réception
      </button>
      <Retour resultat={op.resultat} />
    </div>
  );
}

/** Traiter un courrier arrivé : la réponse partie, ou une note de classement. */
export function Traiter({ id, departs }: { id: string; departs: { id: string; numero: string; correspondant: string }[] }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => traiterPli(id, d));
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Réponse partie (facultatif)">
          <select name="reponsePliId" defaultValue="" className={CLASSE_CHAMP}>
            <option value="">— Aucune, classé —</option>
            {departs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.numero} · {d.correspondant}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Note">
          <input name="note" maxLength={1000} placeholder="Réponse envoyée, dossier transmis, sans suite…" className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className={BOUTON}>
          Marquer traité
        </button>
      </div>
    </form>
  );
}

export function Expedier({ id }: { id: string }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => expedierPli(id, d));
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Transporteur ou coursier">
          <input name="transporteur" maxLength={80} placeholder="DHL, La Poste, coursier interne…" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Numéro de suivi (facultatif)">
          <input name="numeroSuivi" maxLength={80} className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className={BOUTON}>
          Enregistrer l&apos;expédition
        </button>
      </div>
    </form>
  );
}

export function Remettre({ id }: { id: string }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => remettrePli(id, d));
      }}
      className="space-y-3"
    >
      <Champ libelle="Reçu par (nom sur la décharge)">
        <input name="dechargeNom" required maxLength={120} className={CLASSE_CHAMP} />
      </Champ>
      <div className="grid gap-3 sm:grid-cols-2">
        <PrisePhoto nom="decharge_photo" libelle="Photographier la décharge signée" />
        <div className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface-creuse)] p-3">
          <p className="text-sm font-medium">Ou joindre un fichier</p>
          <input name="decharge" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className={BOUTON}>
          Enregistrer la remise
        </button>
      </div>
    </form>
  );
}

/** Ouvre le scan ou la décharge par une adresse signée de deux minutes ; ou les joint s'ils manquent. */
export function Piece({ id, piece, presente, joindre }: { id: string; piece: "scan" | "decharge"; presente: boolean; joindre: boolean }) {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [ajout, setAjout] = useState(false);
  const op = useOperation();
  const libelle = piece === "scan" ? "le scan" : "la décharge";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presente && (
          <button
            type="button"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const url = await ouvrirPiece(id, piece);
                if (url) window.open(url, "_blank", "noopener");
                else setResultat({ ok: false, message: "Pièce indisponible." });
              })
            }
            className="h-9 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
          >
            Ouvrir {libelle}
          </button>
        )}
        {joindre && !ajout && (
          <button type="button" onClick={() => setAjout(true)} className="h-9 rounded-lg px-3 text-sm font-semibold text-marque-600 hover:underline">
            {presente ? `Remplacer ${libelle}` : `Joindre ${libelle}`}
          </button>
        )}
      </div>
      {ajout && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            op.lancer(() => joindrePiece(id, piece, d), () => setAjout(false));
          }}
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <PrisePhoto nom={`${piece}_photo`} libelle="Par la caméra" />
          <input name={piece} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          <button type="submit" disabled={op.enCours} className={BOUTON}>
            Joindre
          </button>
        </form>
      )}
      <Retour resultat={resultat ?? op.resultat} />
    </div>
  );
}
