/**
 * Import d'un règlement intérieur : du texte brut d'un fichier à la structure
 * de la plateforme — un TITRE, un PRÉAMBULE, des ARTICLES (titre et texte).
 * Sans base ni React.
 *
 * Le fichier (Word, texte) n'est pas conservé : la plateforme en RÉCUPÈRE la
 * structure et la montre dans l'éditeur, où l'on relit, corrige, puis
 * enregistre ou publie comme pour un règlement rédigé à la main.
 *
 * Ce qui fait un article, dans l'ordre où on le cherche :
 *   1. un titre « Article 1 : Objet », « ARTICLE 2 – Horaires », « Art. 3. »,
 *      « Article premier » ;
 *   2. à défaut, une numérotation « 1. Objet », « 2) Horaires », si elle part
 *      de 1 et compte au moins trois entrées consécutives.
 * Les intertitres « TITRE I », « CHAPITRE 2 », « SECTION… » se gardent : ils
 * ouvrent le texte de l'article qui les suit. Tout ce qui précède le premier
 * article est le préambule (le titre du document, s'il est court, en est tiré).
 */

import { ARTICLES_MAX, LONGUEUR_MAX_PREAMBULE, LONGUEUR_MAX_TEXTE_ARTICLE, LONGUEUR_MAX_TITRE, LONGUEUR_MAX_TITRE_ARTICLE, type Article } from "./regles";

export interface ReglementLu {
  titre: string | null;
  preambule: string;
  articles: Article[];
  /** Ce que la plateforme n'a pas pu garder tel quel : à relire. */
  avertissements: string[];
}

const ARTICLE = /^\s*(?:art(?:icle)?\.?)\s*(\d{1,3}|premier|1er)\s*(?:bis|ter)?\s*[:.\-–—)]*\s*(.*)$/i;
const NUMEROTE = /^\s*(\d{1,3})\s*[.)\-–—]\s+(\S.*)$/;
const INTERTITRE = /^\s*(?:titre|chapitre|section|partie)\s+(?:[ivxlc]+|\d+|premier|préliminaire)\b/i;

const nettoyer = (ligne: string) => ligne.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();

interface Entete {
  index: number;
  numero: number;
  titre: string;
}

function chercher(lignes: readonly string[], motif: RegExp): Entete[] {
  const trouvees: Entete[] = [];
  lignes.forEach((l, index) => {
    const m = motif.exec(l);
    if (!m) return;
    // Un « Article 5 » cité dans une phrase n'est pas un titre : un titre est court.
    if (l.length > 220) return;
    const brut = m[1].toLowerCase();
    trouvees.push({ index, numero: brut === "premier" || brut === "1er" ? 1 : Number(brut), titre: nettoyer(m[2] ?? "") });
  });
  return trouvees;
}

/** Numérotation « 1. », « 2. »… : retenue seulement si elle part de 1 et suit, trois fois au moins. */
function suiteNumerotee(entetes: Entete[]): Entete[] {
  const suite: Entete[] = [];
  for (const e of entetes) {
    if (e.numero === suite.length + 1) suite.push(e);
  }
  return suite.length >= 3 ? suite : [];
}

