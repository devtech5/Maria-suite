/**
 * Lecture d'une présentation PowerPoint (.pptx) pour l'aperçu, dans le
 * navigateur : un .pptx est une archive ZIP de fichiers XML, décodée en
 * mémoire avec JSZip. Rien ne part vers un service tiers.
 *
 * Fidélité volontairement modeste : texte (gras, italique, taille, couleur,
 * alignement), images et fond uni, à leur place sur la diapositive. Les
 * animations, graphiques, tableaux et formes dessinées ne sont pas rendus ;
 * leur texte l'est quand il existe. Un aperçu sert à reconnaître et à lire,
 * pas à imprimer.
 *
 * Seules les images raster sont reprises (jpeg, png, gif, webp) : un SVG,
 * un EMF ou un WMF n'est jamais décodé.
 */

export interface SegmentTexte {
  texte: string;
  gras: boolean;
  italique: boolean;
  /** Taille en points, telle que le fichier la déclare ; nulle si héritée. */
  taille: number | null;
  /** `#rrggbb`, ou nul si hérité. */
  couleur: string | null;
}

export interface Paragraphe {
  segments: SegmentTexte[];
  alignement: "left" | "center" | "right" | "justify";
  puce: boolean;
}

interface Cadre {
  /** Position et taille en pourcentage de la diapositive. */
  x: number;
  y: number;
  l: number;
  h: number;
}

export type ElementDiapo =
  | ({ type: "texte"; paragraphes: Paragraphe[] } & Cadre)
  | ({ type: "image"; src: string } & Cadre);

export interface Diapo {
  numero: number;
  fond: string | null;
  elements: ElementDiapo[];
}

export interface Presentation {
  /** Largeur et hauteur de la diapositive en points : sert aux proportions et à l'échelle du texte. */
  largeurPt: number;
  hauteurPt: number;
  diapos: Diapo[];
  /** Libère les adresses `blob:` des images. */
  liberer: () => void;
}

const EMU_PAR_POINT = 12_700;
const IMAGES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
const DIAPOS_MAX = 200;

/** Pourcentage d'une mesure EMU rapportée à la diapositive ; arrondi au centième. */
export function pourcent(valeur: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.round((valeur / total) * 10_000) / 100;
}

/** `#rrggbb` si la valeur est une couleur hexadécimale à six chiffres, sinon nul. */
export function couleurSure(v: string | null | undefined): string | null {
  return v && /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null;
}

/** Chemin d'une cible relative (`../media/image1.png`) depuis le dossier d'un fichier de l'archive. */
export function resoudreChemin(dossierDe: string, cible: string): string {
  if (cible.startsWith("/")) return cible.slice(1);
  const morceaux = dossierDe.split("/").filter(Boolean);
  for (const m of cible.split("/")) {
    if (m === "..") morceaux.pop();
    else if (m && m !== ".") morceaux.push(m);
  }
  return morceaux.join("/");
}

type Analyseur = new () => { parseFromString(source: string, type: DOMParserSupportedType): Document };

const enfants = (n: Element, nom: string): Element[] => [...n.children].filter((c) => c.localName === nom);
const premier = (n: Element | null | undefined, nom: string): Element | null => (n ? (enfants(n, nom)[0] ?? null) : null);
const descendants = (n: Element, nom: string): Element[] => [...n.getElementsByTagName("*")].filter((c) => c.localName === nom);
const entier = (v: string | null | undefined): number | null => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
};

function lireRelations(xml: Document): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of descendants(xml.documentElement, "Relationship")) {
    const id = r.getAttribute("Id");
    const cible = r.getAttribute("Target");
    if (id && cible && r.getAttribute("TargetMode") !== "External") m.set(id, cible);
  }
  return m;
}

function lireParagraphes(corps: Element): Paragraphe[] {
  const paragraphes: Paragraphe[] = [];
  for (const p of descendants(corps, "p")) {
    if (p.parentElement?.localName !== "txBody") continue;
    const proprietes = premier(p, "pPr");
    const algn = proprietes?.getAttribute("algn");
    const alignement = algn === "ctr" ? "center" : algn === "r" ? "right" : algn === "just" ? "justify" : "left";
    const puce = Boolean(proprietes && (premier(proprietes, "buChar") || premier(proprietes, "buAutoNum")));
    const segments: SegmentTexte[] = [];
    for (const noeud of p.children) {
      if (noeud.localName === "br") {
        segments.push({ texte: "\n", gras: false, italique: false, taille: null, couleur: null });
        continue;
      }
      if (noeud.localName !== "r" && noeud.localName !== "fld") continue;
      const texte = premier(noeud, "t")?.textContent ?? "";
      if (!texte) continue;
      const rpr = premier(noeud, "rPr");
      const sz = entier(rpr?.getAttribute("sz"));
      segments.push({
        texte,
        gras: rpr?.getAttribute("b") === "1",
        italique: rpr?.getAttribute("i") === "1",
        taille: sz ? sz / 100 : null,
        couleur: couleurSure(premier(premier(rpr, "solidFill"), "srgbClr")?.getAttribute("val")),
      });
    }
    paragraphes.push({ segments, alignement, puce });
  }
  return paragraphes;
}

