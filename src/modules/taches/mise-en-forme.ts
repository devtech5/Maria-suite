/**
 * Mise en forme des mises à jour d'une tâche, sans HTML.
 *
 * Le texte reste du texte : quelques marques, posées par les boutons de
 * l'éditeur, se lisent ensuite en blocs et en segments que React affiche
 * comme éléments — jamais par `innerHTML`. Une balise tapée s'imprime en
 * toutes lettres.
 *
 *   **gras**   *italique*   __souligné__   ~~barré~~
 *   - puce     1. numéro    [ ] à cocher   [x] coché
 *   ---        (filet)
 *   @[Awa Koné](u:<compte>)  mention d'un compte
 *   https://…  lien, reconnu tout seul
 */

export interface Segment {
  texte: string;
  gras?: boolean;
  italique?: boolean;
  souligne?: boolean;
  barre?: boolean;
  /** Adresse http(s) : le segment devient un lien. */
  lien?: string;
  /** Compte mentionné. */
  mention?: string;
}

export type Bloc =
  | { type: "paragraphe"; segments: Segment[] }
  | { type: "puce"; segments: Segment[] }
  | { type: "numero"; numero: number; segments: Segment[] }
  /** `rang` : la place de la case parmi les cases du message, pour la cocher. */
  | { type: "coche"; faite: boolean; rang: number; segments: Segment[] }
  | { type: "filet" }
  | { type: "vide" };

const MARQUES: { ouvre: string; cle: "gras" | "italique" | "souligne" | "barre" }[] = [
  { ouvre: "**", cle: "gras" },
  { ouvre: "__", cle: "souligne" },
  { ouvre: "~~", cle: "barre" },
  { ouvre: "*", cle: "italique" },
];

const MENTION = /^@\[([^\]\n]{1,80})\]\(u:([0-9a-f-]{36})\)/i;
const LIEN = /^https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/i;

/** Segments d'une ligne : marques imbriquées, mentions et liens. */
export function segmentsDe(ligne: string, style: Omit<Segment, "texte"> = {}): Segment[] {
  const segments: Segment[] = [];
  let tampon = "";
  const vider = () => {
    if (tampon) segments.push({ texte: tampon, ...style });
    tampon = "";
  };
  let i = 0;
  while (i < ligne.length) {
    const reste = ligne.slice(i);
    const mention = MENTION.exec(reste);
    if (mention) {
      vider();
      segments.push({ texte: `@${mention[1]}`, mention: mention[2].toLowerCase(), ...style });
      i += mention[0].length;
      continue;
    }
    const lien = LIEN.exec(reste);
    if (lien && (i === 0 || /\s|\(/.test(ligne[i - 1]))) {
      vider();
      segments.push({ texte: lien[0], lien: lien[0], ...style });
      i += lien[0].length;
      continue;
    }
    const marque = MARQUES.find((m) => reste.startsWith(m.ouvre) && !style[m.cle]);
    if (marque) {
      const fin = reste.indexOf(marque.ouvre, marque.ouvre.length);
      // Une marque ne s'applique qu'à un texte non vide, fermé sur la même ligne.
      if (fin > marque.ouvre.length) {
        vider();
        segments.push(...segmentsDe(reste.slice(marque.ouvre.length, fin), { ...style, [marque.cle]: true }));
        i += fin + marque.ouvre.length;
        continue;
      }
    }
    tampon += ligne[i];
    i++;
  }
  vider();
  return segments;
}

const COCHE = /^\s*\[( |x|X)\]\s?(.*)$/;

/** Le message en blocs, ligne par ligne. */
export function analyserMessage(corps: string): Bloc[] {
  let rangCoche = 0;
  return corps.split("\n").map((ligne): Bloc => {
    if (ligne.trim() === "") return { type: "vide" };
    if (/^\s*-{3,}\s*$/.test(ligne)) return { type: "filet" };
    const coche = COCHE.exec(ligne);
    if (coche) return { type: "coche", faite: coche[1] !== " ", rang: rangCoche++, segments: segmentsDe(coche[2]) };
    const puce = /^\s*[-•]\s+(.*)$/.exec(ligne);
    if (puce) return { type: "puce", segments: segmentsDe(puce[1]) };
    const numero = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(ligne);
    if (numero) return { type: "numero", numero: Number(numero[1]), segments: segmentsDe(numero[2]) };
    return { type: "paragraphe", segments: segmentsDe(ligne) };
  });
}

/** Coche ou décoche la case de rang donné ; rend le texte modifié, ou `null` si la case n'existe pas. */
export function basculerCoche(corps: string, rang: number): string | null {
  let n = 0;
  let trouvee = false;
  const lignes = corps.split("\n").map((ligne) => {
    const coche = COCHE.exec(ligne);
    if (!coche) return ligne;
    if (n++ !== rang) return ligne;
    trouvee = true;
    return ligne.replace(/\[( |x|X)\]/, coche[1] === " " ? "[x]" : "[ ]");
  });
  return trouvee ? lignes.join("\n") : null;
}

/** Comptes mentionnés dans un message, sans doublon. */
export function mentionsDe(corps: string): string[] {
  const ids = new Set<string>();
  for (const m of corps.matchAll(/@\[[^\]\n]{1,80}\]\(u:([0-9a-f-]{36})\)/gi)) ids.add(m[1].toLowerCase());
  return [...ids];
}

/** Le message réduit au texte, pour une notification : marques retirées, mentions gardées en nom. */
export function texteSimple(corps: string, max = 140): string {
  const brut = corps
    .replace(/@\[([^\]\n]{1,80})\]\(u:[0-9a-f-]{36}\)/gi, "@$1")
    .replace(/\*\*|__|~~/g, "")
    .replace(/^\s*\[( |x|X)\]\s?/gm, "☐ ")
    .replace(/\s+/g, " ")
    .trim();
  return brut.length > max ? `${brut.slice(0, max - 1)}…` : brut;
}
