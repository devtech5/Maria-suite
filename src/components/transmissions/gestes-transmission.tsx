"use client";

import { useState } from "react";

import { BoutonApercu } from "@/components/ui/apercu";
import { PrisePhoto } from "@/components/ui/prise-photo";
import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { accuser, annuler, joindrePreuve, ouvrirPreuve, recevoir, traiter, transmettre } from "@/modules/transmissions/actions";
import { AVIS, MOYENS, type Piece } from "@/modules/transmissions/regles";

const BOUTON = "h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50";

function Preuve({ libelle }: { libelle: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <PrisePhoto nom="preuve_photo" libelle={libelle} />
      <div className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface-creuse)] p-3">
        <p className="text-sm font-medium">Ou joindre un fichier</p>
        <input name="preuve" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" />
      </div>
    </div>
  );
}

function Moyen() {
  return (
    <Champ libelle="Moyen">
      <select name="moyen" defaultValue="" className={CLASSE_CHAMP}>
        <option value="">—</option>
        {Object.entries(MOYENS).map(([cle, libelle]) => (
          <option key={cle} value={cle}>
            {libelle}
          </option>
        ))}
      </select>
    </Champ>
  );
}

function Formulaire({ action, bouton, children }: { action: (d: FormData) => Promise<Resultat>; bouton: string; children?: React.ReactNode }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => action(d));
      }}
      className="space-y-3"
    >
      {children}
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className={BOUTON}>
          {bouton}
        </button>
      </div>
    </form>
  );
}

export function Transmettre({ id }: { id: string }) {
  return (
    <Formulaire action={(d) => transmettre(id, d)} bouton="Enregistrer la transmission">
      <Moyen />
      <Preuve libelle="Décharge ou accusé (photo)" />
    </Formulaire>
  );
}

export function Recevoir({ id }: { id: string }) {
  return (
    <Formulaire action={(d) => recevoir(id, d)} bouton="Enregistrer la réception">
      <Moyen />
      <Preuve libelle="Bordereau reçu (photo)" />
    </Formulaire>
  );
}

/** Interne : le destinataire accuse d'un clic. Sortante : l'émetteur note qui a signé la décharge. */
export function Accuser({ id, externe }: { id: string; externe: boolean }) {
  return (
    <Formulaire action={(d) => accuser(id, d)} bouton="Accuser réception">
      {externe && (
        <>
          <Champ libelle="Signé par">
            <input name="signataire" required maxLength={120} placeholder="Nom et fonction de qui a reçu" className={CLASSE_CHAMP} />
          </Champ>
          <Preuve libelle="Accusé ou décharge signée (photo)" />
        </>
      )}
    </Formulaire>
  );
}

/** Le retour : un avis par pièce, une observation, une note d'ensemble. */
export function Traiter({ id, pieces, technique }: { id: string; pieces: Piece[]; technique: boolean }) {
  return (
    <Formulaire action={(d) => traiter(id, d)} bouton="Enregistrer le retour">
      {technique && (
        <ul className="space-y-2">
          {pieces.map((p, i) => (
            <li key={i} className="grid gap-2 rounded-lg border border-[var(--filet)] p-2 sm:grid-cols-[1fr_12rem_1fr]">
              <span className="text-sm font-medium">
                {p.designation}
                {p.indice && <span className="ml-1 text-[var(--encre-faible)]">ind. {p.indice}</span>}
              </span>
              <select name={`avis_${i}`} defaultValue={p.avis ?? ""} aria-label={`Avis sur ${p.designation}`} className={CLASSE_CHAMP}>
                <option value="">— Avis —</option>
                {Object.entries(AVIS).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
              <input name={`observation_${i}`} defaultValue={p.observation} maxLength={500} placeholder="Observation" aria-label={`Observation sur ${p.designation}`} className={CLASSE_CHAMP} />
            </li>
          ))}
        </ul>
      )}
      <Champ libelle="Note">
        <input name="note" maxLength={1000} placeholder="Signé et retourné, avis transmis, dossier classé…" className={CLASSE_CHAMP} />
      </Champ>
    </Formulaire>
  );
}

export function Annuler({ id }: { id: string }) {
  const op = useOperation();
  return (
    <div className="flex flex-col items-end">
      <button type="button" disabled={op.enCours} onClick={() => window.confirm("Annuler ce bordereau ?") && op.lancer(() => annuler(id))} className="text-sm font-semibold text-danger-600 hover:underline">
        Annuler le bordereau
      </button>
      <Retour resultat={op.resultat} />
    </div>
  );
}

export function PreuveJointe({ id, presente, joindre }: { id: string; presente: boolean; joindre: boolean }) {
  const [ajout, setAjout] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presente && (
          // Aperçu DANS la plateforme : la preuve ne quitte pas l'écran, ni notre origine.
          <BoutonApercu
            piece={{ titre: "Preuve du bordereau", signer: () => ouvrirPreuve(id) }}
            className="h-9 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
          >
            Ouvrir la preuve
          </BoutonApercu>
        )}
        {joindre && !ajout && (
          <button type="button" onClick={() => setAjout(true)} className="h-9 px-3 text-sm font-semibold text-marque-600 hover:underline">
            {presente ? "Remplacer la preuve" : "Joindre une preuve"}
          </button>
        )}
      </div>
      {ajout && (
        <Formulaire action={(d) => joindrePreuve(id, d)} bouton="Joindre">
          <Preuve libelle="Par la caméra" />
        </Formulaire>
      )}
    </div>
  );
}
