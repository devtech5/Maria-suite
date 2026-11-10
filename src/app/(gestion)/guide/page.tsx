import type { Metadata } from "next";
import Link from "next/link";

import { BarreProgression } from "@/components/guide/barre-progression";
import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { parcoursTermine, progression } from "@/modules/guide/regles";
import { chapitresDeLaSession, chapitresLus, resultatQuiz } from "@/modules/guide/requetes";

export const metadata: Metadata = { title: "Guide d'utilisation" };

const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" });

/**
 * Le parcours du nouveau venu : les chapitres des modules qui lui sont
 * ouverts, dans l'ordre du menu, puis le quiz.
 */
export default async function PageGuide() {
  const session = await exigerEntreprise();
  const [chapitres, lus, quiz] = await Promise.all([chapitresDeLaSession(), chapitresLus(session.organizationId, session.userId), resultatQuiz(session.organizationId, session.userId)]);
  const p = progression(chapitres, lus);
  const termine = parcoursTermine(p, quiz?.reussi ?? false);

  return (
    <>
      <EnTetePage
        titre="Guide d'utilisation"
        sousTitre={`${chapitres.length} chapitres pour vos modules · ${p.lus} lu${p.lus > 1 ? "s" : ""}`}
        actions={
          p.suivant ? (
            <Link href={`/guide/${p.suivant}`} className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
              {p.lus === 0 ? "Commencer le parcours" : "Continuer"}
            </Link>
          ) : (
            !quiz?.reussi && (
              <Link href="/guide/quiz" className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
                Passer le quiz
              </Link>
            )
          )
        }
      />

      <div className="mb-6 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
        <BarreProgression pourcent={p.pourcent} />
        <p className="mt-2 text-sm text-[var(--encre-douce)]">
          {termine
            ? `Parcours terminé : quiz réussi le ${DATE.format(quiz!.passeLe)} (${quiz!.bonnes}/${quiz!.total}).`
            : p.suivant
              ? "Lisez chaque chapitre et marquez-le comme lu ; le quiz s'ouvre une fois tout lu. Le « ? » en haut de chaque écran ramène à la bonne section."
              : quiz
                ? `Dernier essai au quiz : ${quiz.bonnes}/${quiz.total}. Il faut 80 % de bonnes réponses : repassez-le quand vous voulez.`
                : "Tout est lu : passez le quiz pour valider votre parcours."}
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {chapitres.map((c, i) => {
          const lu = lus.has(c.cle);
          return (
            <li key={c.cle}>
              <Link
                href={`/guide/${c.cle}`}
                className="flex h-full gap-3 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm transition hover:-translate-y-px hover:shadow-md"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${lu ? "bg-valide-50 text-valide-600" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"}`}
                  aria-label={lu ? "Lu" : "À lire"}
                >
                  {lu ? "✓" : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold leading-tight">{c.titre}</span>
                  <span className="mt-0.5 block text-sm text-[var(--encre-douce)]">{c.resume}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
