"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useApercu } from "./apercu";

/**
 * Choix de photos et de PDF, avec aperçu avant envoi.
 *
 * Les photos sont réduites dans le navigateur (1 600 px, JPEG) avant de partir :
 * une photo de téléphone pèse 3 à 5 Mo, réduite elle tient en 300 Ko et reste
 * lisible — un reçu, un montant, une façade. Sur une connexion mobile, c'est
 * la différence entre un envoi qui aboutit et un envoi qui expire.
 *
 * Le champ garde son `name` : le formulaire part tel quel, avec les fichiers
 * réduits à la place des originaux.
 */
const COTE_MAX = 1600;

async function reduire(fichier: File): Promise<File> {
  // PDF et formats que le navigateur ne sait pas décoder (HEIC) partent tels quels.
  if (!/^image\/(jpeg|png|webp)$/.test(fichier.type)) return fichier;
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
    if (echelle === 1 && fichier.size < 600_000) return fichier;
    const toile = document.createElement("canvas");
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    toile.getContext("2d")?.drawImage(image, 0, 0, toile.width, toile.height);
    const blob = await new Promise<Blob | null>((r) => toile.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= fichier.size) return fichier;
    return new File([blob], fichier.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return fichier;
  }
}

interface Choisi {
  fichier: File;
  apercu: string | null;
}

export function ChoixFichiers({
  name = "fichier",
  libelle,
  requis = false,
  camera = false,
  accept = "image/*,application/pdf",
  reduirePhotos = true,
}: {
  name?: string;
  libelle: string;
  requis?: boolean;
  /** Sur téléphone, propose directement l'appareil photo. */
  camera?: boolean;
  /** Formats proposés par le sélecteur. Le serveur revérifie de toute façon. */
  accept?: string;
  /**
   * Réduire les photos avant l'envoi. À couper pour une archive : elle doit
   * garder l'original, octet pour octet, sinon son empreinte ne prouve rien.
   */
  reduirePhotos?: boolean;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [choisis, setChoisis] = useState<Choisi[]>([]);
  const [preparation, setPreparation] = useState(false);

  // Les aperçus sont des URL d'objet : à libérer, sinon la mémoire du téléphone y passe.
  useEffect(() => () => choisis.forEach((c) => c.apercu && URL.revokeObjectURL(c.apercu)), [choisis]);

  function synchroniser(liste: File[]) {
    const transfert = new DataTransfer();
    liste.forEach((f) => transfert.items.add(f));
    if (champ.current) champ.current.files = transfert.files;
  }

  async function choisir(nouveaux: File[]) {
    if (nouveaux.length === 0) return;
    setPreparation(true);
    const reduits = reduirePhotos ? await Promise.all(nouveaux.map(reduire)) : nouveaux;
    // On AJOUTE aux fichiers déjà choisis : prendre trois photos d'un reçu se
    // fait en trois gestes, pas en une sélection multiple.
    const tous = [...choisis.map((c) => c.fichier), ...reduits];
    synchroniser(tous);
    setChoisis(tous.map((f) => ({ fichier: f, apercu: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })));
    setPreparation(false);
  }

  function retirer(index: number) {
    const restants = choisis.filter((_, i) => i !== index).map((c) => c.fichier);
    synchroniser(restants);
    setChoisis(restants.map((f) => ({ fichier: f, apercu: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })));
  }

  const poids = choisis.reduce((s, c) => s + c.fichier.size, 0);

  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">{libelle}</span>
      {/* Le vrai champ porte les fichiers ; le bouton visible l'ouvre. */}
      <input
        ref={champ}
        name={name}
        type="file"
        multiple
        accept={accept}
        required={requis && choisis.length === 0}
        // Le navigateur remplace la sélection à chaque choix : `choisir` la
        // recompose avec les fichiers déjà retenus.
        onChange={(e) => void choisir(Array.from(e.target.files ?? []))}
        className="sr-only"
        aria-label={libelle}
      />
      <div className="flex flex-wrap items-center gap-2">
        {choisis.map((c, i) => (
          <figure key={`${c.fichier.name}-${i}`} className="relative size-16 overflow-hidden rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)]">
            {c.apercu ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.apercu} alt={c.fichier.name} className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center px-1 text-center text-[10px] font-semibold uppercase text-[var(--encre-faible)]">
                {c.fichier.name.includes(".") ? c.fichier.name.split(".").pop()!.slice(0, 5) : "Fichier"}
              </span>
            )}
            <button
              type="button"
              onClick={() => retirer(i)}
              aria-label={`Retirer ${c.fichier.name}`}
              className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
            >
              ×
            </button>
          </figure>
        ))}
        <button
          type="button"
          onClick={() => {
            if (!champ.current) return;
            // `capture` force l'appareil photo ; on ne le pose qu'à la demande.
            if (camera) champ.current.setAttribute("capture", "environment");
            else champ.current.removeAttribute("capture");
            champ.current.click();
          }}
          className="flex size-16 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--filet)] text-[var(--encre-faible)] hover:border-marque-400 hover:text-marque-600"
        >
          <span className="text-xl leading-none">+</span>
          <span className="text-[10px]">{choisis.length ? "Ajouter" : "Choisir"}</span>
        </button>
      </div>
      {(choisis.length > 0 || preparation) && (
        <p className="mt-1 text-[11px] text-[var(--encre-faible)]">
          {preparation
            ? "Préparation des photos…"
            : `${choisis.length} fichier${choisis.length > 1 ? "s" : ""} · ${(poids / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`}
        </p>
      )}
    </div>
  );
}

