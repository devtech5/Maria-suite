"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { agirSurReunion, entrerDansLaSalle, quitterLaSalle, signalerPresence, type Jetons } from "@/modules/meeting/actions";
import { PAS_SIGNAL_MS, adresseFlux, cheminFlux, colonnesMosaique } from "@/modules/meeting/calcul";
import type { ParticipantVue } from "@/modules/meeting/requetes";

/**
 * Salle de réunion.
 *
 * Deux temps : le RÉGLAGE, où l'on se voit et où l'on choisit d'entrer
 * micro ouvert ou coupé ; la SALLE, où chacun publie son flux au serveur
 * vidéo (WHIP) et lit celui des autres (WHEP). Qui est là, micro coupé ou
 * écran partagé, vient du signal de présence que chaque navigateur envoie
 * toutes les quatre secondes ; le même signal renouvelle les jetons des flux.
 *
 * Couper le micro ou la caméra ne coupe pas la liaison : la piste est mise en
 * sourdine, et la rouvrir est instantané.
 */

type LireJetons = () => Jetons | null;
type EtatLiaison = "connexion" | "direct" | "echec";

/** Attend la fin de la collecte ICE, sans dépasser `ms` : l'offre part complète, sans échange incrémental. */
function collecteTerminee(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resoudre) => {
    const fin = () => {
      pc.removeEventListener("icegatheringstatechange", verifier);
      resoudre();
    };
    const verifier = () => pc.iceGatheringState === "complete" && fin();
    pc.addEventListener("icegatheringstatechange", verifier);
    setTimeout(fin, ms);
  });
}

/** Offre, réponse : WHIP pour publier, WHEP pour lire, même échange. Rend l'adresse de la session ouverte. */
async function negocier(pc: RTCPeerConnection, url: string): Promise<string | null> {
  await pc.setLocalDescription(await pc.createOffer());
  await collecteTerminee(pc, 2_000);
  const reponse = await fetch(url, { method: "POST", headers: { "Content-Type": "application/sdp" }, body: pc.localDescription?.sdp ?? "" });
  if (!reponse.ok) throw new Error(`Serveur vidéo : ${reponse.status}`);
  const lieu = reponse.headers.get("Location");
  await pc.setRemoteDescription({ type: "answer", sdp: await reponse.text() });
  // L'adresse est relative au serveur vidéo, pas à Maria Suite.
  return lieu ? new URL(lieu, url).toString() : null;
}

/** Libère une session côté serveur vidéo ; sans réponse, elle expirera seule. */
function liberer(session: string | null) {
  if (session) void fetch(session, { method: "DELETE" }).catch(() => undefined);
}

const RELANCE_MS = 3_000;

/** Publie un flux local tant qu'il existe ; se relance seul après une coupure. */
function usePublication(flux: MediaStream | null, chemin: string | null, lireJetons: LireJetons): EtatLiaison {
  const [etat, setEtat] = useState<EtatLiaison>("connexion");
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    const jetons = lireJetons();
    if (!flux || !chemin || !jetons?.base) return;
    let annule = false;
    let session: string | null = null;
    let relance: ReturnType<typeof setTimeout> | undefined;
    const pc = new RTCPeerConnection();
    flux.getTracks().forEach((piste) => pc.addTransceiver(piste, { direction: "sendonly", streams: [flux] }));

    const reessayer = () => {
      if (annule) return;
      setEtat("echec");
      clearTimeout(relance);
      relance = setTimeout(() => setEssai((n) => n + 1), RELANCE_MS);
    };
    pc.onconnectionstatechange = () => {
      if (annule) return;
      if (pc.connectionState === "connected") setEtat("direct");
      if (pc.connectionState === "failed") reessayer();
      // Coupure passagère d'un réseau mobile : on laisse à ICE le temps de se rétablir, pas plus.
      if (pc.connectionState === "disconnected") {
        setTimeout(() => {
          if (!annule && pc.connectionState === "disconnected") reessayer();
        }, RELANCE_MS);
      }
    };
    negocier(pc, adresseFlux(jetons.base, chemin, "whip", jetons.publier))
      .then((s) => {
        session = s;
        if (annule) liberer(s);
      })
      .catch(reessayer);

    return () => {
      annule = true;
      clearTimeout(relance);
      pc.close();
      liberer(session);
    };
  }, [flux, chemin, essai, lireJetons]);

  return etat;
}

