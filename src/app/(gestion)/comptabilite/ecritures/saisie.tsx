"use client";

import { useActionState, useState } from "react";

import {
  contrepartieDe,
  JOURNAUX,
  TVA_TAUX_NORMAL,
  decomposerTTC,
  type CodeJournal,
} from "@/lib/comptabilite/ecritures";
import { fmt } from "@/lib/format";
import { saisirEcriture, type EtatSaisie } from "@/modules/comptabilite/actions";

/** Comptes de charge et de produit les plus utilisés au quotidien. */
const COMPTES_COURANTS = [
  { numero: "601", intitule: "Achats de marchandises", sens: "charge" },
  { numero: "605", intitule: "Autres achats", sens: "charge" },
  { numero: "6221", intitule: "Locations", sens: "charge" },
  { numero: "6241", intitule: "Entretien et réparations", sens: "charge" },
  { numero: "627", intitule: "Publicité et relations publiques", sens: "charge" },
  { numero: "6281", intitule: "Frais de télécommunications", sens: "charge" },
  { numero: "631", intitule: "Frais bancaires", sens: "charge" },
  { numero: "661", intitule: "Rémunérations du personnel", sens: "charge" },
  { numero: "701", intitule: "Ventes de marchandises", sens: "produit" },
  { numero: "706", intitule: "Services vendus", sens: "produit" },
] as const;

/**
 * Les journaux à contrepartie déduite.
 *
 * `OD` en est absent : la paie, les amortissements et les corrections y
 * demandent de saisir les deux côtés, ce que cet écran ne fait pas encore. Le
 * proposer laisserait croire à une saisie qui échouerait au moment d'écrire.
 */
const JOURNAUX_GUIDES = JOURNAUX.filter((j) => contrepartieDe(j.code) !== undefined);

/**
 * Saisie d'écriture.
 *
 * L'utilisateur ne choisit qu'un journal et un seul compte — de charge ou de
 * produit. La contrepartie et le sens du débit et du crédit se déduisent du
 * journal. C'est la meilleure idée du produit concurrent, et la seule
 * abstraction qui rende la comptabilité tenable pour un commerçant qui n'est
 * pas comptable.
 *
 * La partie double reste affichée en permanence : on ne cache pas l'écriture,
 * on évite seulement d'en faire saisir les deux côtés. L'aperçu est calculé
 * ici, mais l'écriture enregistrée est reconstruite sur le serveur — ce qui
 * s'affiche n'engage rien.
 */