function lireCadre(sp: Element, largeur: number, hauteur: number): Cadre | null {
  const xfrm = descendants(sp, "xfrm")[0];
  const off = premier(xfrm, "off");
  const ext = premier(xfrm, "ext");
  const x = entier(off?.getAttribute("x"));
  const y = entier(off?.getAttribute("y"));
  const cx = entier(ext?.getAttribute("cx"));
  const cy = entier(ext?.getAttribute("cy"));
  if (x == null || y == null || cx == null || cy == null) return null;
  return { x: pourcent(x, largeur), y: pourcent(y, hauteur), l: pourcent(cx, largeur), h: pourcent(cy, hauteur) };
}

/**
 * Décode une présentation. Lève une erreur lisible si l'archive n'en est pas
 * une. `Analyseur` est `DOMParser` dans le navigateur.
 */
export async function lirePresentation(octets: ArrayBuffer, Analyse: Analyseur): Promise<Presentation> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(octets).catch(() => {
    throw new Error("Ce fichier n'est pas une présentation PowerPoint valide.");
  });
  const analyser = new Analyse();
  const lireXml = async (chemin: string): Promise<Document | null> => {
    const f = archive.file(chemin);
    return f ? analyser.parseFromString(await f.async("string"), "application/xml") : null;
  };

  const principal = await lireXml("ppt/presentation.xml");
  if (!principal) throw new Error("Ce fichier n'est pas une présentation PowerPoint valide.");
  const taille = descendants(principal.documentElement, "sldSz")[0];
  const largeur = entier(taille?.getAttribute("cx")) ?? 9_144_000;
  const hauteur = entier(taille?.getAttribute("cy")) ?? 5_143_500;

  const relPrincipal = (await lireXml("ppt/_rels/presentation.xml.rels")) ?? null;
  const cibles = relPrincipal ? lireRelations(relPrincipal) : new Map<string, string>();
  const ordre = descendants(principal.documentElement, "sldId")
    .map((s) => s.getAttribute("r:id") ?? s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"))
    .map((id) => (id ? cibles.get(id) : undefined))
    .filter((c): c is string => Boolean(c))
    .slice(0, DIAPOS_MAX);

  const urls: string[] = [];
  const diapos: Diapo[] = [];

  for (const [i, cible] of ordre.entries()) {
    const chemin = resoudreChemin("ppt", cible);
    const xml = await lireXml(chemin);
    if (!xml) continue;
    const dossier = chemin.split("/").slice(0, -1).join("/");
    const rels = await lireXml(`${dossier}/_rels/${chemin.split("/").pop()}.rels`);
    const liens = rels ? lireRelations(rels) : new Map<string, string>();

    const fondArbre = descendants(xml.documentElement, "bg")[0];
    const fond = couleurSure(premier(premier(premier(fondArbre, "bgPr"), "solidFill"), "srgbClr")?.getAttribute("val"));

    const arbre = descendants(xml.documentElement, "spTree")[0];
    const elements: ElementDiapo[] = [];
    let rang = 0;
    const sansCadre = (sp: Element) => {
      // Un titre sans position propre (héritée de la mise en page) : en haut ; le reste, empilé dessous.
      const titre = descendants(sp, "ph").some((ph) => /title|ctrTitle/.test(ph.getAttribute("type") ?? ""));
      if (titre) return { x: 5, y: 5, l: 90, h: 16 };
      const y = 24 + rang * 14;
      rang += 1;
      return { x: 6, y, l: 88, h: Math.max(10, Math.min(14, 96 - y)) };
    };

    for (const noeud of arbre ? [...arbre.children] : []) {
      if (noeud.localName === "sp") {
        const corps = premier(noeud, "txBody");
        if (!corps) continue;
        const paragraphes = lireParagraphes(corps).filter((p) => p.segments.length > 0);
        if (paragraphes.length === 0) continue;
        elements.push({ type: "texte", paragraphes, ...(lireCadre(noeud, largeur, hauteur) ?? sansCadre(noeud)) });
      } else if (noeud.localName === "pic") {
        const cadre = lireCadre(noeud, largeur, hauteur);
        const id =
          descendants(noeud, "blip")[0]?.getAttribute("r:embed") ??
          descendants(noeud, "blip")[0]?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
        const media = id ? liens.get(id) : undefined;
        if (!cadre || !media) continue;
        const cheminMedia = resoudreChemin(dossier, media);
        const type = IMAGES[(cheminMedia.split(".").pop() ?? "").toLowerCase()];
        const fichier = archive.file(cheminMedia);
        if (!type || !fichier) continue;
        const blob = new Blob([await fichier.async("arraybuffer")], { type });
        const src = URL.createObjectURL(blob);
        urls.push(src);
        elements.push({ type: "image", src, ...cadre });
      }
    }
    diapos.push({ numero: i + 1, fond, elements });
  }

  if (diapos.length === 0) throw new Error("Cette présentation ne contient aucune diapositive lisible.");
  return {
    largeurPt: largeur / EMU_PAR_POINT,
    hauteurPt: hauteur / EMU_PAR_POINT,
    diapos,
    liberer: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
