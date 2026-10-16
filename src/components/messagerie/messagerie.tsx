"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BoutonApercu } from "@/components/ui/apercu";
import { ActionRuban, Avatar, EntreeDossier, Icone, LigneListe, Ruban, SeparateurRuban, TitreLecture, type NomIcone } from "@/components/ui/courrier";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Champ } from "@/components/ui/primitives";
import {
  actualiser,
  ajouterAuGroupe,
  ecrireA,
  envoyer,
  nouveauGroupe,
  ouvrirPieceJointe,
  renommer,
  retirerDuGroupe,
  supprimerMessage,
} from "@/modules/messagerie/actions";
import type { DetailConversation, MembreEchangeable, MessageAffiche, ResumeConversation } from "@/modules/messagerie/conversations";

/** Conversation ouverte : toutes les 3 secondes ; sinon la liste toutes les 15. */
const PAS_OUVERTE_MS = 3_000;
const PAS_LISTE_MS = 15_000;

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function ecranVerrouille(): boolean {
  try {
    return localStorage.getItem("maria-verrou") === "1";
  } catch {
    return false;
  }
}

function quand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const aujourdhui = new Date();
  return d.toDateString() === aujourdhui.toDateString() ? HEURE.format(d) : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/**
 * Messagerie interne : liste des conversations à gauche, fil à droite (l'un ou
 * l'autre sur téléphone). Le fil se rafraîchit par interrogation régulière —
 * quasi instantané à l'écran, sans connexion tenue ouverte derrière le pooler.
 */