/**
 * Visionneuse : vignettes, puis plein écran avec navigation au clavier.
 *
 * Les adresses ne viennent PAS du rendu de la page : posées dans le HTML,
 * elles resteraient valables pour qui retrouve la page en cache. Le
 * navigateur les fait signer (`signer`) une fois monté, et les renouvelle
 * avant qu'elles n'expirent. Ce qui n'est pas une image s'ouvre dans l'aperçu.
 */
export interface ImageVisionnable {
  id: string;
  titre: string;
  sousTitre?: string;
  typeMime: string;
  nomFichier?: string;
}

/** Les URL signées valent cinq minutes : on les renouvelle avant. */
const RENOUVELLEMENT_MS = 4 * 60 * 1000;

export function Visionneuse({
  elements,
  signer,
  taille = "petite",
  pieds,
}: {
  elements: ImageVisionnable[];
  /** Action serveur : URL signée par identifiant, pour ceux que la session peut voir. */
  signer: (ids: string[]) => Promise<Record<string, string>>;
  taille?: "petite" | "grande";
  /** Contenu ajouté sous une vignette, par identifiant (bouton de retrait…). */
  pieds?: Record<string, ReactNode>;
}) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const apercu = useApercu();
  const images = elements.filter((e) => e.typeMime.startsWith("image/"));
  const autres = elements.filter((e) => !e.typeMime.startsWith("image/"));
  const idsImages = images.map((e) => e.id).join(",");

  useEffect(() => {
    if (!idsImages) return;
    let actif = true;
    const charger = () =>
      signer(idsImages.split(","))
        .then((r) => actif && setUrls(r))
        .catch(() => undefined);
    void charger();
    const minuterie = window.setInterval(charger, RENOUVELLEMENT_MS);
    return () => {
      actif = false;
      window.clearInterval(minuterie);
    };
  }, [idsImages, signer]);

  useEffect(() => {
    if (ouvert === null) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(null);
      if (e.key === "ArrowRight") setOuvert((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setOuvert((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ouvert, images.length]);

  const courant = ouvert === null ? null : images[ouvert];
  const urlCourante = courant ? urls[courant.id] : undefined;
  const vignette = taille === "grande" ? "aspect-[4/3] w-full" : "size-12";

  return (
    <>
      <ul className={taille === "grande" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-wrap gap-1.5"}>
        {images.map((e, i) => (
          <li key={e.id} className={taille === "grande" ? "overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]" : ""}>
            <button
              type="button"
              onClick={() => setOuvert(i)}
              disabled={!urls[e.id]}
              aria-label={`Voir ${e.titre}`}
              className={`block overflow-hidden ${taille === "grande" ? "w-full" : "rounded-lg border border-[var(--filet)]"}`}
            >
              {urls[e.id] ? (
                // URL signée et éphémère : l'optimiseur d'images la mettrait en cache au-delà de son expiration.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[e.id]} alt={e.titre} loading="lazy" className={`${vignette} object-cover transition hover:opacity-90`} />
              ) : (
                <span className={`${vignette} block animate-pulse bg-[var(--surface-creuse)]`} />
              )}
            </button>
            {taille === "grande" && (
              <div className="flex items-start justify-between gap-2 p-2">
                <p className="min-w-0 text-xs">
                  <span className="block truncate font-medium">{e.titre}</span>
                  {e.sousTitre && <span className="text-[var(--encre-faible)]">{e.sousTitre}</span>}
                </p>
                {pieds?.[e.id]}
              </div>
            )}
          </li>
        ))}
      </ul>
      {autres.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {autres.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() =>
                  apercu.ouvrir({
                    titre: e.titre,
                    nomFichier: e.nomFichier,
                    typeMime: e.typeMime,
                    signer: async () => (await signer([e.id]))[e.id] ?? null,
                  })
                }
                className="text-left text-marque-600 hover:underline"
              >
                {e.titre}
              </button>
            </li>
          ))}
        </ul>
      )}
      {apercu.fenetre}

      {courant && urlCourante && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={courant.titre}
          onClick={() => setOuvert(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urlCourante}
            alt={courant.titre}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] max-w-full rounded-lg object-contain"
          />
          <p className="mt-3 text-center text-sm text-white">
            {courant.titre}
            {courant.sousTitre && <span className="block text-xs text-white/70">{courant.sousTitre}</span>}
            <span className="block text-xs text-white/60">
              {ouvert! + 1} / {images.length}
            </span>
          </p>
          {images.length > 1 && (
            <div className="mt-3 flex gap-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOuvert((ouvert! - 1 + images.length) % images.length)}
                className="h-10 rounded-lg bg-white/15 px-4 text-sm font-semibold text-white hover:bg-white/25"
              >
                ← Précédente
              </button>
              <button
                type="button"
                onClick={() => setOuvert((ouvert! + 1) % images.length)}
                className="h-10 rounded-lg bg-white/15 px-4 text-sm font-semibold text-white hover:bg-white/25"
              >
                Suivante →
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOuvert(null)}
            aria-label="Fermer"
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
