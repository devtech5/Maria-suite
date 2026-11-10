import Image from "next/image";

import positions from "@/modules/guide/captures.json";
import type { Capture } from "@/modules/guide/regles";

interface Releve {
  largeur: number;
  hauteur: number;
  /** Position de chaque repère en pourcentage de l'image, ou null si l'élément n'a pas été trouvé. */
  reperes: ([number, number] | null)[];
}

const RELEVES = positions as unknown as Record<string, Releve>;

/**
 * Une capture d'écran du guide, avec ses repères numérotés et leur légende.
 *
 * Les captures et la position des repères sont produites par
 * `scripts/captures-guide.ts` sur une base de démonstration : l'élément
 * désigné est cherché dans la page, et son centre devient le repère. Une
 * capture pas encore produite ne s'affiche pas ; le texte suffit.
 */
export function CaptureAnnotee({ capture }: { capture: Capture }) {
  const releve = RELEVES[capture.fichier];
  if (!releve) return null;
  return (
    <figure className="my-4">
      <div className="relative overflow-hidden rounded-xl border border-[var(--filet)] shadow-sm">
        <Image src={`/guide/${capture.fichier}.jpg`} alt={capture.alt} width={releve.largeur} height={releve.hauteur} unoptimized className="block h-auto w-full" />
        {capture.reperes.map((r, i) => {
          const position = releve.reperes[i];
          return position ? (
            <span
              key={i}
              aria-hidden
              style={{ left: `${position[0]}%`, top: `${position[1]}%` }}
              className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-or text-xs font-bold text-nuit shadow-md"
            >
              {i + 1}
            </span>
          ) : null;
        })}
      </div>
      {capture.reperes.length > 0 && (
        <figcaption className="mt-2">
          <ol className="space-y-1 text-sm text-[var(--encre-douce)]">
            {capture.reperes.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-or text-[10px] font-bold text-nuit">{i + 1}</span>
                <span>{r.texte}</span>
              </li>
            ))}
          </ol>
        </figcaption>
      )}
    </figure>
  );
}
