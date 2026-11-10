"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rendreQuiz } from "@/modules/guide/actions";
import { SEUIL_REUSSITE, type Correction } from "@/modules/guide/regles";

export interface QuestionPosee {
  cle: string;
  question: string;
  choix: string[];
}

/**
 * Le quiz : une question par carte, un choix par question. Les bonnes
 * réponses ne descendent pas dans le navigateur : la copie part au serveur,
 * qui la corrige et rend les explications.
 */
export function Quiz({ questions }: { questions: QuestionPosee[] }) {
  const [reponses, setReponses] = useState<Record<string, number>>({});
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const repondues = Object.keys(reponses).length;

  const rendre = () =>
    demarrer(async () => {
      setRefus(null);
      const r = await rendreQuiz(reponses);
      if (r.ok) {
        setCorrection(r.correction);
        document.getElementById("resultat-quiz")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else setRefus(r.message);
    });

  const recommencer = () => {
    setReponses({});
    setCorrection(null);
    routeur.refresh();
  };

  const detail = (cle: string) => correction?.details.find((d) => d.cle === cle);

  return (
    <div className="space-y-4">
      <div id="resultat-quiz" className="scroll-mt-24">
        {correction && (
          <div className={`rounded-2xl border p-5 ${correction.reussi ? "border-valide-600/30 bg-valide-50 text-valide-600" : "border-alerte-600/30 bg-alerte-50 text-alerte-600"}`} role="status">
            <p className="text-lg font-bold">
              {correction.reussi ? "Quiz réussi, parcours validé !" : "Pas encore : il faut " + SEUIL_REUSSITE + " % de bonnes réponses."}
            </p>
            <p className="mt-1 text-sm">
              {correction.bonnes} bonne{correction.bonnes > 1 ? "s" : ""} réponse{correction.bonnes > 1 ? "s" : ""} sur {correction.total} ({correction.pourcent} %). Les explications sont sous chaque question.
            </p>
            {!correction.reussi && (
              <button type="button" onClick={recommencer} className="mt-3 h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
                Repasser le quiz
              </button>
            )}
          </div>
        )}
      </div>

      <ol className="space-y-4">
        {questions.map((q, i) => {
          const d = detail(q.cle);
          return (
            <li key={q.cle} className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm">
              <fieldset disabled={correction !== null || enCours}>
                <legend className="mb-3 font-semibold">
                  <span className="mr-2 text-marque-600">{i + 1}.</span>
                  {q.question}
                </legend>
                <div className="space-y-2">
                  {q.choix.map((choix, j) => {
                    const choisi = reponses[q.cle] === j;
                    const ton = d ? (j === d.bonne ? "border-valide-600 bg-valide-50" : choisi ? "border-danger-600 bg-danger-50" : "border-[var(--filet)]") : choisi ? "border-marque-600 bg-marque-600/5" : "border-[var(--filet)]";
                    return (
                      <label key={j} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${ton}`}>
                        <input type="radio" name={q.cle} checked={choisi} onChange={() => setReponses((r) => ({ ...r, [q.cle]: j }))} className="mt-0.5 accent-marque-600" />
                        <span>{choix}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {d && <p className={`mt-3 text-sm ${d.juste ? "text-valide-600" : "text-danger-600"}`}>{(d.juste ? "Juste. " : "Faux. ") + d.explication}</p>}
            </li>
          );
        })}
      </ol>

      {!correction && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--filet)] bg-[var(--fond)]/95 py-3 backdrop-blur">
          {refus && <p role="alert" className="mr-auto text-sm text-danger-600">{refus}</p>}
          <span className="text-sm text-[var(--encre-douce)]">
            {repondues} / {questions.length} répondue{repondues > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={rendre}
            disabled={enCours || repondues < questions.length}
            className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
          >
            {enCours ? "Correction…" : "Rendre ma copie"}
          </button>
        </div>
      )}
    </div>
  );
}
