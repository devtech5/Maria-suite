"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { BoutonApercu } from "@/components/ui/apercu";
import { Avatar } from "@/components/ui/courrier";
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
/** Même plafond que le serveur : refuser tôt évite d'envoyer 30 Mo pour rien. */
const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES_ACCEPTES = "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx";

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });

const EMOJIS = [
  "😀", "😂", "😊", "😍", "😉", "😎", "🤔", "😅", "😢", "😡", "🙏", "👍",
  "👎", "👏", "🙌", "💪", "🤝", "👌", "✌️", "❤️", "🔥", "🎉", "✅", "❌",
  "⚠️", "📌", "📎", "📄", "📅", "⏰", "📞", "💰", "🏗️", "🚗", "☕", "👋",
];

function ecranVerrouille(): boolean {
  try {
    return localStorage.getItem("maria-verrou") === "1";
  } catch {
    return false;
  }
}

/** Heure aujourd'hui, « hier », le jour de la semaine, ou la date. */
function quand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const maintenant = new Date();
  const jours = Math.floor((debutJour(maintenant) - debutJour(d)) / 86_400_000);
  if (jours <= 0) return HEURE.format(d);
  if (jours === 1) return "Hier";
  if (jours < 7) return JOUR_COURT.format(d);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function debutJour(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** « Aujourd'hui », « Hier », sinon la date en toutes lettres. */
function titreJour(iso: string): string {
  const d = new Date(iso);
  const jours = Math.round((debutJour(new Date()) - debutJour(d)) / 86_400_000);
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Hier";
  return JOUR.format(d);
}

function taille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(Math.round(octets / 104_857.6) / 10).toString().replace(".", ",")} Mo`;
}

function extension(nom: string): string {
  return (nom.split(".").pop() ?? "").toUpperCase().slice(0, 4);
}

/** Teinte de la vignette d'un fichier, par famille : PDF rouge, Word bleu, Excel vert. */
function teinteFichier(nom: string, type: string): string {
  if (type === "application/pdf" || /\.pdf$/i.test(nom)) return "#e5484d";
  if (/\.(docx?|odt)$/i.test(nom) || type.includes("word")) return "#2b6cb0";
  if (/\.(xlsx?|ods|csv)$/i.test(nom) || type.includes("sheet") || type.includes("excel")) return "#1f8a5c";
  return "#667781";
}

// --------------------------------------------------------------- icônes

const TRACES = {
  nouveau: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  groupe: <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" />,
  actualiser: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  recherche: <path d="m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z" />,
  retour: <path d="M19 12H5m6-6-6 6 6 6" />,
  fermer: <path d="M6 6l12 12M18 6 6 18" />,
  envoyer: <path d="M4 12 20 4l-4 16-4-7-8-1Z" />,
  emoji: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" />,
  trombone: <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  infos: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-4m0-4h.01" />,
  horloge: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2" />,
  bas: <path d="M12 5v14m-6-6 6 6 6-6" />,
  discussions: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12Z" />,
} as const;

function Svg({ nom, className = "size-5" }: { nom: keyof typeof TRACES; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {TRACES[nom]}
    </svg>
  );
}

/** Une coche : envoyé ; deux coches dorées : lu par tous. */
function Coches({ lu, className = "" }: { lu: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 18 12" className={`h-3 w-[18px] shrink-0 ${lu ? "text-[var(--discussion-or)]" : "text-[var(--bulle-faible)]"} ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label={lu ? "Lu" : "Envoyé"}>
      <path d="m1 6.5 3.2 3.2L11 2.5" />
      {lu && <path d="m7.5 9.2.5.5L15 2.5" />}
    </svg>
  );
}

function BoutonIcone({ libelle, onClick, actif, children, className = "" }: { libelle: string; onClick: () => void; actif?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      title={libelle}
      aria-pressed={actif}
      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--encre-douce)] transition-colors hover:bg-[var(--surface-creuse)] ${actif ? "bg-[var(--surface-creuse)] text-[var(--encre)]" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------ messagerie

type Filtre = "toutes" | "non_lues" | "privees" | "groupes";

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "non_lues", libelle: "Non lues" },
  { cle: "privees", libelle: "Privées" },
  { cle: "groupes", libelle: "Groupes" },
];

type VueGauche = "liste" | "nouvelle" | "groupe";

