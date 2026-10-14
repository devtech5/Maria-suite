import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Coque des écrans d'accès — connexion, mot de passe oublié, nouveau mot de
 * passe, accès non ouvert — aux couleurs de MARIA GROUP : bleu nuit et or.
 *
 * Deux colonnes sur grand écran : la marque à gauche, le contenu à droite.
 * Sur téléphone et sur la tablette de caisse en portrait, la marque se réduit
 * à l'icône au-dessus du titre : le premier champ reste visible sans
 * défiler, clavier ouvert.
 */
export function CoqueAcces({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh bg-[var(--fond)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <PanneauMarque />

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <header className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <Image
              src="/marque/icone-blanc-or.png"
              alt="MARIA GROUP"
              width={400}
              height={400}
              loading="eager"
              unoptimized
              className="mb-5 size-16 rounded-2xl lg:hidden"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--encre-faible)]">
              Maria Suite
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{titre}</h1>
            <span aria-hidden className="mt-3 h-0.5 w-10 rounded-full bg-or" />
            {sousTitre && <p className="mt-3 text-sm text-[var(--encre-douce)]">{sousTitre}</p>}
          </header>

          {children}
        </div>
      </section>
    </main>
  );
}

/**
 * Panneau de marque : le logo blanc et or sur son bleu nuit — son fond est
 * opaque, il n'est posé que sur cette couleur — et l'anneau du logo repris
 * en filigrane. Décoratif, masqué sous 1024 px.
 */
function PanneauMarque() {
  return (
    <aside className="relative hidden overflow-hidden bg-nuit text-white lg:flex lg:flex-col lg:items-center lg:justify-between lg:p-12">
      {/* Anneaux d'or en filigrane, coupés par les bords comme celui du logo. */}
      <span aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[30rem] rounded-full border border-or/25" />
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[22rem] rounded-full border border-or/15" />
      <span aria-hidden className="pointer-events-none absolute -bottom-48 -left-48 size-[34rem] rounded-full border-2 border-or/20" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-nuit-profond to-transparent" />

      <p className="relative text-center text-xs font-semibold uppercase tracking-[0.25em] text-or">
        MARIA GROUP SARL
      </p>

      <div className="relative flex flex-col items-center text-center">
        <Image
          src="/marque/logo-blanc-or.png"
          alt="MARIA GROUP"
          width={400}
          height={400}
          loading="eager"
          unoptimized
          className="size-72 xl:size-80"
        />
        <span aria-hidden className="mt-2 h-px w-24 bg-or/70" />
        <p className="mt-6 max-w-xs text-lg leading-relaxed text-white/85">
          Ouvrir les horizons, bâtir avec puissance et détermination.
        </p>
      </div>

      <p className="relative text-center text-xs text-white/50">
        Maria Suite — propulsé par Fiessou ERP
      </p>
    </aside>
  );
}
