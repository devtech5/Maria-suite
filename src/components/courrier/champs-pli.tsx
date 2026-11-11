"use client";

import { PrisePhoto } from "@/components/ui/prise-photo";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { CANAUX, LONGUEURS, NATURES, type Sens } from "@/modules/courrier/regles";

/** Les champs d'un pli à enregistrer, et son scan : par la caméra, ou un PDF. */
export function ChampsPli({ sens }: { sens: Sens }) {
  const arrivee = sens === "arrivee";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle={arrivee ? "Expéditeur" : "Destinataire"}>
          <input name="correspondant" required maxLength={LONGUEURS.correspondant} placeholder={arrivee ? "Société, administration, personne" : "Nom et adresse du destinataire"} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Référence (facultatif)">
          <input name="reference" maxLength={LONGUEURS.reference} placeholder={arrivee ? "Leur référence" : "Notre référence"} className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <Champ libelle="Objet">
        <input name="objet" required maxLength={LONGUEURS.objet} className={CLASSE_CHAMP} />
      </Champ>
      <div className="grid gap-3 sm:grid-cols-3">
        <Champ libelle="Nature">
          <select name="nature" defaultValue="lettre" className={CLASSE_CHAMP}>
            {Object.entries(NATURES).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle={arrivee ? "Arrivé par" : "Part par"}>
          <select name="canal" defaultValue={arrivee ? "main_propre" : "coursier"} className={CLASSE_CHAMP}>
            {Object.entries(CANAUX).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Date du document">
          <input name="dateDocument" type="date" className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confidentiel" className="accent-marque-600" /> Confidentiel : l&apos;objet et le scan ne se lisent que par la direction et le destinataire
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <PrisePhoto nom="scan_photo" libelle="Scanner avec la caméra" aide="Une photo de la première page suffit." />
        <div className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface-creuse)] p-3">
          <p className="text-sm font-medium">Ou joindre un fichier</p>
          <p className="text-xs text-[var(--encre-faible)]">PDF ou photo, 10 Mo au plus.</p>
          <input name="scan" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" />
        </div>
      </div>
    </div>
  );
}