/** Lit le flux d'un autre participant. Tant qu'il ne publie pas encore, réessaie. */
function useLecture(chemin: string, lireJetons: LireJetons): { flux: MediaStream | null; etat: EtatLiaison } {
  const [flux, setFlux] = useState<MediaStream | null>(null);
  const [etat, setEtat] = useState<EtatLiaison>("connexion");
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    const jetons = lireJetons();
    if (!jetons?.base) return;
    let annule = false;
    let session: string | null = null;
    let relance: ReturnType<typeof setTimeout> | undefined;
    const pc = new RTCPeerConnection();
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (e) => {
      if (!annule && e.streams[0]) setFlux(e.streams[0]);
    };

    const reessayer = () => {
      if (annule) return;
      setEtat("echec");
      clearTimeout(relance);
      relance = setTimeout(() => setEssai((n) => n + 1), RELANCE_MS);
    };
    pc.onconnectionstatechange = () => {
      if (annule) return;
      if (pc.connectionState === "connected") setEtat("direct");
      if (pc.connectionState === "failed") reessayer();
      // Coupure passagère d'un réseau mobile : on laisse à ICE le temps de se rétablir, pas plus.
      if (pc.connectionState === "disconnected") {
        setTimeout(() => {
          if (!annule && pc.connectionState === "disconnected") reessayer();
        }, RELANCE_MS);
      }
    };
    negocier(pc, adresseFlux(jetons.base, chemin, "whep", jetons.lire))
      .then((s) => {
        session = s;
        if (annule) liberer(s);
      })
      .catch(reessayer);

    return () => {
      annule = true;
      clearTimeout(relance);
      pc.close();
      liberer(session);
    };
  }, [chemin, essai, lireJetons]);

  return { flux, etat };
}

/** Caméra et micro, ou ce qui en est disponible. */
async function ouvrirMedias(): Promise<{ flux: MediaStream | null; erreur: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { flux: null, erreur: "Ce navigateur ne donne accès ni à la caméra ni au micro : une adresse https est nécessaire." };
  }
  try {
    const flux = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      // 360p à 20 images par seconde : lisible en mosaïque, et tenable sur une liaison montante mobile.
      video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 24 } },
    });
    return { flux, erreur: null };
  } catch {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      return { flux, erreur: "Caméra indisponible ou refusée : vous entrerez avec le micro seul." };
    } catch {
      return {
        flux: null,
        erreur: "Caméra et micro refusés ou absents : vous pourrez voir et entendre, sans parler. Autorisez-les dans le navigateur puis rechargez la page.",
      };
    }
  }
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("");
}

function Video({ flux, muet, miroir, ajuste }: { flux: MediaStream | null; muet: boolean; miroir?: boolean; ajuste?: "cover" | "contain" }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = flux;
  }, [flux]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muet}
      className={`h-full w-full ${ajuste === "contain" ? "object-contain" : "object-cover"} ${miroir ? "-scale-x-100" : ""}`}
    />
  );
}

const ICONES = {
  micro: <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3" />,
  microCoupe: <path d="M12 3a3 3 0 0 1 3 3v4m-6 0v2a3 3 0 0 0 4.5 2.6M5 12a7 7 0 0 0 11.5 5.4M19 12a7 7 0 0 1-.6 2.8M12 19v3M3 3l18 18" />,
  camera: <path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" />,
  cameraCoupee: <path d="M3 7h3m4 0h5v5m0 4v1H3V7M15 10l6-3v10l-6-3M3 3l18 18" />,
  ecran: <path d="M3 4h18v12H3zM8 20h8M12 16v4" />,
  quitter: <path d="M4 15c4-4 12-4 16 0l-2 3-3-1v-2.5a9 9 0 0 0-6 0V17l-3 1Z" />,
} as const;

