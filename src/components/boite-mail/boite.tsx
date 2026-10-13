"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  ActionRuban,
  Avatar,
  BoutonPied,
  EntreeDossier,
  Icone,
  LigneListe,
  Ruban,
  SeparateurRuban,
  TitreLecture,
  VignettePiece,
  type NomIcone,
} from "@/components/ui/courrier";
import { CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import {
  archiverMessage,
  deconnecterBoite,
  envoyerCourriel,
  listerDossiers,
  listerMessages,
  marquerNonLu,
  marquerSuivi,
  mettreCorbeille,
  ouvrirMessage,
  telechargerPiece,
} from "@/modules/boite-mail/actions";
import { documentCourriel } from "@/modules/boite-mail/fournisseurs";
import type { ApercuMessage, Dossier, MessageLu } from "@/modules/boite-mail/imap";

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
const COMPLET = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" });
const ENTETE = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function quand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? HEURE.format(d) : JOUR.format(d);
}

function taille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(Math.round(octets / 104_857.6) / 10).toString().replace(".", ",")} Mo`;
}

const ICONE_USAGE: Record<string, NomIcone> = {
  "\\Inbox": "reception",
  "\\Sent": "envoyes",
  "\\Drafts": "brouillons",
  "\\Junk": "indesirables",
  "\\Trash": "corbeille",
  "\\Archive": "archiver",
  "\\Flagged": "drapeau",
};

interface Brouillon {
  a: string;
  cc: string;
  objet: string;
  texte: string;
  enReponseA?: string | null;
  references?: string[];
}

/**
 * La boîte mail, présentée comme Outlook : ruban, dossiers, liste, lecture.
 * Rien n'est gardé en base ni dans le navigateur au-delà de l'écran ouvert.
 */
export function BoiteMail({ adresse, signature }: { adresse: string; signature: string | null }) {
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  const [dossier, setDossier] = useState("INBOX");
  const [liste, setListe] = useState<ApercuMessage[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [ouvert, setOuvert] = useState<MessageLu | null>(null);
  const [redaction, setRedaction] = useState<Brouillon | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const charger = useCallback((d: string, p: number) => {
    demarrer(async () => {
      setErreur(null);
      const r = await listerMessages(d, p);
      if (!r.ok) return setErreur(r.message);
      setListe(r.messages);
      setTotal(r.total);
    });
  }, []);

  useEffect(() => {
    demarrer(async () => {
      const r = await listerDossiers();
      if (!r.ok) return setErreur(r.message);
      setDossiers(r.dossiers);
    });
  }, []);

  useEffect(() => {
    charger(dossier, page);
  }, [dossier, page, charger]);

  function lire(uid: number) {
    setErreur(null);
    setRedaction(null);
    demarrer(async () => {
      const r = await ouvrirMessage(dossier, uid);
      if (!r.ok) return setErreur(r.message);
      setOuvert(r.message);
      setListe((l) => l?.map((m) => (m.uid === uid ? { ...m, lu: true } : m)) ?? l);
    });
  }

  function changerDossier(d: string) {
    setDossier(d);
    setPage(0);
    setOuvert(null);
  }

  const pied = signature ? `\n\n--\n${signature}` : "";
  const citer = (m: MessageLu) =>
    `\n\n${pied}\n\nLe ${m.date ? COMPLET.format(new Date(m.date)) : ""}, ${m.de[0]?.nom ?? m.de[0]?.adresse ?? ""} a écrit :\n${m.texte
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n")}`;

  function nouveau() {
    setOuvert(null);
    setRedaction({ a: "", cc: "", objet: "", texte: pied });
  }

  function repondre(m: MessageLu, tous: boolean) {
    const de = m.de[0]?.adresse ?? "";
    const cc = tous ? [...m.a, ...m.cc].map((x) => x.adresse).filter((x) => x.toLowerCase() !== adresse.toLowerCase() && x !== de) : [];
    setRedaction({
      a: de,
      cc: cc.join(", "),
      objet: /^re\s*:/i.test(m.objet) ? m.objet : `Re : ${m.objet}`,
      texte: citer(m),
      enReponseA: m.messageId,
      references: [...m.references, ...(m.messageId ? [m.messageId] : [])],
    });
  }

  function transferer(m: MessageLu) {
    setRedaction({
      a: "",
      cc: "",
      objet: /^(tr|fwd?)\s*:/i.test(m.objet) ? m.objet : `Tr : ${m.objet}`,
      texte: `${pied}\n\n---------- Message transféré ----------\nDe : ${m.de.map((x) => x.nom ?? x.adresse).join(", ")}\nObjet : ${m.objet}\n\n${m.texte}`,
    });
  }

  /** Une action sur le message ouvert ; en cas de succès, la liste suit sans recharger. */
  function agir(action: (uid: number) => Promise<{ ok: boolean; message: string }>, apres: (uid: number) => void) {
    if (!ouvert) return;
    const uid = ouvert.uid;
    setErreur(null);
    demarrer(async () => {
      const r = await action(uid);
      if (r.ok) apres(uid);
      else setErreur(r.message);
    });
  }
  const retirer = (uid: number) => {
    setOuvert(null);
    setListe((l) => l?.filter((x) => x.uid !== uid) ?? l);
  };

  const apercuOuvert = ouvert ? liste?.find((x) => x.uid === ouvert.uid) : undefined;
  const rang = ouvert && liste ? liste.findIndex((x) => x.uid === ouvert.uid) : -1;
  const voisin = (pas: number) => (liste && rang >= 0 && liste[rang + pas] ? () => lire(liste[rang + pas].uid) : null);
  const plusieurs = Boolean(ouvert && ouvert.a.length + ouvert.cc.length > 1);
  const dansArchives = dossiers?.find((d) => d.chemin === dossier)?.usage === "\\Archive";
  const lecture = Boolean(ouvert || redaction);

  const parPage = 30;
  const pages = Math.max(1, Math.ceil(total / parPage));
  const libelleDossier = dossiers?.find((d) => d.chemin === dossier)?.libelle ?? "Boîte de réception";

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-[30rem] lg:h-[calc(100dvh-9rem)] flex-col gap-2">
      <Ruban>
        <ActionRuban principal icone="nouveau" libelle="Nouveau message" onClick={nouveau} />
        <SeparateurRuban />
        <ActionRuban icone="corbeille" libelle="Supprimer" danger disabled={!ouvert || enCours} onClick={() => agir((uid) => mettreCorbeille(dossier, uid), retirer)} />
        <ActionRuban icone="archiver" libelle="Archiver" disabled={!ouvert || enCours || dansArchives} onClick={() => agir((uid) => archiverMessage(dossier, uid), retirer)} />
        <SeparateurRuban />
        <ActionRuban icone="repondre" libelle="Répondre" disabled={!ouvert} onClick={() => ouvert && repondre(ouvert, false)} />
        <ActionRuban icone="repondre-tous" libelle="Répondre à tous" disabled={!plusieurs} onClick={() => ouvert && repondre(ouvert, true)} />
        <ActionRuban icone="transferer" libelle="Transférer" disabled={!ouvert} onClick={() => ouvert && transferer(ouvert)} />
        <SeparateurRuban />
        <ActionRuban
          icone="enveloppe"
          libelle="Non lu"
          disabled={!ouvert || enCours}
          onClick={() =>
            agir(
              (uid) => marquerNonLu(dossier, uid),
              (uid) => {
                setOuvert(null);
                setListe((l) => l?.map((x) => (x.uid === uid ? { ...x, lu: false } : x)) ?? l);
              },
            )
          }
        />
        <ActionRuban
          icone="drapeau"
          libelle={apercuOuvert?.suivi ? "Retirer le suivi" : "Suivi"}
          actif={Boolean(apercuOuvert?.suivi)}
          disabled={!ouvert || enCours}
          onClick={() => {
            const suivi = !apercuOuvert?.suivi;
            agir(
              (uid) => marquerSuivi(dossier, uid, suivi),
              (uid) => setListe((l) => l?.map((x) => (x.uid === uid ? { ...x, suivi } : x)) ?? l),
            );
          }}
        />
        <SeparateurRuban />
        <ActionRuban icone="actualiser" libelle="Actualiser" disabled={enCours} onClick={() => charger(dossier, page)} />
      </Ruban>

      {erreur && <p className="shrink-0 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-600">{erreur}</p>}

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Dossiers */}
        <nav className="hidden w-56 shrink-0 flex-col lg:flex">
          <p className="truncate px-2.5 pb-2 pt-1 text-sm font-semibold" title={adresse}>
            {adresse}
          </p>
          <ul className="flex-1 space-y-0.5 overflow-y-auto">
            {(dossiers ?? []).map((d) => (
              <li key={d.chemin}>
                <EntreeDossier
                  icone={(d.usage && ICONE_USAGE[d.usage]) || "dossier"}
                  libelle={d.libelle}
                  compte={d.nonLus}
                  actif={d.chemin === dossier}
                  onClick={() => changerDossier(d.chemin)}
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("Déconnecter cette boîte ? Le mot de passe enregistré sera effacé ; vos e-mails restent chez votre fournisseur.")) return;
              demarrer(async () => {
                await deconnecterBoite();
                routeur.refresh();
              });
            }}
            className="mt-1 flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-xs text-danger-600 hover:bg-[var(--surface-creuse)]"
          >
            <Icone nom="sortie" />
            Déconnecter la boîte
          </button>
        </nav>

        {/* Liste */}
        <section className={`flex w-full flex-col overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm md:w-80 md:shrink-0 xl:w-96 ${lecture ? "max-md:hidden" : ""}`}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--filet)] px-3 py-2">
            <select value={dossier} onChange={(e) => changerDossier(e.target.value)} aria-label="Dossier" className={`${CLASSE_CHAMP_COMPACT} h-9 min-w-0 max-w-[45%] lg:hidden`}>
              {(dossiers ?? [{ chemin: "INBOX", libelle: "Boîte de réception" } as Dossier]).map((d) => (
                <option key={d.chemin} value={d.chemin}>
                  {d.libelle}
                </option>
              ))}
            </select>
            <span className="hidden truncate text-sm font-semibold lg:inline">{libelleDossier}</span>
            <span className="flex shrink-0 items-center text-xs text-[var(--encre-faible)]">
              <button type="button" disabled={page === 0 || enCours} onClick={() => setPage(page - 1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-[var(--surface-creuse)] disabled:opacity-30" aria-label="Plus récents">
                <Icone nom="precedent" />
              </button>
              <span className="chiffres">
                {page + 1}/{pages}
              </span>
              <button type="button" disabled={page + 1 >= pages || enCours} onClick={() => setPage(page + 1)} className="flex size-8 items-center justify-center rounded-lg hover:bg-[var(--surface-creuse)] disabled:opacity-30" aria-label="Plus anciens">
                <Icone nom="suivant" />
              </button>
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {liste === null && <li className="p-4 text-center text-sm text-[var(--encre-faible)]">{enCours ? "Connexion à la boîte…" : ""}</li>}
            {liste?.length === 0 && <li className="p-4 text-center text-sm text-[var(--encre-faible)]">Aucun message.</li>}
            {liste?.map((m) => (
              <li key={m.uid}>
                <LigneListe actif={ouvert?.uid === m.uid} nonLu={!m.lu} onClick={() => lire(m.uid)}>
                  <Avatar nom={m.de} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${m.lu ? "" : "font-semibold"}`}>{m.de}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[var(--encre-faible)]">
                        {m.pieces && <Icone nom="trombone" className="size-3.5" />}
                        {m.suivi && <Icone nom="drapeau" className="size-3.5 text-danger-600" />}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-xs ${m.lu ? "text-[var(--encre-douce)]" : "font-semibold text-marque-600"}`}>{m.objet}</span>
                      <span className="chiffres shrink-0 text-[11px] text-[var(--encre-faible)]">{quand(m.date)}</span>
                    </span>
                  </span>
                </LigneListe>
              </li>
            ))}
          </ul>
        </section>

        {/* Lecture ou rédaction */}
        <section className={`flex min-w-0 flex-1 flex-col gap-2 ${lecture ? "" : "max-md:hidden"}`}>
          {redaction ? (
            <Redaction
              initial={redaction}
              fermer={() => setRedaction(null)}
              envoye={() => {
                setRedaction(null);
                charger(dossier, page);
              }}
            />
          ) : ouvert ? (
            <Lecture
              key={ouvert.uid}
              m={ouvert}
              dossier={dossier}
              fermer={() => setOuvert(null)}
              precedent={voisin(-1)}
              suivant={voisin(1)}
              repondre={(tous) => repondre(ouvert, tous)}
              transferer={() => transferer(ouvert)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--filet)] p-6 text-center text-sm text-[var(--encre-faible)]">
              <Icone nom="enveloppe-ouverte" className="size-10" />
              Choisissez un message à lire.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Lecture({
  m,
  dossier,
  fermer,
  precedent,
  suivant,
  repondre,
  transferer,
}: {
  m: MessageLu;
  dossier: string;
  fermer: () => void;
  precedent: (() => void) | null;
  suivant: (() => void) | null;
  repondre: (tous: boolean) => void;
  transferer: () => void;
}) {
  const [images, setImages] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const aDesImagesDistantes = Boolean(m.html && /<img[^>]+src=["']?https?:/i.test(m.html));
  const plusieurs = m.a.length + m.cc.length > 1;
  const expediteur = m.de[0];
  const icone = "flex size-8 items-center justify-center rounded-lg text-marque-600 hover:bg-[var(--surface-creuse)]";

  return (
    <>
      <TitreLecture titre={m.objet} fermer={fermer} precedent={precedent} suivant={suivant} />
      <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
        <div className="flex items-start gap-3 px-4 pt-4">
          <Avatar nom={expediteur?.nom ?? expediteur?.adresse ?? "?"} className="size-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="font-semibold">{m.de.map((x) => x.nom ?? x.adresse).join(", ")}</span>
              <span className="text-[var(--encre-faible)]"> &lt;{m.de.map((x) => x.adresse).join(", ")}&gt;</span>
            </p>
            <p className="truncate text-xs text-[var(--encre-douce)]">
              À : {m.a.map((x) => x.nom ?? x.adresse).join(" ; ") || "—"}
              {m.cc.length > 0 && ` · Cc : ${m.cc.map((x) => x.nom ?? x.adresse).join(" ; ")}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <div className="flex">
              <button type="button" onClick={() => repondre(false)} className={icone} aria-label="Répondre" title="Répondre">
                <Icone nom="repondre" />
              </button>
              {plusieurs && (
                <button type="button" onClick={() => repondre(true)} className={icone} aria-label="Répondre à tous" title="Répondre à tous">
                  <Icone nom="repondre-tous" />
                </button>
              )}
              <button type="button" onClick={transferer} className={icone} aria-label="Transférer" title="Transférer">
                <Icone nom="transferer" />
              </button>
            </div>
            {m.date && <p className="chiffres hidden text-xs text-[var(--encre-faible)] sm:block">{ENTETE.format(new Date(m.date))}</p>}
          </div>
        </div>

        {m.pieces.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-4 pt-3">
            {m.pieces.map((p) => (
              <li key={p.index} className="max-w-full">
                <VignettePiece
                  nom={p.nom}
                  type={p.type}
                  detail={taille(p.taille)}
                  disabled={enCours}
                  onClick={() =>
                    demarrer(async () => {
                      const r = await telechargerPiece(dossier, m.uid, p.index);
                      if (!r.ok) return setMessage(r.message);
                      const octets = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
                      const url = URL.createObjectURL(new Blob([octets], { type: r.type }));
                      const lien = document.createElement("a");
                      lien.href = url;
                      lien.download = r.nom;
                      lien.click();
                      setTimeout(() => URL.revokeObjectURL(url), 10_000);
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {message && <p className="px-4 pt-2 text-xs text-danger-600">{message}</p>}
        {aDesImagesDistantes && !images && (
          <p className="mx-4 mt-3 rounded-lg bg-[var(--surface-creuse)] px-3 py-1.5 text-xs">
            Images distantes bloquées : elles signaleraient à l&apos;expéditeur que vous avez ouvert le message.{" "}
            <button type="button" onClick={() => setImages(true)} className="text-marque-600 hover:underline">
              Afficher les images
            </button>
          </p>
        )}

        <div className="mx-4 mt-3 min-h-48 flex-1 overflow-hidden rounded-lg bg-white">
          {m.html ? (
            // Aucun script, aucune origine partagée : le message ne peut ni lire
            // la page de Maria Suite, ni exécuter quoi que ce soit.
            <iframe title={m.objet} sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={documentCourriel(m.html, images)} className="size-full border-0" />
          ) : (
            <pre className="size-full overflow-auto whitespace-pre-wrap break-words p-1 font-sans text-sm text-black">{m.texte}</pre>
          )}
        </div>

        <footer className="flex flex-wrap gap-2 px-4 py-3">
          <BoutonPied icone="repondre" libelle="Répondre" onClick={() => repondre(false)} />
          {plusieurs && <BoutonPied icone="repondre-tous" libelle="Répondre à tous" onClick={() => repondre(true)} />}
          <BoutonPied icone="transferer" libelle="Transférer" onClick={transferer} />
        </footer>
      </article>
    </>
  );
}

function Redaction({ initial, fermer, envoye }: { initial: Brouillon; fermer: () => void; envoye: () => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const texte = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    texte.current?.focus();
    texte.current?.setSelectionRange(0, 0);
  }, []);
  const ligne = "flex items-center gap-3 border-b border-[var(--filet)] px-4";
  const champ = "h-10 min-w-0 flex-1 bg-transparent text-sm outline-none";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        if (initial.enReponseA) d.set("enReponseA", initial.enReponseA);
        if (initial.references?.length) d.set("references", initial.references.join(" "));
        setErreur(null);
        demarrer(async () => {
          const r = await envoyerCourriel(d);
          if (r.ok) envoye();
          else setErreur(r.message);
        });
      }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-[var(--filet)] px-4 py-2">
        <button type="submit" disabled={enCours} className="flex h-9 items-center gap-2 rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600 disabled:opacity-50">
          <Icone nom="envoyes" />
          {enCours ? "Envoi…" : "Envoyer"}
        </button>
        <span className="flex-1 truncate text-sm font-semibold">{initial.objet || "Nouveau message"}</span>
        <button type="button" onClick={fermer} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]">
          <Icone nom="corbeille" />
          Abandonner
        </button>
      </div>
      <label className={ligne}>
        <span className="w-10 text-sm text-[var(--encre-faible)]">À</span>
        <input name="a" defaultValue={initial.a} required placeholder="Séparez les adresses par des virgules" aria-label="Destinataires" className={champ} />
      </label>
      <label className={ligne}>
        <span className="w-10 text-sm text-[var(--encre-faible)]">Cc</span>
        <input name="cc" defaultValue={initial.cc} aria-label="Copie" className={champ} />
      </label>
      <label className={ligne}>
        <span className="w-10 text-sm text-[var(--encre-faible)]">Objet</span>
        <input name="objet" defaultValue={initial.objet} placeholder="Ajouter un objet" aria-label="Objet" className={champ} />
      </label>
      <textarea ref={texte} name="texte" defaultValue={initial.texte} aria-label="Message" className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none" />
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--filet)] px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-[var(--encre-douce)]">
          <Icone nom="trombone" />
          <input name="pieces" type="file" multiple aria-label="Pièces jointes" className="text-xs" />
        </label>
        {erreur && <span className="text-xs text-danger-600">{erreur}</span>}
      </div>
    </form>
  );
}
