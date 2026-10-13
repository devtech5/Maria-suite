"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { etatCloche, marquerNotificationsLues, type NotificationVue } from "@/modules/communication/actions";

/** Toutes les 45 secondes onglet visible ; rien quand il est caché ou l'écran verrouillé. */
const PAS_MS = 45_000;

function ecranVerrouille(): boolean {
  try {
    return localStorage.getItem("maria-verrou") === "1";
  } catch {
    return false;
  }
}

const HEURE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Cloche des notifications : ce qui attend la personne connectée — une tâche
 * attribuée, une dépense à approuver, un bon de caisse.
 */
export function Cloche() {
  const [nonLues, setNonLues] = useState(0);
  const [dernieres, setDernieres] = useState<NotificationVue[]>([]);
  const [messages, setMessages] = useState<number | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const panneau = useRef<HTMLDivElement>(null);
  const routeur = useRouter();

  const rafraichir = useCallback(async () => {
    if (document.visibilityState !== "visible" || ecranVerrouille()) return;
    try {
      const etat = await etatCloche();
      setNonLues(etat.nonLues);
      setDernieres(etat.dernieres);
      setMessages(etat.messages);
    } catch {
      // Réseau coupé : la cloche garde son dernier état, elle réessaiera.
    }
  }, []);

  useEffect(() => {
    // Premier relevé au montage, puis à intervalle régulier et au retour sur l'onglet.
    const premier = window.setTimeout(() => void rafraichir(), 0);
    const minuterie = window.setInterval(() => void rafraichir(), PAS_MS);
    const surVisibilite = () => void rafraichir();
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.clearTimeout(premier);
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [rafraichir]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (panneau.current && !panneau.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  async function ouvrir(n: NotificationVue) {
    setOuvert(false);
    if (!n.lue) {
      setNonLues((v) => Math.max(0, v - 1));
      setDernieres((l) => l.map((x) => (x.id === n.id ? { ...x, lue: true } : x)));
      void marquerNotificationsLues([n.id]);
    }
    if (n.lien) routeur.push(n.lien);
  }

  async function toutLire() {
    setNonLues(0);
    setDernieres((l) => l.map((x) => ({ ...x, lue: true })));
    await marquerNotificationsLues();
  }

  return (
    <div ref={panneau} className="relative flex items-center gap-1">
      {messages !== null && (
        <Link
          href="/messagerie"
          aria-label={messages > 0 ? `${messages} message${messages > 1 ? "s" : ""} non lu${messages > 1 ? "s" : ""}` : "Messagerie"}
          className="relative flex size-9 items-center justify-center rounded-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {messages > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-marque-500 px-1 text-[10px] font-bold text-white">
              {messages > 99 ? "99+" : messages}
            </span>
          )}
        </Link>
      )}
      <button
        type="button"
        onClick={() => {
          setOuvert((o) => !o);
          void rafraichir();
        }}
        aria-label={nonLues > 0 ? `${nonLues} notification${nonLues > 1 ? "s" : ""} non lue${nonLues > 1 ? "s" : ""}` : "Notifications"}
        aria-expanded={ouvert}
        className="relative flex size-9 items-center justify-center rounded-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {nonLues > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">
            {nonLues > 99 ? "99+" : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--filet)] px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {nonLues > 0 && (
              <button type="button" onClick={() => void toutLire()} className="text-xs text-marque-600 hover:underline">
                Tout marquer comme lu
              </button>
            )}
          </div>
          {dernieres.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--encre-faible)]">Rien de nouveau.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-[var(--filet)] overflow-y-auto">
              {dernieres.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void ouvrir(n)}
                    className={`block w-full px-3 py-2.5 text-left hover:bg-[var(--surface-creuse)] ${n.lue ? "" : "bg-marque-50/60"}`}
                  >
                    <span className="flex items-start gap-2">
                      {!n.lue && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-marque-500" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{n.titre}</span>
                        {n.corps && <span className="block truncate text-xs text-[var(--encre-douce)]">{n.corps}</span>}
                        <span className="chiffres block text-[11px] text-[var(--encre-faible)]">{HEURE.format(new Date(n.le))}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" onClick={() => setOuvert(false)} className="block border-t border-[var(--filet)] px-3 py-2 text-center text-xs text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]">
            Toutes les notifications
          </Link>
        </div>
      )}
    </div>
  );
}
