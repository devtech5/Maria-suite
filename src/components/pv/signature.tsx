"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import { CADRE_SIGNATURE } from "@/modules/pv/regles";

const { largeur: L, hauteur: H } = CADRE_SIGNATURE;

/**
 * Le cadre où l'on signe, au doigt, au stylet ou à la souris. Les traits se
 * relèvent en coordonnées entières d'un cadre fixe de 1000 × 400, quelle que
 * soit la taille de l'écran : la même signature s'imprime pareil partout.
 * `onChange` reçoit le chemin SVG (`M x y L x y …`), ou une chaîne vide.
 */
export function PadSignature({ onChange }: { onChange: (trace: string) => void }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const traits = useRef<[number, number][][]>([]);
  const enCours = useRef(false);
  const [vide, setVide] = useState(true);

  // La toile se dessine à la taille réelle de l'écran (net sur un téléphone à haute densité).
  useEffect(() => {
    const c = toile.current;
    if (!c) return;
    const ajuster = () => {
      const r = c.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * ratio);
      c.height = Math.round(r.height * ratio);
      redessiner();
    };
    ajuster();
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
  }, []);

  function redessiner() {
    const c = toile.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = Math.max(2, c.width / 220);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f2236";
    for (const trait of traits.current) {
      ctx.beginPath();
      trait.forEach(([x, y], i) => {
        const px = (x / L) * c.width;
        const py = (y / H) * c.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (trait.length === 1) ctx.lineTo((trait[0][0] / L) * c.width + 0.5, (trait[0][1] / H) * c.height);
      ctx.stroke();
    }
  }

  const point = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * L);
    const y = Math.round(((e.clientY - r.top) / r.height) * H);
    return [Math.min(L, Math.max(0, x)), Math.min(H, Math.max(0, y))];
  };

  const publier = () => {
    const trace = traits.current
      .filter((t) => t.length > 0)
      .map((t) => t.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" "))
      .join(" ");
    setVide(trace === "");
    onChange(trace);
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={toile}
          aria-label="Cadre de signature : signez au doigt, au stylet ou à la souris"
          role="img"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            enCours.current = true;
            traits.current.push([point(e)]);
            redessiner();
          }}
          onPointerMove={(e) => {
            if (!enCours.current) return;
            const trait = traits.current.at(-1)!;
            const [x, y] = point(e);
            const [px, py] = trait.at(-1)!;
            // Un point tous les 3 pas au moins : la signature reste légère sans perdre sa forme.
            if (Math.abs(x - px) + Math.abs(y - py) < 3) return;
            trait.push([x, y]);
            redessiner();
          }}
          onPointerUp={() => {
            enCours.current = false;
            publier();
          }}
          onPointerCancel={() => {
            enCours.current = false;
            publier();
          }}
          className="block aspect-[5/2] w-full touch-none rounded-xl border-2 border-dashed border-[var(--filet)] bg-white"
        />
        {vide && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-[#9aa5b1]">Signez ici</span>}
        <span aria-hidden className="pointer-events-none absolute inset-x-[8%] bottom-[22%] border-b border-[#d0d7de]" />
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => {
            traits.current = [];
            redessiner();
            publier();
          }}
          className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}

const TRACE = /^[ML0-9 ]+$/;

/** Une signature enregistrée, redessinée en SVG ; rien d'autre qu'un trait n'y passe. */
export function TraceSignature({ trace, className = "" }: { trace: string; className?: string }) {
  if (!TRACE.test(trace)) return null;
  return (
    <svg viewBox={`0 0 ${L} ${H}`} className={className} role="img" aria-label="Signature">
      <path d={trace} fill="none" stroke="#0f2236" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
