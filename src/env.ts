import { z } from "zod";

/**
 * Configuration lue depuis l'environnement.
 *
 * La validation est PARESSEUSE, déclenchée au premier accès et non au
 * chargement du module. C'est délibéré : `next build` évalue les modules pour
 * collecter les routes, sans que les variables d'exécution soient forcément
 * présentes. Valider au chargement ferait échouer la compilation d'un
 * déploiement par ailleurs correct.
 *
 * Au premier accès réel — donc à la première requête — une configuration
 * incomplète échoue bruyamment, avec le détail de ce qui manque.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères"),
  DEFAULT_COUNTRY: z.string().length(2).default("CI"),
  /**
   * Instance de démonstration : affiche un bandeau « données fictives » sur
   * toutes les pages. Un prospect qui prend un jeu d'essai pour un vrai bilan
   * repart avec une idée fausse de ce qu'il a vu.
   */
  INSTANCE_DEMO: z.enum(["0", "1"]).default("0"),

  /**
   * Dépôt de fichiers sur disque : `pnpm dev:local`, ou le VPS (volume
   * persistant, inclus dans la sauvegarde). Jamais sur un hébergeur à disque
   * éphémère.
   *
   * Facultatif : sans lui, la bibliothèque de documents se lit toujours, et
   * seul l'ajout de fichier refuse en disant pourquoi. Une variable oubliée ne
   * doit pas fermer un module entier.
   */
  STOCKAGE_LOCAL: z.string().optional(),

  /**
   * Applique les migrations et recopie le catalogue des droits au démarrage
   * du serveur. « 1 » sur le VPS : un déploiement ne peut plus tourner sur un
   * schéma en retard. Utilise DATABASE_URL_MIGRATION si elle est renseignée.
   */
  MIGRATIONS_AU_DEMARRAGE: z.enum(["0", "1"]).default("0"),
  DATABASE_URL_MIGRATION: z.string().optional(),

  /**
   * Modules à ouvrir malgré leurs écrans sur jeu d'essai.
   *
   * Clés du registre séparées par des virgules, ou `*` pour toutes. Renseignée,
   * elle fait foi partout — c'est ainsi qu'on voit en développement ce que le
   * client verra. Vide, le développement ouvre tout et la production ne s'ouvre
   * à rien, quoi qu'en dise le rôle.
   *
   * Sert à l'instance de démonstration, où montrer la suite du périmètre est
   * l'objet même de la visite — et nulle part ailleurs. Sur une instance qui
   * porte de vraies recettes, cette variable reste vide.
   */
  MODULES_APERCU: z.string().default(""),

  /**
   * Envoi des e-mails : mot de passe oublié, et demain relances et reçus.
   * Vide : rien ne part, le lien est écrit dans le journal du serveur — assez
   * pour le développement, jamais pour une vraie instance.
   */
  COURRIEL_FOURNISSEUR: z.enum(["", "brevo", "resend"]).default(""),
  COURRIEL_CLE: z.string().optional(),
  COURRIEL_EXPEDITEUR: z.string().default("Maria Suite <no-reply@exemple.ci>"),
  /** Adresse publique de l'application, pour les liens envoyés hors de l'écran. */
  URL_PUBLIQUE: z.string().url().optional(),

  /**
   * WhatsApp Business (API Cloud de Meta) : jeton d'accès et identifiant du
   * numéro expéditeur. Vides : les envois WhatsApp sont refusés en le disant,
   * l'e-mail reste disponible.
   *
   * Hors d'une conversation ouverte par le client dans les 24 heures, Meta
   * n'accepte que des MODÈLES approuvés. `WHATSAPP_MODELE` nomme ce modèle —
   * un corps à une variable, « {{1}} », qui reçoit le texte du message.
   */
  WHATSAPP_JETON: z.string().optional(),
  WHATSAPP_NUMERO_ID: z.string().optional(),
  WHATSAPP_MODELE: z.string().optional(),
  WHATSAPP_LANGUE: z.string().default("fr"),

  /**
   * Serveur vidéo (MediaMTX) des modules Sécurité et Meeting.
   *
   * `VIDEO_URL_PUBLIQUE` — adresse où les navigateurs lisent les caméras en
   * WebRTC (WHEP), et publient et lisent les flux des réunions (WHIP/WHEP) :
   * https://video.exemple.ci. `VIDEO_PUBLICATION` — hôte
   * et port où les relais des sites publient en RTSPS : video.exemple.ci:8322.
   * Vides : le module se configure, mais aucune image ne s'affiche.
   */
  VIDEO_URL_PUBLIQUE: z.string().url().optional(),
  VIDEO_PUBLICATION: z
    .string()
    .regex(/^[a-z0-9.-]+:\d{2,5}$/i, "VIDEO_PUBLICATION : hôte:port, par exemple video.exemple.ci:8322")
    .optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function resolve(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  · ${issue.path.join(".")} — ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuration invalide.\n${details}\n\n` +
        "En local : copiez .env.example vers .env.local et complétez.\n" +
        "En déploiement : renseignez ces variables dans les réglages du projet.",
    );
  }

  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get: (_target, key: string) => resolve()[key as keyof Env],
  has: (_target, key: string) => key in resolve(),
  ownKeys: () => Reflect.ownKeys(resolve()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