export function Messagerie({
  moi,
  initiales,
  ouverteInitiale,
  membres,
  gereLesGroupes,
}: {
  moi: string;
  initiales: ResumeConversation[];
  ouverteInitiale: DetailConversation | null;
  membres: MembreEchangeable[];
  gereLesGroupes: boolean;
}) {
  const [liste, setListe] = useState(initiales);
  const [ouverte, setOuverte] = useState<DetailConversation | null>(ouverteInitiale);
  const [panneau, setPanneau] = useState<"nouvelle" | "groupe" | "membres" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [, demarrer] = useTransition();
  const routeur = useRouter();
  const ouverteId = ouverte?.id ?? null;
  const dernierLe = ouverte?.messages.at(-1)?.le ?? null;

  const rafraichir = useCallback(
    async (complet = false) => {
      if (document.visibilityState !== "visible" || ecranVerrouille()) return;
      const r = await actualiser(ouverteId, complet ? null : dernierLe).catch(() => null);
      if (!r) return;
      setListe(r.conversations);
      if (r.detail && r.detail.id === ouverteId) {
        setOuverte((avant) => {
          if (!avant || complet) return r.detail;
          // Ajoute les nouveaux messages ; met à jour les accusés de lecture des anciens.
          const connus = new Set(avant.messages.map((m) => m.id));
          const nouveaux = r.detail!.messages.filter((m) => !connus.has(m.id));
          return { ...r.detail!, messages: [...avant.messages, ...nouveaux] };
        });
      }
    },
    [ouverteId, dernierLe],
  );

  useEffect(() => {
    const minuterie = window.setInterval(() => void rafraichir(), ouverteId ? PAS_OUVERTE_MS : PAS_LISTE_MS);
    const surVisibilite = () => void rafraichir();
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [rafraichir, ouverteId]);

  // Accusés de lecture des anciens messages : un relevé complet de temps en temps.
  useEffect(() => {
    if (!ouverteId) return;
    const minuterie = window.setInterval(() => void rafraichir(true), 20_000);
    return () => window.clearInterval(minuterie);
  }, [ouverteId, rafraichir]);

  async function ouvrir(id: string) {
    setErreur(null);
    setPanneau(null);
    const r = await actualiser(id, null);
    if (r?.detail) {
      setOuverte(r.detail);
      setListe(r.conversations);
      window.history.replaceState(null, "", `/messagerie?c=${id}`);
    }
  }

  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [recherche, setRecherche] = useState("");
  const cherche = recherche.trim().toLocaleLowerCase("fr");
  const visibles = liste.filter(
    (c) =>
      (filtre === "toutes" ||
        (filtre === "non_lues" && c.nonLus > 0) ||
        (filtre === "privees" && c.type !== "groupe") ||
        (filtre === "groupes" && c.type === "groupe")) &&
      (!cherche || c.nom.toLocaleLowerCase("fr").includes(cherche) || (c.apercu ?? "").toLocaleLowerCase("fr").includes(cherche)),
  );
  const nonLus = liste.reduce((s, c) => s + c.nonLus, 0);
  const comptes: Record<Filtre, number> = {
    toutes: nonLus,
    non_lues: liste.filter((c) => c.nonLus > 0).length,
    privees: liste.filter((c) => c.type !== "groupe").reduce((s, c) => s + c.nonLus, 0),
    groupes: liste.filter((c) => c.type === "groupe").reduce((s, c) => s + c.nonLus, 0),
  };
  const rang = ouverteId ? visibles.findIndex((c) => c.id === ouverteId) : -1;
  const voisin = (pas: number) => (rang >= 0 && visibles[rang + pas] ? () => void ouvrir(visibles[rang + pas].id) : null);
  // Sur téléphone, un panneau de création se montre dans la liste : elle passe devant le fil.
  const creation = panneau === "nouvelle" || panneau === "groupe";
  const filFermer = () => {
    setOuverte(null);
    window.history.replaceState(null, "", "/messagerie");
  };

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-[28rem] lg:h-[calc(100dvh-9rem)] flex-col gap-2">
      <Ruban>
        <ActionRuban principal icone="nouveau" libelle="Nouvelle discussion" actif={panneau === "nouvelle"} onClick={() => setPanneau(panneau === "nouvelle" ? null : "nouvelle")} />
        {gereLesGroupes && <ActionRuban icone="groupe" libelle="Nouveau groupe" actif={panneau === "groupe"} onClick={() => setPanneau(panneau === "groupe" ? null : "groupe")} />}
        <SeparateurRuban />
        <ActionRuban
          icone="personne"
          libelle="Membres du groupe"
          actif={panneau === "membres"}
          disabled={ouverte?.type !== "groupe"}
          onClick={() => setPanneau(panneau === "membres" ? null : "membres")}
        />
        <ActionRuban icone="fermer" libelle="Fermer la conversation" disabled={!ouverte} onClick={filFermer} />
        <SeparateurRuban />
        <ActionRuban icone="actualiser" libelle="Actualiser" onClick={() => void rafraichir(true)} />
      </Ruban>

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Filtres, à la place des dossiers d'Outlook */}
        <nav className="hidden w-56 shrink-0 flex-col lg:flex">
          <p className="px-2.5 pb-2 pt-1 text-sm font-semibold">Discussions</p>
          <ul className="space-y-0.5">
            {FILTRES.map((f) => (
              <li key={f.cle}>
                <EntreeDossier icone={f.icone} libelle={f.libelle} compte={comptes[f.cle]} actif={filtre === f.cle} onClick={() => setFiltre(f.cle)} />
              </li>
            ))}
          </ul>
        </nav>

        {/* Liste */}
        <aside className={`flex w-full flex-col overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm md:w-80 md:shrink-0 xl:w-96 ${ouverte && !creation ? "max-md:hidden" : ""}`}>
          <div className="flex items-center gap-2 border-b border-[var(--filet)] p-2">
            <select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} aria-label="Afficher" className={`${CLASSE_CHAMP_COMPACT} h-9 shrink-0 lg:hidden`}>
              {FILTRES.map((f) => (
                <option key={f.cle} value={f.cle}>
                  {f.libelle}
                </option>
              ))}
            </select>
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-[var(--surface-creuse)] px-2.5 text-[var(--encre-faible)]">
              <Icone nom="recherche" />
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher" aria-label="Rechercher une conversation" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--encre)] outline-none" />
            </label>
          </div>

          {panneau === "nouvelle" && (
            <ul className="max-h-64 overflow-y-auto border-b border-[var(--filet)]">
              {membres.length === 0 && <li className="p-3 text-sm text-[var(--encre-faible)]">Personne d&apos;autre n&apos;a accès à la messagerie.</li>}
              {membres.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    onClick={() =>
                      demarrer(async () => {
                        const r = await ecrireA(m.userId);
                        if (r.ok && r.id) await ouvrir(r.id);
                        else setErreur(r.message);
                      })
                    }
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-creuse)]"
                  >
                    {m.nom}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {panneau === "groupe" && (
            <FormulaireGroupe
              membres={membres}
              onCree={async (id) => {
                setPanneau(null);
                await ouvrir(id);
                routeur.refresh();
              }}
            />
          )}

          {erreur && <p className="m-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-600">{erreur}</p>}

          <ul className="flex-1 overflow-y-auto">
            {liste.length === 0 && <li className="p-4 text-center text-sm text-[var(--encre-faible)]">Aucune conversation. Écrivez à un collègue.</li>}
            {liste.length > 0 && visibles.length === 0 && <li className="p-4 text-center text-sm text-[var(--encre-faible)]">Aucune conversation ne correspond.</li>}
            {visibles.map((c) => (
              <li key={c.id}>
                <LigneListe actif={c.id === ouverteId} nonLu={c.nonLus > 0} onClick={() => void ouvrir(c.id)}>
                  <Avatar nom={c.nom} groupe={c.type === "groupe"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${c.nonLus > 0 ? "font-semibold" : "font-medium"}`}>{c.nom}</span>
                      <span className="chiffres shrink-0 text-[11px] text-[var(--encre-faible)]">{quand(c.dernierLe)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-xs ${c.nonLus > 0 ? "font-semibold text-marque-600" : "text-[var(--encre-douce)]"}`}>
                        {c.retire ? "Vous avez quitté ce groupe" : (c.apercu ?? (c.type === "groupe" ? `${c.membres} membres` : "Nouvelle conversation"))}
                      </span>
                      {c.nonLus > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-marque-500 px-1.5 text-[11px] font-bold text-white">{c.nonLus}</span>}
                    </span>
                  </span>
                </LigneListe>
              </li>
            ))}
          </ul>
        </aside>

        {/* Fil */}
        <section className={`flex min-w-0 flex-1 flex-col gap-2 ${ouverte && !creation ? "" : "max-md:hidden"}`}>
          {!ouverte ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--filet)] p-6 text-center text-sm text-[var(--encre-faible)]">
              <Icone nom="discussions" className="size-10" />
              Choisissez une conversation, ou écrivez à un collègue.
            </div>
          ) : (
            <Fil
              key={ouverte.id}
              moi={moi}
              conversation={ouverte}
              membres={membres}
              gereLesGroupes={gereLesGroupes}
              panneauMembres={panneau === "membres"}
              fermer={filFermer}
              precedent={voisin(-1)}
              suivant={voisin(1)}
              apresEnvoi={() => void rafraichir()}
              recharger={() => void rafraichir(true)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

type Filtre = "toutes" | "non_lues" | "privees" | "groupes";

const FILTRES: { cle: Filtre; libelle: string; icone: NomIcone }[] = [
  { cle: "toutes", libelle: "Toutes les discussions", icone: "discussions" },
  { cle: "non_lues", libelle: "Non lues", icone: "enveloppe" },
  { cle: "privees", libelle: "Privées", icone: "personne" },
  { cle: "groupes", libelle: "Groupes", icone: "groupe" },
];

function Fil({
  moi,
  conversation,
  membres,
  gereLesGroupes,
  panneauMembres,
  fermer,
  precedent,
  suivant,
  apresEnvoi,
  recharger,
}: {
  moi: string;
  conversation: DetailConversation;
  membres: MembreEchangeable[];
  gereLesGroupes: boolean;
  panneauMembres: boolean;
  fermer: () => void;
  precedent: (() => void) | null;
  suivant: (() => void) | null;
  apresEnvoi: () => void;
  recharger: () => void;
}) {
  const fond = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const [texte, setTexte] = useState("");
  const [piece, setPiece] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const nombre = conversation.messages.length;

  useEffect(() => {
    fond.current?.scrollTo({ top: fond.current.scrollHeight });
  }, [nombre]);

  const peutAdministrer = conversation.type === "groupe" && (conversation.estAdmin || gereLesGroupes);

  function partir() {
    if (!texte.trim() && !piece) return;
    const donnees = new FormData();
    donnees.set("corps", texte);
    if (piece) donnees.set("fichier", piece);
    setErreur(null);
    demarrer(async () => {
      const r = await envoyer(conversation.id, donnees);
      if (!r.ok) {
        setErreur(r.message);
        return;
      }
      setTexte("");
      setPiece(null);
      if (fichier.current) fichier.current.value = "";
      apresEnvoi();
      champ.current?.focus();
    });
  }

  const parJour = useMemo(() => {
    const groupes: { jour: string; messages: MessageAffiche[] }[] = [];
    for (const m of conversation.messages) {
      const jour = JOUR.format(new Date(m.le));
      const dernier = groupes.at(-1);
      if (dernier?.jour === jour) dernier.messages.push(m);
      else groupes.push({ jour, messages: [m] });
    }
    return groupes;
  }, [conversation.messages]);

  return (
    <>
      <TitreLecture
        titre={conversation.nom}
        sousTitre={conversation.type === "groupe" ? conversation.membres.map((m) => (m.userId === moi ? "vous" : m.nom.split(" ")[0])).join(", ") : "Conversation privée"}
        fermer={fermer}
        precedent={precedent}
        suivant={suivant}
        actions={<Avatar nom={conversation.nom} groupe={conversation.type === "groupe"} className="size-9 text-xs max-sm:hidden" />}
      />

      <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
        {panneauMembres && conversation.type === "groupe" && (
          <GestionGroupe moi={moi} conversation={conversation} membres={membres} peutAdministrer={peutAdministrer} recharger={recharger} />
        )}

        <div ref={fond} className="flex-1 space-y-4 overflow-y-auto bg-[var(--fond)] px-3 py-4">
          {parJour.length === 0 && <p className="text-center text-sm text-[var(--encre-faible)]">Aucun message. Écrivez le premier.</p>}
          {parJour.map((g) => (
            <div key={g.jour} className="space-y-1.5">
              <p className="text-center text-[11px] font-medium uppercase tracking-wide text-[var(--encre-faible)]">{g.jour}</p>
              {g.messages.map((m) => (
                <Bulle key={m.id} message={m} mien={m.auteurId === moi} groupe={conversation.type === "groupe"} />
              ))}
            </div>
          ))}
        </div>

        {conversation.retire ? (
          <p className="border-t border-[var(--filet)] p-3 text-center text-sm text-[var(--encre-faible)]">Vous ne faites plus partie de ce groupe.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              partir();
            }}
            className="border-t border-[var(--filet)] p-2"
          >
            {erreur && <p className="mb-2 rounded-lg bg-danger-50 px-3 py-1.5 text-xs text-danger-600">{erreur}</p>}
            {piece && (
              <p className="mb-2 flex items-center justify-between rounded-lg bg-[var(--surface-creuse)] px-3 py-1.5 text-xs">
                📎 {piece.name}
                <button type="button" onClick={() => setPiece(null)} className="text-danger-600">
                  Retirer
                </button>
              </p>
            )}
            <div className="flex items-end gap-2">
              <input ref={fichier} type="file" className="sr-only" aria-label="Joindre un fichier" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setPiece(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fichier.current?.click()} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]" aria-label="Joindre un fichier" title="Joindre un fichier">
                📎
              </button>
              <textarea
                ref={champ}
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                onKeyDown={(e) => {
                  // Entrée envoie, Maj+Entrée revient à la ligne — comme partout ailleurs.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    partir();
                  }
                }}
                rows={1}
                placeholder="Votre message…"
                aria-label="Votre message"
                className={`${CLASSE_CHAMP} h-auto max-h-40 min-h-10 resize-none py-2`}
              />
              <button type="submit" disabled={enCours || (!texte.trim() && !piece)} className="h-10 shrink-0 rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
                Envoyer
              </button>
            </div>
          </form>
        )}
      </article>
    </>
  );
}

