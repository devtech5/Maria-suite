"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import {
  creerIntervenant,
  enregistrerPointage,
  reglerIntervenant,
  type EtatBonPaiement,
  type EtatIntervenant,
  type EtatPointage,
} from "@/modules/personnes/actions";
import { LIBELLE_MODE, type ModeRemuneration } from "@/modules/personnes/paie";
import { Fenetre } from "@/components/ui/fenetre";

export interface OptionIntervenant {
  id: string;
  nom: string;
  qualification: string;
  uniteLibelle: string;
  taux: number;
  du: number;
  affectation: string | null;
}

const MODES: ModeRemuneration[] = ["journee", "tache", "unite", "forfait"];

/** Unité proposée par défaut, alignée sur celle que le serveur déduirait. */
const UNITE_PAR_MODE: Record<ModeRemuneration, string> = {
  journee: "jour",
  tache: "tâche",
  unite: "unité",
  forfait: "forfait",
};

const CLASSE_BOUTON =
  "h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50";

const CLASSE_BOUTON_DOUX =
  "h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50";

// -------------------------------------------------------- nouvel intervenant

export function FormulaireIntervenant({ premier = false }: { premier?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<ModeRemuneration>("journee");
  const [etat, action, enCours] = useActionState<EtatIntervenant, FormData>(
    creerIntervenant,
    {},
  );

  const [dernier, setDernier] = useState(etat.code);
  if (etat.code !== dernier) {
    setDernier(etat.code);
    if (etat.code) setOuvert(false);
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.code && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.code}</span> ouvert.
          </span>
        )}
        <button type="button" onClick={() => setOuvert(true)} className={CLASSE_BOUTON}>
          {premier ? "Ouvrir la première fiche" : "Nouvel intervenant"}
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouvel intervenant" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Nom">
              <input
                name="nom"
                required
                placeholder="Ouattara Ibrahim"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ libelle="Qualification">
              <input name="qualification" required placeholder="Maçon" className={CLASSE_CHAMP} />
            </Champ>

            <Champ
              libelle="Rémunération"
              precision="Ce que le taux paie : une journée, une tâche, une unité d'œuvre."
            >
              <select
                name="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ModeRemuneration)}
                className={CLASSE_CHAMP}
              >
                {MODES.map((valeur) => (
                  <option key={valeur} value={valeur}>
                    {LIBELLE_MODE[valeur]}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ libelle="Taux" precision="En francs entiers, par unité.">
              <input
                name="taux"
                inputMode="numeric"
                required
                defaultValue="0"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ
              libelle="Unité du taux"
              precision="Ce qui figurera sur le bon : « m² enduit », « coffrage »."
            >
              <input
                name="uniteLibelle"
                placeholder={UNITE_PAR_MODE[mode]}
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ libelle="Chantier ou équipe">
              <input
                name="affectation"
                placeholder="Villa Riviera 3"
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ libelle="Téléphone">
              <input
                name="telephone"
                placeholder="+225 07 00 00 00 00"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ
              libelle="Numéro de paiement"
              precision="Vide : le téléphone. Rempli quand il se fait payer ailleurs."
            >
              <input
                name="telephonePaiement"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>
          </div>

          {etat.erreur && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
            >
              {etat.erreur}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={enCours} className={CLASSE_BOUTON}>
              {enCours ? "Enregistrement…" : "Ouvrir la fiche"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}

// ------------------------------------------------------------------ pointage

/**
 * Pointage d'une journée, d'une tâche ou d'une unité d'œuvre.
 *
 * Le taux proposé est celui de la fiche, modifiable sur la ligne : une journée
 * exceptionnelle se paie parfois davantage, et refuser l'écart obligerait à
 * changer le taux de référence — ce qui repaierait tout le mois passé.
 */
export function FormulairePointage({
  intervenants,
}: {
  intervenants: OptionIntervenant[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [id, setId] = useState(intervenants[0]?.id ?? "");
  const [sens, setSens] = useState<"pointer" | "corriger">("pointer");
  const [etat, action, enCours] = useActionState<EtatPointage, FormData>(
    enregistrerPointage,
    {},
  );

  const [dernier, setDernier] = useState(etat.piece);
  if (etat.piece !== dernier) {
    setDernier(etat.piece);
    if (etat.piece) setOuvert(false);
  }

  const choisi = intervenants.find((i) => i.id === id);

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.piece && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.piece}</span> enregistré.
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={intervenants.length === 0}
          className={CLASSE_BOUTON_DOUX}
        >
          Pointer
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Pointage" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Intervenant">
              <select
                name="workerId"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className={CLASSE_CHAMP}
              >
                {intervenants.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nom} — {i.qualification}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ
              libelle="Nature"
              precision={
                sens === "corriger"
                  ? "La correction pointe en négatif : rien n'est réécrit."
                  : "Ce qui a été réalisé, constaté sur place."
              }
            >
              <select
                name="sens"
                value={sens}
                onChange={(e) => setSens(e.target.value as "pointer" | "corriger")}
                className={CLASSE_CHAMP}
              >
                <option value="pointer">Pointage</option>
                <option value="corriger">Correction — retirer</option>
              </select>
            </Champ>

            <Champ
              libelle="Quantité"
              precision={choisi ? `En ${choisi.uniteLibelle}.` : undefined}
            >
              <input
                name="quantite"
                inputMode="decimal"
                required
                defaultValue="1"
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ
              libelle="Taux"
              precision={
                choisi
                  ? `Vide : ${fmt(choisi.taux)} F par ${choisi.uniteLibelle}.`
                  : "Vide : le taux de la fiche."
              }
            >
              <input
                name="taux"
                inputMode="numeric"
                placeholder={choisi ? String(choisi.taux) : "0"}
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ
              libelle="Chantier"
              precision="Vide : celui de la fiche."
            >
              <input
                name="affectation"
                defaultValue={choisi?.affectation ?? ""}
                className={CLASSE_CHAMP}
              />
            </Champ>

            <Champ
              libelle="Motif"
              precision={
                sens === "corriger"
                  ? "Obligatoire : une correction se justifie devant l'intéressé."
                  : "Facultatif."
              }
            >
              <input
                name="motif"
                required={sens === "corriger"}
                placeholder="Journée comptée deux fois"
                className={CLASSE_CHAMP}
              />
            </Champ>
          </div>

          {etat.erreur && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
            >
              {etat.erreur}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={enCours} className={CLASSE_BOUTON}>
              {enCours ? "Enregistrement…" : "Enregistrer le pointage"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}

// ----------------------------------------------------------- bon de paiement

const MOYENS = [
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "mobile_money", libelle: "Mobile money" },
  { valeur: "banque", libelle: "Virement" },
  { valeur: "carte", libelle: "Carte" },
] as const;

/**
 * Émission d'un bon de paiement.
 *
 * Le montant proposé est le reste dû, mais il se modifie : un acompte de
 * milieu de semaine est la règle sur un chantier, pas l'exception. Le geste
 * sort de l'argent de la caisse et pose une écriture — d'où un droit distinct
 * de celui du pointage.
 */
export function FormulaireBonPaiement({
  intervenants,
}: {
  intervenants: OptionIntervenant[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [id, setId] = useState(intervenants[0]?.id ?? "");
  const [etat, action, enCours] = useActionState<EtatBonPaiement, FormData>(
    reglerIntervenant,
    {},
  );

  const [dernier, setDernier] = useState(etat.numero);
  if (etat.numero !== dernier) {
    setDernier(etat.numero);
    if (etat.numero) setOuvert(false);
  }

  const choisi = intervenants.find((i) => i.id === id);

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.numero && (
          <span className="text-sm text-valide-600">
            <span className="chiffres">{etat.numero}</span>
            {etat.message ? ` · ${etat.message}` : " émis."}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={intervenants.length === 0}
          className={CLASSE_BOUTON}
        >
          Bon de paiement
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Bon de paiement" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Champ libelle="Intervenant">
              <select
                name="workerId"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className={CLASSE_CHAMP}
              >
                {intervenants.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nom} — reste {fmt(i.du)} F
                  </option>
                ))}
              </select>
            </Champ>

            <Champ
              libelle="Montant versé"
              precision={
                choisi
                  ? `Reste dû : ${fmt(choisi.du)} F. Une avance supérieure est admise.`
                  : undefined
              }
            >
              <input
                key={id}
                name="montant"
                inputMode="numeric"
                required
                defaultValue={choisi && choisi.du > 0 ? String(choisi.du) : "0"}
                className={`${CLASSE_CHAMP} chiffres`}
              />
            </Champ>

            <Champ libelle="Moyen">
              <select name="moyen" defaultValue="especes" className={CLASSE_CHAMP}>
                {MOYENS.map((m) => (
                  <option key={m.valeur} value={m.valeur}>
                    {m.libelle}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ
              libelle="Référence"
              precision="Numéro du transfert, du chèque, du virement."
            >
              <input name="reference" className={`${CLASSE_CHAMP} chiffres`} />
            </Champ>
          </div>

          {etat.erreur && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
            >
              {etat.erreur}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={enCours} className={CLASSE_BOUTON}>
              {enCours ? "Enregistrement…" : "Émettre le bon"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
