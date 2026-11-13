/**
 * Pied de page du papier à en-tête, sous le filet doré : deux lignes de petits
 * caractères, tout sur la même ligne, séparé par « · ».
 *
 *   MARIA GROUP - RCCM N° … · NCC … · Capital : 10 000 000 FCFA · Siège social : …
 *   Bureaux : … · Tél. : … · hello@… · www.…
 *
 * Sans dépendance : partagé par les documents imprimés et l'aperçu de l'écran
 * « Entreprise ». Une mention absente disparaît, rien n'est inventé : un NCC
 * non saisi ne laisse pas de « [N°] » sur le papier.
 */

export interface EntreePied {
  nom: string;
  formeJuridique: string | null;
  rccm: string | null;
  /** « RCCM » : le libellé du registre du pays. */
  registre: string;
  identifiantFiscal: string | null;
  /** « NCC » en Côte d'Ivoire. */
  sigleFiscal: string;
  /** Capital déjà formaté, devise comprise : « 10 000 000 FCFA ». */
  capital: string | null;
  regimeFiscal: string | null;
  /** Mentions libres (siège social…) ; les retours à la ligne deviennent des « · ». */
  mentions: string | null;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  siteWeb: string | null;
}

const SEPARATEUR = " · ";

/** La raison sociale sans sa forme (« MARIA GROUP SARL » donne « MARIA GROUP »), comme sur le papier. */
function marque(nom: string, forme: string | null): string {
  const n = nom.trim();
  const f = forme?.trim();
  return f && n.toLowerCase().endsWith(` ${f.toLowerCase()}`) ? n.slice(0, -(f.length + 1)).trim() : n;
}

export function lignesPied(e: EntreePied): string[] {
  const mentions = (e.mentions ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const identite = [
    e.rccm ? `${e.registre} ${e.rccm}` : null,
    e.identifiantFiscal ? `${e.sigleFiscal} ${e.identifiantFiscal}` : null,
    e.capital ? `Capital : ${e.capital}` : null,
    e.regimeFiscal,
    ...mentions,
  ].filter((x): x is string => Boolean(x));
  const lieu = [e.adresse, e.ville].filter(Boolean).join(", ");
  const coordonnees = [lieu ? `Bureaux : ${lieu}` : null, e.telephone ? `Tél. : ${e.telephone}` : null, e.email, e.siteWeb].filter((x): x is string => Boolean(x));

  const premiere = identite.length > 0 ? `${marque(e.nom, e.formeJuridique)} - ${identite.join(SEPARATEUR)}` : "";
  return [premiere, coordonnees.join(SEPARATEUR)].filter(Boolean);
}