function Bulle({ message, mien, groupe }: { message: MessageAffiche; mien: boolean; groupe: boolean }) {
  const [, demarrer] = useTransition();
  const [efface, setEfface] = useState(message.efface);
  const vu = message.autres > 0 && message.luPar >= message.autres;

  if (efface) {
    return (
      <div className={`flex ${mien ? "justify-end" : "justify-start"}`}>
        <p className="rounded-2xl border border-dashed border-[var(--filet)] px-3 py-1.5 text-xs italic text-[var(--encre-faible)]">Message supprimé</p>
      </div>
    );
  }

  return (
    <div className={`group flex ${mien ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mien ? "rounded-br-sm bg-marque-500 text-white" : "rounded-bl-sm bg-[var(--surface)]"}`}>
        {groupe && !mien && <p className="mb-0.5 text-xs font-semibold text-marque-600">{message.auteur}</p>}
        {message.piece && (
          <BoutonApercu
            piece={{ titre: message.piece.nom, nomFichier: message.piece.nom, typeMime: message.piece.typeMime, signer: () => ouvrirPieceJointe(message.id) }}
            className={`mb-1 block underline ${mien ? "text-white" : "text-marque-600"}`}
          >
            📎 {message.piece.nom}
          </BoutonApercu>
        )}
        {message.corps && <p className="whitespace-pre-wrap break-words">{message.corps}</p>}
        <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mien ? "text-white/80" : "text-[var(--encre-faible)]"}`}>
          {mien && (
            <button
              type="button"
              onClick={() =>
                window.confirm("Supprimer ce message ?") &&
                demarrer(async () => {
                  const r = await supprimerMessage(message.id);
                  if (r.ok) setEfface(true);
                })
              }
              className="mr-1 hidden underline group-hover:inline"
            >
              supprimer
            </button>
          )}
          {HEURE.format(new Date(message.le))}
          {mien && <span title={vu ? "Lu" : "Envoyé"}>{vu ? "✓✓" : "✓"}</span>}
        </p>
      </div>
    </div>
  );
}

function FormulaireGroupe({ membres, onCree }: { membres: MembreEchangeable[]; onCree: (id: string) => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        demarrer(async () => {
          const r = await nouveauGroupe(donnees);
          if (r.ok && r.id) onCree(r.id);
          else setErreur(r.message);
        });
      }}
      className="space-y-2 border-b border-[var(--filet)] p-3"
    >
      <Champ libelle="Nom du groupe">
        <input name="nom" required placeholder="Équipe magasin" className={CLASSE_CHAMP} />
      </Champ>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Membres</legend>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {membres.map((m) => (
            <label key={m.userId} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="membres" value={m.userId} className="size-4" />
              {m.nom}
            </label>
          ))}
        </div>
      </fieldset>
      {erreur && <p className="text-xs text-danger-600">{erreur}</p>}
      <button type="submit" disabled={enCours} className="h-9 w-full rounded-lg bg-marque-500 text-sm font-semibold text-white disabled:opacity-50">
        Créer le groupe
      </button>
    </form>
  );
}

function GestionGroupe({
  moi,
  conversation,
  membres,
  peutAdministrer,
  recharger,
}: {
  moi: string;
  conversation: DetailConversation;
  membres: MembreEchangeable[];
  peutAdministrer: boolean;
  recharger: () => void;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [ajout, setAjout] = useState("");
  const [nom, setNom] = useState(conversation.nom);
  const presents = new Set(conversation.membres.map((m) => m.userId));
  const ajoutables = membres.filter((m) => !presents.has(m.userId));
  const agir = (op: () => Promise<{ ok: boolean; message: string }>) =>
    demarrer(async () => {
      const r = await op();
      setMessage(r.message);
      if (r.ok) recharger();
    });

  return (
    <div className="space-y-3 border-b border-[var(--filet)] bg-[var(--surface-creuse)] p-3 text-sm">
      {peutAdministrer && (
        <div className="flex flex-wrap gap-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} aria-label="Nom du groupe" className={`${CLASSE_CHAMP} h-9 flex-1`} />
          <button type="button" disabled={enCours} onClick={() => agir(() => renommer(conversation.id, nom))} className="h-9 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3">
            Renommer
          </button>
        </div>
      )}
      <ul className="space-y-1">
        {conversation.membres.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2">
            <span>
              {m.userId === moi ? "Vous" : m.nom}
              {m.role === "admin" && <span className="ml-1.5 text-xs text-[var(--encre-faible)]">administrateur</span>}
            </span>
            {m.userId === moi ? (
              <button type="button" disabled={enCours} onClick={() => window.confirm("Quitter ce groupe ?") && agir(() => retirerDuGroupe(conversation.id, moi))} className="text-xs text-danger-600 hover:underline">
                Quitter
              </button>
            ) : (
              peutAdministrer && (
                <button type="button" disabled={enCours} onClick={() => agir(() => retirerDuGroupe(conversation.id, m.userId))} className="text-xs text-danger-600 hover:underline">
                  Retirer
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {peutAdministrer && ajoutables.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select value={ajout} onChange={(e) => setAjout(e.target.value)} aria-label="Membre à ajouter" className={`${CLASSE_CHAMP} h-9 flex-1`}>
            <option value="">Ajouter un membre…</option>
            {ajoutables.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.nom}
              </option>
            ))}
          </select>
          <button type="button" disabled={enCours || !ajout} onClick={() => agir(() => ajouterAuGroupe(conversation.id, [ajout]))} className="h-9 rounded-lg bg-marque-500 px-3 font-semibold text-white disabled:opacity-50">
            Ajouter
          </button>
        </div>
      )}
      {message && <p className="text-xs text-[var(--encre-douce)]">{message}</p>}
    </div>
  );
}
