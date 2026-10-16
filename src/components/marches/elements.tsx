"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BoutonApercu } from "@/components/ui/apercu";
import type { Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { ajouterPieceDossier, cocherPiece, inviter, joindrePiece, ouvrirFichier, retirerPieceDossier } from "@/modules/marches/actions";

function useAction() {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const routeur = useRouter();
  return {
    enCours,
    resultat,
    lancer(op: () => Promise<Resultat>) {
      setResultat(null);
      demarrer(async () => {
        const r = await op();
        setResultat(r);
        if (r.ok) routeur.refresh();
      });
    },
  };
}

function Message({ r }: { r: Resultat | null }) {
  if (!r) return null;
  return <span className={`text-xs ${r.ok ? "text-valide-600" : "text-danger-600"}`}>{r.message}</span>;
}

/** Ouvre le fichier d'une ligne par une URL signée demandée au clic. */
export function BoutonFichier({ nature, id, nom }: { nature: "piece" | "offre" | "convention" | "avenant"; id: string; nom: string }) {
  return (
    <span title={nom}>
      <BoutonApercu piece={{ titre: nom, nomFichier: nom, signer: () => ouvrirFichier(nature, id) }} className="text-xs text-marque-600 hover:underline">
        📎 {nom.length > 28 ? `${nom.slice(0, 26)}…` : nom}
      </BoutonApercu>
    </span>
  );
}

/**
 * Bouton qui lance une action serveur, avec confirmation, motif demandé ou
 * non. L'action reçoit le motif saisi.
 */
export function BoutonGeste({
  libelle,
  action,
  confirmation,
  motif,
  ton = "neutre",
}: {
  libelle: string;
  action: (motif?: string) => Promise<Resultat>;
  confirmation?: string;
  /** Question posée pour obtenir un motif obligatoire. */
  motif?: string;
  ton?: "neutre" | "principal" | "danger";
}) {
  const a = useAction();
  const classe =
    ton === "principal"
      ? "bg-marque-500 text-white border-marque-500"
      : ton === "danger"
        ? "text-danger-600 border-[var(--filet)]"
        : "border-[var(--filet)] hover:bg-[var(--surface-creuse)]";
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={a.enCours}
        onClick={() => {
          let saisi: string | undefined;
          if (motif) {
            const r = window.prompt(motif);
            if (!r) return;
            saisi = r;
          } else if (confirmation && !window.confirm(confirmation)) return;
          a.lancer(() => action(saisi));
        }}
        className={`h-9 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${classe}`}
      >
        {libelle}
      </button>
      <Message r={a.resultat} />
    </span>
  );
}

/** Une pièce du dossier : cochée à la main, ou par le dépôt de son fichier. */
export function PieceDossier({
  id,
  libelle,
  fournie,
  fichier,
  peutGerer,
}: {
  id: string;
  libelle: string;
  fournie: boolean;
  fichier: string | null;
  peutGerer: boolean;
}) {
  const a = useAction();
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <input
        type="checkbox"
        checked={fournie}
        disabled={!peutGerer || a.enCours}
        onChange={(e) => a.lancer(() => cocherPiece(id, e.target.checked))}
        aria-label={`${libelle} fournie`}
        className="size-4"
      />
      <span className={`flex-1 text-sm ${fournie ? "" : "font-medium"}`}>{libelle}</span>
      {fichier && <BoutonFichier nature="piece" id={id} nom={fichier} />}
      {peutGerer && (
        <>
          <label className="cursor-pointer text-xs text-[var(--encre-douce)] hover:underline">
            {fichier ? "Remplacer" : "Joindre"}
            <input
              type="file"
              className="sr-only"
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const d = new FormData();
                d.set("fichier", f);
                a.lancer(() => joindrePiece(id, d));
              }}
            />
          </label>
          <button type="button" disabled={a.enCours} onClick={() => window.confirm(`Retirer « ${libelle} » du dossier ?`) && a.lancer(() => retirerPieceDossier(id))} className="text-xs text-danger-600 hover:underline">
            Retirer
          </button>
        </>
      )}
      <Message r={a.resultat && !a.resultat.ok ? a.resultat : null} />
    </li>
  );
}

export function AjoutPieceDossier({ soumissionId }: { soumissionId: string }) {
  const [libelle, setLibelle] = useState("");
  const a = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        a.lancer(async () => {
          const r = await ajouterPieceDossier(soumissionId, libelle);
          if (r.ok) setLibelle("");
          return r;
        });
      }}
      className="flex flex-wrap items-center gap-2 px-4 py-2.5"
    >
      <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Autre pièce demandée par l'avis…" aria-label="Pièce à ajouter" className={`${CLASSE_CHAMP} h-9 flex-1`} />
      <button type="submit" disabled={a.enCours || libelle.trim().length < 2} className="h-9 rounded-lg border border-[var(--filet)] px-3 text-sm disabled:opacity-50">
        Ajouter
      </button>
      <Message r={a.resultat} />
    </form>
  );
}

/** Invitation de fournisseurs à une consultation, avec ou sans message. */
export function Invitation({ consultationId, fournisseurs }: { consultationId: string; fournisseurs: { id: string; nom: string; email: boolean; telephone: boolean }[] }) {
  const [choisis, setChoisis] = useState<string[]>([]);
  const [canal, setCanal] = useState<"" | "email" | "whatsapp">("email");
  const a = useAction();
  if (fournisseurs.length === 0) return <p className="text-sm text-[var(--encre-faible)]">Tous vos fournisseurs sont déjà invités, ou aucun n&apos;est enregistré.</p>;
  return (
    <div className="space-y-3">
      <div className="flex max-h-48 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
        {fournisseurs.map((f) => (
          <label key={f.id} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={choisis.includes(f.id)} onChange={(e) => setChoisis(e.target.checked ? [...choisis, f.id] : choisis.filter((x) => x !== f.id))} className="size-4" />
            {f.nom}
            {canal === "email" && !f.email && <span className="text-xs text-[var(--encre-faible)]">(sans e-mail)</span>}
            {canal === "whatsapp" && !f.telephone && <span className="text-xs text-[var(--encre-faible)]">(sans numéro)</span>}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)} aria-label="Prévenir par" className={`${CLASSE_CHAMP} h-9 w-auto`}>
          <option value="email">Prévenir par e-mail</option>
          <option value="whatsapp">Prévenir par WhatsApp</option>
          <option value="">Sans message (déjà prévenus)</option>
        </select>
        <button type="button" disabled={a.enCours || choisis.length === 0} onClick={() => a.lancer(() => inviter(consultationId, choisis, canal || null))} className="h-9 rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
          Inviter {choisis.length > 0 ? `(${choisis.length})` : ""}
        </button>
        <Message r={a.resultat} />
      </div>
    </div>
  );
}