/**
 * Messagerie interne, à la manière de WhatsApp : les discussions à gauche,
 * le fil à droite (l'un ou l'autre sur téléphone). Le fil se rafraîchit par
 * interrogation régulière — quasi instantané à l'écran, sans connexion tenue
 * ouverte derrière le pooler.
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
  const [vue, setVue] = useState<VueGauche>("liste");
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [recherche, setRecherche] = useState("");
  const [chargement, setChargement] = useState<string | null>(null);
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
    setVue("liste");
    setChargement(id);
    const r = await actualiser(id, null).catch(() => null);
    setChargement(null);
    if (r?.detail) {
      setOuverte(r.detail);
      setListe(r.conversations);
      window.history.replaceState(null, "", `/messagerie?c=${id}`);
    }
  }

  const cherche = recherche.trim().toLocaleLowerCase("fr");
  const visibles = liste.filter(
    (c) =>
      (filtre === "toutes" ||
        (filtre === "non_lues" && c.nonLus > 0) ||
        (filtre === "privees" && c.type !== "groupe") ||
        (filtre === "groupes" && c.type === "groupe")) &&
      (!cherche || c.nom.toLocaleLowerCase("fr").includes(cherche) || (c.apercu ?? "").toLocaleLowerCase("fr").includes(cherche)),
  );
  const comptes: Record<Filtre, number> = {
    toutes: 0,
    non_lues: liste.filter((c) => c.nonLus > 0).length,
    privees: liste.filter((c) => c.type !== "groupe" && c.nonLus > 0).length,
    groupes: liste.filter((c) => c.type === "groupe" && c.nonLus > 0).length,
  };
  const fermerFil = () => {
    setOuverte(null);
    window.history.replaceState(null, "", "/messagerie");
  };

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[30rem] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm lg:h-[calc(100dvh-8.5rem)]">
      {/* ------------------------------------------------ colonne de gauche */}
      <aside className={`flex w-full flex-col border-r border-[var(--filet)] md:w-[22rem] md:shrink-0 xl:w-[26rem] ${ouverte ? "max-md:hidden" : ""}`}>
        {vue === "liste" && (
          <>
            <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b-2 border-or bg-nuit px-4 text-white">
              <h2 className="text-xl font-bold tracking-tight">Discussions</h2>
              <div className="flex items-center">
                <BoutonIcone libelle="Nouvelle discussion" onClick={() => setVue("nouvelle")} className="!text-white hover:!bg-white/10">
                  <Svg nom="nouveau" />
                </BoutonIcone>
                <BoutonIcone libelle="Actualiser" onClick={() => void rafraichir(true)} className="!text-white hover:!bg-white/10">
                  <Svg nom="actualiser" />
                </BoutonIcone>
              </div>
            </header>
            <div className="px-3 pb-2 pt-2">
              <label className="flex h-10 items-center gap-3 rounded-lg bg-[var(--surface-creuse)] px-3 text-[var(--encre-faible)]">
                <Svg nom="recherche" className="size-4" />
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher ou démarrer une discussion"
                  aria-label="Rechercher une conversation"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--encre)] outline-none"
                />
                {recherche && (
                  <button type="button" onClick={() => setRecherche("")} aria-label="Effacer la recherche">
                    <Svg nom="fermer" className="size-4" />
                  </button>
                )}
              </label>
            </div>
            <div className="flex gap-2 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Filtrer les discussions">
              {FILTRES.map((f) => (
                <button
                  key={f.cle}
                  type="button"
                  role="tab"
                  aria-selected={filtre === f.cle}
                  onClick={() => setFiltre(f.cle)}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${
                    filtre === f.cle ? "bg-[color-mix(in_srgb,var(--discussion-accent)_18%,transparent)] font-semibold text-[var(--discussion-accent)]" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)] hover:brightness-95"
                  }`}
                >
                  {f.libelle}
                  {comptes[f.cle] > 0 && <span className="chiffres text-xs">{comptes[f.cle]}</span>}
                </button>
              ))}
            </div>
            {erreur && <p className="mx-3 mb-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-600">{erreur}</p>}

            <ul className="flex-1 overflow-y-auto">
              {liste.length === 0 && (
                <li className="flex flex-col items-center gap-3 p-8 text-center text-sm text-[var(--encre-faible)]">
                  <Svg nom="discussions" className="size-10" />
                  Aucune discussion. Écrivez à un collègue.
                  <button type="button" onClick={() => setVue("nouvelle")} className="rounded-full bg-[var(--discussion-accent)] px-4 py-2 text-sm font-semibold text-white">
                    Nouvelle discussion
                  </button>
                </li>
              )}
              {liste.length > 0 && visibles.length === 0 && <li className="p-6 text-center text-sm text-[var(--encre-faible)]">Aucune discussion ne correspond.</li>}
              {visibles.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void ouvrir(c.id)}
                    aria-current={c.id === ouverteId ? "true" : undefined}
                    className={`flex w-full items-center gap-3 px-3 text-left transition-colors hover:bg-[var(--surface-creuse)] ${c.id === ouverteId ? "bg-[var(--surface-creuse)]" : ""}`}
                  >
                    <Avatar nom={c.nom} groupe={c.type === "groupe"} className="size-12 text-sm" />
                    <span className="min-w-0 flex-1 border-b border-[var(--filet)] py-3">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[15px] font-medium">{c.nom}</span>
                        <span className={`chiffres shrink-0 text-xs ${c.nonLus > 0 ? "font-semibold text-[var(--discussion-or)]" : "text-[var(--encre-faible)]"}`}>
                          {chargement === c.id ? "…" : quand(c.dernierLe)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 text-sm text-[var(--encre-douce)]">
                          {c.dernierDeMoi && c.apercu && !c.retire && <Coches lu={false} />}
                          <span className="truncate">
                            {c.retire
                              ? "Vous avez quitté ce groupe"
                              : c.apercu
                                ? `${c.type === "groupe" && c.dernierAuteur && !c.dernierDeMoi ? `${c.dernierAuteur} : ` : ""}${c.apercu}`
                                : c.type === "groupe"
                                  ? `${c.membres} membres`
                                  : "Nouvelle discussion"}
                          </span>
                        </span>
                        {c.nonLus > 0 && (
                          <span className="chiffres flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-or px-1.5 text-[11px] font-bold text-nuit">{c.nonLus}</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {vue === "nouvelle" && (
          <NouvelleDiscussion
            membres={membres}
            gereLesGroupes={gereLesGroupes}
            retour={() => setVue("liste")}
            versGroupe={() => setVue("groupe")}
            choisir={(userId) =>
              demarrer(async () => {
                const r = await ecrireA(userId);
                if (r.ok && r.id) await ouvrir(r.id);
                else {
                  setErreur(r.message);
                  setVue("liste");
                }
              })
            }
          />
        )}

        {vue === "groupe" && (
          <FormulaireGroupe
            membres={membres}
            retour={() => setVue("nouvelle")}
            onCree={async (id) => {
              await ouvrir(id);
              routeur.refresh();
            }}
          />
        )}
      </aside>

      {/* -------------------------------------------------------- le fil */}
      <section className={`flex min-w-0 flex-1 flex-col ${ouverte ? "" : "max-md:hidden"}`}>
        {!ouverte ? (
          <div className="fond-discussion flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--discussion-accent)] shadow-sm">
              <Svg nom="discussions" className="size-10" />
            </span>
            <p className="text-lg font-semibold">Messagerie Maria Suite</p>
            <p className="max-w-sm text-sm text-[var(--encre-douce)]">Choisissez une discussion à gauche, ou écrivez à un collègue. Les messages restent dans l&apos;entreprise.</p>
          </div>
        ) : (
          <Fil
            key={ouverte.id}
            moi={moi}
            conversation={ouverte}
            membres={membres}
            gereLesGroupes={gereLesGroupes}
            fermer={fermerFil}
            apresEnvoi={() => rafraichir()}
            recharger={() => void rafraichir(true)}
          />
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------- nouvelle discussion

function EnTetePanneau({ titre, retour }: { titre: string; retour: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 bg-[var(--discussion-accent)] px-3 text-white">
      <button type="button" onClick={retour} aria-label="Retour" className="flex size-10 items-center justify-center rounded-full hover:bg-white/15">
        <Svg nom="retour" />
      </button>
      <h2 className="text-base font-semibold">{titre}</h2>
    </header>
  );
}

function NouvelleDiscussion({
  membres,
  gereLesGroupes,
  retour,
  versGroupe,
  choisir,
}: {
  membres: MembreEchangeable[];
  gereLesGroupes: boolean;
  retour: () => void;
  versGroupe: () => void;
  choisir: (userId: string) => void;
}) {
  const [q, setQ] = useState("");
  const cherche = q.trim().toLocaleLowerCase("fr");
  const trouves = membres.filter((m) => !cherche || m.nom.toLocaleLowerCase("fr").includes(cherche));
  // Regroupés par initiale, comme un répertoire de téléphone.
  const parLettre = useMemo(() => {
    const groupes = new Map<string, MembreEchangeable[]>();
    for (const m of trouves) {
      const lettre = m.nom.trim()[0]?.toLocaleUpperCase("fr") ?? "#";
      groupes.set(lettre, [...(groupes.get(lettre) ?? []), m]);
    }
    return [...groupes.entries()];
  }, [trouves]);

  return (
    <>
      <EnTetePanneau titre="Nouvelle discussion" retour={retour} />
      <div className="p-3">
        <label className="flex h-10 items-center gap-3 rounded-lg bg-[var(--surface-creuse)] px-3 text-[var(--encre-faible)]">
          <Svg nom="recherche" className="size-4" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Rechercher un collègue" aria-label="Rechercher un collègue" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--encre)] outline-none" />
        </label>
      </div>
      <ul className="flex-1 overflow-y-auto pb-3">
        {gereLesGroupes && !cherche && (
          <li>
            <button type="button" onClick={versGroupe} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-creuse)]">
              <span className="flex size-12 items-center justify-center rounded-full bg-[var(--discussion-accent)] text-white">
                <Svg nom="groupe" />
              </span>
              <span className="text-[15px] font-medium">Nouveau groupe</span>
            </button>
          </li>
        )}
        {membres.length === 0 && <li className="p-4 text-sm text-[var(--encre-faible)]">Personne d&apos;autre n&apos;a accès à la messagerie.</li>}
        {parLettre.map(([lettre, liste]) => (
          <li key={lettre}>
            <p className="px-6 pb-1 pt-4 text-sm font-medium text-[var(--discussion-accent)]">{lettre}</p>
            <ul>
              {liste.map((m) => (
                <li key={m.userId}>
                  <button type="button" onClick={() => choisir(m.userId)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--surface-creuse)]">
                    <Avatar nom={m.nom} className="size-12 text-sm" />
                    <span className="truncate text-[15px]">{m.nom}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function FormulaireGroupe({ membres, retour, onCree }: { membres: MembreEchangeable[]; retour: () => void; onCree: (id: string) => Promise<void> }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [enCours, demarrer] = useTransition();
  const cherche = q.trim().toLocaleLowerCase("fr");
  return (
    <>
      <EnTetePanneau titre="Nouveau groupe" retour={retour} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const donnees = new FormData(e.currentTarget);
          for (const id of choisis) donnees.append("membres", id);
          demarrer(async () => {
            const r = await nouveauGroupe(donnees);
            if (r.ok && r.id) await onCree(r.id);
            else setErreur(r.message);
          });
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="space-y-3 p-4">
          <input name="nom" required maxLength={80} placeholder="Nom du groupe" aria-label="Nom du groupe" className="h-10 w-full border-b-2 border-[var(--discussion-accent)] bg-transparent text-[15px] outline-none" />
          {choisis.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {choisis.map((id) => {
                const m = membres.find((x) => x.userId === id);
                return (
                  <button key={id} type="button" onClick={() => setChoisis((c) => c.filter((x) => x !== id))} className="flex items-center gap-1 rounded-full bg-[var(--surface-creuse)] py-0.5 pl-0.5 pr-2 text-xs">
                    <Avatar nom={m?.nom ?? "?"} className="size-6 text-[10px]" />
                    {m?.nom.split(/\s+/)[0]}
                    <Svg nom="fermer" className="size-3" />
                  </button>
                );
              })}
            </div>
          )}
          <label className="flex h-9 items-center gap-2 rounded-lg bg-[var(--surface-creuse)] px-3 text-[var(--encre-faible)]">
            <Svg nom="recherche" className="size-4" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter des membres" aria-label="Rechercher un membre" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--encre)] outline-none" />
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {membres
            .filter((m) => !cherche || m.nom.toLocaleLowerCase("fr").includes(cherche))
            .map((m) => {
              const coche = choisis.includes(m.userId);
              return (
                <li key={m.userId}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-[var(--surface-creuse)]">
                    <Avatar nom={m.nom} className="size-10 text-xs" />
                    <span className="flex-1 truncate text-sm">{m.nom}</span>
                    <input
                      type="checkbox"
                      checked={coche}
                      onChange={() => setChoisis((c) => (coche ? c.filter((x) => x !== m.userId) : [...c, m.userId]))}
                      className="size-5 accent-[var(--discussion-accent)]"
                    />
                  </label>
                </li>
              );
            })}
        </ul>
        {erreur && <p className="mx-4 mb-2 text-xs text-danger-600">{erreur}</p>}
        <div className="flex justify-center p-4">
          <button type="submit" disabled={enCours} className="h-11 rounded-full bg-[var(--discussion-accent)] px-6 text-sm font-semibold text-white disabled:opacity-50">
            {enCours ? "Création…" : `Créer le groupe${choisis.length ? ` (${choisis.length + 1})` : ""}`}
          </button>
        </div>
      </form>
    </>
  );
}

// ----------------------------------------------------------------- fil

/** Un message parti du navigateur, pas encore revenu du serveur. */
interface Envoi {
  cle: string;
  corps: string;
  fichier: File | null;
  apercu: string | null;
  etat: "envoi" | "echec";
  erreur?: string;
}

function Fil({
  moi,
  conversation,
  membres,
  gereLesGroupes,
  fermer,
  apresEnvoi,
  recharger,
}: {
  moi: string;
  conversation: DetailConversation;
  membres: MembreEchangeable[];
  gereLesGroupes: boolean;
  fermer: () => void;
  apresEnvoi: () => Promise<void>;
  recharger: () => void;
}) {
  const fond = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const entreeFichier = useRef<HTMLInputElement>(null);
  const [texte, setTexte] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercuFichier, setApercuFichier] = useState<string | null>(null);
  const apercuRef = useRef<string | null>(null);
  const [enAttente, setEnAttente] = useState<Envoi[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [emojis, setEmojis] = useState(false);
  const [infos, setInfos] = useState(false);
  const [recherche, setRecherche] = useState<string | null>(null);
  const [glisse, setGlisse] = useState(false);
  const [enBas, setEnBas] = useState(true);
  const [nouveaux, setNouveaux] = useState(0);
  const nombre = conversation.messages.length + enAttente.length;
  const dernierMien = conversation.messages.at(-1)?.auteurId === moi;
  const enBasRef = useRef(true);

  // Au bas du fil quand on y était, ou quand on vient d'écrire ; sinon on
  // compte ce qui arrive, et une flèche ramène en bas.
  useLayoutEffect(() => {
    const el = fond.current;
    if (!el) return;
    if (enBasRef.current || dernierMien || enAttente.length > 0) {
      el.scrollTop = el.scrollHeight;
    } else {
      setNouveaux((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seul le nombre de messages déclenche
  }, [nombre]);

  /** Le fichier choisi, et son aperçu local s'il s'agit d'une image ; l'ancien aperçu est libéré. */
  function poserFichier(f: File | null) {
    if (apercuRef.current) URL.revokeObjectURL(apercuRef.current);
    const url = f?.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    apercuRef.current = url;
    setApercuFichier(url);
    setFichier(f);
  }

  const peutAdministrer = conversation.type === "groupe" && (conversation.estAdmin || gereLesGroupes);

  function choisirFichier(f: File | null | undefined) {
    setErreur(null);
    if (!f) return;
    if (f.size > TAILLE_MAX) return setErreur(`« ${f.name} » pèse ${taille(f.size)} : 10 Mo au plus.`);
    poserFichier(f);
    champ.current?.focus();
  }

  async function expedier(envoi: Envoi) {
    const donnees = new FormData();
    donnees.set("corps", envoi.corps);
    if (envoi.fichier) donnees.set("fichier", envoi.fichier);
    const r = await envoyer(conversation.id, donnees).catch(() => ({ ok: false as const, message: "Réseau indisponible : message non envoyé." }));
    if (!r.ok) {
      setEnAttente((liste) => liste.map((e) => (e.cle === envoi.cle ? { ...e, etat: "echec", erreur: r.message } : e)));
      return;
    }
    // Le message revient du serveur avant de quitter la file : pas de trou à l'écran.
    await apresEnvoi();
    setEnAttente((liste) => liste.filter((e) => e.cle !== envoi.cle));
    if (envoi.apercu) URL.revokeObjectURL(envoi.apercu);
  }

  function partir() {
    const corps = texte.trim();
    if (!corps && !fichier) return;
    const envoi: Envoi = {
      cle: `${Date.now()}-${Math.random()}`,
      corps,
      fichier,
      apercu: fichier?.type.startsWith("image/") ? URL.createObjectURL(fichier) : null,
      etat: "envoi",
    };
    // La saisie se vide aussitôt, comme sur un téléphone : le message part en arrière-plan.
    setTexte("");
    poserFichier(null);
    setEmojis(false);
    setErreur(null);
    if (entreeFichier.current) entreeFichier.current.value = "";
    enBasRef.current = true;
    setEnAttente((liste) => [...liste, envoi]);
    void expedier(envoi);
    champ.current?.focus();
  }

  function insererEmoji(e: string) {
    const el = champ.current;
    if (!el) return setTexte((t) => t + e);
    const debut = el.selectionStart ?? texte.length;
    const fin = el.selectionEnd ?? texte.length;
    setTexte(texte.slice(0, debut) + e + texte.slice(fin));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(debut + e.length, debut + e.length);
    });
  }

  const cherche = recherche?.trim().toLocaleLowerCase("fr") ?? "";
  const messages = cherche ? conversation.messages.filter((m) => (m.corps ?? m.piece?.nom ?? "").toLocaleLowerCase("fr").includes(cherche)) : conversation.messages;

  const parJour = useMemo(() => {
    const groupes: { jour: string; messages: MessageAffiche[] }[] = [];
    for (const m of messages) {
      const jour = titreJour(m.le);
      const dernier = groupes.at(-1);
      if (dernier?.jour === jour) dernier.messages.push(m);
      else groupes.push({ jour, messages: [m] });
    }
    return groupes;
  }, [messages]);

  const sousTitre =
    conversation.type === "groupe"
      ? conversation.membres.map((m) => (m.userId === moi ? "vous" : m.nom.split(" ")[0])).join(", ")
      : "Conversation privée";

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          if (conversation.retire || !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setGlisse(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setGlisse(false);
        }}
        onDrop={(e) => {
          if (conversation.retire) return;
          e.preventDefault();
          setGlisse(false);
          choisirFichier(e.dataTransfer.files[0]);
        }}
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b-2 border-or bg-[var(--discussion-barre)] px-2 sm:px-4">
          <button type="button" onClick={fermer} aria-label="Retour aux discussions" className="flex size-10 items-center justify-center rounded-full hover:bg-[var(--surface-creuse)] md:hidden">
            <Svg nom="retour" />
          </button>
          <button type="button" onClick={() => setInfos((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Avatar nom={conversation.nom} groupe={conversation.type === "groupe"} className="size-10 text-xs" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{conversation.nom}</span>
              <span className="block truncate text-xs text-[var(--encre-faible)]">{sousTitre}</span>
            </span>
          </button>
          <BoutonIcone libelle="Rechercher dans la discussion" actif={recherche !== null} onClick={() => setRecherche((r) => (r === null ? "" : null))}>
            <Svg nom="recherche" />
          </BoutonIcone>
          <BoutonIcone libelle={conversation.type === "groupe" ? "Infos du groupe" : "Infos de la discussion"} actif={infos} onClick={() => setInfos((v) => !v)}>
            <Svg nom="infos" />
          </BoutonIcone>
          <BoutonIcone libelle="Fermer la discussion" onClick={fermer} className="max-md:hidden">
            <Svg nom="fermer" />
          </BoutonIcone>
        </header>

        {recherche !== null && (
          <div className="flex items-center gap-2 border-b border-[var(--filet)] bg-[var(--surface)] px-3 py-2">
            <Svg nom="recherche" className="size-4 text-[var(--encre-faible)]" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus placeholder="Rechercher un message" aria-label="Rechercher un message" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            {cherche && (
              <span className="chiffres text-xs text-[var(--encre-faible)]">
                {messages.length} résultat{messages.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        <div
          ref={fond}
          onScroll={(e) => {
            const el = e.currentTarget;
            const enBasMaintenant = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            enBasRef.current = enBasMaintenant;
            setEnBas(enBasMaintenant);
            if (enBasMaintenant) setNouveaux(0);
          }}
          className="fond-discussion flex-1 overflow-y-auto px-3 py-3 sm:px-[6%]"
        >
          {parJour.length === 0 && enAttente.length === 0 && (
            <p className="mx-auto mt-6 w-fit rounded-lg bg-[var(--bulle-autre)] px-3 py-1.5 text-center text-xs text-[var(--bulle-faible)] shadow-sm">
              {cherche ? "Aucun message ne correspond." : "Aucun message. Écrivez le premier."}
            </p>
          )}
          {parJour.map((g) => (
            <div key={g.jour}>
              <p className="sticky top-1 z-10 mx-auto my-3 w-fit rounded-lg bg-[var(--bulle-autre)] px-3 py-1 text-xs font-medium text-[var(--bulle-faible)] shadow-sm first-letter:uppercase">{g.jour}</p>
              {g.messages.map((m, i) => {
                const precedent = g.messages[i - 1];
                const suite = Boolean(precedent && precedent.auteurId === m.auteurId && new Date(m.le).getTime() - new Date(precedent.le).getTime() < 5 * 60_000);
                return <Bulle key={m.id} message={m} mien={m.auteurId === moi} groupe={conversation.type === "groupe"} suite={suite} />;
              })}
            </div>
          ))}
          {enAttente.map((e) => (
            <BulleEnvoi
              key={e.cle}
              envoi={e}
              reessayer={() => {
                setEnAttente((liste) => liste.map((x) => (x.cle === e.cle ? { ...x, etat: "envoi", erreur: undefined } : x)));
                void expedier({ ...e, etat: "envoi" });
              }}
              abandonner={() => {
                setEnAttente((liste) => liste.filter((x) => x.cle !== e.cle));
                if (e.apercu) URL.revokeObjectURL(e.apercu);
              }}
            />
          ))}
        </div>

        {!enBas && (
          <button
            type="button"
            onClick={() => fond.current?.scrollTo({ top: fond.current.scrollHeight, behavior: "smooth" })}
            aria-label="Aller aux derniers messages"
            className="absolute bottom-20 right-5 z-10 flex size-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--encre-douce)] shadow-md"
          >
            <Svg nom="bas" />
            {nouveaux > 0 && <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--discussion-accent)] px-1 text-[11px] font-bold text-white">{nouveaux}</span>}
          </button>
        )}

        {glisse && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--surface)]/85 backdrop-blur-sm">
            <p className="rounded-2xl border-2 border-dashed border-[var(--discussion-accent)] px-8 py-6 text-center text-sm font-medium text-[var(--discussion-accent)]">
              Déposez le fichier pour l&apos;envoyer
              <span className="mt-1 block text-xs font-normal text-[var(--encre-faible)]">Image, PDF, Word ou Excel · 10 Mo au plus</span>
            </p>
          </div>
        )}

        {conversation.retire ? (
          <p className="border-t border-[var(--filet)] bg-[var(--discussion-barre)] p-4 text-center text-sm text-[var(--encre-faible)]">Vous ne faites plus partie de ce groupe.</p>
        ) : (
          <div className="relative shrink-0 bg-[var(--discussion-barre)] px-2 py-2 sm:px-4">
            {emojis && (
              <div className="absolute bottom-full left-2 z-20 mb-2 grid w-[19rem] grid-cols-8 gap-0.5 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-2 shadow-lg">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => insererEmoji(e)} className="flex size-9 items-center justify-center rounded-lg text-xl hover:bg-[var(--surface-creuse)]" aria-label={`Insérer ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
            {fichier && (
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-[var(--surface)] p-2 shadow-sm">
                {apercuFichier ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), rien à optimiser
                  <img src={apercuFichier} alt="" className="size-14 rounded-lg object-cover" />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: teinteFichier(fichier.name, fichier.type) }}>
                    {extension(fichier.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{fichier.name}</span>
                  <span className="block text-xs text-[var(--encre-faible)]">{taille(fichier.size)} · prêt à envoyer</span>
                </span>
                <BoutonIcone libelle="Retirer le fichier" onClick={() => poserFichier(null)}>
                  <Svg nom="fermer" />
                </BoutonIcone>
              </div>
            )}
            {erreur && <p className="mb-2 rounded-lg bg-danger-50 px-3 py-1.5 text-xs text-danger-600">{erreur}</p>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                partir();
              }}
              className="flex items-end gap-1.5"
            >
              <BoutonIcone libelle="Émojis" actif={emojis} onClick={() => setEmojis((v) => !v)}>
                <Svg nom="emoji" className="size-6" />
              </BoutonIcone>
              <input ref={entreeFichier} type="file" className="sr-only" aria-label="Joindre un fichier" accept={TYPES_ACCEPTES} onChange={(e) => choisirFichier(e.target.files?.[0])} />
              <BoutonIcone libelle="Joindre un fichier" onClick={() => entreeFichier.current?.click()}>
                <Svg nom="trombone" className="size-6" />
              </BoutonIcone>
              <textarea
                ref={champ}
                value={texte}
                onChange={(e) => {
                  setTexte(e.target.value);
                  // La zone grandit avec le texte, jusqu'à six lignes.
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
                }}
                onKeyDown={(e) => {
                  // Entrée envoie, Maj+Entrée revient à la ligne — comme partout ailleurs.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    partir();
                  }
                }}
                onPaste={(e) => {
                  const image = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
                  if (image) {
                    e.preventDefault();
                    choisirFichier(image);
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={fichier ? "Ajouter une légende" : "Tapez un message"}
                aria-label="Votre message"
                className="max-h-36 min-h-10 flex-1 resize-none rounded-lg bg-[var(--surface)] px-3.5 py-2.5 text-[15px] leading-5 outline-none"
              />
              <button
                type="submit"
                disabled={!texte.trim() && !fichier}
                aria-label="Envoyer"
                title="Envoyer"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--discussion-accent)] text-white transition-opacity disabled:opacity-40"
              >
                <Svg nom="envoyer" className="size-5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {infos && (
        <aside className="flex w-full shrink-0 flex-col border-l border-[var(--filet)] bg-[var(--surface)] max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:max-w-sm sm:w-80">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--filet)] bg-[var(--discussion-barre)] px-3">
            <BoutonIcone libelle="Fermer les infos" onClick={() => setInfos(false)}>
              <Svg nom="fermer" />
            </BoutonIcone>
            <h3 className="text-base font-medium">{conversation.type === "groupe" ? "Infos du groupe" : "Infos de la discussion"}</h3>
          </header>
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col items-center gap-2 border-b border-[var(--filet)] px-4 py-6 text-center">
              <Avatar nom={conversation.nom} groupe={conversation.type === "groupe"} className="size-24 text-2xl" />
              <p className="text-lg font-medium">{conversation.nom}</p>
              <p className="text-sm text-[var(--encre-faible)]">
                {conversation.type === "groupe" ? `Groupe · ${conversation.membres.length} membres` : "Conversation privée"}
              </p>
            </div>
            {conversation.type === "groupe" && (
              <GestionGroupe moi={moi} conversation={conversation} membres={membres} peutAdministrer={peutAdministrer} recharger={recharger} />
            )}
            <PiecesDeLaDiscussion messages={conversation.messages} />
          </div>
        </aside>
      )}
    </div>
  );
}

