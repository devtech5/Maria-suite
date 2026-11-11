"use client";

import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { LONGUEURS, PIECES_IDENTITE } from "@/modules/visiteurs/regles";

import { PrisePhoto } from "@/components/ui/prise-photo";

export interface ValeursVisite {
  nom?: string;
  telephone?: string | null;
  societe?: string | null;
  motif?: string;
  typePiece?: string | null;
  numeroPiece?: string | null;
  visiteUserId?: string | null;
  visiteLibelle?: string | null;
}

/**
 * Les champs d'une visite : qui vient, pour qui, pourquoi ; la pièce
 * d'identité et ses photos à l'arrivée (`arrivee`), pas à l'annonce.
 */
export function ChampsVisite({
  personnes,
  valeurs = {},
  arrivee,
  pieceExigee = true,
}: {
  personnes: { id: string; nom: string }[];
  valeurs?: ValeursVisite;
  arrivee: boolean;
  pieceExigee?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Nom et prénoms">
          <input name="nom" required maxLength={LONGUEURS.nom} defaultValue={valeurs.nom ?? ""} autoComplete="off" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Téléphone" precision={arrivee ? undefined : "Pour lui envoyer son QR d'entrée par WhatsApp."}>
          <input name="telephone" type="tel" maxLength={LONGUEURS.telephone} defaultValue={valeurs.telephone ?? ""} placeholder="07 07 12 34 56" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Société (facultatif)">
          <input name="societe" maxLength={LONGUEURS.societe} defaultValue={valeurs.societe ?? ""} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Motif de la visite">
          <input name="motif" required maxLength={LONGUEURS.motif} defaultValue={valeurs.motif ?? ""} placeholder="Rendez-vous, livraison, entretien…" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Personne visitée">
          <select name="visiteUserId" defaultValue={valeurs.visiteUserId ?? ""} className={CLASSE_CHAMP}>
            <option value="">— Aucune, ou hors de la liste —</option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Service ou personne (sans compte)">
          <input name="visiteLibelle" maxLength={120} defaultValue={valeurs.visiteLibelle ?? ""} placeholder="Direction technique, chef de chantier…" className={CLASSE_CHAMP} />
        </Champ>
      </div>

      {arrivee && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ libelle={pieceExigee ? "Pièce d'identité" : "Pièce d'identité (facultative ici)"}>
              <select name="typePiece" required={pieceExigee} defaultValue={valeurs.typePiece ?? "cni"} className={CLASSE_CHAMP}>
                {!pieceExigee && <option value="">— Aucune —</option>}
                {Object.entries(PIECES_IDENTITE).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Numéro de la pièce">
              <input name="numeroPiece" required={pieceExigee} maxLength={LONGUEURS.numeroPiece} defaultValue={valeurs.numeroPiece ?? ""} autoComplete="off" className={`${CLASSE_CHAMP} uppercase`} />
            </Champ>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <PrisePhoto nom="photo_recto" libelle="Pièce — recto" />
            <PrisePhoto nom="photo_verso" libelle="Pièce — verso" />
            <PrisePhoto nom="photo_visiteur" libelle="Visiteur (facultatif)" />
          </div>
          <p className="text-xs text-[var(--encre-faible)]">
            Données personnelles : les photos s&apos;effacent d&apos;elles-mêmes trois mois après la visite. Le registre (nom, heures, motif) reste.
          </p>
        </>
      )}
    </div>
  );
}
