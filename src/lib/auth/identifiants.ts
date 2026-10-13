/**
 * Règles d'identifiants : adresse e-mail et mot de passe.
 *
 * Logique pure, sans base ni hachage : c'est ce qui se teste, et ce que
 * l'inscription, la connexion et l'écran des membres appliquent à l'identique.
 */

/**
 * Normalise une adresse : espaces retirés, minuscules.
 *
 * Sans cela, « Awa@Boutique.ci » et « awa@boutique.ci » ouvriraient deux
 * comptes, et la personne ne retrouverait jamais le sien. Les minuscules sont
 * un écart assumé à la norme (la partie locale y est sensible à la casse) :
 * aucun fournisseur courant ne la distingue, et l'erreur inverse coûte cher.
 */
export function normaliserEmail(saisie: string): string | null {
  const email = saisie.trim().toLowerCase();
  if (email.length > 254) return null;
  // Volontairement simple : une adresse se prouve en recevant un message, pas
  // avec une expression régulière. On écarte seulement l'évidemment faux.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

export const LONGUEUR_MIN_MOT_DE_PASSE = 8;
/** Au-delà, Argon2 travaille pour rien et une requête devient une arme. */
export const LONGUEUR_MAX_MOT_DE_PASSE = 128;

/**
 * Juge un mot de passe choisi par l'utilisateur. Rend le motif du refus, ou
 * `null` quand il convient.
 *
 * Pas d'exigence de majuscule ou de caractère spécial : elles produisent
 * « Motdepasse1! » et rien de plus solide. La longueur compte davantage, et
 * quelques mots de passe trop courants sont refusés d'office.
 */
export function motifRefusMotDePasse(
  motDePasse: string,
  contexte: { email?: string | null } = {},
): string | null {
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`;
  }
  if (motDePasse.length > LONGUEUR_MAX_MOT_DE_PASSE) {
    return `Le mot de passe ne peut pas dépasser ${LONGUEUR_MAX_MOT_DE_PASSE} caractères.`;
  }
  if (/^(.)\1+$/.test(motDePasse)) {
    return "Un mot de passe fait d'un seul caractère répété se devine tout de suite.";
  }

  const bas = motDePasse.toLowerCase();
  if (TROP_COURANTS.has(bas)) {
    return "Ce mot de passe fait partie des plus utilisés : choisissez-en un autre.";
  }

  const identifiant = contexte.email?.split("@")[0]?.toLowerCase();
  if (identifiant && identifiant.length >= 4 && bas.includes(identifiant)) {
    return "Le mot de passe ne doit pas reprendre votre adresse e-mail.";
  }

  return null;
}

const TROP_COURANTS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "azertyuiop",
  "azerty123",
  "qwertyuiop",
  "password",
  "password1",
  "motdepasse",
  "motdepasse1",
  "abidjan2024",
  "abidjan2025",
  "abidjan2026",
  "fiessou123",
  "maria123",
  "mariasuite",
  "00000000",
  "11111111",
  "87654321",
]);

/** Échecs tolérés avant le verrou. */
export const ECHECS_AVANT_VERROU = 5;
/** Durée du verrou, en minutes. Assez pour décourager, pas pour bloquer une journée. */
export const DUREE_VERROU_MINUTES = 15;

/** Le compte est-il verrouillé à cet instant ? */
export function estVerrouille(lockedUntil: Date | null, maintenant = new Date()): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > maintenant.getTime();
}

/**
 * Conséquence d'un échec : nouveau compteur, et verrou s'il atteint le seuil.
 * Le compteur repart de zéro une fois le verrou posé, pour qu'un verrou expiré
 * laisse de nouveau cinq essais et non un seul.
 */
export function apresEchec(
  echecs: number,
  maintenant = new Date(),
): { failedLogins: number; lockedUntil: Date | null } {
  const total = echecs + 1;
  if (total >= ECHECS_AVANT_VERROU) {
    return {
      failedLogins: 0,
      lockedUntil: new Date(maintenant.getTime() + DUREE_VERROU_MINUTES * 60 * 1000),
    };
  }
  return { failedLogins: total, lockedUntil: null };
}

/**
 * Mot de passe provisoire lisible : quatre groupes de quatre caractères, sans
 * les signes qu'on confond à l'oral ou à l'écriture (0/O, 1/l/I).
 *
 * `aleatoire` rend un entier dans [0, max) ; en production c'est `randomInt`
 * de `node:crypto`. Le paramètre ne sert qu'à garder la fonction testable.
 */
export function motDePasseProvisoire(aleatoire: (max: number) => number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const groupes: string[] = [];
  for (let g = 0; g < 4; g += 1) {
    let groupe = "";
    for (let i = 0; i < 4; i += 1) groupe += alphabet[aleatoire(alphabet.length)];
    groupes.push(groupe);
  }
  return groupes.join("-");
}

// ------------------------------------------------- mot de passe oublié

/** Durée de validité d'un lien de réinitialisation. */
export const DUREE_JETON_REINIT_MINUTES = 60;
/** Demandes tolérées par adresse et par heure : freine l'envoi en rafale. */
export const DEMANDES_REINIT_PAR_HEURE = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Jeton du lien envoyé par e-mail : `<id>.<secret>`. L'identifiant retrouve la
 * demande sans balayer la table ; seul le secret, haché, est comparé. En base
 * ne vit que l'empreinte : une fuite de la table ne donne aucun lien valable.
 */
export function formerJetonReinit(id: string, secret: string): string {
  return `${id}.${secret}`;
}

export function lireJetonReinit(jeton: string): { id: string; secret: string } | null {
  const point = jeton.indexOf(".");
  if (point < 0) return null;
  const id = jeton.slice(0, point);
  const secret = jeton.slice(point + 1);
  if (!UUID.test(id) || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return null;
  return { id, secret };
}
