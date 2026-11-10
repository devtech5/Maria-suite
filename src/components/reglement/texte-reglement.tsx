import { ancreArticle, dateLongue, intituleArticle, paragraphes, type Article } from "@/modules/reglement/regles";

export interface TexteDeVersion {
  titre: string;
  numero: number | null;
  dateEffet: string | null;
  preambule: string | null;
  articles: Article[];
}

/**
 * Le texte d'une version : sommaire des articles, préambule, articles.
 *
 * Même rendu à l'écran de lecture bloquante, dans le module et à
 * l'impression : ce que chacun accepte est exactement ce qu'il relit.
 */
export function TexteReglement({ version, sommaire = true }: { version: TexteDeVersion; sommaire?: boolean }) {
  return (
    <div className={sommaire && version.articles.length > 1 ? "grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]" : ""}>
      {sommaire && version.articles.length > 1 && <Sommaire articles={version.articles} />}

      <article className="min-w-0 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 shadow-sm sm:p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 border-b border-[var(--filet)] pb-4 text-center">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{version.titre}</h2>
          <p className="mt-1 text-sm text-[var(--encre-douce)]">
            {version.numero !== null ? `Version ${version.numero}` : "Brouillon"}
            {version.dateEffet && ` · en vigueur le ${dateLongue(version.dateEffet)}`}
          </p>
        </header>

        {version.preambule && (
          <div className="mb-6 space-y-3 text-[15px] leading-relaxed text-[var(--encre-douce)]">
            {paragraphes(version.preambule).map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-7">
          {version.articles.map((article, i) => (
            <section key={i} id={ancreArticle(i + 1)} className="scroll-mt-24">
              <h3 className="mb-2 text-base font-bold text-marque-600">{intituleArticle(article, i + 1)}</h3>
              <div className="space-y-3 text-[15px] leading-relaxed">
                {paragraphes(article.texte).map((p, j) => (
                  <p key={j} className="whitespace-pre-line">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

function Sommaire({ articles }: { articles: Article[] }) {
  return (
    <nav aria-label="Sommaire" className="print:hidden lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--encre-faible)]">Sommaire</p>
      <ol className="space-y-0.5 text-sm">
        {articles.map((article, i) => (
          <li key={i}>
            <a href={`#${ancreArticle(i + 1)}`} className="block rounded-md px-2 py-1 text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]">
              <span className="font-semibold text-[var(--encre)]">Art. {i + 1}</span>
              {article.titre && <> · {article.titre}</>}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
