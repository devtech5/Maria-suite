"use client";

import { useRef, useState } from "react";

/**
 * Photo d'identité, recadrée au format portrait et réduite dans le
 * navigateur avant de partir.
 *
 * 3 × 4, comme une photo d'identité : 300 × 400 px au plus, JPEG. Assez pour
 * un badge ou une carte professionnelle imprimés, assez léger (30 à 60 Ko)
 * pour vivre en base et suivre la carte hors ligne. Une photo trop large est
 * rognée sur les côtés ; trop haute, surtout en bas — le visage est en haut
 * du cadre. Le serveur ne reçoit jamais la photo de 4 Mo prise au téléphone.
 */
const LARGEUR = 300;
const HAUTEUR = 400;
const BORNE = 131_072;

/** Rectangle source 3 × 4 dans une image de `largeur` × `hauteur`. */
export function cadrePortrait(largeur: number, hauteur: number): { x: number; y: number; l: number; h: number } {
  const rapport = LARGEUR / HAUTEUR;
  if (largeur / hauteur > rapport) {
    const l = Math.round(hauteur * rapport);
    return { x: Math.round((largeur - l) / 2), y: 0, l, h: hauteur };
  }
  const h = Math.round(largeur / rapport);
  return { x: 0, y: Math.round((hauteur - h) * 0.25), l: largeur, h };
}

export async function reduirePhoto(fichier: File): Promise<string> {
  const image = await createImageBitmap(fichier);
  const cadre = cadrePortrait(image.width, image.height);
  const echelle = Math.min(1, LARGEUR / cadre.l);
  const toile = document.createElement("canvas");
  toile.width = Math.max(1, Math.round(cadre.l * echelle));
  toile.height = Math.max(1, Math.round(cadre.h * echelle));
  const ctx = toile.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, toile.width, toile.height);
  ctx.drawImage(image, cadre.x, cadre.y, cadre.l, cadre.h, 0, 0, toile.width, toile.height);
  for (const qualite of [0.85, 0.75, 0.6, 0.45]) {
    const url = toile.toDataURL("image/jpeg", qualite);
    if (url.length <= BORNE) return url;
  }
  throw new Error("Photo trop détaillée, même réduite.");
}

const DIMENSIONS = {
  rond: { petite: "size-8 text-xs", moyenne: "size-14 text-base", grande: "size-24 text-2xl" },
  portrait: { petite: "h-12 w-9 text-xs", moyenne: "h-24 w-[4.5rem] text-base", grande: "h-40 w-[7.5rem] text-3xl" },
} as const;

/**
 * La photo, ou les initiales à défaut : en vignette ronde dans les listes,
 * en portrait 3 × 4 sur la fiche, comme sur une pièce d'identité.
 */
export function Portrait({
  photo,
  nom,
  taille = "moyenne",
  forme = "rond",
}: {
  photo: string | null;
  nom: string;
  taille?: "petite" | "moyenne" | "grande";
  forme?: "rond" | "portrait";
}) {
  const dimension = DIMENSIONS[forme][taille];
  const arrondi = forme === "rond" ? "rounded-full" : "rounded-lg";
  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
  return photo ? (
    // Data URL en base : rien à optimiser, et pas d'URL externe à autoriser.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt={`Photo de ${nom}`} className={`${dimension} ${arrondi} shrink-0 border border-[var(--filet)] object-cover`} />
  ) : (
    <span aria-hidden className={`${dimension} ${arrondi} flex shrink-0 items-center justify-center bg-marque-50 font-semibold text-marque-600`}>
      {initiales || "?"}
    </span>
  );
}

/**
 * Choix d'une photo pour un formulaire : la data URL réduite part dans un
 * champ caché `name`, le fichier d'origine ne part pas.
 */
export function ChoixPhoto({ name = "photo", nom = "" }: { name?: string; nom?: string }) {
  const champ = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="w-[7.5rem]">
      <span className="mb-1.5 block text-sm font-medium">Photo portrait</span>
      <input type="hidden" name={name} value={photo ?? ""} />
      <input
        ref={champ}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choisir une photo portrait"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErreur(null);
          try {
            setPhoto(await reduirePhoto(f));
          } catch (err) {
            setErreur(err instanceof Error ? err.message : "Photo illisible.");
          }
        }}
      />
      {/* Le cadre lui-même ouvre le choix : la cible la plus grande de la ligne. */}
      <button
        type="button"
        onClick={() => champ.current?.click()}
        title={photo ? "Changer la photo" : "Choisir une photo"}
        className="group relative block overflow-hidden rounded-lg"
      >
        {photo ? (
          <Portrait photo={photo} nom={nom || "?"} taille="grande" forme="portrait" />
        ) : (
          <span className="flex h-40 w-[7.5rem] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--filet)] bg-[var(--fond)] text-[var(--encre-faible)] group-hover:border-marque-500 group-hover:text-marque-600">
            <svg viewBox="0 0 24 24" aria-hidden className="size-8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <span className="px-2 text-center text-xs">Ajouter une photo</span>
          </span>
        )}
      </button>
      <span className="mt-1.5 flex justify-between text-xs">
        <span className="text-[var(--encre-faible)]">Format 3 × 4</span>
        {photo && (
          <button type="button" onClick={() => setPhoto(null)} className="text-danger-600 hover:underline">
            Retirer
          </button>
        )}
      </span>
      {erreur && <p className="mt-1 text-xs text-danger-600">{erreur}</p>}
    </div>
  );
}
