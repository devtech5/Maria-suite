/**
 * Règles pures de la communication : adresses, numéros, gabarits.
 * Sans dépendance — testées sans base, lues par le navigateur.
 */

export const CANAUX = { email: "E-mail", whatsapp: "WhatsApp" } as const;

/**
 * Numéro au format international, chiffres seuls, ou `null` s'il n'en est pas un.
 *
 * Un numéro ivoirien saisi localement (« 07 07 12 34 56 », dix chiffres
 * depuis 2021) reçoit l'indicatif 225. Un numéro qui commence par « + » ou
 * « 00 » garde le sien. Un numéro à huit chiffres — l'ancien plan — ne se
 * devine pas : on le refuse plutôt que d'écrire au mauvais abonné.
 */
export function normaliserTelephone(saisie: string, indicatifPays = "225"): string | null {
  const brut = saisie.trim();
  const international = brut.startsWith("+") || brut.startsWith("00");
  let chiffres = brut.replace(/\D/g, "");
  if (brut.startsWith("00")) chiffres = chiffres.slice(2);
  if (!international) {
    if (indicatifPays === "225" && chiffres.length !== 10) return null;
    chiffres = indicatifPays + chiffres;
  }
  return chiffres.length >= 8 && chiffres.length <= 15 ? chiffres : null;
}

export function normaliserAdresseEmail(saisie: string): string | null {
  const v = saisie.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
}

/** Adresse normalisée selon le canal : la clé des désinscriptions. */
export function normaliserDestinataire(canal: keyof typeof CANAUX, saisie: string): string | null {
  return canal === "email" ? normaliserAdresseEmail(saisie) : normaliserTelephone(saisie);
}

/**
 * Remplit un gabarit : `{nom}`, `{entreprise}`… Une variable inconnue reste
 * telle quelle, visible à la relecture plutôt que remplacée par du vide.
 */
export function remplir(gabarit: string, valeurs: Record<string, string | null | undefined>): string {
  return gabarit.replace(/\{(\w+)\}/g, (tout, cle: string) => {
    const v = valeurs[cle];
    return v === undefined || v === null ? tout : v;
  });
}