function Icone({ nom }: { nom: keyof typeof ICONES }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONES[nom]}
    </svg>
  );
}

function Tuile({ nom, children, micro, camera, note }: { nom: string; children?: ReactNode; micro: boolean; camera: boolean; note?: string }) {
  return (
    <figure className="relative aspect-video min-w-0 overflow-hidden rounded-lg bg-[#16233a]">
      {/* L'élément vidéo reste monté caméra coupée : c'est lui qui porte le son. */}
      <div className={camera ? "h-full w-full" : "hidden"}>{children}</div>
      {!camera && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-marque-500 text-xl font-bold text-white">{initiales(nom)}</span>
        </div>
      )}
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5 text-xs text-white">
        {!micro && (
          <span className="text-red-400" title="Micro coupé">
            <Icone nom="microCoupe" />
          </span>
        )}
        <span className="truncate font-semibold">{nom}</span>
        {note && <span className="opacity-75">· {note}</span>}
      </figcaption>
    </figure>
  );
}

function TuileDistante({ reunionId, participant, lireJetons }: { reunionId: string; participant: ParticipantVue; lireJetons: LireJetons }) {
  const { flux, etat } = useLecture(cheminFlux(reunionId, participant.userId, "cam"), lireJetons);
  return (
    <Tuile nom={participant.nom} micro={participant.micro} camera={participant.camera && etat === "direct"} note={etat === "direct" ? undefined : "connexion…"}>
      <Video flux={flux} muet={false} />
    </Tuile>
  );
}

function EcranDistant({ reunionId, participant, lireJetons }: { reunionId: string; participant: ParticipantVue; lireJetons: LireJetons }) {
  const { flux, etat } = useLecture(cheminFlux(reunionId, participant.userId, "ecran"), lireJetons);
  return (
    <figure className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black">
      <Video flux={flux} muet ajuste="contain" />
      <figcaption className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white">
        Écran de {participant.nom}
        {etat !== "direct" ? " · connexion…" : ""}
      </figcaption>
    </figure>
  );
}

