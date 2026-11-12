"use client";

import { useState, useTransition, type ReactNode } from "react";

import { Fenetre } from "@/components/ui/fenetre";
import { envoyerContact, envoyerEvenement, envoyerSondage, repondreEvenement, voter } from "@/modules/messagerie/actions";
import type { MembreEchangeable, MessageAffiche } from "@/modules/messagerie/conversations";
import { LIBELLES_REPONSE, OPTIONS_MAX, REPONSES_EVENEMENT } from "@/modules/messagerie/genres";

const CHAMP = "h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-marque-500";
const LIBELLE = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";
const BOUTON = "h-cible rounded-lg px-4 text-sm font-semibold";

export type GenreAJoindre = "fichier" | "media" | "sondage" | "evenement" | "contact";

const ENTREES: { cle: GenreAJoindre; libelle: string; glyphe: string; fond: string }[] = [
  { cle: "fichier", libelle: "Fichier", glyphe: "📄", fond: "#6d5bd0" },
  { cle: "media", libelle: "Photos et vidéos", glyphe: "🖼️", fond: "#2f7df6" },
  { cle: "contact", libelle: "Contact", glyphe: "👤", fond: "#0e9f9a" },
  { cle: "sondage", libelle: "Sondage", glyphe: "📊", fond: "#d89a0c" },
  { cle: "evenement", libelle: "Événement", glyphe: "📅", fond: "#e0457b" },
];

/**
 * Le menu de la pièce jointe, comme sur WhatsApp : un fichier, des photos et
 * vidéos, un contact, un sondage, un événement. Se pose au-dessus du bouton.
 */
export function MenuJoindre({ ouvert, onFermer, onChoix }: { ouvert: boolean; onFermer: () => void; onChoix: (g: GenreAJoindre) => void }) {
  if (!ouvert) return null;
  return (
    <>
      <div className="fixed inset-0 z-30" aria-hidden onMouseDown={onFermer} />
      <div
        role="menu"
        aria-label="Joindre"
        onKeyDown={(e) => e.key === "Escape" && onFermer()}
        className="absolute bottom-full left-0 z-40 mb-2 w-56 overflow-hidden rounded-2xl border border-[var(--filet)] bg-[var(--surface)] py-2 shadow-xl"
      >
        {ENTREES.map((e) => (
          <button
            key={e.cle}
            type="button"
            role="menuitem"
            onClick={() => {
              onFermer();
              onChoix(e.cle);
            }}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--surface-creuse)]"
          >
            <span aria-hidden className="flex size-9 items-center justify-center rounded-full text-base text-white" style={{ background: e.fond }}>
              {e.glyphe}
            </span>
            <span className="font-medium">{e.libelle}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function PiedFenetre({ enCours, libelle, erreur, onFermer, desactive }: { enCours: boolean; libelle: string; erreur: string | null; onFermer: () => void; desactive?: boolean }) {
  return (
    <>
      {erreur && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-600">
          {erreur}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFermer} className={`${BOUTON} border border-[var(--filet)] hover:bg-[var(--surface-creuse)]`}>
          Annuler
        </button>
        <button type="submit" disabled={enCours || desactive} className={`${BOUTON} bg-marque-600 text-white hover:bg-marque-700 disabled:opacity-50`}>
          {enCours ? "Envoi…" : libelle}
        </button>
      </div>
    </>
  );
}

/** Lance l'envoi, ferme à la réussite, montre l'erreur sinon. */
function useEnvoi(onFermer: () => void, apres: () => Promise<void>) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const lancer = (operation: () => Promise<{ ok: boolean; message: string }>) => {
    setErreur(null);
    demarrer(async () => {
      const r = await operation().catch(() => ({ ok: false, message: "Réseau indisponible : rien n'a été envoyé." }));
      if (!r.ok) return setErreur(r.message);
      await apres();
      onFermer();
    });
  };
  return { erreur, enCours, lancer };
}

export function FenetreSondage({ conversationId, onFermer, apresEnvoi }: { conversationId: string; onFermer: () => void; apresEnvoi: () => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const { erreur, enCours, lancer } = useEnvoi(onFermer, apresEnvoi);
  const remplies = options.filter((o) => o.trim()).length;

  return (
    <Fenetre ouverte titre="Nouveau sondage" sousTitre="Chacun répond d'un geste, les résultats se mettent à jour en direct." retenir={Boolean(question || remplies)} onFermer={onFermer}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lancer(() => envoyerSondage(conversationId, { question, options, multiple }));
        }}
        className="space-y-4 px-5 py-4"
      >
        <label className="block">
          <span className={LIBELLE}>Question</span>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} required placeholder="Où déjeunons-nous vendredi ?" className={CHAMP} />
        </label>
        <fieldset className="space-y-2">
          <legend className={LIBELLE}>Réponses proposées</legend>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={o}
                onChange={(e) => setOptions((avant) => avant.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={100}
                aria-label={`Réponse ${i + 1}`}
                placeholder={`Réponse ${i + 1}`}
                className={CHAMP}
              />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions((avant) => avant.filter((_, j) => j !== i))} aria-label={`Retirer la réponse ${i + 1}`} className="size-10 shrink-0 rounded-lg text-lg text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)]">
                  ×
                </button>
              )}
            </div>
          ))}
          {options.length < OPTIONS_MAX && (
            <button type="button" onClick={() => setOptions((avant) => [...avant, ""])} className="text-sm font-semibold text-marque-600 hover:underline">
              + Ajouter une réponse
            </button>
          )}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="size-4 accent-marque-600" />
          Autoriser plusieurs réponses
        </label>
        <PiedFenetre enCours={enCours} libelle="Envoyer le sondage" erreur={erreur} onFermer={onFermer} desactive={question.trim().length < 3 || remplies < 2} />
      </form>
    </Fenetre>
  );
}

