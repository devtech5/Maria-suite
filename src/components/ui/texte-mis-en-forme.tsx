"use client";

import { analyserMessage, type Segment } from "@/modules/taches/mise-en-forme";

function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) => {
        const classes = [s.gras && "font-semibold", s.italique && "italic", s.souligne && "underline", s.barre && "line-through"].filter(Boolean).join(" ");
        if (s.lien)
          return (
            <a key={i} href={s.lien} target="_blank" rel="noopener noreferrer nofollow" className={`break-all text-[#1f76f0] hover:underline ${classes}`}>
              {s.texte}
            </a>
          );
        if (s.mention)
          return (
            <span key={i} className={`rounded bg-[#1f76f0]/10 px-1 font-medium text-[#1f76f0] ${classes}`}>
              {s.texte}
            </span>
          );
        return (
          <span key={i} className={classes || undefined}>
            {s.texte}
          </span>
        );
      })}
    </>
  );
}

/** Le corps d'une mise à jour, mis en forme en éléments : aucun HTML saisi n'est interprété. */
export function CorpsMessage({ corps, cocher, desactive }: { corps: string; cocher?: (rang: number) => void; desactive?: boolean }) {
  const blocs = analyserMessage(corps);
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {blocs.map((b, i) => {
        switch (b.type) {
          case "vide":
            return <div key={i} className="h-2" />;
          case "filet":
            return <hr key={i} className="my-2 border-[var(--filet)]" />;
          case "puce":
            return (
              <p key={i} className="flex gap-2 pl-1">
                <span aria-hidden>•</span>
                <span>
                  <Segments segments={b.segments} />
                </span>
              </p>
            );
          case "numero":
            return (
              <p key={i} className="flex gap-2 pl-1">
                <span className="chiffres text-[var(--encre-douce)]">{b.numero}.</span>
                <span>
                  <Segments segments={b.segments} />
                </span>
              </p>
            );
          case "coche":
            return (
              <label key={i} className={`flex items-start gap-2 pl-1 ${cocher ? "cursor-pointer" : ""}`}>
                <input
                  type="checkbox"
                  checked={b.faite}
                  disabled={!cocher || desactive}
                  onChange={() => cocher?.(b.rang)}
                  className="mt-1 size-4 accent-[#00c875]"
                />
                <span className={b.faite ? "text-[var(--encre-faible)] line-through" : ""}>
                  <Segments segments={b.segments} />
                </span>
              </label>
            );
          default:
            return (
              <p key={i}>
                <Segments segments={b.segments} />
              </p>
            );
        }
      })}
    </div>
  );
}