function Commande({ actif, alerte, onClick, libelle, children }: { actif?: boolean; alerte?: boolean; onClick: () => void; libelle: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      title={libelle}
      className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
        alerte ? "bg-red-600 text-white hover:bg-red-700" : actif ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[#0b1220] hover:bg-white/90"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{libelle}</span>
    </button>
  );
}

interface Props {
  reunionId: string;
  numero: string;
  titre: string;
  moi: string;
  nomMoi: string;
  pilote: boolean;
  videoConfiguree: boolean;
}

export function SalleReunion(props: Props) {
  const [flux, setFlux] = useState<MediaStream | null>(null);
  const [erreurMedias, setErreurMedias] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [micro, setMicro] = useState(true);
  const [camera, setCamera] = useState(true);
  const [entree, setEntree] = useState<{ jetons: Jetons } | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const fluxRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let annule = false;
    void ouvrirMedias().then((r) => {
      if (annule) {
        r.flux?.getTracks().forEach((piste) => piste.stop());
        return;
      }
      fluxRef.current = r.flux;
      setFlux(r.flux);
      setErreurMedias(r.erreur);
      setCamera(Boolean(r.flux?.getVideoTracks().length));
      setMicro(Boolean(r.flux?.getAudioTracks().length));
      setPret(true);
    });
    return () => {
      annule = true;
      fluxRef.current?.getTracks().forEach((piste) => piste.stop());
      fluxRef.current = null;
    };
  }, []);

  // Sourdine plutôt qu'arrêt : la liaison reste ouverte, rouvrir est instantané.
  useEffect(() => {
    flux?.getAudioTracks().forEach((piste) => (piste.enabled = micro));
  }, [flux, micro]);
  useEffect(() => {
    flux?.getVideoTracks().forEach((piste) => (piste.enabled = camera));
  }, [flux, camera]);

  const entrer = async () => {
    setEnCours(true);
    setRefus(null);
    const r = await entrerDansLaSalle(props.reunionId);
    setEnCours(false);
    if (!r.ok) setRefus(r.message);
    else setEntree({ jetons: r.jetons });
  };

  if (entree) {
    return (
      <SalleOuverte
        {...props}
        jetonsInitiaux={entree.jetons}
        flux={flux}
        micro={micro}
        camera={camera}
        basculerMicro={() => setMicro((v) => !v)}
        basculerCamera={() => setCamera((v) => !v)}
        aMicro={Boolean(flux?.getAudioTracks().length)}
        aCamera={Boolean(flux?.getVideoTracks().length)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 text-sm">
        <Link href={`/meeting/${props.reunionId}`} className="text-[var(--encre-douce)] hover:underline">
          ← {props.numero}
        </Link>
      </p>
      <h1 className="text-xl font-bold tracking-tight">{props.titre}</h1>
      <p className="mb-4 text-sm text-[var(--encre-douce)]">Réglez votre caméra et votre micro avant d&apos;entrer.</p>

      <div className="overflow-hidden rounded-xl bg-[#0b1220] p-3">
        <Tuile nom={props.nomMoi} micro={micro} camera={camera && Boolean(flux?.getVideoTracks().length)} note="vous">
          <Video flux={flux} muet miroir />
        </Tuile>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {Boolean(flux?.getAudioTracks().length) && (
            <Commande actif={micro} alerte={!micro} onClick={() => setMicro((v) => !v)} libelle={micro ? "Micro ouvert" : "Micro coupé"}>
              <Icone nom={micro ? "micro" : "microCoupe"} />
            </Commande>
          )}
          {Boolean(flux?.getVideoTracks().length) && (
            <Commande actif={camera} alerte={!camera} onClick={() => setCamera((v) => !v)} libelle={camera ? "Caméra ouverte" : "Caméra coupée"}>
              <Icone nom={camera ? "camera" : "cameraCoupee"} />
            </Commande>
          )}
        </div>
      </div>

      {/* On entre sans attendre : caméra et micro se branchent dès que le navigateur les accorde. */}
      {!pret && (
        <p className="mt-3 rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm text-[var(--encre-douce)]">
          Autorisez la caméra et le micro dans la fenêtre du navigateur.
        </p>
      )}
      {erreurMedias && <p className="mt-3 rounded-lg bg-alerte-50 px-3 py-2 text-sm text-alerte-600">{erreurMedias}</p>}
      {!props.videoConfiguree && (
        <p className="mt-3 rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm text-[var(--encre-douce)]">
          Serveur vidéo non configuré sur cette instance (<code>VIDEO_URL_PUBLIQUE</code>) : la salle montrera qui est présent, sans image ni son.
        </p>
      )}
      {refus && <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-600">{refus}</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={enCours}
          onClick={() => void entrer()}
          className="h-cible rounded-lg bg-valide-500 px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {enCours ? "Entrée…" : "Entrer dans la réunion"}
        </button>
      </div>
    </div>
  );
}

function SalleOuverte({
  reunionId,
  numero,
  titre,
  moi,
  nomMoi,
  pilote,
  jetonsInitiaux,
  flux,
  micro,
  camera,
  basculerMicro,
  basculerCamera,
  aMicro,
  aCamera,
}: Props & {
  jetonsInitiaux: Jetons;
  flux: MediaStream | null;
  micro: boolean;
  camera: boolean;
  basculerMicro: () => void;
  basculerCamera: () => void;
  aMicro: boolean;
  aCamera: boolean;
}) {
  const routeur = useRouter();
  const jetonsRef = useRef<Jetons>(jetonsInitiaux);
  const lireJetons = useCallback(() => jetonsRef.current, []);
  const [participants, setParticipants] = useState<ParticipantVue[]>([]);
  const [ecran, setEcran] = useState<MediaStream | null>(null);
  const [close, setClose] = useState(false);
  const [liste, setListe] = useState(false);
  const ecranRef = useRef<MediaStream | null>(null);
  const medias = useRef({ micro, camera, ecran: false });

  const etatPublication = usePublication(flux, cheminFlux(reunionId, moi, "cam"), lireJetons);
  usePublication(ecran, ecran ? cheminFlux(reunionId, moi, "ecran") : null, lireJetons);

  const signaler = useCallback(async () => {
    const r = await signalerPresence(reunionId, medias.current).catch(() => ({ etat: "muet" as const }));
    if (r.etat === "salle") {
      jetonsRef.current = r.jetons;
      setParticipants(r.participants);
    } else if (r.etat === "close") {
      setClose(true);
    }
  }, [reunionId]);

  // Tout changement de micro, de caméra ou de partage se dit aussitôt aux autres.
  useEffect(() => {
    medias.current = { micro: aMicro && micro, camera: aCamera && camera, ecran: ecran !== null };
    void signaler();
  }, [micro, camera, ecran, aMicro, aCamera, signaler]);

  useEffect(() => {
    if (close) return;
    const minuterie = setInterval(() => void signaler(), PAS_SIGNAL_MS);
    // Onglet fermé : on le dit si on peut ; sinon, trois signaux manqués suffisent.
    const partir = () => void quitterLaSalle(reunionId);
    window.addEventListener("pagehide", partir);
    return () => {
      clearInterval(minuterie);
      window.removeEventListener("pagehide", partir);
    };
  }, [close, signaler, reunionId]);

  useEffect(
    () => () => {
      ecranRef.current?.getTracks().forEach((piste) => piste.stop());
    },
    [],
  );

  const arreterEcran = () => {
    ecranRef.current?.getTracks().forEach((piste) => piste.stop());
    ecranRef.current = null;
    setEcran(null);
  };

  const partagerEcran = async () => {
    if (ecranRef.current) return arreterEcran();
    if (!navigator.mediaDevices?.getDisplayMedia) return;
    try {
      // Peu d'images par seconde, beaucoup de netteté : un tableau ou un document se lit, il ne bouge pas.
      const partage = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 8, max: 15 } }, audio: false });
      partage.getVideoTracks()[0]?.addEventListener("ended", arreterEcran);
      ecranRef.current = partage;
      setEcran(partage);
    } catch {
      // Partage refusé dans la fenêtre du navigateur : rien à faire.
    }
  };

  const quitter = async () => {
    arreterEcran();
    await quitterLaSalle(reunionId);
    routeur.push(`/meeting/${reunionId}`);
  };

  const terminer = async () => {
    if (!confirm("Terminer la réunion pour tous les participants ?")) return;
    arreterEcran();
    await agirSurReunion(reunionId, "terminer");
    routeur.push(`/meeting/${reunionId}`);
  };

  if (close) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-6 text-center">
        <p className="text-base font-semibold">La réunion est terminée</p>
        <p className="mt-1 text-sm text-[var(--encre-douce)]">L&apos;organisateur a fermé la salle. Le compte rendu et la feuille de présence restent consultables.</p>
        <Link href={`/meeting/${reunionId}`} className="mt-4 inline-flex h-cible items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white">
          Voir la réunion
        </Link>
      </div>
    );
  }

  const autres = participants.filter((p) => p.present && p.userId !== moi);
  const ecransPartages = autres.filter((p) => p.ecran);
  const colonnes = colonnesMosaique(autres.length + 1);
  const video = jetonsInitiaux.base !== null;
  const absents = participants.filter((p) => !p.present);

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-xl bg-[#0b1220] text-white">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{titre}</h1>
          <p className="text-xs text-white/60">
            {numero} · {autres.length + 1} dans la salle
            {!video ? " · serveur vidéo non configuré" : etatPublication === "echec" ? " · reconnexion de votre flux…" : ""}
          </p>
        </div>
        <button type="button" onClick={() => setListe((v) => !v)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20" aria-expanded={liste}>
          Participants ({participants.length})
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {ecran && (
            <p className="rounded-lg bg-marque-500/30 px-3 py-2 text-sm">
              Vous partagez votre écran.{" "}
              <button type="button" onClick={arreterEcran} className="font-semibold underline">
                Arrêter
              </button>
            </p>
          )}
          {video && ecransPartages.map((p) => <EcranDistant key={`ecran-${p.userId}`} reunionId={reunionId} participant={p} lireJetons={lireJetons} />)}
          <div className={`grid content-center gap-3 ${ecransPartages.length > 0 ? "" : "flex-1"}`} style={{ gridTemplateColumns: `repeat(${ecransPartages.length > 0 ? Math.min(autres.length + 1, 6) : colonnes}, minmax(0, 1fr))` }}>
            <Tuile nom={nomMoi} micro={aMicro && micro} camera={aCamera && camera} note="vous">
              <Video flux={flux} muet miroir />
            </Tuile>
            {autres.map((p) =>
              video ? (
                <TuileDistante key={p.userId} reunionId={reunionId} participant={p} lireJetons={lireJetons} />
              ) : (
                <Tuile key={p.userId} nom={p.nom} micro={p.micro} camera={false} />
              ),
            )}
          </div>
          {autres.length === 0 && <p className="text-center text-sm text-white/60">Vous êtes seul dans la salle pour l&apos;instant. Les invités ont été prévenus.</p>}
        </div>

        {liste && (
          <aside className="w-64 shrink-0 overflow-y-auto rounded-lg bg-white/5 p-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Dans la salle</p>
            <ul className="mb-3 space-y-1.5">
              <li className="flex items-center justify-between gap-2">
                <span className="truncate">{nomMoi} (vous)</span>
                {!(aMicro && micro) && <Icone nom="microCoupe" />}
              </li>
              {autres.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.nom}</span>
                  <span className="flex gap-1 text-white/70">
                    {p.ecran && <Icone nom="ecran" />}
                    {!p.micro && <Icone nom="microCoupe" />}
                  </span>
                </li>
              ))}
            </ul>
            {absents.length > 0 && (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Pas encore là</p>
                <ul className="space-y-1.5 text-white/60">
                  {absents.map((p) => (
                    <li key={p.userId} className="truncate">
                      {p.nom}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-3">
        {aMicro && (
          <Commande actif={micro} alerte={!micro} onClick={basculerMicro} libelle={micro ? "Couper le micro" : "Ouvrir le micro"}>
            <Icone nom={micro ? "micro" : "microCoupe"} />
          </Commande>
        )}
        {aCamera && (
          <Commande actif={camera} alerte={!camera} onClick={basculerCamera} libelle={camera ? "Couper la caméra" : "Ouvrir la caméra"}>
            <Icone nom={camera ? "camera" : "cameraCoupee"} />
          </Commande>
        )}
        {video && (
          <Commande actif={ecran === null} onClick={() => void partagerEcran()} libelle={ecran ? "Arrêter le partage" : "Partager l'écran"}>
            <Icone nom="ecran" />
          </Commande>
        )}
        <Commande alerte onClick={() => void quitter()} libelle="Quitter">
          <Icone nom="quitter" />
        </Commande>
        {pilote && (
          <button type="button" onClick={() => void terminer()} className="h-11 rounded-full border border-white/30 px-4 text-sm font-semibold hover:bg-white/10">
            Terminer pour tous
          </button>
        )}
      </footer>
    </div>
  );
}
