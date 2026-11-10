"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ecrireEnSalle, entrerDansLaSalle, quitterLaSalle, reagirEnSalle, signalerPresence, terminerDepuisLaSalle, type Jetons } from "@/modules/meeting/actions";
import { PAS_SIGNAL_MS, REACTIONS, REACTION_MS, adresseFlux, cheminFlux, colonnesMosaique, lienDeSalle } from "@/modules/meeting/calcul";
import type { MessageSalle, ParticipantVue } from "@/modules/meeting/requetes";

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

/** Une teinte stable par personne, pour reconnaître une tuile caméra coupée d'un coup d'œil. */
const TEINTES = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#007b83", "#b06000", "#c5221f", "#1967d2"];
function teinte(nom: string): string {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[h % TEINTES.length];
}

/**
 * Parle-t-on dans ce flux ? Un analyseur lit le niveau du son quatre fois par
 * seconde ; la tuile s'entoure de bleu pendant qu'on parle, comme dans toute
 * visioconférence. Rien ne quitte le navigateur.
 */
function useParle(flux: MediaStream | null, actif: boolean): boolean {
  const [parle, setParle] = useState(false);
  const ecoute = Boolean(flux && actif && flux.getAudioTracks().length && typeof AudioContext !== "undefined");
  useEffect(() => {
    if (!ecoute || !flux) return;
    let contexte: AudioContext | null = null;
    let minuterie: ReturnType<typeof setInterval> | undefined;
    try {
      contexte = new AudioContext();
      const source = contexte.createMediaStreamSource(flux);
      const analyseur = contexte.createAnalyser();
      analyseur.fftSize = 512;
      source.connect(analyseur);
      const donnees = new Uint8Array(analyseur.fftSize);
      minuterie = setInterval(() => {
        analyseur.getByteTimeDomainData(donnees);
        let somme = 0;
        for (const v of donnees) somme += (v - 128) * (v - 128);
        setParle(Math.sqrt(somme / donnees.length) > 6);
      }, 250);
    } catch {
      // Analyse du son indisponible : la tuile reste sans halo, rien de plus.
    }
    return () => {
      clearInterval(minuterie);
      void contexte?.close().catch(() => undefined);
    };
  }, [flux, ecoute]);
  // Micro coupé ou flux perdu : on ne parle plus, quoi qu'ait dit la dernière mesure.
  return ecoute && parle;
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
  ecran: <path d="M3 4h18v12H3zM8 20h8M12 16v4M12 13V7m-3 3 3-3 3 3" />,
  quitter: <path d="M4 15c4-4 12-4 16 0l-2 3-3-1v-2.5a9 9 0 0 0-6 0V17l-3 1Z" />,
  main: <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m-9-1V8.5a1.5 1.5 0 0 0-3 0V14a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-3" />,
  reaction: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" />,
  discussion: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  personnes: <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" />,
  infos: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-4m0-4h.01" />,
  envoyer: <path d="m4 12 16-8-6 16-2-7-8-1Z" />,
  fermer: <path d="M6 6l12 12M18 6 6 18" />,
  lien: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
} as const;

function Icone({ nom, className = "size-5" }: { nom: keyof typeof ICONES; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONES[nom]}
    </svg>
  );
}

function Pastille({ nom, taille = "size-16 text-xl" }: { nom: string; taille?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${taille}`} style={{ background: teinte(nom) }}>
      {initiales(nom)}
    </span>
  );
}

/** Une personne dans la mosaïque : son image, ou sa pastille caméra coupée ; micro, main levée, réaction. */
function Tuile({
  nom,
  children,
  micro,
  camera,
  note,
  parle,
  main,
  reaction,
}: {
  nom: string;
  children?: ReactNode;
  micro: boolean;
  camera: boolean;
  note?: string;
  parle?: boolean;
  main?: boolean;
  reaction?: string | null;
}) {
  return (
    <figure
      className={`relative aspect-video min-w-0 overflow-hidden rounded-xl bg-[#3c4043] ring-offset-2 ring-offset-[#202124] transition-shadow ${parle ? "ring-[3px] ring-[#8ab4f8]" : ""}`}
    >
      {/* L'élément vidéo reste monté caméra coupée : c'est lui qui porte le son. */}
      <div className={camera ? "h-full w-full" : "hidden"}>{children}</div>
      {!camera && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`rounded-full ${parle ? "ring-4 ring-[#8ab4f8]/60" : ""}`}>
            <Pastille nom={nom} taille="size-[clamp(3rem,22%,6rem)] text-[clamp(1rem,4vw,2rem)]" />
          </span>
        </div>
      )}
      {main && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[#fdd663] px-2 py-1 text-xs font-semibold text-[#202124]" title="Main levée">
          <Icone nom="main" className="size-4" /> Main levée
        </span>
      )}
      {!micro && (
        <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-[#202124]/70 text-[#f28b82]" title="Micro coupé">
          <Icone nom="microCoupe" className="size-4" />
        </span>
      )}
      {reaction && (
        <span key={reaction} aria-label={`Réaction : ${reaction}`} className="reaction-flottante pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-5xl">
          {reaction}
        </span>
      )}
      <figcaption className="pointer-events-none absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-[#202124]/60 px-2 py-0.5 text-xs text-white">
        <span className="truncate font-medium">{nom}</span>
        {note && <span className="shrink-0 opacity-75">{note}</span>}
      </figcaption>
    </figure>
  );
}

