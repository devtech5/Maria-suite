"use client";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { imputerPli } from "@/modules/courrier/actions";

/** Imputer (ou réimputer) un pli arrivé : à qui, quel service, quoi faire, pour quand. */
export function FormulaireImputation({
  pliId,
  personnes,
  services,
  aujourdhui,
  valeurs,
  compact = false,
}: {
  pliId: string;
  personnes: { id: string; nom: string }[];
  services: { id: string; libelle: string; code: string }[];
  aujourdhui: string;
  valeurs?: { userId?: string | null; serviceId?: string | null; instructions?: string | null; delaiReponse?: string | null };
  compact?: boolean;
}) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => imputerPli(pliId, d));
      }}
      className="space-y-3"
    >
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <Champ libelle="Imputé à">
          <select name="userId" required defaultValue={valeurs?.userId ?? ""} className={CLASSE_CHAMP}>
            <option value="" disabled>
              — Choisir —
            </option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Service (facultatif)">
          <select name="serviceId" defaultValue={valeurs?.serviceId ?? ""} className={CLASSE_CHAMP}>
            <option value="">—</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Réponse attendue le">
          <input name="delaiReponse" type="date" min={aujourdhui} defaultValue={valeurs?.delaiReponse ?? ""} className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <Champ libelle="Instructions">
        <textarea name="instructions" rows={2} maxLength={1000} defaultValue={valeurs?.instructions ?? ""} placeholder="Pour suite à donner, pour information, préparer une réponse…" className={`${CLASSE_CHAMP.replace("h-cible ", "")} min-h-16 py-2`} />
      </Champ>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          {valeurs?.userId ? "Réimputer" : "Imputer"}
        </button>
      </div>
    </form>
  );
}
