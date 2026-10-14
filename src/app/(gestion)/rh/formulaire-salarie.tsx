"use client";

import { useActionState, useState } from "react";

import { ChoixPhoto } from "@/components/personnes/photo";
import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { embaucherSalarie, type EtatSalarie } from "@/modules/personnes/actions";
import { finEssai, MOIS_ESSAI } from "@/modules/personnes/calcul";

const CONTRATS = [
  {
    valeur: "cdi",
    libelle: "Durée indéterminée",
    precision: "Sans terme. Aucune échéance à surveiller.",
  },
  {
    valeur: "cdd",
    libelle: "Durée déterminée",
    precision: "Le terme est obligatoire : c'est lui qui déclenche l'alerte.",
  },
  {
    valeur: "essai",
    libelle: `Période d'essai (${String(MOIS_ESSAI).padStart(2, "0")} mois)`,
    precision: `${MOIS_ESSAI} mois : la fin se calcule depuis la date d'embauche. Une décision à prendre avant elle.`,
  },
  {
    valeur: "stage",
    libelle: "Stage",
    precision: "Convention à durée fixe.",
  },
] as const;

type Contrat = (typeof CONTRATS)[number]["valeur"];

/**
 * Embauche d'un salarié.
 *
 * Le champ de terme n'apparaît que pour les contrats qui en ont un. Le laisser
 * visible sur un CDI ferait saisir une date « au cas où », et l'écran des
 * échéances annoncerait des fins de contrat qui n'existent pas.
 */
export function FormulaireSalarie({ premier = false, dossier = false }: { premier?: boolean; dossier?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [contrat, setContrat] = useState<Contrat>("cdi");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  // Vrai dès qu'on touche au terme à la main : le calcul ne l'écrase plus.
  const [finSaisie, setFinSaisie] = useState(false);

  /** Terme proposé : la fin de la période d'essai, tant qu'on ne l'a pas changé. */
  function proposerFin(nouveauContrat: Contrat, nouveauDebut: string) {
    if (finSaisie || nouveauContrat !== "essai" || !/^d{4}-d{2}-d{2}$/.test(nouveauDebut)) return;
    setFin(finEssai(nouveauDebut));
  }
  const [etat, action, enCours] = useActionState<EtatSalarie, FormData>(
    embaucherSalarie,
    {},
  );

  const [dernier, setDernier] = useState(etat.matricule);
  if (etat.matricule !== dernier) {
    setDernier(etat.matricule);
    if (etat.matricule) setOuvert(false);
  }

  const definition = CONTRATS.find((c) => c.valeur === contrat) ?? CONTRATS[0];
  const aUnTerme = contrat !== "cdi";

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {etat.matricule && (
          <span className={`text-sm ${etat.avertissement ? "text-alerte-600" : "text-valide-600"}`}>
            {etat.avertissement ?? (
              <>
                <span className="chiffres">{etat.matricule}</span> embauché.
              </>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          {premier ? "Embaucher le premier salarié" : "Nouveau salarié"}
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mb-5 w-full rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Nouveau salarié</h2>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Annuler
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Nom">
          <input name="nom" required placeholder="Koffi Bernard" className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle="Poste">
          <input name="poste" required placeholder="Magasinier" className={CLASSE_CHAMP} />
        </Champ>

        <Champ libelle="Contrat" precision={definition.precision}>
          <select
            name="contrat"
            value={contrat}
            onChange={(e) => {
              const choisi = e.target.value as Contrat;
              setContrat(choisi);
              proposerFin(choisi, debut);
            }}
            className={CLASSE_CHAMP}
          >
            {CONTRATS.map((c) => (
              <option key={c.valeur} value={c.valeur}>
                {c.libelle}
              </option>
            ))}
          </select>
        </Champ>

        <Champ libelle="Date d'embauche">
          <input
            name="debut"
            type="date"
            required
            value={debut}
            onChange={(e) => {
              setDebut(e.target.value);
              proposerFin(contrat, e.target.value);
            }}
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        {aUnTerme && (
          <Champ
            libelle={contrat === "essai" ? "Fin de la période d'essai" : "Terme du contrat"}
            precision={contrat === "essai" ? "Calculée sur la date d'embauche, modifiable." : "Obligatoire hors CDI."}
          >
            <input
              name="fin"
              type="date"
              required
              value={fin}
              onChange={(e) => {
                setFin(e.target.value);
                setFinSaisie(true);
              }}
              className={`${CLASSE_CHAMP} chiffres`}
            />
          </Champ>
        )}

        <Champ libelle="Salaire de base" precision="Brut mensuel, en francs entiers.">
          <input
            name="salaireBase"
            inputMode="numeric"
            required
            defaultValue="0"
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        <Champ
          libelle="Numéro CNPS"
          precision="Sans lui, aucune déclaration sociale n'est possible."
        >
          <input
            name="numeroCnps"
            placeholder="0123456789"
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        <Champ libelle="Téléphone">
          <input
            name="telephone"
            placeholder="+225 07 00 00 00 00"
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        <Champ libelle="Adresse électronique">
          <input name="email" type="email" className={CLASSE_CHAMP} />
        </Champ>
      </div>

      {/* Facultatif : le dossier se complète ensuite depuis la fiche du
          salarié — pièces d'identité, CMU, RIB, casier… */}
      {dossier && (
        <fieldset className="mt-5 border-t border-[var(--filet)] pt-4">
          <legend className="sr-only">Pièces jointes</legend>
          <p className="mb-3 text-sm font-semibold">
            Pièces jointes <span className="font-normal text-[var(--encre-faible)]">— facultatives</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <ChoixPhoto />
            <Champ libelle="CV" precision="PDF, Word ou photo.">
              <input name="cv" type="file" accept="application/pdf,.doc,.docx,image/*" className="block w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-[var(--filet)] file:bg-[var(--surface)] file:px-3" />
            </Champ>
            <Champ libelle="Lettre de motivation">
              <input name="lettre" type="file" accept="application/pdf,.doc,.docx,image/*" className="block w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-[var(--filet)] file:bg-[var(--surface)] file:px-3" />
            </Champ>
          </div>
          <p className="mt-2 text-xs text-[var(--encre-faible)]">
            Pièces d&apos;identité, CMU, casier judiciaire, RIB et autres se joignent ensuite depuis la fiche du salarié.
          </p>
        </fieldset>
      )}

      {etat.erreur && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
        >
          {etat.erreur}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={enCours}
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Embaucher"}
        </button>
      </div>
    </form>
  );
}