function TuileDistante({ reunionId, participant, lireJetons }: { reunionId: string; participant: ParticipantVue; lireJetons: LireJetons }) {
  const { flux, etat } = useLecture(cheminFlux(reunionId, participant.userId, "cam"), lireJetons);
  const parle = useParle(flux, participant.micro && etat === "direct");
  return (
    <Tuile
      nom={participant.nom}
      micro={participant.micro}
      camera={participant.camera && etat === "direct"}
      note={etat === "direct" ? undefined : "· connexion…"}
      parle={parle}
      main={participant.main}
      reaction={participant.reaction}
    >
      <Video flux={flux} muet={false} />
    </Tuile>
  );
}

function EcranDistant({ reunionId, participant, lireJetons }: { reunionId: string; participant: ParticipantVue; lireJetons: LireJetons }) {
  const { flux, etat } = useLecture(cheminFlux(reunionId, participant.userId, "ecran"), lireJetons);
  return (
    <figure className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
      <Video flux={flux} muet ajuste="contain" />
      <figcaption className="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-[#202124]/70 px-2.5 py-1 text-xs font-medium text-white">
        <Icone nom="ecran" className="size-4" />
        Présentation de {participant.nom}
        {etat !== "direct" ? " · connexion…" : ""}
      </figcaption>
    </figure>
  );
}

/** Bouton rond de la barre du bas, comme dans Meet : gris s'il est actif, rouge s'il coupe quelque chose. */
function BoutonRond({
  onClick,
  libelle,
  coupe,
  allume,
  children,
  badge,
  className = "",
}: {
  onClick: () => void;
  libelle: string;
  coupe?: boolean;
  allume?: boolean;
  children: ReactNode;
  badge?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={allume ?? (coupe === undefined ? undefined : !coupe)}
      aria-label={libelle}
      title={libelle}
      className={`relative flex size-12 shrink-0 items-center justify-center rounded-full transition-colors ${
        coupe ? "bg-[#ea4335] text-white hover:bg-[#d93025]" : allume ? "bg-[#8ab4f8] text-[#202124] hover:bg-[#aecbfa]" : "bg-[#3c4043] text-white hover:bg-[#4a4e51]"
      } ${className}`}
    >
      {children}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#8ab4f8] px-1 text-[11px] font-bold text-[#202124]">{badge}</span>
      ) : null}
    </button>
  );
}

/** Copie le lien de la salle ; dit qu'il est copié. */
function useCopieLien(reunionId: string): [boolean, () => void] {
  const [copie, setCopie] = useState(false);
  const copier = () => {
    void navigator.clipboard
      ?.writeText(lienDeSalle(window.location.origin, reunionId))
      .then(() => {
        setCopie(true);
        setTimeout(() => setCopie(false), 2_000);
      })
      .catch(() => undefined);
  };
  return [copie, copier];
}

interface Props {
  reunionId: string;
  numero: string;
  titre: string;
  moi: string;
  nomMoi: string;
  pilote: boolean;
  videoConfiguree: boolean;
  /** Noms de ceux déjà dans la salle, pour l'écran de réglage. */
  dejaLa: string[];
  lienActif: boolean;
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
  const [copie, copier] = useCopieLien(props.reunionId);

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