/** Les fichiers échangés dans la discussion, du plus récent au plus ancien. */
function PiecesDeLaDiscussion({ messages }: { messages: MessageAffiche[] }) {
  const pieces = messages.filter((m) => m.piece && !m.efface).reverse();
  if (pieces.length === 0) return null;
  return (
    <section className="px-4 py-4">
      <p className="mb-2 text-sm text-[var(--encre-faible)]">Fichiers · {pieces.length}</p>
      <ul className="space-y-1">
        {pieces.slice(0, 30).map((m) => (
          <li key={m.id}>
            <BoutonApercu
              piece={{ titre: m.piece!.nom, nomFichier: m.piece!.nom, typeMime: m.piece!.typeMime, signer: () => ouvrirPieceJointe(m.id) }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface-creuse)]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: m.piece!.typeMime.startsWith("image/") ? "#7c3aed" : teinteFichier(m.piece!.nom, m.piece!.typeMime) }}>
                {extension(m.piece!.nom)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{m.piece!.nom}</span>
                <span className="block text-xs text-[var(--encre-faible)]">
                  {taille(m.piece!.taille)} · {quand(m.le)}
                </span>
              </span>
            </BoutonApercu>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- bulles

/**
 * Image jointe, affichée dans la bulle : son adresse signée (cinq minutes)
 * n'est demandée qu'à l'approche de l'écran, jamais rendue dans le HTML.
 */
function ImageJointe({ messageId, nom, typeMime }: { messageId: string; nom: string; typeMime: string }) {
  const cadre = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    let actif = true;
    const observateur = new IntersectionObserver(
      (entrees) => {
        if (!entrees.some((e) => e.isIntersecting)) return;
        observateur.disconnect();
        void ouvrirPieceJointe(messageId)
          .then((u) => {
            if (!actif) return;
            if (u) setUrl(u);
            else setEchec(true);
          })
          .catch(() => actif && setEchec(true));
      },
      { rootMargin: "200px" },
    );
    observateur.observe(el);
    return () => {
      actif = false;
      observateur.disconnect();
    };
  }, [messageId]);

  return (
    <div ref={cadre} className="mb-1 overflow-hidden rounded-md">
      <BoutonApercu piece={{ titre: nom, nomFichier: nom, typeMime, signer: () => ouvrirPieceJointe(messageId) }} className="block">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- adresse signée et éphémère, hors de l'optimiseur d'images
          <img src={url} alt={nom} loading="lazy" className="max-h-72 w-full max-w-[18rem] object-cover" />
        ) : (
          <span className="flex h-40 w-64 max-w-full items-center justify-center bg-black/5 text-xs text-[var(--bulle-faible)]">{echec ? "Image indisponible" : "Chargement de l'image…"}</span>
        )}
      </BoutonApercu>
    </div>
  );
}

