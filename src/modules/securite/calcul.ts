/**
 * Sécurité : vidéosurveillance des sites.
 *
 * Le chemin d'une image, de la caméra au navigateur :
 *
 *     caméra → enregistreur du site (Hikvision, Dahua)
 *            → relais du site (go2rtc), qui lit l'enregistreur en RTSP
 *            → serveur vidéo central (MediaMTX), où le relais PUBLIE ses flux
 *            → navigateur, en WebRTC (WHEP)
 *
 * Le relais se connecte au serveur central de lui-même : rien à ouvrir sur la
 * box du site, et l'enregistreur ne s'expose jamais sur internet. Le serveur
 * vidéo ne décide de rien : à chaque publication et à chaque lecture, il
 * demande à Maria Suite (`/api/video/autorisation`) si elle est permise.
 *
 * Ce fichier est pur : chemins, adresses RTSP des enregistreurs, configuration
 * du relais. Il se teste sans réseau.
 */

export type Marque = "hikvision" | "dahua";
export type Qualite = "hd" | "sd";

export const LIBELLE_MARQUE: Record<Marque, string> = { hikvision: "Hikvision (ou HiLook, EZVIZ pro)", dahua: "Dahua (ou Imou pro)" };

export type NatureSite = "magasin" | "entrepot" | "bureau" | "autre";
export const LIBELLE_NATURE: Record<NatureSite, string> = { magasin: "Magasin", entrepot: "Entrepôt", bureau: "Bureau", autre: "Autre site" };

/**
 * Chemin d'un flux sur le serveur vidéo : `s/<site>/<caméra>/<qualité>`.
 *
 * Le site est dans le chemin, et c'est ce qui permet de refuser à un relais
 * de publier sous le nom d'un autre : il ne publie que sous son propre site.
 */
export function cheminFlux(siteId: string, cameraId: string, qualite: Qualite): string {
  return `s/${siteId}/${cameraId}/${qualite}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MOTIF_CHEMIN = new RegExp(`^s/(${UUID})/(${UUID})/(hd|sd)$`, "i");

export function lireChemin(chemin: string): { siteId: string; cameraId: string; qualite: Qualite } | null {
  const m = MOTIF_CHEMIN.exec(chemin.replace(/^\//, ""));
  return m ? { siteId: m[1].toLowerCase(), cameraId: m[2].toLowerCase(), qualite: m[3].toLowerCase() as Qualite } : null;
}

/**
 * Adresse RTSP d'un canal sur l'enregistreur, telle que le relais la lit sur
 * le réseau du site. Le flux secondaire (`sd`) sert la mosaïque : quelques
 * centaines de kilobits par caméra, là où le principal en demande plusieurs
 * mégabits — la liaison montante d'une boutique d'Abidjan ne les a pas.
 *
 * Identifiants laissés en variables (`${NVR_UTILISATEUR}`) : go2rtc les lit
 * dans l'environnement du boîtier. Ils ne passent jamais par Maria Suite.
 */
export function urlEnregistreur(marque: Marque, adresse: string, port: number, canal: number, qualite: Qualite): string {
  const auth = "${NVR_UTILISATEUR}:${NVR_MOT_DE_PASSE}";
  if (marque === "hikvision") {
    return `rtsp://${auth}@${adresse}:${port}/Streaming/Channels/${canal}0${qualite === "hd" ? 1 : 2}`;
  }
  return `rtsp://${auth}@${adresse}:${port}/cam/realmonitor?channel=${canal}&subtype=${qualite === "hd" ? 0 : 1}`;
}

export interface CameraRelais {
  id: string;
  nom: string;
  canal: number;
  /** Publier aussi le flux principal, pour le plein écran. Coûte de la bande passante. */
  hd: boolean;
}

/**
 * Configuration go2rtc du relais d'un site.
 *
 * Aucun secret dedans : le mot de passe de l'enregistreur et la clé du relais
 * sont des variables d'environnement du boîtier. Le fichier peut donc
 * circuler — par WhatsApp à l'installateur — sans rien livrer.
 */
export function configurationRelais(site: {
  id: string;
  nom: string;
  marque: Marque;
  adresse: string;
  port: number;
  publication: string;
  cameras: CameraRelais[];
}): string {
  const nomFlux = (camera: CameraRelais, q: Qualite) => `c${camera.canal}_${q}`;
  const lignes = [
    `# Relais Maria Suite — ${site.nom}`,
    "# Variables à définir sur le boîtier : NVR_UTILISATEUR, NVR_MOT_DE_PASSE, RELAIS_CLE.",
    "# Le boîtier se connecte au serveur vidéo de lui-même : aucun port à ouvrir sur la box.",
    "",
    "streams:",
  ];
  const publications: string[] = ["publish:"];
  for (const camera of site.cameras) {
    for (const q of camera.hd ? (["sd", "hd"] as const) : (["sd"] as const)) {
      lignes.push(`  ${nomFlux(camera, q)}: ${urlEnregistreur(site.marque, site.adresse, site.port, camera.canal, q)}  # ${camera.nom.replace(/[\r\n#]/g, " ")}`);
      publications.push(`  ${nomFlux(camera, q)}: rtsps://${site.id}:\${RELAIS_CLE}@${site.publication}/${cheminFlux(site.id, camera.id, q)}`);
    }
  }
  return [...lignes, "", ...publications, "", "api:", '  listen: "127.0.0.1:1984"', ""].join("\n");
}

/**
 * Débit montant que le site doit tenir en continu, en kilobits par seconde.
 * Ordres de grandeur d'un enregistreur réglé par défaut : 512 kbit/s pour un
 * flux secondaire, 2 048 pour un principal en 1080p.
 */
export const DEBIT_KBPS: Record<Qualite, number> = { sd: 512, hd: 2048 };

export function debitMontant(cameras: readonly Pick<CameraRelais, "hd">[]): number {
  return cameras.reduce((s, c) => s + DEBIT_KBPS.sd + (c.hd ? DEBIT_KBPS.hd : 0), 0);
}

/** Le relais est vu en ligne s'il a publié depuis moins de cinq minutes. */
export function relaisEnLigne(vuLe: Date | null, maintenant: Date): boolean {
  return vuLe !== null && maintenant.getTime() - vuLe.getTime() < 5 * 60_000;
}

/** Disposition du mur : 1, 4, 9 ou 16 images. */
export const DISPOSITIONS = [1, 4, 9, 16] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export function dispositionPour(nombre: number): Disposition {
  return DISPOSITIONS.find((d) => d >= nombre) ?? 16;
}