export function FenetreEvenement({ conversationId, aujourdhui, onFermer, apresEnvoi }: { conversationId: string; aujourdhui: string; onFermer: () => void; apresEnvoi: () => Promise<void> }) {
  const [titre, setTitre] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [heure, setHeure] = useState("");
  const [lieu, setLieu] = useState("");
  const [description, setDescription] = useState("");
  const { erreur, enCours, lancer } = useEnvoi(onFermer, apresEnvoi);

  return (
    <Fenetre ouverte titre="Nouvel événement" sousTitre="Les participants répondent : je viens, peut-être, je ne viens pas." retenir={Boolean(titre)} onFermer={onFermer}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lancer(() => envoyerEvenement(conversationId, { titre, date, heure, lieu, description }));
        }}
        className="space-y-4 px-5 py-4"
      >
        <label className="block">
          <span className={LIBELLE}>Titre</span>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} required placeholder="Pot de fin d'année" className={CHAMP} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LIBELLE}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={CHAMP} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Heure (facultative)</span>
            <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={CHAMP} />
          </label>
        </div>
        <label className="block">
          <span className={LIBELLE}>Lieu</span>
          <input value={lieu} onChange={(e) => setLieu(e.target.value)} maxLength={160} placeholder="Siège, Yopougon" className={CHAMP} />
        </label>
        <label className="block">
          <span className={LIBELLE}>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} className={`${CHAMP} h-auto py-2`} />
        </label>
        <PiedFenetre enCours={enCours} libelle="Envoyer l'événement" erreur={erreur} onFermer={onFermer} desactive={titre.trim().length < 3 || !date} />
      </form>
    </Fenetre>
  );
}

export function FenetreContact({ conversationId, membres, onFermer, apresEnvoi }: { conversationId: string; membres: MembreEchangeable[]; onFermer: () => void; apresEnvoi: () => Promise<void> }) {
  const [filtre, setFiltre] = useState("");
  const { erreur, enCours, lancer } = useEnvoi(onFermer, apresEnvoi);
  const cherche = filtre.trim().toLocaleLowerCase("fr");
  const visibles = membres.filter((m) => !cherche || m.nom.toLocaleLowerCase("fr").includes(cherche));
  return (
    <Fenetre ouverte titre="Partager un contact" sousTitre="Choisissez un collègue : sa carte arrive dans la discussion." onFermer={onFermer}>
      <div className="space-y-3 px-5 py-4">
        <input value={filtre} onChange={(e) => setFiltre(e.target.value)} type="search" placeholder="Rechercher un collègue" aria-label="Rechercher un collègue" className={CHAMP} />
        <ul className="max-h-72 divide-y divide-[var(--filet)] overflow-y-auto rounded-lg border border-[var(--filet)]">
          {visibles.length === 0 && <li className="px-3 py-3 text-sm text-[var(--encre-faible)]">Aucun collègue ne correspond.</li>}
          {visibles.map((m) => (
            <li key={m.userId}>
              <button type="button" disabled={enCours} onClick={() => lancer(() => envoyerContact(conversationId, m.userId))} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-creuse)] disabled:opacity-50">
                <Initiales nom={m.nom} />
                <span className="font-medium">{m.nom}</span>
              </button>
            </li>
          ))}
        </ul>
        {erreur && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-600">
            {erreur}
          </p>
        )}
      </div>
    </Fenetre>
  );
}

