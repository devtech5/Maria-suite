import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonLu } from "@/components/guide/bouton-lu";
import { CaptureAnnotee } from "@/components/guide/capture-annotee";
import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { chapitre as chapitreDe } from "@/modules/guide/chapitres";
import { chapitresDeLaSession, chapitresLus } from "@/modules/guide/requetes";

export async function generateMetadata({ params }: PageProps<"/guide/[chapitre]">): Promise<Metadata> {
  const { chapitre } = await params;
  return { title: chapitreDe(chapitre)?.titre ?? "Guide d'utilisation" };
}

/**
 * Un chapitre du guide : ses sections, leurs étapes et leurs captures
 * annotées. Un chapitre d'un module qui n'est pas ouvert à la personne ne
 * s'affiche pas — le guide suit le menu.
 */
export default async function PageChapitre({ params }: PageProps<"/guide/[chapitre]">) {
  const session = await exigerEntreprise();
  const { chapitre: cle } = await params;
  const [chapitres, lus] = await Promise.all([chapitresDeLaSession(), chapitresLus(session.organizationId, session.userId)]);
  const rang = chapitres.findIndex((c) => c.cle === cle);
  if (rang < 0) notFound();
  const c = chapitres[rang];
  const precedent = chapitres[rang - 1] ?? null;
  const suivant = chapitres[rang + 1] ?? null;
  // Après le dernier chapitre, ou quand tout le reste est lu : le quiz.
  const restants = chapitres.filter((x) => x.cle !== c.cle && !lus.has(x.cle));
  const suite = restants.length === 0 ? "/guide/quiz" : `/guide/${(suivant && !lus.has(suivant.cle) ? suivant : restants[0]).cle}`;

  return (
    <article className="mx-auto max-w-3xl">
      <EnTetePage titre={c.titre} sousTitre={`Chapitre ${rang + 1} sur ${chapitres.length} · ${c.resume}`} />

      {c.sections.length > 1 && (
        <nav aria-label="Dans ce chapitre" className="mb-6 flex flex-wrap gap-2 text-sm">
          {c.sections.map((s) => (
            <a key={s.ancre} href={`#${s.ancre}`} className="rounded-full border border-[var(--filet)] bg-[var(--surface)] px-3 py-1 text-[var(--encre-douce)] hover:text-[var(--encre)]">
              {s.titre}
            </a>
          ))}
        </nav>
      )}

      <div className="space-y-8">
        {c.sections.map((s) => (
          <section key={s.ancre} id={s.ancre} className="scroll-mt-24 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm target:ring-2 target:ring-or sm:p-6">
            <h2 className="mb-3 text-lg font-bold">{s.titre}</h2>
            <div className="space-y-3 text-[15px] leading-relaxed">
              {s.texte.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>
            {s.etapes && (
              <ol className="mt-4 space-y-2">
                {s.etapes.map((e, i) => (
                  <li key={i} className="flex gap-3 text-[15px]">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-marque-600 text-xs font-bold text-white">{i + 1}</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ol>
            )}
            {s.capture && <CaptureAnnotee capture={s.capture} />}
            {s.chemin && (
              <p className="mt-4 text-sm">
                <Link href={s.chemin} className="font-semibold text-marque-600 hover:underline">
                  Ouvrir cet écran →
                </Link>
              </p>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--filet)] pt-4">
        {precedent ? (
          <Link href={`/guide/${precedent.cle}`} className="text-sm font-semibold text-[var(--encre-douce)] hover:underline">
            ← {precedent.titre}
          </Link>
        ) : (
          <Link href="/guide" className="text-sm font-semibold text-[var(--encre-douce)] hover:underline">
            ← Sommaire
          </Link>
        )}
        <BoutonLu chapitre={c.cle} deja={lus.has(c.cle)} suite={suite} />
      </footer>
    </article>
  );
}