  const parle = useParle(flux, micro);
  const aMicro = Boolean(flux?.getAudioTracks().length);
  const aCamera = Boolean(flux?.getVideoTracks().length);

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
        aMicro={aMicro}
        aCamera={aCamera}
      />
    );
  }

  const dejaLa = props.dejaLa;
  return (
    <div className="flex min-h-dvh flex-col text-white">
      <header className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <Link href={`/meeting/${props.reunionId}`} className="rounded-full px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">
          ← Retour
        </Link>
        <span className="text-sm text-white/50">{props.numero}</span>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative">
          <Tuile nom={props.nomMoi} micro={micro && aMicro} camera={camera && aCamera} parle={parle}>
            <Video flux={flux} muet miroir />
          </Tuile>
          {!pret && <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-white/80">Autorisez la caméra et le micro dans la fenêtre du navigateur…</p>}
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
            {aMicro && (
              <BoutonRond coupe={!micro} onClick={() => setMicro((v) => !v)} libelle={micro ? "Couper le micro" : "Ouvrir le micro"}>
                <Icone nom={micro ? "micro" : "microCoupe"} />
              </BoutonRond>
            )}
            {aCamera && (
              <BoutonRond coupe={!camera} onClick={() => setCamera((v) => !v)} libelle={camera ? "Couper la caméra" : "Ouvrir la caméra"}>
                <Icone nom={camera ? "camera" : "cameraCoupee"} />
              </BoutonRond>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-left">
          <h1 className="text-2xl font-normal sm:text-3xl">Prêt à participer ?</h1>
          <p className="text-base font-medium text-white/90">{props.titre}</p>
          {dejaLa.length === 0 ? (
            <p className="text-sm text-white/60">Personne n&apos;est encore dans la salle.</p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex -space-x-2">
                {dejaLa.slice(0, 4).map((n) => (
                  <span key={n} className="rounded-full ring-2 ring-[#202124]">
                    <Pastille nom={n} taille="size-8 text-xs" />
                  </span>
                ))}
              </span>
              <span className="text-sm text-white/80">
                {dejaLa.length === 1 ? `${dejaLa[0]} est dans la salle` : `${dejaLa.slice(0, 2).join(", ")}${dejaLa.length > 2 ? ` et ${dejaLa.length - 2} autre${dejaLa.length > 3 ? "s" : ""}` : ""} sont dans la salle`}
              </span>
            </div>
          )}
          {!props.lienActif && <p className="rounded-lg bg-[#fdd663]/15 px-3 py-2 text-sm text-[#fdd663]">Lien désactivé : vous entrez comme organisateur, les autres attendent sa réactivation.</p>}
          <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
            <button
              type="button"
              disabled={enCours}
              onClick={() => void entrer()}
              className="h-12 rounded-full bg-[#8ab4f8] px-7 text-sm font-semibold text-[#202124] hover:bg-[#aecbfa] disabled:opacity-50"
            >
              {enCours ? "Connexion…" : "Participer"}
            </button>
            <button type="button" onClick={copier} className="flex h-12 items-center gap-2 rounded-full border border-white/25 px-5 text-sm font-medium text-[#8ab4f8] hover:bg-white/5">
              <Icone nom="lien" className="size-4" />
              {copie ? "Lien copié" : "Copier le lien"}
            </button>
          </div>
          {erreurMedias && <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-[#fdd663]">{erreurMedias}</p>}
          {!props.videoConfiguree && (
            <p className="rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">
              Serveur vidéo non configuré sur cette instance (<code>VIDEO_URL_PUBLIQUE</code>) : la salle montrera qui est présent, sans image ni son.
            </p>
          )}
          {refus && <p className="rounded-lg bg-[#ea4335]/15 px-3 py-2 text-sm font-medium text-[#f28b82]">{refus}</p>}
        </div>
      </div>
    </div>
  );
}

type Panneau = "personnes" | "discussion" | "infos";

function SalleOuverte({
  reunionId,
  numero,
  titre,
  moi,
  nomMoi,
  pilote,
  lienActif,
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
  const [messages, setMessages] = useState<MessageSalle[]>([]);
  const [ecran, setEcran] = useState<MediaStream | null>(null);
  const [close, setClose] = useState(false);
  const [panneau, setPanneau] = useState<Panneau | null>(null);
  const [main, setMain] = useState(false);
  const [choixReaction, setChoixReaction] = useState(false);
  const [maReaction, setMaReaction] = useState<string | null>(null);
  const finReaction = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [nonLus, setNonLus] = useState(0);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [heure, setHeure] = useState(() => new Date());
  const ecranRef = useRef<MediaStream | null>(null);
  const medias = useRef({ micro, camera, ecran: false, main: false });
  const dernierMessage = useRef<string | null>(null);
  const panneauRef = useRef<Panneau | null>(null);
  const mainsConnues = useRef<Set<string>>(new Set());
  const [copie, copier] = useCopieLien(reunionId);

  useEffect(() => {
    panneauRef.current = panneau;
  }, [panneau]);

  const etatPublication = usePublication(flux, cheminFlux(reunionId, moi, "cam"), lireJetons);
  usePublication(ecran, ecran ? cheminFlux(reunionId, moi, "ecran") : null, lireJetons);
  const jeParle = useParle(flux, aMicro && micro);

  const annoncer = useCallback((texte: string) => {
    setAnnonce(texte);
    setTimeout(() => setAnnonce((a) => (a === texte ? null : a)), 4_000);
  }, []);

  const signaler = useCallback(async () => {
    const r = await signalerPresence(reunionId, medias.current, dernierMessage.current).catch(() => ({ etat: "muet" as const }));
    if (r.etat === "salle") {
      jetonsRef.current = r.jetons;
      setParticipants(r.participants);
      // Une main qui se lève se dit, comme dans Meet ; la sienne, non.
      const levees = new Set(r.participants.filter((p) => p.main && p.userId !== moi).map((p) => p.userId));
      for (const p of r.participants) if (levees.has(p.userId) && !mainsConnues.current.has(p.userId)) annoncer(`${p.nom} lève la main`);
      mainsConnues.current = levees;
      if (r.messages.length) {
        setMessages((avant) => {
          const connus = new Set(avant.map((m) => m.id));
          const nouveaux = r.messages.filter((m) => !connus.has(m.id));
          if (nouveaux.length && panneauRef.current !== "discussion") {
            const autres = nouveaux.filter((m) => m.userId !== moi);
            if (autres.length) {
              setNonLus((n) => n + autres.length);
              annoncer(`${autres.at(-1)!.nom} : ${autres.at(-1)!.corps.slice(0, 80)}`);
            }
          }
          return nouveaux.length ? [...avant, ...nouveaux] : avant;
        });
        dernierMessage.current = r.messages.at(-1)!.le;
      }
    } else if (r.etat === "close") {
      setClose(true);
    }
  }, [reunionId, moi, annoncer]);

  // Tout changement de micro, de caméra, de partage ou de main se dit aussitôt aux autres.
  useEffect(() => {
    medias.current = { micro: aMicro && micro, camera: aCamera && camera, ecran: ecran !== null, main };
    void signaler();
  }, [micro, camera, ecran, main, aMicro, aCamera, signaler]);

  useEffect(() => {
    if (close) return;
    const minuterie = setInterval(() => void signaler(), PAS_SIGNAL_MS);
    const horloge = setInterval(() => setHeure(new Date()), 15_000);
    // Onglet fermé : on le dit si on peut ; sinon, trois signaux manqués suffisent.
    const partir = () => void quitterLaSalle(reunionId);
    window.addEventListener("pagehide", partir);
    return () => {
      clearInterval(minuterie);
      clearInterval(horloge);
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

  const reagir = (emoji: string) => {
    setChoixReaction(false);
    setMaReaction(emoji);
    clearTimeout(finReaction.current);
    finReaction.current = setTimeout(() => setMaReaction(null), REACTION_MS);
    void reagirEnSalle(reunionId, emoji);
  };

  const quitter = async () => {
    arreterEcran();
    await quitterLaSalle(reunionId);
    routeur.push(`/meeting/${reunionId}`);
  };

  const terminer = async () => {
    if (!confirm("Terminer la réunion pour tous les participants ?")) return;
    arreterEcran();
    await terminerDepuisLaSalle(reunionId);
    routeur.push(`/meeting/${reunionId}`);
  };

  if (close) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <p className="text-2xl">La réunion est terminée</p>
        <p className="max-w-md text-sm text-white/70">L&apos;organisateur a fermé la salle. Le compte rendu et la feuille de présence restent consultables.</p>
        <Link href={`/meeting/${reunionId}`} className="flex h-12 items-center rounded-full bg-[#8ab4f8] px-6 text-sm font-semibold text-[#202124]">
          Voir la réunion
        </Link>
      </div>
    );
  }

  const autres = participants.filter((p) => p.present && p.userId !== moi);
  const ecransPartages = autres.filter((p) => p.ecran);
  const presentation = ecransPartages.length > 0;
  const colonnes = colonnesMosaique(autres.length + 1);
  const video = jetonsInitiaux.base !== null;
  const absents = participants.filter((p) => !p.present);
  const mains = participants.filter((p) => p.present && p.main).length;
  const basculer = (p: Panneau) => {
    if (p === "discussion") setNonLus(0);
    setPanneau((actuel) => (actuel === p ? null : p));
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden text-white">
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <main className={`flex min-w-0 flex-1 ${presentation ? "flex-col gap-3 lg:flex-row" : "flex-col"}`}>
          {ecran && (
            <p className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-[#3c4043] px-4 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Icone nom="ecran" className="size-4" /> Vous présentez votre écran à tout le monde
              </span>
              <button type="button" onClick={arreterEcran} className="rounded-full bg-[#8ab4f8] px-3 py-1 text-xs font-semibold text-[#202124]">
                Arrêter la présentation
              </button>
            </p>
          )}
          {video && presentation && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {ecransPartages.map((p) => (
                <EcranDistant key={`ecran-${p.userId}`} reunionId={reunionId} participant={p} lireJetons={lireJetons} />
              ))}
            </div>
          )}
          <div
            className={presentation ? "grid shrink-0 auto-rows-min content-start gap-3 overflow-y-auto max-lg:grid-flow-col max-lg:auto-cols-[10rem] lg:w-64" : "grid flex-1 content-center gap-3"}
            style={presentation ? undefined : { gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))` }}
          >
            <Tuile nom={`${nomMoi}`} note="(vous)" micro={aMicro && micro} camera={aCamera && camera} parle={jeParle} main={main} reaction={maReaction}>
              <Video flux={flux} muet miroir />
            </Tuile>
            {autres.map((p) =>
              video ? (
                <TuileDistante key={p.userId} reunionId={reunionId} participant={p} lireJetons={lireJetons} />
              ) : (
                <Tuile key={p.userId} nom={p.nom} micro={p.micro} camera={false} main={p.main} reaction={p.reaction} />
              ),
            )}
          </div>
          {autres.length === 0 && !presentation && (
            <div className="mx-auto mt-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-[#3c4043] p-5 text-center">
              <p className="text-sm">Vous êtes seul dans la salle. Les invités ont été prévenus par la cloche.</p>
              <button type="button" onClick={copier} className="flex items-center gap-2 rounded-full bg-[#8ab4f8] px-4 py-2 text-sm font-semibold text-[#202124]">
                <Icone nom="lien" className="size-4" /> {copie ? "Lien copié" : "Copier le lien de la salle"}
              </button>
            </div>
          )}
        </main>

        {panneau && (
          <aside className="flex w-full max-w-sm shrink-0 flex-col overflow-hidden rounded-2xl bg-white text-[#202124] max-sm:fixed max-sm:inset-2 max-sm:z-40 max-sm:w-auto max-sm:max-w-none sm:w-80">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="text-lg">{panneau === "personnes" ? "Participants" : panneau === "discussion" ? "Messages dans la réunion" : "Informations sur la réunion"}</h2>
              <button type="button" onClick={() => setPanneau(null)} aria-label="Fermer le panneau" className="flex size-9 items-center justify-center rounded-full hover:bg-black/5">
                <Icone nom="fermer" />
              </button>
            </div>
            {panneau === "personnes" && (
              <PanneauPersonnes moi={moi} nomMoi={nomMoi} micro={aMicro && micro} main={main} autres={autres} absents={absents} />
            )}
            {panneau === "discussion" && <PanneauDiscussion reunionId={reunionId} moi={moi} messages={messages} apresEnvoi={() => void signaler()} />}
            {panneau === "infos" && (
              <div className="space-y-4 overflow-y-auto px-5 pb-5 text-sm">
                <div>
                  <p className="font-medium">{titre}</p>
                  <p className="text-[#5f6368]">{numero}</p>
                </div>
                <div>
                  <p className="mb-1 font-medium">Lien de la salle</p>
                  <p className="break-all text-[#5f6368]">{typeof window === "undefined" ? "" : lienDeSalle(window.location.origin, reunionId)}</p>
                  <button type="button" onClick={copier} className="mt-2 flex items-center gap-2 rounded-full px-3 py-1.5 font-medium text-[#1a73e8] hover:bg-[#e8f0fe]">
                    <Icone nom="lien" className="size-4" /> {copie ? "Lien copié" : "Copier le lien"}
                  </button>
                  <p className="mt-1 text-xs text-[#5f6368]">Seuls les invités, connectés à Maria Suite, peuvent entrer.</p>
                  {!lienActif && <p className="mt-2 rounded-lg bg-[#fef7e0] px-3 py-2 text-xs text-[#b06000]">Lien désactivé : personne d&apos;autre n&apos;entre tant qu&apos;il n&apos;est pas réactivé.</p>}
                </div>
                {pilote && (
                  <div className="border-t border-black/10 pt-4">
                    <p className="mb-2 font-medium">Organisateur</p>
                    <button type="button" onClick={() => void terminer()} className="w-full rounded-full bg-[#ea4335] px-4 py-2 font-semibold text-white hover:bg-[#d93025]">
                      Terminer la réunion pour tous
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {annonce && (
        <p role="status" className="pointer-events-none fixed bottom-24 left-4 z-50 max-w-xs truncate rounded-lg bg-[#3c4043] px-4 py-3 text-sm shadow-lg">
          {annonce}
        </p>
      )}

      <footer className="relative flex h-20 shrink-0 items-center justify-between gap-3 px-4">
        <div className="hidden min-w-0 flex-1 items-center gap-3 text-sm md:flex">
          <span className="chiffres">{HEURE_SALLE.format(heure)}</span>
          <span className="h-4 w-px bg-white/30" aria-hidden />
          <span className="truncate">{titre}</span>
          {!video ? <span className="text-xs text-white/50">· serveur vidéo non configuré</span> : etatPublication === "echec" ? <span className="text-xs text-[#fdd663]">· reconnexion…</span> : null}
        </div>

        <div className="flex flex-1 items-center justify-center gap-2 sm:gap-3 md:flex-none">
          {aMicro && (
            <BoutonRond coupe={!micro} onClick={basculerMicro} libelle={micro ? "Couper le micro" : "Ouvrir le micro"}>
              <Icone nom={micro ? "micro" : "microCoupe"} />
            </BoutonRond>
          )}
          {aCamera && (
            <BoutonRond coupe={!camera} onClick={basculerCamera} libelle={camera ? "Couper la caméra" : "Ouvrir la caméra"}>
              <Icone nom={camera ? "camera" : "cameraCoupee"} />
            </BoutonRond>
          )}
          <BoutonRond allume={main} onClick={() => setMain((v) => !v)} libelle={main ? "Baisser la main" : "Lever la main"} className="max-sm:hidden">
            <Icone nom="main" />
          </BoutonRond>
          <div className="relative max-sm:hidden">
            <BoutonRond allume={choixReaction} onClick={() => setChoixReaction((v) => !v)} libelle="Envoyer une réaction">
              <Icone nom="reaction" />
            </BoutonRond>
            {choixReaction && (
              <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-[#3c4043] p-1.5 shadow-lg">
                {REACTIONS.map((r) => (
                  <button key={r} type="button" onClick={() => reagir(r)} className="flex size-10 items-center justify-center rounded-full text-2xl hover:bg-white/10" aria-label={`Réagir ${r}`}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
          {video && (
            <BoutonRond allume={ecran !== null} onClick={() => void partagerEcran()} libelle={ecran ? "Arrêter la présentation" : "Présenter l'écran"}>
              <Icone nom="ecran" />
            </BoutonRond>
          )}
          <button
            type="button"
            onClick={() => void quitter()}
            aria-label="Quitter la réunion"
            title="Quitter la réunion"
            className="flex h-12 w-16 items-center justify-center rounded-full bg-[#ea4335] text-white hover:bg-[#d93025]"
          >
            <Icone nom="quitter" className="size-6" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-end gap-1">
          <BoutonRond onClick={() => basculer("infos")} allume={panneau === "infos"} libelle="Informations sur la réunion" className="max-md:hidden">
            <Icone nom="infos" />
          </BoutonRond>
          <BoutonRond onClick={() => basculer("personnes")} allume={panneau === "personnes"} libelle={`Participants (${autres.length + 1})`} badge={mains || undefined}>
            <Icone nom="personnes" />
          </BoutonRond>
          <BoutonRond onClick={() => basculer("discussion")} allume={panneau === "discussion"} libelle="Messages dans la réunion" badge={nonLus || undefined}>
            <Icone nom="discussion" />
          </BoutonRond>
        </div>
      </footer>
    </div>
  );
}

const HEURE_SALLE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function LignePersonne({ nom, sousTitre, microOuvert, levee }: { nom: string; sousTitre?: string; microOuvert: boolean; levee: boolean }) {
  return (
    <li className="flex items-center gap-3 px-5 py-2">
      <Pastille nom={nom} taille="size-8 text-xs" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{nom}</span>
        {sousTitre && <span className="block text-xs text-[#5f6368]">{sousTitre}</span>}
      </span>
      {levee && <Icone nom="main" className="size-5 text-[#b06000]" />}
      <span className={microOuvert ? "text-[#5f6368]" : "text-[#d93025]"}>
        <Icone nom={microOuvert ? "micro" : "microCoupe"} />
      </span>
    </li>
  );
}

function PanneauPersonnes({
  moi,
  nomMoi,
  micro,
  main,
  autres,
  absents,
}: {
  moi: string;
  nomMoi: string;
  micro: boolean;
  main: boolean;
  autres: ParticipantVue[];
  absents: ParticipantVue[];
}) {
  // Mains levées en tête, comme dans Meet : c'est l'ordre de parole.
  const tries = [...autres].sort((a, b) => Number(b.main) - Number(a.main));
  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <p className="px-5 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-[#5f6368]">Dans la réunion · {autres.length + 1}</p>
      <ul>
        <LignePersonne key={moi} nom={nomMoi} sousTitre="Vous" microOuvert={micro} levee={main} />
        {tries.map((p) => (
          <LignePersonne key={p.userId} nom={p.nom} sousTitre={p.ecran ? "Présente son écran" : undefined} microOuvert={p.micro} levee={p.main} />
        ))}
      </ul>
      {absents.length > 0 && (
        <>
          <p className="px-5 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-[#5f6368]">Invités, pas encore là · {absents.length}</p>
          <ul className="opacity-70">
            {absents.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-5 py-2">
                <Pastille nom={p.nom} taille="size-8 text-xs" />
                <span className="truncate text-sm">{p.nom}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PanneauDiscussion({ reunionId, moi, messages, apresEnvoi }: { reunionId: string; moi: string; messages: MessageSalle[]; apresEnvoi: () => void }) {
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fond = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fond.current?.scrollTo({ top: fond.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const envoyer = async () => {
    const corps = texte.trim();
    if (!corps || envoi) return;
    setEnvoi(true);
    setErreur(null);
    const r = await ecrireEnSalle(reunionId, corps);
    setEnvoi(false);
    if (r.ok) {
      setTexte("");
      // Le message revient tout de suite, sans attendre le signal suivant.
      apresEnvoi();
    } else setErreur(r.message);
  };

  return (
    <>
      <p className="mx-5 mb-2 rounded-lg bg-[#f1f3f4] px-3 py-2 text-xs text-[#5f6368]">
        Les messages sont visibles par les participants et gardés avec la réunion.
      </p>
      <div ref={fond} className="flex-1 space-y-3 overflow-y-auto px-5 pb-3">
        {messages.length === 0 && <p className="pt-6 text-center text-sm text-[#5f6368]">Aucun message pour l&apos;instant.</p>}
        {messages.map((m, i) => {
          const suite = i > 0 && messages[i - 1].userId === m.userId;
          return (
            <div key={m.id}>
              {!suite && (
                <p className="text-xs">
                  <span className="font-semibold">{m.userId === moi ? "Vous" : m.nom}</span>{" "}
                  <span className="text-[#5f6368]">{HEURE_SALLE.format(new Date(m.le))}</span>
                </p>
              )}
              <p className="whitespace-pre-wrap break-words text-sm">{m.corps}</p>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer();
        }}
        className="m-3 flex items-end gap-2 rounded-3xl bg-[#f1f3f4] px-4 py-2"
      >
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void envoyer();
            }
          }}
          rows={1}
          maxLength={2_000}
          placeholder="Envoyer un message"
          aria-label="Message aux participants"
          className="max-h-28 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
        />
        <button type="submit" disabled={envoi || !texte.trim()} aria-label="Envoyer" className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#1a73e8] hover:bg-black/5 disabled:text-[#5f6368]/50">
          <Icone nom="envoyer" />
        </button>
      </form>
      {erreur && <p className="mx-5 mb-3 text-xs text-[#d93025]">{erreur}</p>}
    </>
  );
}
