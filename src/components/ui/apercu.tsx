"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { natureApercu, type NatureApercu } from "@/lib/apercu";

/**
 * Aperçu d'une pièce jointe dans la plateforme, sans téléchargement.
 *
 * L'URL signée se demande AU CLIC, par l'action serveur que l'écran fournit
 * (`signer`), jamais au rendu de la page : posée dans le HTML, elle resterait
 * valable pour qui retrouve une page en cache (voir CLAUDE.md, « Les fichiers
 * vivent dans un dépôt »).
 *
 * Le fichier ne quitte jamais notre origine : PDF et images s'affichent par le
 * navigateur, Word et Excel sont décodés DANS la page (docx-preview, SheetJS),
 * chargés à la demande pour ne rien coûter aux écrans qui n'en ouvrent pas.
 * Aucun service de prévisualisation tiers : il faudrait lui confier l'adresse,
 * donc le fichier.
 */

export interface PieceAOuvrir {
  titre: string;
  /** Nom d'origine : choisit le rendu et nomme le téléchargement. */
  nomFichier?: string | null;
  typeMime?: string | null;
  /** Demande une URL signée au serveur ; `null` si refusé ou dépôt muet. */
  signer: () => Promise<string | null>;
}

const INDISPONIBLE = "Fichier indisponible : dépôt de fichiers muet, ou accès refusé.";
/** Au-delà, une URL déjà obtenue est redemandée : elle expire à cinq minutes. */
const FRAICHEUR_MS = 4 * 60 * 1000;
/** Word et Excel se décodent en mémoire : au-delà, l'onglet du téléphone y passerait. */
const POIDS_MAX_DECODAGE = 15 * 1024 * 1024;
const LIGNES_MAX = 1000;
const COLONNES_MAX = 60;
const CARACTERES_MAX = 500_000;

/**
 * Un aperçu par écran : `ouvrir` au clic, `fenetre` à poser une fois dans le rendu.
 */
export function useApercu(): { ouvrir: (piece: PieceAOuvrir) => void; fenetre: ReactNode } {
  const [piece, setPiece] = useState<{ cle: number; piece: PieceAOuvrir } | null>(null);
  const ouvrir = useCallback((p: PieceAOuvrir) => setPiece((avant) => ({ cle: (avant?.cle ?? 0) + 1, piece: p })), []);
  // Stable : la fenêtre ne doit pas reprendre le focus à chaque rendu de l'écran.
  const fermer = useCallback(() => setPiece(null), []);
  const fenetre = piece ? <FenetreApercu key={piece.cle} piece={piece.piece} onFermer={fermer} /> : null;
  return { ouvrir, fenetre };
}

/** Bouton prêt à l'emploi, pour un écran qui n'a qu'une pièce à montrer. */
export function BoutonApercu({ piece, children, className }: { piece: PieceAOuvrir; children?: ReactNode; className?: string }) {
  const { ouvrir, fenetre } = useApercu();
  return (
    <>
      <button type="button" onClick={() => ouvrir(piece)} className={className ?? "text-marque-600 hover:underline"}>
        {children ?? "Voir"}
      </button>
      {fenetre}
    </>
  );
}

type Etat = { phase: "signature" } | { phase: "erreur"; message: string } | { phase: "pret"; url: string; obtenue: number };

