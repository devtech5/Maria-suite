"use client";

import { useState } from "react";

import { FormulaireRepliable, Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import {
  ajouterFerie,
  ajusterSolde,
  annulerConge,
  deciderConge,
  demanderConge,
  enregistrerReglages,
  ouvrirJustificatif,
  pointerMonDepart,
  pointerSalarie,
  proposerFeries,
  retirerFerie,
} from "@/modules/presences/actions";
import { LIBELLES_JOURS, NATURES_CONGE } from "@/modules/presences/calcul";

export interface OptionSalarie {
  id: string;
  nom: string;
}

const BOUTON = "h-cible rounded-lg px-3.5 text-sm font-semibold disabled:opacity-50";
const PRINCIPAL = `${BOUTON} bg-marque-600 text-white hover:bg-marque-700`;
const SECONDAIRE = `${BOUTON} border border-[var(--filet)] bg-[var(--surface)] font-medium hover:bg-[var(--surface-creuse)]`;

export function BoutonDepart() {
  const op = useOperation();
  return (
    <div>
      <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => pointerMonDepart())} className={SECONDAIRE}>
        {op.enCours ? "…" : "Pointer mon départ"}
      </button>
      <Retour resultat={op.resultat} />
    </div>
  );
}

function ChoixSalarie({ salaries, name = "employeeId" }: { salaries: OptionSalarie[]; name?: string }) {
  return (
    <select name={name} required defaultValue="" className={CLASSE_CHAMP}>
      <option value="" disabled>
        Choisir…
      </option>
      {salaries.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nom}
        </option>
      ))}
    </select>
  );
}

export function FormulairePointage({ salaries, aujourdhui }: { salaries: OptionSalarie[]; aujourdhui: string }) {
  return (
    <FormulaireRepliable libelle="Pointer un salarié" titre="Pointer ou corriger une journée" action={pointerSalarie}>
      <p className="mb-3 text-sm text-[var(--encre-douce)]">
        Pour un salarié sans compte, un oubli ou un travail hors site. Une journée déjà pointée est corrigée ; le motif est inscrit au journal.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Champ libelle="Salarié">
          <ChoixSalarie salaries={salaries} />
        </Champ>
        <Champ libelle="Jour">
          <input name="jour" type="date" required max={aujourdhui} defaultValue={aujourdhui} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Arrivée">
          <input name="arrivee" type="time" required defaultValue="08:00" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Départ (facultatif)">
          <input name="depart" type="time" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Motif">
          <input name="motif" required minLength={3} placeholder="Oubli, panne, mission…" className={CLASSE_CHAMP} />
        </Champ>
      </div>
    </FormulaireRepliable>
  );
}

