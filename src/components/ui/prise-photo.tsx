"use client";

import { useEffect, useRef, useState } from "react";

/** Plus grand côté d'une photo envoyée : lisible pour une pièce d'identité, léger pour le réseau d'un chantier. */
const COTE_MAX = 1600;

/**
 * Prise de photo par la caméra de l'appareil — tablette de l'accueil,
 * téléphone, webcam du poste. La photo prise se range dans un champ fichier
 * caché nommé `nom`, que le formulaire envoie comme n'importe quel fichier.
 *
 * La caméra s'ouvre dans le navigateur (`getUserMedia`, caméra arrière de
 * préférence). Sans caméra ou sans autorisation, un choix de fichier prend
 * le relais — sur téléphone, il ouvre l'appareil photo.
 */
export function PrisePhoto({ nom, libelle, aide }: { nom: string; libelle: string; aide?: string }) {
  const champ = useRef<HTMLInputElement>(null);
  const secours = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const arreter = () => {
    flux.current?.getTracks().forEach((t) => t.stop());
    flux.current = null;
    setCamera(false);
  };

  useEffect(() => () => flux.current?.getTracks().forEach((t) => t.stop()), []);
  useEffect(() => () => {
    if (apercu) URL.revokeObjectURL(apercu);
  }, [apercu]);

  const ranger = (blob: Blob) => {
    const fichier = new File([blob], `${nom}.jpg`, { type: "image/jpeg" });
    const transfert = new DataTransfer();
    transfert.items.add(fichier);
    if (champ.current) champ.current.files = transfert.files;
    setApercu(URL.createObjectURL(fichier));
  };

  const reduire = (source: CanvasImageSource, largeur: number, hauteur: number) => {
    const echelle = Math.min(1, COTE_MAX / Math.max(largeur, hauteur));
    const toile = document.createElement("canvas");
    toile.width = Math.round(largeur * echelle);
    toile.height = Math.round(hauteur * echelle);
    toile.getContext("2d")?.drawImage(source, 0, 0, toile.width, toile.height);
    toile.toBlob((b) => b && ranger(b), "image/jpeg", 0.85);
  };

  const ouvrir = async () => {
    setErreur(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      secours.current?.click();
      return;
    }
    try {
      flux.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
      setCamera(true);
      requestAnimationFrame(() => {
        if (video.current && flux.current) {
          video.current.srcObject = flux.current;
          void video.current.play();
        }
      });
    } catch {
      setErreur("Caméra indisponible ou refusée : choisissez une photo.");
      secours.current?.click();
    }
  };

  const capturer = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    reduire(v, v.videoWidth, v.videoHeight);
    arreter();
  };

  const choisir = (f: File | undefined) => {
    if (!f) return;
    const image = new Image();
    image.onload = () => {
      reduire(image, image.naturalWidth, image.naturalHeight);
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(f);
  };

  const effacer = () => {
    if (champ.current) champ.current.value = "";
    setApercu(null);
  };

  return (
    <div className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface-creuse)] p-3">
      <p className="text-sm font-medium">{libelle}</p>
      {aide && <p className="text-xs text-[var(--encre-faible)]">{aide}</p>}
      <input ref={champ} type="file" name={nom} accept="image/jpeg" className="hidden" tabIndex={-1} aria-hidden />
      <input ref={secours} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden onChange={(e) => choisir(e.target.files?.[0])} />

      {camera ? (
        <div className="mt-2 space-y-2">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full rounded-lg bg-black object-cover" />
          <div className="flex gap-2">
            <button type="button" onClick={capturer} className="h-cible flex-1 rounded-lg bg-marque-600 px-3 text-sm font-semibold text-white hover:bg-marque-700">
              Prendre la photo
            </button>
            <button type="button" onClick={arreter} className="h-cible rounded-lg border border-[var(--filet)] px-3 text-sm">
              Annuler
            </button>
          </div>
        </div>
      ) : apercu ? (
        <div className="mt-2 flex items-center gap-3">
          {/* Aperçu local (blob:) de la photo qui partira avec le formulaire. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={apercu} alt={`Aperçu : ${libelle}`} className="h-20 w-28 rounded-lg object-cover" />
          <div className="flex flex-col gap-1 text-sm">
            <button type="button" onClick={ouvrir} className="text-left font-semibold text-marque-600 hover:underline">
              Reprendre
            </button>
            <button type="button" onClick={effacer} className="text-left text-[var(--encre-faible)] hover:underline">
              Retirer
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={ouvrir} className="h-cible rounded-lg bg-marque-600 px-3 text-sm font-semibold text-white hover:bg-marque-700">
            📷 Ouvrir la caméra
          </button>
          <button type="button" onClick={() => secours.current?.click()} className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm">
            Choisir une photo
          </button>
        </div>
      )}
      {erreur && <p className="mt-1 text-xs text-danger-600">{erreur}</p>}
    </div>
  );
}