export function SaisieEcriture() {
  const [etat, action, enCours] = useActionState<EtatSaisie, FormData>(
    saisirEcriture,
    {},
  );

  const [journal, setJournal] = useState<CodeJournal>("CA");
  const [compte, setCompte] = useState<(typeof COMPTES_COURANTS)[number]>(
    COMPTES_COURANTS[1],
  );
  const [montant, setMontant] = useState(0);
  const [avecTva, setAvecTva] = useState(false);

  const journalRetenu = JOURNAUX_GUIDES.find((j) => j.code === journal)!;
  const contrepartie = contrepartieDe(journal)!;

  // Un compte de charge se débite, un compte de produit se crédite. La
  // contrepartie du journal prend l'autre sens, systématiquement.
  const estCharge = compte.sens === "charge";
  const { ht, tva } = avecTva
    ? decomposerTTC(montant, TVA_TAUX_NORMAL)
    : { ht: montant, tva: 0 };

  const compteTaxe = estCharge
    ? { numero: "4451", intitule: "TVA récupérable sur achats" }
    : { numero: "4431", intitule: "TVA facturée sur ventes" };

  const lignes = [
    {
      compte: `${compte.numero} — ${compte.intitule}`,
      debit: estCharge ? ht : 0,
      credit: estCharge ? 0 : ht,
    },
    ...(tva > 0
      ? [
          {
            compte: `${compteTaxe.numero} — ${compteTaxe.intitule}`,
            debit: estCharge ? tva : 0,
            credit: estCharge ? 0 : tva,
          },
        ]
      : []),
    {
      compte: `${contrepartie.numero} — ${contrepartie.libelle}`,
      debit: estCharge ? 0 : montant,
      credit: estCharge ? montant : 0,
    },
  ];

  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={action}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]"
    >
      {/* --------------------------------------------------- le formulaire */}
      <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
        <h2 className="mb-4 text-base font-semibold">Nouvelle écriture</h2>

        <input type="hidden" name="journal" value={journal} />
        <input type="hidden" name="compte" value={compte.numero} />
        <input type="hidden" name="libelleCompte" value={compte.intitule} />
        <input type="hidden" name="sens" value={compte.sens} />

        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">
            Journal
          </legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {JOURNAUX_GUIDES.map((j) => (
              <button
                key={j.code}
                type="button"
                onClick={() => setJournal(j.code)}
                aria-pressed={journal === j.code}
                className={`h-cible rounded-lg border text-sm font-semibold ${
                  journal === j.code
                    ? "border-marque-600 bg-marque-600 text-white"
                    : "border-[var(--filet)] text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
                }`}
              >
                {j.code}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[var(--encre-faible)]">
            {journalRetenu.libelle} · contrepartie {journalRetenu.contrepartie}
          </p>
        </fieldset>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--encre-faible)]">
            Libellé
          </span>
          <input
            name="libelle"
            required
            placeholder="Ex : facture électricité CIE août"
            className="h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-sm outline-none focus:border-marque-500"
          />
        </label>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--encre-faible)]">
              Date de la pièce
            </span>
            <input
              type="date"
              name="date"
              required
              defaultValue={aujourdhui}
              className="chiffres h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-sm outline-none focus:border-marque-500"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--encre-faible)]">
              N° de pièce
            </span>
            <input
              name="piece"
              placeholder="Attribué si vide"
              className="chiffres h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-sm outline-none focus:border-marque-500"
            />
          </label>
        </div>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--encre-faible)]">
            Compte
          </span>
          <select
            name="compteChoisi"
            value={compte.numero}
            onChange={(e) =>
              setCompte(COMPTES_COURANTS.find((c) => c.numero === e.target.value)!)
            }
            className="h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-sm outline-none focus:border-marque-500"
          >
            {COMPTES_COURANTS.map((c) => (
              <option key={c.numero} value={c.numero}>
                {c.numero} — {c.intitule}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--encre-faible)]">
            Montant
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="montant"
              min={1}
              step={1}
              required
              value={montant || ""}
              onChange={(e) =>
                setMontant(Math.max(0, Math.round(Number(e.target.value) || 0)))
              }
              placeholder="0"
              className="chiffres h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-right text-sm outline-none focus:border-marque-500"
            />
            <span className="shrink-0 text-sm text-[var(--encre-faible)]">FCFA</span>
          </div>
          {/* Le franc CFA n'a pas de centime : la saisie est arrondie à l'entier. */}
        </label>

        {/* La TVA doit être isolée, sans quoi la part récupérable reste noyée
            dans la charge et l'entreprise la paie deux fois. */}
        <label className="mb-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="avecTva"
            checked={avecTva}
            onChange={(e) => setAvecTva(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-marque-600"
          />
          <span>
            <span className="block font-medium">
              Le montant comprend la TVA à {TVA_TAUX_NORMAL} %
            </span>
            <span className="block text-xs text-[var(--encre-faible)]">
              Elle sera isolée sur son compte, le reste ira à la charge ou au produit.
            </span>
          </span>
        </label>

        {etat.erreur && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
          >
            {etat.erreur}
          </p>
        )}

        {etat.numero && (
          <p className="mb-4 rounded-lg bg-valide-50 px-3 py-2.5 text-sm font-medium text-valide-600">
            Écriture {etat.numero} enregistrée.
          </p>
        )}

        <button
          type="submit"
          disabled={enCours || montant <= 0}
          className="h-cible w-full rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Enregistrer l'écriture"}
        </button>
      </div>

      {/* ------------------------------------------------ la partie double */}
      <aside className="h-fit rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold">Écriture générée</h2>
        <p className="mt-0.5 text-xs text-[var(--encre-faible)]">
          Vous saisissez un compte, Maria Suite écrit les deux lignes.
        </p>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--filet)]">
              <th className="pb-1.5 text-left text-xs font-semibold text-[var(--encre-faible)]">
                Compte
              </th>
              <th className="pb-1.5 text-right text-xs font-semibold text-[var(--encre-faible)]">
                Débit
              </th>
              <th className="pb-1.5 text-right text-xs font-semibold text-[var(--encre-faible)]">
                Crédit
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => (
              <tr key={index} className="border-b border-[var(--filet)]">
                <td className="py-2 pr-2 text-xs">{ligne.compte}</td>
                <td className="chiffres py-2 text-right">
                  {ligne.debit > 0 ? fmt(ligne.debit) : "—"}
                </td>
                <td className="chiffres py-2 text-right">
                  {ligne.credit > 0 ? fmt(ligne.credit) : "—"}
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-2 text-xs font-semibold">Totaux</td>
              <td className="chiffres py-2 text-right font-bold">{fmt(montant)}</td>
              <td className="chiffres py-2 text-right font-bold">{fmt(montant)}</td>
            </tr>
          </tbody>
        </table>

        {montant > 0 ? (
          <p className="mt-3 rounded-lg bg-valide-50 px-3 py-2 text-xs font-medium text-valide-600">
            Équilibrée — débit égal au crédit
          </p>
        ) : (
          <p className="mt-3 rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-xs text-[var(--encre-faible)]">
            Saisissez un montant : l&apos;écriture se construit ici.
          </p>
        )}
      </aside>
    </form>
  );
}
