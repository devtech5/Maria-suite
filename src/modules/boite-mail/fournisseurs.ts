/**
 * Réglages IMAP/SMTP des fournisseurs courants, devinés d'après l'adresse.
 * Sans dépendance : lu par le formulaire de connexion.
 */

export interface Reglages {
  imapHote: string;
  imapPort: number;
  imapSecurise: boolean;
  smtpHote: string;
  smtpPort: number;
  /** Vrai : TLS dès la connexion (465). Faux : STARTTLS (587). */
  smtpSecurise: boolean;
  /** Ce qu'il faut savoir avant de se connecter. */
  conseil: string;
  fournisseur: string;
  /**
   * Le mot de passe attendu : celui de la boîte elle-même (hébergeur), ou un
   * « mot de passe d'application » que le fournisseur fait créer à part.
   */
  motDePasse: "boite" | "application";
}

/**
 * Hostinger héberge les boîtes de MARIA GROUP SARL (@maria-groupe.com). IMAP
 * et SMTP chiffrés dès la connexion ; le mot de passe est celui de la boîte,
 * choisi dans hPanel — pas de mot de passe d'application.
 */
const HOSTINGER: Reglages = {
  fournisseur: "Hostinger",
  imapHote: "imap.hostinger.com",
  imapPort: 993,
  imapSecurise: true,
  smtpHote: "smtp.hostinger.com",
  smtpPort: 465,
  smtpSecurise: true,
  motDePasse: "boite",
  conseil:
    "Saisissez le mot de passe de votre boîte @maria-groupe.com. Oublié ? L'administrateur le réinitialise dans hPanel (E-mails › Comptes de messagerie).",
};

const GMAIL: Reglages = {
  fournisseur: "Gmail",
  imapHote: "imap.gmail.com",
  imapPort: 993,
  imapSecurise: true,
  smtpHote: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecurise: true,
  motDePasse: "application",
  conseil:
    "Gmail refuse le mot de passe habituel : activez la validation en deux étapes, puis créez un « mot de passe d'application » (Compte Google › Sécurité) et saisissez-le ici.",
};

const YAHOO: Reglages = {
  fournisseur: "Yahoo",
  imapHote: "imap.mail.yahoo.com",
  imapPort: 993,
  imapSecurise: true,
  smtpHote: "smtp.mail.yahoo.com",
  smtpPort: 465,
  smtpSecurise: true,
  motDePasse: "application",
  conseil: "Yahoo demande un « mot de passe d'application » (Sécurité du compte › Générer un mot de passe d'application).",
};

const OUTLOOK: Reglages = {
  fournisseur: "Outlook / Hotmail",
  imapHote: "outlook.office365.com",
  imapPort: 993,
  imapSecurise: true,
  smtpHote: "smtp-mail.outlook.com",
  smtpPort: 587,
  smtpSecurise: false,
  motDePasse: "boite",
  conseil:
    "Microsoft n'accepte plus le mot de passe seul pour les comptes Outlook.com et Hotmail personnels, et le refuse souvent sur Microsoft 365. Si la connexion échoue, utilisez une boîte de votre hébergeur ou Gmail.",
};

const DOMAINES: Record<string, Reglages> = {
  "maria-groupe.com": HOSTINGER,
  "gmail.com": GMAIL,
  "googlemail.com": GMAIL,
  "yahoo.com": YAHOO,
  "yahoo.fr": YAHOO,
  "ymail.com": YAHOO,
  "outlook.com": OUTLOOK,
  "outlook.fr": OUTLOOK,
  "hotmail.com": OUTLOOK,
  "hotmail.fr": OUTLOOK,
  "live.com": OUTLOOK,
  "live.fr": OUTLOOK,
};

/**
 * Réglages probables pour une adresse. Un domaine d'entreprise (boutique.ci)
 * est le plus souvent hébergé chez un prestataire cPanel ou équivalent :
 * mail.<domaine>, ports standard.
 */
export function deviner(adresse: string): Reglages {
  const domaine = adresse.split("@")[1]?.trim().toLowerCase() ?? "";
  return (
    DOMAINES[domaine] ?? {
      fournisseur: "Hébergeur",
      imapHote: domaine ? `mail.${domaine}` : "",
      imapPort: 993,
      imapSecurise: true,
      smtpHote: domaine ? `mail.${domaine}` : "",
      smtpPort: 465,
      smtpSecurise: true,
      motDePasse: "boite",
      conseil: "Réglages habituels d'un hébergeur : vérifiez-les dans l'espace client de votre hébergement (rubrique e-mail).",
    }
  );
}

/** Nom lisible d'un dossier IMAP selon son usage déclaré. */
export function libelleDossier(chemin: string, usage?: string | null): string {
  switch (usage) {
    case "\\Inbox":
      return "Boîte de réception";
    case "\\Sent":
      return "Envoyés";
    case "\\Drafts":
      return "Brouillons";
    case "\\Trash":
      return "Corbeille";
    case "\\Junk":
      return "Indésirables";
    case "\\Archive":
      return "Archives";
    case "\\All":
      return "Tous les messages";
    case "\\Flagged":
      return "Suivis";
  }
  if (chemin.toUpperCase() === "INBOX") return "Boîte de réception";
  return chemin.split(/[/.]/).pop() ?? chemin;
}

/** Ordre d'affichage des dossiers : réception d'abord, corbeille en dernier. */
export function rangDossier(chemin: string, usage?: string | null): number {
  const ordre = ["\\Inbox", "\\Flagged", "\\Drafts", "\\Sent", "\\Archive", "\\All", "\\Junk", "\\Trash"];
  if (chemin.toUpperCase() === "INBOX") return 0;
  const i = usage ? ordre.indexOf(usage) : -1;
  return i >= 0 ? i : 5;
}

/**
 * Document HTML d'un e-mail, prêt pour un `<iframe sandbox srcdoc>`.
 *
 * La politique de sécurité interdit tout script et, par défaut, toute
 * ressource distante : une image distante sert souvent de pixel espion, qui
 * signale à l'expéditeur que le message a été ouvert, quand et d'où. Les liens
 * s'ouvrent dans un nouvel onglet.
 */
export function documentCourriel(html: string, imagesDistantes: boolean): string {
  const images = imagesDistantes ? "img-src data: cid: https: http:;" : "img-src data: cid:;";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${images} style-src 'unsafe-inline'; font-src data:;"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}
