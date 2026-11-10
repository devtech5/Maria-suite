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
 * La boîte mail, présentée comme Outlook : ruban, dossiers, liste rangée par
 * date avec actions au survol, lecture. Chaque attente se voit — liste en
 * squelette, message ouvert aussitôt avec ce qu'on en sait, pièce en cours de
 * téléchargement, envoi avec ses pièces et leur poids. Rien n'est gardé en
 * base ni dans le navigateur au-delà de l'écran ouvert.
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
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  /** Dossier et page dont la liste affichée est la réponse ; tant qu'ils diffèrent de la demande, elle charge. */
  const [chargee, setChargee] = useState<string | null>(null);
  const [actualisation, setActualisation] = useState(0);
  /** Message en cours d'ouverture : la lecture s'affiche aussitôt, son corps suit. */
  const [ouverture, setOuverture] = useState<number | null>(null);
  const [recherche, setRecherche] = useState("");
  const routeur = useRouter();

  const charger = useCallback((d: string, p: number, tour: number) => {
    demarrer(async () => {
      setErreur(null);
      const r = await listerMessages(d, p);
      setChargee(`${d}:${p}:${tour}`);
      if (!r.ok) return setErreur(r.message);
      setListe(r.messages);
      setTotal(r.total);
    });
  }, []);
  const listeEnCours = chargee !== `${dossier}:${page}:${actualisation}`;
  /** Recharge la page courante : la liste se grise le temps de la réponse. */
  const recharger = () => setActualisation((n) => n + 1);

  /** Un message bref qui s'efface seul : « Message envoyé ». */
  const annoncer = useCallback((texte: string) => {
    setInfo(texte);
    window.setTimeout(() => setInfo((i) => (i === texte ? null : i)), 3_500);
  }, []);

  useEffect(() => {
    demarrer(async () => {
      const r = await listerDossiers();
      if (!r.ok) return setErreur(r.message);
      setDossiers(r.dossiers);
    });
  }, []);

  useEffect(() => {
    charger(dossier, page, actualisation);
  }, [dossier, page, actualisation, charger]);

  function lire(uid: number) {
    setErreur(null);
    setRedaction(null);
    setOuverture(uid);
    demarrer(async () => {
      const r = await ouvrirMessage(dossier, uid);
      setOuverture((o) => (o === uid ? null : o));
      if (!r.ok) return setErreur(r.message);
      setOuvert(r.message);
      setListe((l) => l?.map((m) => (m.uid === uid ? { ...m, lu: true } : m)) ?? l);
    });
  }

  function changerDossier(d: string) {
    setDossier(d);
    setPage(0);
    setOuvert(null);
    setListe(null);
    setRecherche("");
  }

  /** Action rapide au survol d'une ligne, sans ouvrir le message. */
  function agirSurLigne(uid: number, action: (uid: number) => Promise<{ ok: boolean; message: string }>, apres: (uid: number) => void, texte: string) {
    setErreur(null);
    demarrer(async () => {
      const r = await action(uid);
      if (!r.ok) return setErreur(r.message);
      apres(uid);
      annoncer(texte);
    });
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
  const cherche = recherche.trim().toLocaleLowerCase("fr");
  const visibles = (liste ?? []).filter((m) => !cherche || m.de.toLocaleLowerCase("fr").includes(cherche) || m.objet.toLocaleLowerCase("fr").includes(cherche));
  const groupes = grouperParDate(visibles);
  const enOuverture = ouverture !== null && ouvert?.uid !== ouverture ? liste?.find((m) => m.uid === ouverture) : undefined;

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
        <ActionRuban icone="actualiser" libelle="Actualiser" disabled={enCours} onClick={recharger} />
      </Ruban>

      {/* Toujours la même hauteur : la page ne saute pas quand un chargement commence. */}
      <div className="relative h-0.5 shrink-0 overflow-hidden rounded-full" aria-hidden={!enCours}>
        {enCours && <span role="progressbar" aria-label="Chargement en cours" className="barre-envoi absolute inset-y-0 left-0 w-1/3 rounded-full bg-marque-500" />}
      </div>
      {erreur && <p className="shrink-0 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-600">{erreur}</p>}
      {info && (
        <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#1f2937] px-4 py-2.5 text-sm text-white shadow-lg">
          {info}
        </p>
      )}

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
          <label className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--filet)] px-3 text-[var(--encre-faible)]">
            <Icone nom="recherche" className="size-4" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={`Rechercher dans ${libelleDossier.toLocaleLowerCase("fr")}`}
              aria-label="Rechercher un message de cette page"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--encre)] outline-none"
            />
          </label>
          <ul className={`flex-1 overflow-y-auto transition-opacity ${listeEnCours && liste ? "opacity-60" : ""}`} aria-busy={listeEnCours}>
            {liste === null && (listeEnCours ? <SqueletteListe /> : null)}
            {liste?.length === 0 && !listeEnCours && <li className="p-6 text-center text-sm text-[var(--encre-faible)]">Aucun message dans ce dossier.</li>}
            {liste && liste.length > 0 && visibles.length === 0 && <li className="p-6 text-center text-sm text-[var(--encre-faible)]">Aucun message de cette page ne correspond.</li>}
            {groupes.map((g) => (
              <li key={g.titre}>
                <p className="sticky top-0 z-10 border-b border-[var(--filet)] bg-[var(--surface-creuse)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--encre-douce)]">{g.titre}</p>
                <ul>
                  {g.messages.map((m) => (
                    <li key={m.uid} className="group relative">
                      <LigneListe actif={ouvert?.uid === m.uid || ouverture === m.uid} nonLu={!m.lu} onClick={() => lire(m.uid)}>
                        <Avatar nom={m.de} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={`truncate text-sm ${m.lu ? "" : "font-semibold"}`}>{m.de}</span>
                            <span className="flex shrink-0 items-center gap-1 text-[var(--encre-faible)] group-hover:invisible">
                              {m.pieces && <Icone nom="trombone" className="size-3.5" />}
                              {m.suivi && <Icone nom="drapeau" className="size-3.5 text-danger-600" />}
                            </span>
                          </span>
                          <span className="flex items-center justify-between gap-2">
                            <span className={`truncate text-xs ${m.lu ? "text-[var(--encre-douce)]" : "font-semibold text-marque-600"}`}>{m.objet}</span>
                            <span className="chiffres shrink-0 text-[11px] text-[var(--encre-faible)]">{ouverture === m.uid ? "Ouverture…" : quand(m.date)}</span>
                          </span>
                        </span>
                      </LigneListe>
                      {/* Actions rapides, comme dans Outlook : au survol, sans ouvrir le message. */}
                      <span className="absolute right-2 top-1.5 hidden items-center gap-0.5 rounded-lg border border-[var(--filet)] bg-[var(--surface)] p-0.5 shadow-sm group-hover:flex">
                        <ActionLigne
                          icone={m.lu ? "enveloppe" : "enveloppe-ouverte"}
                          libelle={m.lu ? "Marquer comme non lu" : "Marquer comme lu"}
                          onClick={() =>
                            m.lu
                              ? agirSurLigne(m.uid, (uid) => marquerNonLu(dossier, uid), (uid) => setListe((l) => l?.map((x) => (x.uid === uid ? { ...x, lu: false } : x)) ?? l), "Marqué comme non lu.")
                              : lire(m.uid)
                          }
                        />
                        <ActionLigne
                          icone="drapeau"
                          libelle={m.suivi ? "Retirer le suivi" : "Assurer un suivi"}
                          onClick={() =>
                            agirSurLigne(m.uid, (uid) => marquerSuivi(dossier, uid, !m.suivi), (uid) => setListe((l) => l?.map((x) => (x.uid === uid ? { ...x, suivi: !m.suivi } : x)) ?? l), m.suivi ? "Suivi retiré." : "Message suivi.")
                          }
                        />
                        {!dansArchives && (
                          <ActionLigne
                            icone="archiver"
                            libelle="Archiver"
                            onClick={() =>
                              agirSurLigne(m.uid, (uid) => archiverMessage(dossier, uid), (uid) => {
                                if (ouvert?.uid === uid) setOuvert(null);
                                setListe((l) => l?.filter((x) => x.uid !== uid) ?? l);
                              }, "Message archivé.")
                            }
                          />
                        )}
                        <ActionLigne
                          icone="corbeille"
                          libelle="Supprimer"
                          danger
                          onClick={() =>
                            agirSurLigne(m.uid, (uid) => mettreCorbeille(dossier, uid), (uid) => {
                              if (ouvert?.uid === uid) setOuvert(null);
                              setListe((l) => l?.filter((x) => x.uid !== uid) ?? l);
                            }, "Message mis à la corbeille.")
                          }
                        />
                      </span>
                    </li>
                  ))}
                </ul>
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
              envoye={(texte) => {
                setRedaction(null);
                annoncer(texte);
                recharger();
              }}
            />
          ) : enOuverture ? (
            <LectureEnChargement apercu={enOuverture} />
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
  const [telechargement, setTelechargement] = useState<number | null>(null);
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
          <p className="px-4 pt-3 text-xs text-[var(--encre-faible)]">
            {m.pieces.length} pièce{m.pieces.length > 1 ? "s" : ""} jointe{m.pieces.length > 1 ? "s" : ""} · {taille(m.pieces.reduce((t, p) => t + p.taille, 0))}
          </p>
        )}
        {m.pieces.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-4 pt-1.5">
            {m.pieces.map((p) => (
              <li key={p.index} className="max-w-full">
                <VignettePiece
                  nom={p.nom}
                  type={p.type}
                  detail={telechargement === p.index ? "Téléchargement…" : `${taille(p.taille)} · télécharger`}
                  disabled={enCours}
                  onClick={() =>
                    demarrer(async () => {
                      setMessage(null);
                      setTelechargement(p.index);
                      const r = await telechargerPiece(dossier, m.uid, p.index);
                      setTelechargement(null);
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

const PLAFOND_PIECES = 10 * 1024 * 1024;

function Redaction({ initial, fermer, envoye }: { initial: Brouillon; fermer: () => void; envoye: (texte: string) => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [pieces, setPieces] = useState<File[]>([]);
  const [glisse, setGlisse] = useState(false);
  const texte = useRef<HTMLTextAreaElement>(null);
  const entree = useRef<HTMLInputElement>(null);
  useEffect(() => {
    texte.current?.focus();
    texte.current?.setSelectionRange(0, 0);
  }, []);
  const poids = pieces.reduce((s, f) => s + f.size, 0);
  const tropLourd = poids > PLAFOND_PIECES;

  /** Ajoute des fichiers, sans doublon (même nom et même taille). */
  function joindre(fichiers: FileList | File[] | null | undefined) {
    if (!fichiers?.length) return;
    setErreur(null);
    setPieces((avant) => {
      const suite = [...avant];
      for (const f of Array.from(fichiers)) if (!suite.some((x) => x.name === f.name && x.size === f.size)) suite.push(f);
      return suite;
    });
    if (entree.current) entree.current.value = "";
  }

  const ligne = "flex items-center gap-3 border-b border-[var(--filet)] px-4";
  const champ = "h-10 min-w-0 flex-1 bg-transparent text-sm outline-none";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (tropLourd) return setErreur(`Pièces jointes trop lourdes : ${taille(poids)} pour 10 Mo au plus.`);
        const d = new FormData(e.currentTarget);
        d.delete("pieces");
        for (const f of pieces) d.append("pieces", f);
        if (initial.enReponseA) d.set("enReponseA", initial.enReponseA);
        if (initial.references?.length) d.set("references", initial.references.join(" "));
        setErreur(null);
        demarrer(async () => {
          const r = await envoyerCourriel(d);
          if (r.ok) envoye(pieces.length ? `Message envoyé avec ${pieces.length} pièce${pieces.length > 1 ? "s" : ""} jointe${pieces.length > 1 ? "s" : ""}.` : "Message envoyé.");
          else setErreur(r.message);
        });
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setGlisse(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setGlisse(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setGlisse(false);
        joindre(e.dataTransfer.files);
      }}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-[var(--filet)] px-4 py-2">
        <button type="submit" disabled={enCours || tropLourd} className="flex h-9 items-center gap-2 rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600 disabled:opacity-50">
          <Icone nom="envoyes" />
          {enCours ? "Envoi…" : "Envoyer"}
        </button>
        <button type="button" onClick={() => entree.current?.click()} disabled={enCours} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] disabled:opacity-50">
          <Icone nom="trombone" />
          Joindre
        </button>
        <input ref={entree} type="file" multiple className="sr-only" aria-label="Pièces jointes" onChange={(e) => joindre(e.target.files)} />
        <span className="flex-1 truncate text-sm font-semibold max-sm:hidden">{initial.objet || "Nouveau message"}</span>
        <button type="button" onClick={fermer} disabled={enCours} className="ml-auto flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]">
          <Icone nom="corbeille" />
          Abandonner
        </button>
      </div>
      {enCours && (
        <div className="relative h-1 overflow-hidden bg-[var(--surface-creuse)]" role="progressbar" aria-label="Envoi en cours">
          <span className="barre-envoi absolute inset-y-0 left-0 w-1/3 bg-marque-500" />
        </div>
      )}
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

      {pieces.length > 0 && (
        <div className="border-b border-[var(--filet)] px-4 py-2">
          <ul className="flex flex-wrap gap-2">
            {pieces.map((f, i) => (
              <li key={`${f.name}-${f.size}`} className="flex max-w-full items-center gap-2 rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)] py-1 pl-2 pr-1 text-xs">
                <Icone nom="trombone" className="size-3.5 shrink-0 text-[var(--encre-faible)]" />
                <span className="max-w-48 truncate font-medium" title={f.name}>
                  {f.name}
                </span>
                <span className="chiffres shrink-0 text-[var(--encre-faible)]">{taille(f.size)}</span>
                <button type="button" disabled={enCours} onClick={() => setPieces((p) => p.filter((_, n) => n !== i))} aria-label={`Retirer ${f.name}`} className="flex size-6 items-center justify-center rounded hover:bg-[var(--filet)]">
                  <Icone nom="fermer" className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className={`mt-1 text-[11px] ${tropLourd ? "font-semibold text-danger-600" : "text-[var(--encre-faible)]"}`}>
            {pieces.length} pièce{pieces.length > 1 ? "s" : ""} · {taille(poids)} sur 10 Mo
          </p>
        </div>
      )}

      <textarea ref={texte} name="texte" defaultValue={initial.texte} aria-label="Message" className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-sm outline-none" />
      {erreur && <p className="border-t border-[var(--filet)] px-4 py-2 text-xs text-danger-600">{erreur}</p>}
      {enCours && (
        <p className="border-t border-[var(--filet)] px-4 py-2 text-xs text-[var(--encre-douce)]">
          Envoi en cours{pieces.length ? ` : ${pieces.length} pièce${pieces.length > 1 ? "s" : ""}, ${taille(poids)}` : ""}… ne fermez pas la page.
        </p>
      )}
      {glisse && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface)]/85 backdrop-blur-sm">
          <p className="rounded-2xl border-2 border-dashed border-marque-500 px-8 py-6 text-center text-sm font-medium text-marque-600">
            Déposez les fichiers pour les joindre
            <span className="mt-1 block text-xs font-normal text-[var(--encre-faible)]">10 Mo au plus, toutes pièces confondues</span>
          </p>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- outils

/** Les messages d'une page, rangés comme dans Outlook : aujourd'hui, hier, cette semaine… */
function grouperParDate(messages: ApercuMessage[]): { titre: string; messages: ApercuMessage[] }[] {
  const maintenant = new Date();
  const debut = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const jours = (iso: string | null) => (iso ? Math.round((debut(maintenant) - debut(new Date(iso))) / 86_400_000) : 999);
  const titreDe = (m: ApercuMessage) => {
    const j = jours(m.date);
    if (j <= 0) return "Aujourd'hui";
    if (j === 1) return "Hier";
    if (j < 7) return "Cette semaine";
    if (m.date && new Date(m.date).getMonth() === maintenant.getMonth() && new Date(m.date).getFullYear() === maintenant.getFullYear()) return "Ce mois-ci";
    return "Plus ancien";
  };
  const groupes: { titre: string; messages: ApercuMessage[] }[] = [];
  for (const m of messages) {
    const titre = titreDe(m);
    const dernier = groupes.at(-1);
    if (dernier?.titre === titre) dernier.messages.push(m);
    else groupes.push({ titre, messages: [m] });
  }
  return groupes;
}

function SqueletteListe() {
  return (
    <>
      <li className="px-3 pt-3 text-xs text-[var(--encre-faible)]">Connexion à la boîte…</li>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex animate-pulse items-start gap-3 border-b border-[var(--filet)] px-3 py-3" aria-hidden>
          <span className="size-9 shrink-0 rounded-full bg-[var(--surface-creuse)]" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/2 rounded bg-[var(--surface-creuse)]" />
            <span className="block h-3 w-4/5 rounded bg-[var(--surface-creuse)]" />
          </span>
        </li>
      ))}
    </>
  );
}

function ActionLigne({ icone, libelle, onClick, danger }: { icone: NomIcone; libelle: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={libelle}
      title={libelle}
      className={`flex size-7 items-center justify-center rounded-md hover:bg-[var(--surface-creuse)] ${danger ? "text-danger-600" : "text-[var(--encre-douce)]"}`}
    >
      <Icone nom={icone} className="size-4" />
    </button>
  );
}

/** La lecture s'ouvre aussitôt avec ce que la liste sait déjà ; le corps arrive ensuite. */
function LectureEnChargement({ apercu }: { apercu: ApercuMessage }) {
  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-[var(--filet)] bg-[var(--surface)] px-4 py-3 shadow-sm">
        <p className="truncate text-base font-semibold">{apercu.objet}</p>
      </div>
      <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm" aria-busy>
        <div className="flex items-start gap-3 px-4 pt-4">
          <Avatar nom={apercu.de} className="size-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{apercu.de}</p>
            <p className="text-xs text-[var(--encre-faible)]">{apercu.date ? ENTETE.format(new Date(apercu.date)) : ""}</p>
          </div>
        </div>
        <div className="mx-4 mt-4 flex-1 animate-pulse space-y-3" aria-hidden>
          {[92, 85, 97, 60, 88, 75].map((l, i) => (
            <span key={i} className="block h-3 rounded bg-[var(--surface-creuse)]" style={{ width: `${l}%` }} />
          ))}
        </div>
        <p className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--encre-faible)]">
          <span className="size-3 animate-spin rounded-full border-2 border-marque-500 border-t-transparent" aria-hidden />
          Chargement du message{apercu.pieces ? " et de ses pièces jointes" : ""}…
        </p>
      </article>
    </>
  );
}