export function FormulaireConge({ salaries, aujourdhui, pourMoi }: { salaries?: OptionSalarie[]; aujourdhui: string; pourMoi: boolean }) {
  const [nature, setNature] = useState<keyof typeof NATURES_CONGE>("paye");
  return (
    <FormulaireRepliable libelle={salaries ? "Saisir un congé" : "Demander un congé"} titre={salaries ? "Saisir un congé (accordé d'office)" : "Demander un congé"} action={demanderConge}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {salaries && (
          <Champ libelle="Salarié">
            <ChoixSalarie salaries={salaries} />
          </Champ>
        )}
        <Champ libelle="Nature">
          <select name="nature" value={nature} onChange={(e) => setNature(e.target.value as keyof typeof NATURES_CONGE)} className={CLASSE_CHAMP}>
            {Object.entries(NATURES_CONGE).map(([cle, n]) => (
              <option key={cle} value={cle}>
                {n.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Du">
          <input name="debut" type="date" required min={pourMoi && !salaries && nature === "paye" ? aujourdhui : undefined} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Au (inclus)">
          <input name="fin" type="date" required className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="debutDemi" /> Part l&apos;après-midi du premier jour
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="finDemi" /> Rentre l&apos;après-midi du dernier jour
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Champ libelle="Motif (facultatif)">
          <input name="motif" maxLength={300} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Justificatif (facultatif)">
          <input name="justificatif" type="file" accept="image/*,application/pdf" className={`${CLASSE_CHAMP} py-1.5`} />
        </Champ>
      </div>
      <p className="mt-2 text-xs text-[var(--encre-faible)]">
        Les jours se décomptent hors dimanches et jours fériés. Seul le congé payé entame le solde.
      </p>
    </FormulaireRepliable>
  );
}

export function ActionsConge({ id, peutDecider, peutAnnuler, aJustificatif }: { id: string; peutDecider: boolean; peutAnnuler: boolean; aJustificatif: boolean }) {
  const op = useOperation();
  const [refus, setRefus] = useState(false);
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {aJustificatif && (
          <button
            type="button"
            className="text-sm text-marque-600 hover:underline"
            onClick={async () => {
              setErreur(null);
              const r = await ouvrirJustificatif(id);
              if (r.ok) window.open(r.url, "_blank", "noopener");
              else setErreur(r.message);
            }}
          >
            Justificatif
          </button>
        )}
        {peutDecider && !refus && (
          <>
            <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => deciderConge(id, "approuve", null))} className={`${BOUTON} h-9 bg-valide-600 text-white`}>
              Accorder
            </button>
            <button type="button" disabled={op.enCours} onClick={() => setRefus(true)} className={`${SECONDAIRE} h-9`}>
              Refuser
            </button>
          </>
        )}
        {peutAnnuler && !refus && (
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => annulerConge(id))} className="text-sm text-danger-600 hover:underline">
            Annuler
          </button>
        )}
      </div>
      {refus && (
        <div className="flex w-full max-w-sm gap-1.5">
          <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Motif du refus" className={`${CLASSE_CHAMP} h-9`} autoFocus />
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => deciderConge(id, "refuse", commentaire), () => setRefus(false))} className={`${BOUTON} h-9 bg-danger-600 text-white`}>
            Refuser
          </button>
          <button type="button" onClick={() => setRefus(false)} className="text-sm text-[var(--encre-faible)]">
            ✕
          </button>
        </div>
      )}
      {erreur && <p className="text-xs text-danger-600">{erreur}</p>}
      <Retour resultat={op.resultat} />
    </div>
  );
}

export interface ValeursReglages {
  pointageAuto: boolean;
  heureArrivee: string;
  heureDepart: string;
  toleranceMinutes: number;
  joursTravailles: number[];
  congesCentiemesParMois: number;
  decompte: "ouvrables" | "ouvres";
  verifie: boolean;
  source: string;
}

