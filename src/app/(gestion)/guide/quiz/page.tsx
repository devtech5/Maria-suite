import type { Metadata } from "next";
import Link from "next/link";

import { Quiz } from "@/components/guide/quiz";
import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { SEUIL_REUSSITE, progression, tirerQuiz } from "@/modules/guide/regles";
import { chapitresDeLaSession, chapitresLus, graineQuiz, nombreEssais, resultatQuiz } from "@/modules/guide/requetes";

export const metadata: Metadata = { title: "Quiz du guide" };

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });

/**
 * Le quiz de validation du parcours : des questions tirées des chapitres de
 * la personne, une par chapitre d'abord. Il s'ouvre une fois tout lu ; on le
 * repasse autant qu'on veut, avec d'autres questions à chaque essai.
 */
export default async function PageQuiz() {
  const session = await exigerEntreprise();
  const [chapitres, lus, essais, resultat] = await Promise.all([
    chapitresDeLaSession(),
    chapitresLus(session.organizationId, session.userId),
    nombreEssais(session.organizationId, session.userId),
    resultatQuiz(session.organizationId, session.userId),
  ]);
  const p = progression(chapitres, lus);
  const restants = chapitres.filter((c) => !lus.has(c.cle));

  if (restants.length > 0) {
    return (
      <>
        <EnTetePage titre="Quiz" sousTitre={`Il reste ${restants.length} chapitre${restants.length > 1 ? "s" : ""} à lire avant le quiz.`} />
        <ul className="divide-y divide-[var(--filet)] rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
          {restants.map((c) => (
            <li key={c.cle}>
              <Link href={`/guide/${c.cle}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[var(--surface-creuse)]">
                <span className="font-semibold">{c.titre}</span>
                <span className="text-marque-600">Lire →</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[var(--encre-douce)]">{p.lus} chapitre{p.lus > 1 ? "s" : ""} lu{p.lus > 1 ? "s" : ""} sur {p.total}.</p>
      </>
    );
  }

  const questions = tirerQuiz(chapitres, graineQuiz(session.userId, essais)).map(({ cle, question, choix }) => ({ cle, question, choix }));
  return (
    <div className="mx-auto max-w-3xl">
      <EnTetePage
        titre="Quiz"
        sousTitre={
          resultat?.reussi
            ? `Réussi le ${DATE.format(resultat.passeLe)} (${resultat.bonnes}/${resultat.total}). Vous pouvez le repasser pour vous entraîner.`
            : `${questions.length} questions sur vos modules · ${SEUIL_REUSSITE} % de bonnes réponses pour valider le parcours.`
        }
      />
      {/* La clé remonte le quiz à chaque essai : de nouvelles questions, des cases vides. */}
      <Quiz key={essais} questions={questions} />
    </div>
  );
}