function Initiales({ nom }: { nom: string }) {
  const lettres = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toLocaleUpperCase("fr"))
    .join("");
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marque-600/15 text-sm font-bold text-marque-700">
      {lettres}
    </span>
  );
}

// ---------------------------------------------------------------- dans la bulle

const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function BlocSondage({ message, recharger }: { message: MessageAffiche; recharger: () => void }) {
  const sondage = message.sondage!;
  const [choisis, setChoisis] = useState<number[] | null>(null);
  const [occupe, demarrer] = useTransition();
  const actuels = choisis ?? sondage.resultat.options.flatMap((o, i) => (o.moi ? [i] : []));

  const basculer = (i: number) => {
    const suivants = sondage.multiple ? (actuels.includes(i) ? actuels.filter((x) => x !== i) : [...actuels, i]) : actuels.includes(i) ? [] : [i];
    setChoisis(suivants);
    demarrer(async () => {
      await voter(message.id, suivants).catch(() => undefined);
      recharger();
      setChoisis(null);
    });
  };

  return (
    <div className="w-64 max-w-full px-1 pb-1 sm:w-72">
      <p className="text-[14.5px] font-semibold leading-5">📊 {sondage.question}</p>
      <p className="mb-2 text-xs text-[var(--bulle-faible)]">{sondage.multiple ? "Plusieurs réponses possibles" : "Une seule réponse"}</p>
      <ul className="space-y-2">
        {sondage.options.map((texte, i) => {
          const o = sondage.resultat.options[i];
          const coche = actuels.includes(i);
          return (
            <li key={i}>
              <button type="button" disabled={occupe} onClick={() => basculer(i)} aria-pressed={coche} className="block w-full text-left disabled:opacity-70">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`flex size-4 shrink-0 items-center justify-center rounded-${sondage.multiple ? "sm" : "full"} border text-[10px] ${coche ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--bulle-faible)]"}`}>
                      {coche ? "✓" : ""}
                    </span>
                    {texte}
                  </span>
                  <span className="chiffres text-xs text-[var(--bulle-faible)]">{o?.votes ?? 0}</span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/10">
                  <span className="block h-full rounded-full bg-marque-600" style={{ width: `${o?.part ?? 0}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-[var(--bulle-faible)]">
        {sondage.resultat.votants} vote{sondage.resultat.votants > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function BlocEvenement({ message, recharger }: { message: MessageAffiche; recharger: () => void }) {
  const e = message.evenement!;
  const [occupe, demarrer] = useTransition();
  const quand = JOUR.format(new Date(`${e.date}T00:00:00`));
  const repondre = (reponse: string) =>
    demarrer(async () => {
      await repondreEvenement(message.id, reponse).catch(() => undefined);
      recharger();
    });
  const compte: Record<string, number> = { oui: e.resultat.oui, peut_etre: e.resultat.peutEtre, non: e.resultat.non };

  return (
    <div className="w-64 max-w-full px-1 pb-1 sm:w-72">
      <p className="text-[14.5px] font-semibold leading-5">📅 {e.titre}</p>
      <p className="mt-1 text-sm capitalize">
        {quand}
        {e.heure && <span className="normal-case"> à {e.heure}</span>}
      </p>
      {e.lieu && <p className="text-sm">📍 {e.lieu}</p>}
      {e.description && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bulle-faible)]">{e.description}</p>}
      <div className="mt-2 grid gap-1.5">
        {REPONSES_EVENEMENT.map((r) => (
          <button
            key={r}
            type="button"
            disabled={occupe}
            onClick={() => repondre(r)}
            aria-pressed={e.resultat.moi === r}
            className={`flex h-9 items-center justify-between rounded-lg border px-3 text-sm font-medium disabled:opacity-70 ${e.resultat.moi === r ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--filet)] bg-[var(--surface)] text-[var(--encre)] hover:bg-[var(--surface-creuse)]"}`}
          >
            <span>{LIBELLES_REPONSE[r]}</span>
            <span className="chiffres text-xs">{compte[r]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BlocContact({ message, mien, onEcrire }: { message: MessageAffiche; mien: boolean; onEcrire: (userId: string) => void }): ReactNode {
  const c = message.contact!;
  return (
    <div className="flex w-64 max-w-full items-center gap-3 px-1 pb-1 sm:w-72">
      <Initiales nom={c.nom} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold">{c.nom}</p>
        <p className="text-xs text-[var(--bulle-faible)]">Collègue</p>
      </div>
      {!mien && (
        <button type="button" onClick={() => onEcrire(c.userId)} className="h-9 shrink-0 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-semibold text-marque-700 hover:bg-[var(--surface-creuse)]">
          Écrire
        </button>
      )}
    </div>
  );
}