export function decouperReglement(texte: string): ReglementLu {
  const lignes = texte
    .replace(/\r\n?/g, "\n")
    .replace(/^﻿/, "")
    .split("\n")
    .map(nettoyer);
  const avertissements: string[] = [];

  let entetes = chercher(lignes, ARTICLE);
  if (entetes.length === 0) {
    entetes = suiteNumerotee(chercher(lignes, NUMEROTE));
    if (entetes.length > 0) avertissements.push("Les articles ont été repérés par leur numérotation (« 1. », « 2. »…) : vérifiez le découpage.");
  }
  if (entetes.length === 0) {
    return { titre: null, preambule: "", articles: [], avertissements: ["Aucun article repéré. La plateforme cherche des titres du type « Article 1 : Objet » ou une numérotation « 1. Objet »."] };
  }
  if (entetes.length > ARTICLES_MAX) {
    return { titre: null, preambule: "", articles: [], avertissements: [`${entetes.length} articles repérés : la plateforme en accepte ${ARTICLES_MAX} au plus. Découpez le règlement en plusieurs versions.`] };
  }

  // Avant le premier article : le titre du document, puis le préambule.
  const avant = lignes.slice(0, entetes[0].index).filter(Boolean);
  let titre: string | null = null;
  if (avant.length > 0 && avant[0].length <= LONGUEUR_MAX_TITRE && !INTERTITRE.test(avant[0])) titre = avant.shift() ?? null;
  // Un intertitre juste avant le premier article (« TITRE I ») ouvre cet article, il n'est pas du préambule.
  const intertitresDebut: string[] = [];
  while (avant.length > 0 && INTERTITRE.test(avant[avant.length - 1])) intertitresDebut.unshift(avant.pop() as string);
  const preambule = avant.join("\n").slice(0, LONGUEUR_MAX_PREAMBULE);
  if (avant.join("\n").length > LONGUEUR_MAX_PREAMBULE) avertissements.push(`Le préambule dépasse ${LONGUEUR_MAX_PREAMBULE} caractères : il a été coupé.`);

  const articles: Article[] = entetes.map((e, i) => {
    const fin = i + 1 < entetes.length ? entetes[i + 1].index : lignes.length;
    const corps = lignes.slice(e.index + 1, fin);
    // Un titre vide (« Article 4 ») prend la première ligne du corps, si elle est courte.
    let titreArticle = e.titre;
    if (!titreArticle && corps.length > 0 && corps[0] && corps[0].length <= LONGUEUR_MAX_TITRE_ARTICLE && !/[.;:]$/.test(corps[0])) titreArticle = corps.shift() ?? "";
    if (!titreArticle) titreArticle = `Article ${e.numero}`;
    let texteArticle = corps.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (titreArticle.length > LONGUEUR_MAX_TITRE_ARTICLE) {
      avertissements.push(`Article ${e.numero} : titre coupé à ${LONGUEUR_MAX_TITRE_ARTICLE} caractères.`);
      titreArticle = titreArticle.slice(0, LONGUEUR_MAX_TITRE_ARTICLE).trim();
    }
    if (texteArticle.length > LONGUEUR_MAX_TEXTE_ARTICLE) {
      avertissements.push(`Article ${e.numero} : texte coupé à ${LONGUEUR_MAX_TEXTE_ARTICLE} caractères.`);
      texteArticle = texteArticle.slice(0, LONGUEUR_MAX_TEXTE_ARTICLE).trim();
    }
    if (!texteArticle) avertissements.push(`Article ${e.numero} (« ${titreArticle} ») n'a pas de texte : à compléter.`);
    return { titre: titreArticle, texte: texteArticle };
  });

  // Les intertitres (« CHAPITRE II ») suivent la fin d'un article dans le texte brut : ils ouvrent le suivant.
  for (let i = 0; i < articles.length - 1; i += 1) {
    const lignesTexte = articles[i].texte.split("\n");
    let k = lignesTexte.length;
    while (k > 0 && (INTERTITRE.test(lignesTexte[k - 1]) || lignesTexte[k - 1] === "")) k -= 1;
    const intertitres = lignesTexte.slice(k).filter((l) => l && INTERTITRE.test(l));
    if (intertitres.length > 0) {
      articles[i] = { ...articles[i], texte: lignesTexte.slice(0, k).join("\n").trim() };
      articles[i + 1] = { ...articles[i + 1], texte: [...intertitres, articles[i + 1].texte].filter(Boolean).join("\n") };
    }
  }

  if (intertitresDebut.length > 0) articles[0] = { ...articles[0], texte: [...intertitresDebut, articles[0].texte].filter(Boolean).join("\n") };

  const numeros = entetes.map((e) => e.numero);
  if (numeros.some((n, i) => i > 0 && n !== numeros[i - 1] + 1)) avertissements.push("La numérotation des articles saute ou revient en arrière : vérifiez que rien n'a été perdu.");

  return { titre, preambule, articles, avertissements };
}