function CarteFichier({ nom, typeMime, octets, children }: { nom: string; typeMime: string; octets: number | null; children?: ReactNode }) {
  return (
    <span className="mb-1 flex w-64 max-w-full items-center gap-3 rounded-md bg-black/5 p-2 text-left">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: teinteFichier(nom, typeMime) }}>
        {extension(nom)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{nom}</span>
        <span className="block text-xs text-[var(--bulle-faible)]">{[octets !== null ? taille(octets) : null, extension(nom)].filter(Boolean).join(" · ")}</span>
      </span>
      {children}
    </span>
  );
}

function Bulle({ message, mien, groupe, suite }: { message: MessageAffiche; mien: boolean; groupe: boolean; suite: boolean }) {
  const [, demarrer] = useTransition();
  const [efface, setEfface] = useState(message.efface);
  const [menu, setMenu] = useState(false);
  const vu = message.autres > 0 && message.luPar >= message.autres;
  const image = message.piece?.typeMime.startsWith("image/");
  const cote = mien ? "justify-end" : "justify-start";
  const forme = `${mien ? "bg-[var(--bulle-moi)]" : "bg-[var(--bulle-autre)]"} ${suite ? "rounded-lg" : mien ? "rounded-lg rounded-tr-none" : "rounded-lg rounded-tl-none"}`;

  if (efface) {
    return (
      <div className={`flex ${cote} ${suite ? "mt-0.5" : "mt-2"}`}>
        <p className={`${forme} px-3 py-1.5 text-sm italic text-[var(--bulle-faible)] shadow-sm`}>🚫 Message supprimé</p>
      </div>
    );
  }

  return (
    <div className={`group flex ${cote} ${suite ? "mt-0.5" : "mt-2"}`}>
      <div className={`relative max-w-[85%] px-2 pb-1 pt-1.5 text-[var(--bulle-encre)] shadow-sm sm:max-w-[65%] ${forme}`}>
        {groupe && !mien && !suite && <p className="mb-0.5 px-1 text-xs font-semibold" style={{ color: couleurAuteur(message.auteur) }}>{message.auteur}</p>}
        {message.piece &&
          (image ? (
            <ImageJointe messageId={message.id} nom={message.piece.nom} typeMime={message.piece.typeMime} />
          ) : (
            <BoutonApercu
              piece={{ titre: message.piece.nom, nomFichier: message.piece.nom, typeMime: message.piece.typeMime, signer: () => ouvrirPieceJointe(message.id) }}
              className="block hover:brightness-95"
            >
              <CarteFichier nom={message.piece.nom} typeMime={message.piece.typeMime} octets={message.piece.taille} />
            </BoutonApercu>
          ))}
        <div className="px-1">
          {message.corps && <span className="whitespace-pre-wrap break-words text-[14.5px] leading-5">{message.corps}</span>}
          {/* L'heure flotte en bas à droite ; l'espace réservé évite qu'elle chevauche la dernière ligne. */}
          <span aria-hidden className="inline-block w-16" />
          <span className="float-right -mb-0.5 ml-2 mt-1 flex items-center gap-1 text-[11px] leading-none text-[var(--bulle-faible)]">
            {HEURE.format(new Date(message.le))}
            {mien && <Coches lu={vu} />}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-label="Options du message"
          className={`absolute right-1 top-1 hidden size-6 items-center justify-center rounded-full bg-inherit text-[var(--bulle-faible)] group-hover:flex ${menu ? "flex" : ""}`}
        >
          <Svg nom="chevron" className="size-4" />
        </button>
        {menu && (
          <div className="absolute right-1 top-7 z-20 w-40 overflow-hidden rounded-lg border border-[var(--filet)] bg-[var(--surface)] py-1 text-sm text-[var(--encre)] shadow-lg" onMouseLeave={() => setMenu(false)}>
            {message.corps && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-[var(--surface-creuse)]"
                onClick={() => {
                  void navigator.clipboard?.writeText(message.corps ?? "").catch(() => undefined);
                  setMenu(false);
                }}
              >
                Copier
              </button>
            )}
            {mien && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-danger-600 hover:bg-[var(--surface-creuse)]"
                onClick={() => {
                  setMenu(false);
                  if (!window.confirm("Supprimer ce message pour tout le monde ?")) return;
                  demarrer(async () => {
                    const r = await supprimerMessage(message.id);
                    if (r.ok) setEfface(true);
                  });
                }}
              >
                Supprimer
              </button>
            )}
            {!message.corps && !mien && <p className="px-3 py-2 text-[var(--encre-faible)]">Aucune option</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Un message en route : horloge, barre qui avance ; en échec, réessayer ou abandonner. */
function BulleEnvoi({ envoi, reessayer, abandonner }: { envoi: Envoi; reessayer: () => void; abandonner: () => void }) {
  return (
    <div className="mt-2 flex justify-end">
      <div className={`max-w-[85%] rounded-lg rounded-tr-none bg-[var(--bulle-moi)] px-2 pb-1 pt-1.5 text-[var(--bulle-encre)] shadow-sm sm:max-w-[65%] ${envoi.etat === "envoi" ? "opacity-90" : ""}`}>
        {envoi.fichier &&
          (envoi.apercu ? (
            <div className="relative mb-1 overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) */}
              <img src={envoi.apercu} alt={envoi.fichier.name} className={`max-h-72 w-full max-w-[18rem] object-cover ${envoi.etat === "envoi" ? "opacity-60" : ""}`} />
              {envoi.etat === "envoi" && <BarreEnvoi />}
            </div>
          ) : (
            <div className="relative">
              <CarteFichier nom={envoi.fichier.name} typeMime={envoi.fichier.type} octets={envoi.fichier.size} />
              {envoi.etat === "envoi" && <BarreEnvoi />}
            </div>
          ))}
        <div className="px-1">
          {envoi.corps && <span className="whitespace-pre-wrap break-words text-[14.5px] leading-5">{envoi.corps}</span>}
          <span aria-hidden className="inline-block w-16" />
          <span className="float-right -mb-0.5 ml-2 mt-1 flex items-center gap-1 text-[11px] leading-none text-[var(--bulle-faible)]">
            {envoi.etat === "envoi" ? (
              <>
                {envoi.fichier ? `Envoi de ${taille(envoi.fichier.size)}…` : "Envoi…"}
                <Svg nom="horloge" className="size-3.5" />
              </>
            ) : (
              <span className="text-danger-600">Non envoyé</span>
            )}
          </span>
        </div>
        {envoi.etat === "echec" && (
          <div className="mt-1 flex items-center justify-end gap-3 border-t border-black/10 px-1 pt-1 text-xs">
            {envoi.erreur && <span className="mr-auto text-danger-600">{envoi.erreur}</span>}
            <button type="button" onClick={abandonner} className="text-[var(--bulle-faible)] hover:underline">
              Abandonner
            </button>
            <button type="button" onClick={reessayer} className="font-semibold text-[var(--discussion-accent)] hover:underline">
              Réessayer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Barre de chargement indéterminée : le serveur ne dit pas où il en est, on montre qu'il travaille. */
function BarreEnvoi() {
  return (
    <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/15" role="progressbar" aria-label="Envoi en cours">
      <span className="barre-envoi block h-full w-2/5 rounded-full bg-[var(--discussion-accent)]" />
    </span>
  );
}

const COULEURS_AUTEURS = ["#1f8a5c", "#c2410c", "#7c3aed", "#0369a1", "#be185d", "#a16207", "#0f766e", "#b91c1c"];
function couleurAuteur(nom: string): string {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COULEURS_AUTEURS[h % COULEURS_AUTEURS.length];
}

// --------------------------------------------------------------- groupe

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
    <div className="space-y-4 border-b border-[var(--filet)] px-4 py-4 text-sm">
      {peutAdministrer && (
        <div className="flex gap-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} aria-label="Nom du groupe" className="h-9 min-w-0 flex-1 border-b border-[var(--filet)] bg-transparent outline-none focus:border-[var(--discussion-accent)]" />
          <button type="button" disabled={enCours || nom.trim() === conversation.nom} onClick={() => agir(() => renommer(conversation.id, nom))} className="font-semibold text-[var(--discussion-accent)] disabled:opacity-40">
            Renommer
          </button>
        </div>
      )}
      <div>
        <p className="mb-1 text-[var(--encre-faible)]">{conversation.membres.length} membres</p>
        {peutAdministrer && ajoutables.length > 0 && (
          <div className="mb-2 flex gap-2">
            <select value={ajout} onChange={(e) => setAjout(e.target.value)} aria-label="Membre à ajouter" className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-2">
              <option value="">Ajouter un membre…</option>
              {ajoutables.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.nom}
                </option>
              ))}
            </select>
            <button type="button" disabled={enCours || !ajout} onClick={() => agir(() => ajouterAuGroupe(conversation.id, [ajout]))} className="h-9 rounded-lg bg-[var(--discussion-accent)] px-3 font-semibold text-white disabled:opacity-50">
              Ajouter
            </button>
          </div>
        )}
        <ul>
          {conversation.membres.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2">
              <Avatar nom={m.nom} className="size-9 text-xs" />
              <span className="min-w-0 flex-1 truncate">{m.userId === moi ? "Vous" : m.nom}</span>
              {m.role === "admin" && <span className="rounded border border-[var(--discussion-accent)] px-1.5 text-[11px] text-[var(--discussion-accent)]">Admin</span>}
              {m.userId !== moi && peutAdministrer && (
                <button type="button" disabled={enCours} onClick={() => agir(() => retirerDuGroupe(conversation.id, m.userId))} className="text-xs text-danger-600 hover:underline">
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" disabled={enCours} onClick={() => window.confirm("Quitter ce groupe ?") && agir(() => retirerDuGroupe(conversation.id, moi))} className="flex items-center gap-2 font-medium text-danger-600 hover:underline">
        Quitter le groupe
      </button>
      {message && <p className="text-xs text-[var(--encre-douce)]">{message}</p>}
    </div>
  );
}