export function FormulaireReglages({ r }: { r: ValeursReglages }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => enregistrerReglages(d));
      }}
      className="space-y-5 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5"
    >
      <section>
        <h2 className="text-sm font-semibold">Pointage</h2>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" name="pointageAuto" defaultChecked={r.pointageAuto} className="mt-0.5" />
          <span>
            Pointer automatiquement chaque compte à sa première activité du jour (connexion ou premier écran ouvert).
            <span className="block text-xs text-[var(--encre-faible)]">Informez votre personnel que la plateforme enregistre l&apos;heure d&apos;arrivée et la dernière activité.</span>
          </span>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Champ libelle="Heure d'arrivée attendue">
            <input name="heureArrivee" type="time" required defaultValue={r.heureArrivee} className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Heure de départ">
            <input name="heureDepart" type="time" required defaultValue={r.heureDepart} className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Tolérance de retard (minutes)">
            <input name="toleranceMinutes" type="number" min={0} max={240} defaultValue={r.toleranceMinutes} className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
        </div>
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-sm font-medium">Jours travaillés</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {LIBELLES_JOURS.map((j, i) => (
              <label key={j} className="flex items-center gap-1.5 capitalize">
                <input type="checkbox" name="joursTravailles" value={i + 1} defaultChecked={r.joursTravailles.includes(i + 1)} /> {j}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="border-t border-[var(--filet)] pt-4">
        <h2 className="text-sm font-semibold">Congés payés</h2>
        <p className={`mt-1 rounded-lg px-3 py-2 text-sm ${r.verifie ? "bg-valide-50 text-valide-600" : "bg-alerte-50 text-alerte-600"}`}>
          {r.verifie ? "Règle attestée." : "À vérifier :"} {r.source}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Champ libelle="Jours acquis par mois de service">
            <input name="joursParMois" inputMode="decimal" required defaultValue={(r.congesCentiemesParMois / 100).toLocaleString("fr-FR")} className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
          <Champ libelle="Décompte">
            <select name="decompte" defaultValue={r.decompte} className={CLASSE_CHAMP}>
              <option value="ouvrables">Jours ouvrables (lundi au samedi)</option>
              <option value="ouvres">Jours travaillés de l&apos;entreprise</option>
            </select>
          </Champ>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="atteste" defaultChecked={r.verifie} /> J&apos;atteste avoir vérifié cette règle (convention collective, contrat).
        </label>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className={PRINCIPAL}>
          {op.enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

export function GestionFeries({ feries, annee }: { feries: { id: string; jour: string; libelle: string }[]; annee: number }) {
  const op = useOperation();
  return (
    <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Jours fériés {annee}</h2>
        <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => proposerFeries(annee))} className={SECONDAIRE}>
          Proposer les fériés du pays
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--encre-faible)]">Korité, Tabaski, Maouloud et Nuit du Destin suivent le calendrier lunaire : ajoutez-les dès leur annonce officielle.</p>
      <ul className="mt-3 divide-y divide-[var(--filet)] text-sm">
        {feries.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className="chiffres mr-3 text-[var(--encre-faible)]">{new Date(`${f.jour}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })}</span>
              {f.libelle}
            </span>
            <button type="button" onClick={() => op.lancer(() => retirerFerie(f.id))} className="text-xs text-danger-600 hover:underline">
              Retirer
            </button>
          </li>
        ))}
        {feries.length === 0 && <li className="py-2 text-[var(--encre-faible)]">Aucun jour férié posé pour {annee}.</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formulaire = e.currentTarget;
          const d = new FormData(formulaire);
          op.lancer(() => ajouterFerie(d), () => formulaire.reset());
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <Champ libelle="Date">
          <input name="jour" type="date" required className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Libellé">
          <input name="libelle" required placeholder="Tabaski" className={CLASSE_CHAMP} />
        </Champ>
        <button type="submit" disabled={op.enCours} className={PRINCIPAL}>
          Ajouter
        </button>
      </form>
      <Retour resultat={op.resultat} />
    </div>
  );
}

export function FormulaireAjustement({ salaries, aujourdhui }: { salaries: OptionSalarie[]; aujourdhui: string }) {
  return (
    <FormulaireRepliable libelle="Ajuster un solde" titre="Ajuster un solde de congés" action={ajusterSolde}>
      <p className="mb-3 text-sm text-[var(--encre-douce)]">
        <strong>Reprise</strong> : le solde réel à une date (salarié embauché avant Maria Suite) ; le décompte repart de là. <strong>Majoration</strong> : jours
        supplémentaires (ancienneté, enfants). <strong>Correction</strong> : rectification motivée, en plus ou en moins.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Champ libelle="Salarié">
          <ChoixSalarie salaries={salaries} />
        </Champ>
        <Champ libelle="Type">
          <select name="motif" defaultValue="reprise" className={CLASSE_CHAMP}>
            <option value="reprise">Reprise de solde</option>
            <option value="majoration">Majoration</option>
            <option value="correction">Correction</option>
          </select>
        </Champ>
        <Champ libelle="Date">
          <input name="jour" type="date" required defaultValue={aujourdhui} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Jours (ex. 12,5 ou -2)">
          <input name="jours" inputMode="decimal" required className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Note">
          <input name="note" maxLength={300} className={CLASSE_CHAMP} />
        </Champ>
      </div>
    </FormulaireRepliable>
  );
}
