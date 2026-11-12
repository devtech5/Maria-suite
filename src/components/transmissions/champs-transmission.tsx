"use client";

import { useState } from "react";

import { PrisePhoto } from "@/components/ui/prise-photo";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { MENTIONS, MOYENS, type Sens } from "@/modules/transmissions/regles";
import type { ChoixPersonne } from "@/modules/transmissions/requetes";

import { EditeurPieces } from "./editeur-pieces";

export interface Choix {
  personnes: ChoixPersonne[];
  services: { id: string; libelle: string; code: string }[];
  entreprises: { id: string; nom: string }[];
}

/** Les champs d'un bordereau selon son sens : interne, vers une entreprise, ou attendu d'elle. */
export function ChampsTransmission({ sens, choix, moi, aujourdhui }: { sens: Sens; choix: Choix; moi: string; aujourdhui: string }) {
  const [dejaFait, setDejaFait] = useState(false);
  const externe = sens !== "interne";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <Champ libelle="Objet">
          <input name="objet" required maxLength={200} placeholder={sens === "entrante" ? "Attestation de régularité fiscale, plans d'exécution…" : "Dossier, contrat, plans, rapport…"} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Mention">
          <select name="mention" defaultValue={sens === "interne" ? "attribution" : sens === "sortante" ? "visa" : "information"} className={CLASSE_CHAMP}>
            {Object.entries(MENTIONS).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      {sens === "interne" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Destinataire">
            <select name="destinataireUserId" required defaultValue="" className={CLASSE_CHAMP}>
              <option value="" disabled>
                — Choisir —
              </option>
              {choix.personnes
                .filter((p) => p.id !== moi)
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={p.sansCompte}>
                    {p.nom}
                    {p.detail ? ` — ${p.detail}` : ""}
                    {p.sansCompte ? " (sans compte)" : ""}
                  </option>
                ))}
            </select>
          </Champ>
          <Champ libelle="Service destinataire">
            <select name="destinataireServiceId" defaultValue="" className={CLASSE_CHAMP}>
              <option value="">—</option>
              {choix.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Votre service">
            <select name="emetteurServiceId" defaultValue="" className={CLASSE_CHAMP}>
              <option value="">—</option>
              {choix.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.libelle}
                </option>
              ))}
            </select>
          </Champ>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="Entreprise (fichier tiers)">
            <select name="tiersId" defaultValue="" className={CLASSE_CHAMP}>
              <option value="">— Hors du fichier : saisir le nom —</option>
              {choix.entreprises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Ou nom de l'entreprise">
            <input name="entreprise" maxLength={160} placeholder="Bureau de contrôle, maître d'ouvrage, sous-traitant…" className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Contact (facultatif)">
            <input name="contact" maxLength={160} placeholder="Nom, fonction, téléphone" className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Suivi par">
            <select name="responsableUserId" defaultValue={moi} className={CLASSE_CHAMP}>
              {choix.personnes
                .filter((p) => !p.sansCompte)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
            </select>
          </Champ>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium">Pièces</p>
        <EditeurPieces />
      </div>

      {externe && (
        <div className="space-y-3 rounded-xl bg-[var(--surface-creuse)] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="dejaFait" checked={dejaFait} onChange={(e) => setDejaFait(e.target.checked)} className="accent-marque-600" />
            {sens === "sortante" ? "Déjà transmis aujourd'hui" : "Déjà reçu aujourd'hui"}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {!dejaFait && (
              <Champ libelle={sens === "sortante" ? "À transmettre avant le" : "Doit nous parvenir avant le"}>
                <input name="dateLimite" type="date" required min={aujourdhui} className={CLASSE_CHAMP} />
              </Champ>
            )}
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
          </div>
          {dejaFait && (
            <div className="grid gap-3 sm:grid-cols-2">
              <PrisePhoto nom="preuve_photo" libelle={sens === "sortante" ? "Décharge signée (photo)" : "Bordereau reçu (photo)"} />
              <div className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] p-3">
                <p className="text-sm font-medium">Ou joindre un fichier</p>
                <input name="preuve" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