function FenetreApercu({ piece, onFermer }: { piece: PieceAOuvrir; onFermer: () => void }) {
  const [etat, setEtat] = useState<Etat>({ phase: "signature" });
  const fermer = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let actif = true;
    piece
      .signer()
      .then((url) => {
        if (!actif) return;
        setEtat(url ? { phase: "pret", url, obtenue: Date.now() } : { phase: "erreur", message: INDISPONIBLE });
      })
      .catch(() => actif && setEtat({ phase: "erreur", message: INDISPONIBLE }));
    return () => {
      actif = false;
    };
  }, [piece]);

  // Échap ferme ; la page dessous ne défile plus tant que l'aperçu est ouvert.
  useEffect(() => {
    fermer.current?.focus();
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", touche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", touche);
      document.body.style.overflow = debordement;
    };
  }, [onFermer]);

  /** URL encore fraîche, ou une nouvelle. */
  async function urlFraiche(): Promise<string | null> {
    if (etat.phase === "pret" && Date.now() - etat.obtenue < FRAICHEUR_MS) return etat.url;
    const url = await piece.signer().catch(() => null);
    if (url) setEtat({ phase: "pret", url, obtenue: Date.now() });
    return url;
  }

  function nouvelOnglet() {
    // Ouverte AVANT l'éventuel appel serveur : après un `await`, le navigateur
    // la bloquerait comme fenêtre surgissante.
    const onglet = window.open("about:blank", "_blank");
    void urlFraiche().then((url) => {
      if (!url) return onglet?.close();
      if (onglet) {
        onglet.opener = null;
        onglet.location.href = url;
      }
    });
  }

  function telecharger() {
    void urlFraiche().then((url) => {
      if (!url) return;
      const lien = document.createElement("a");
      lien.href = `${url}&telecharger=1`;
      // Même origine : le navigateur retient ce nom plutôt que la clé du dépôt.
      lien.download = piece.nomFichier ?? piece.titre;
      document.body.append(lien);
      lien.click();
      lien.remove();
    });
  }

  const nature: NatureApercu =
    etat.phase === "pret" ? natureApercu({ nomFichier: piece.nomFichier, typeMime: piece.typeMime, url: etat.url }) : "telecharger";

  return (
    <div role="dialog" aria-modal="true" aria-label={`Aperçu : ${piece.titre}`} className="fixed inset-0 z-50 flex flex-col bg-black/80 p-0 sm:p-4" onClick={onFermer}>
      <div className="mx-auto flex size-full max-w-6xl flex-col overflow-hidden bg-[var(--surface)] shadow-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex flex-wrap items-center gap-2 border-b border-[var(--filet)] px-4 py-2.5">
          <p className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{piece.titre}</span>
            {piece.nomFichier && piece.nomFichier !== piece.titre && (
              <span className="block truncate text-xs text-[var(--encre-faible)]">{piece.nomFichier}</span>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <BoutonBarre onClick={nouvelOnglet} disabled={etat.phase !== "pret"}>
              Nouvel onglet
            </BoutonBarre>
            <BoutonBarre onClick={telecharger} disabled={etat.phase !== "pret"}>
              Télécharger
            </BoutonBarre>
            <button
              ref={fermer}
              type="button"
              onClick={onFermer}
              aria-label="Fermer l'aperçu"
              className="flex size-9 items-center justify-center rounded-lg text-xl text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)]"
            >
              ×
            </button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-auto bg-[var(--surface-creuse)]">
          {etat.phase === "signature" && <Message>Ouverture…</Message>}
          {etat.phase === "erreur" && <Message>{etat.message}</Message>}
          {etat.phase === "pret" && <Rendu nature={nature} url={etat.url} titre={piece.titre} telecharger={telecharger} />}
        </div>
      </div>
    </div>
  );
}

function BoutonBarre({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-lg border border-[var(--filet)] px-3 text-xs font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Message({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--encre-faible)]">
      <p className="max-w-md">{children}</p>
      {action}
    </div>
  );
}

function Rendu({ nature, url, titre, telecharger }: { nature: NatureApercu; url: string; titre: string; telecharger: () => void }) {
  const boutonTelecharger = (
    <button type="button" onClick={telecharger} className="h-9 rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
      Télécharger le fichier
    </button>
  );
  switch (nature) {
    case "pdf":
      return <RenduPdf url={url} titre={titre} action={boutonTelecharger} />;
    case "image":
      return <RenduImage url={url} titre={titre} action={boutonTelecharger} />;
    case "texte":
      return <RenduTexte url={url} action={boutonTelecharger} />;
    case "tableur":
      return <RenduTableur url={url} action={boutonTelecharger} />;
    case "docx":
      return <RenduDocx url={url} action={boutonTelecharger} />;
    case "audio":
      return (
        <Message>
          <audio src={url} controls className="w-full max-w-md" />
        </Message>
      );
    case "video":
      return (
        <div className="flex h-full items-center justify-center bg-black">
          <video src={url} controls className="max-h-full max-w-full" />
        </div>
      );
    default:
      return <Message action={boutonTelecharger}>Ce format ne s&apos;affiche pas dans la plateforme. Téléchargez-le pour l&apos;ouvrir avec l&apos;application adaptée.</Message>;
  }
}

function RenduPdf({ url, titre, action }: { url: string; titre: string; action: ReactNode }) {
  // Un téléphone Android n'a pas de lecteur PDF intégré au navigateur : une
  // iframe y resterait blanche. On le dit plutôt que de laisser un cadre vide.
  const lecteur = typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;
  if (!lecteur) return <Message action={action}>Ce navigateur n&apos;affiche pas les PDF dans une page. Ouvrez-le dans un nouvel onglet ou téléchargez-le.</Message>;
  return <iframe src={url} title={titre} className="size-full border-0 bg-white" />;
}

function RenduImage({ url, titre, action }: { url: string; titre: string; action: ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [echec, setEchec] = useState(false);
  if (echec) return <Message action={action}>Ce navigateur ne sait pas afficher cette image (format HEIC, par exemple).</Message>;
  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center gap-1.5 border-b border-[var(--filet)] bg-[var(--surface)] py-1.5">
        <BoutonBarre onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>−</BoutonBarre>
        <BoutonBarre onClick={() => setZoom(1)}>{Math.round(zoom * 100)} %</BoutonBarre>
        <BoutonBarre onClick={() => setZoom((z) => Math.min(8, z * 1.25))}>+</BoutonBarre>
        <BoutonBarre onClick={() => setRotation((r) => (r + 90) % 360)}>Pivoter</BoutonBarre>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {/* URL signée et éphémère : l'optimiseur d'images la mettrait en cache au-delà de son expiration. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={titre}
          onError={() => setEchec(true)}
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          className="max-h-full max-w-full object-contain transition-transform"
        />
      </div>
    </div>
  );
}

/** Lit le fichier une fois ; rend l'erreur plutôt que de lever. */
function useContenu<T>(url: string, lire: (reponse: Response) => Promise<T>): { donnee?: T; erreur?: string } {
  const [etat, setEtat] = useState<{ donnee?: T; erreur?: string }>({});
  const lecteur = useRef(lire);
  useEffect(() => {
    let actif = true;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Lien expiré : fermez et rouvrez l'aperçu." : "Lecture impossible.");
        const poids = Number(r.headers.get("content-length") ?? 0);
        if (poids > POIDS_MAX_DECODAGE) throw new Error("Fichier trop lourd pour l'aperçu. Téléchargez-le.");
        return lecteur.current(r);
      })
      .then((donnee) => actif && setEtat({ donnee }))
      .catch((e: unknown) => actif && setEtat({ erreur: e instanceof Error ? e.message : "Lecture impossible." }));
    return () => {
      actif = false;
    };
  }, [url]);
  return etat;
}

/** UTF-8 d'abord ; à défaut, Windows-1252 — un CSV enregistré par Excel en français. */
function decoder(octets: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder("windows-1252").decode(octets);
  }
}

function RenduTexte({ url, action }: { url: string; action: ReactNode }) {
  const { donnee, erreur } = useContenu(url, async (r) => decoder(await r.arrayBuffer()));
  if (erreur) return <Message action={action}>{erreur}</Message>;
  if (donnee === undefined) return <Message>Lecture…</Message>;
  return (
    <pre className="min-h-full whitespace-pre-wrap break-words bg-[var(--surface)] p-4 font-mono text-xs">
      {donnee.length > CARACTERES_MAX ? `${donnee.slice(0, CARACTERES_MAX)}\n\n… (suite tronquée, téléchargez le fichier)` : donnee}
    </pre>
  );
}

interface Feuille {
  nom: string;
  lignes: string[][];
  tronquee: boolean;
}

function RenduTableur({ url, action }: { url: string; action: ReactNode }) {
  const { donnee, erreur } = useContenu(url, async (r) => {
    const [XLSX, octets] = await Promise.all([import("xlsx"), r.arrayBuffer()]);
    const csv = (r.headers.get("content-type") ?? "").startsWith("text/csv");
    // Le séparateur (virgule, point-virgule, tabulation) est deviné par SheetJS.
    const classeur = csv ? XLSX.read(decoder(octets), { type: "string" }) : XLSX.read(octets, { type: "array" });
    return classeur.SheetNames.map<Feuille>((nom) => {
      const toutes = XLSX.utils.sheet_to_json<string[]>(classeur.Sheets[nom], { header: 1, raw: false, defval: "", blankrows: false });
      const tronquee = toutes.length > LIGNES_MAX || toutes.some((l) => l.length > COLONNES_MAX);
      return { nom, lignes: toutes.slice(0, LIGNES_MAX).map((l) => l.slice(0, COLONNES_MAX).map(String)), tronquee };
    });
  });
  const [active, setActive] = useState(0);
  if (erreur) return <Message action={action}>{erreur}</Message>;
  if (!donnee) return <Message>Lecture du classeur…</Message>;
  const feuille = donnee[Math.min(active, donnee.length - 1)];
  if (!feuille || feuille.lignes.length === 0) return <Message action={action}>Classeur vide.</Message>;
  const largeur = Math.max(...feuille.lignes.map((l) => l.length));

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface)]">
        {/* Rendu par React, donc échappé : une cellule ne devient jamais du HTML. */}
        <table className="border-collapse text-xs">
          <tbody>
            {feuille.lignes.map((ligne, i) => (
              <tr key={i} className={i === 0 ? "sticky top-0 bg-[var(--surface-creuse)] font-semibold" : ""}>
                <th className="border border-[var(--filet)] bg-[var(--surface-creuse)] px-2 py-1 text-right font-normal text-[var(--encre-faible)]">{i + 1}</th>
                {Array.from({ length: largeur }, (_, j) => (
                  <td key={j} className="max-w-xs truncate border border-[var(--filet)] px-2 py-1">
                    {ligne[j] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {feuille.tronquee && (
          <p className="p-3 text-xs text-[var(--encre-faible)]">
            Aperçu limité à {LIGNES_MAX} lignes et {COLONNES_MAX} colonnes : téléchargez le fichier pour le reste.
          </p>
        )}
      </div>
      {donnee.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--filet)] bg-[var(--surface)] px-2 py-1.5" aria-label="Feuilles">
          {donnee.map((f, i) => (
            <button
              key={f.nom}
              type="button"
              onClick={() => setActive(i)}
              aria-current={i === active}
              className={`whitespace-nowrap rounded-md px-3 py-1 text-xs ${i === active ? "bg-marque-600 font-semibold text-white" : "hover:bg-[var(--surface-creuse)]"}`}
            >
              {f.nom}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Seuls ces liens survivent au rendu d'un Word : jamais `javascript:` ni `data:`. */
const LIEN_SUR = /^(https?:|mailto:|tel:|#)/i;

function RenduDocx({ url, action }: { url: string; action: ReactNode }) {
  const hote = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"lecture" | "pret" | string>("lecture");

  useEffect(() => {
    let actif = true;
    const element = hote.current;
    if (!element) return;
    (async () => {
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error(reponse.status === 403 ? "Lien expiré : fermez et rouvrez l'aperçu." : "Lecture impossible.");
      if (Number(reponse.headers.get("content-length") ?? 0) > POIDS_MAX_DECODAGE) throw new Error("Fichier trop lourd pour l'aperçu. Téléchargez-le.");
      const [{ renderAsync }, octets] = await Promise.all([import("docx-preview"), reponse.arrayBuffer()]);
      if (!actif) return;
      // Ombre : les styles du document restent dans le document, et ceux de la
      // plateforme ne le déforment pas.
      const ombre = element.shadowRoot ?? element.attachShadow({ mode: "open" });
      ombre.replaceChildren();
      const styles = document.createElement("div");
      const corps = document.createElement("div");
      ombre.append(styles, corps);
      await renderAsync(octets, corps, styles, {
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
        // Un « altChunk » embarque du HTML brut : on ne l'interprète pas.
        renderAltChunks: false,
        useBase64URL: true,
      });
      corps.querySelectorAll("a[href]").forEach((a) => {
        if (!LIEN_SUR.test(a.getAttribute("href") ?? "")) a.removeAttribute("href");
        else if (!a.getAttribute("href")!.startsWith("#")) {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        }
      });
      if (actif) setPhase("pret");
    })().catch((e: unknown) => actif && setPhase(e instanceof Error ? e.message : "Ce document Word n'a pas pu être lu."));
    return () => {
      actif = false;
    };
  }, [url]);

  return (
    <>
      {phase === "lecture" && <Message>Lecture du document…</Message>}
      {phase !== "lecture" && phase !== "pret" && <Message action={action}>{phase}</Message>}
      <div ref={hote} className={phase === "pret" ? "min-h-full" : "hidden"} />
    </>
  );
}
