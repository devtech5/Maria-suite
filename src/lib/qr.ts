/**
 * Encodeur QR, sans dépendance : un texte devient une matrice de modules,
 * puis un dessin SVG.
 *
 * Suit la norme ISO/IEC 18004 dans la forme qu'en donne Project Nayuki
 * (« QR Code generator library », licence MIT) : mode octet (UTF-8),
 * versions 1 à 40, correction d'erreur au choix, masque choisi par la règle
 * de pénalité. Écrit ici plutôt qu'ajouté en dépendance : il sert aux badges
 * de visiteurs et aux étiquettes, et tient en un fichier qu'on relit.
 *
 * Testé contre un décodeur indépendant (OpenCV) lors de son écriture ;
 * `tests/qr.test.ts` fige des propriétés de structure.
 */

export type NiveauCorrection = "L" | "M" | "Q" | "H";

// Pour chaque niveau (L, M, Q, H) et chaque version (index 0 inutilisé).
const ECC_PAR_BLOC: Record<NiveauCorrection, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCS: Record<NiveauCorrection, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
/** Bits de format du niveau de correction. */
const BITS_NIVEAU: Record<NiveauCorrection, number> = { L: 1, M: 0, Q: 3, H: 2 };

function bit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

/** Modules de données d'une version, hors motifs de fonction. */
function modulesBruts(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignements = Math.floor(version / 7) + 2;
    n -= (25 * alignements - 10) * alignements - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

function octetsDeDonnees(version: number, niveau: NiveauCorrection): number {
  return Math.floor(modulesBruts(version) / 8) - ECC_PAR_BLOC[niveau][version] * BLOCS[niveau][version];
}

// --------------------------------------------------------- Reed-Solomon

function multiplier(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function diviseur(degre: number): number[] {
  const resultat = new Array<number>(degre).fill(0);
  resultat[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < resultat.length; j++) {
      resultat[j] = multiplier(resultat[j], racine);
      if (j + 1 < resultat.length) resultat[j] ^= resultat[j + 1];
    }
    racine = multiplier(racine, 0x02);
  }
  return resultat;
}

function reste(donnees: number[], div: number[]): number[] {
  const resultat = div.map(() => 0);
  for (const b of donnees) {
    const facteur = b ^ (resultat.shift() as number);
    resultat.push(0);
    div.forEach((coef, i) => (resultat[i] ^= multiplier(coef, facteur)));
  }
  return resultat;
}

// --------------------------------------------------------- matrice

export interface MatriceQr {
  taille: number;
  /** `modules[y][x]` : vrai pour un module sombre. */
  modules: boolean[][];
  version: number;
}

class Grille {
  readonly taille: number;
  readonly modules: boolean[][];
  readonly fonction: boolean[][];

  constructor(readonly version: number) {
    this.taille = version * 4 + 17;
    this.modules = Array.from({ length: this.taille }, () => new Array<boolean>(this.taille).fill(false));
    this.fonction = Array.from({ length: this.taille }, () => new Array<boolean>(this.taille).fill(false));
  }

  poser(x: number, y: number, sombre: boolean) {
    this.modules[y][x] = sombre;
    this.fonction[y][x] = true;
  }

  positionsAlignement(): number[] {
    if (this.version === 1) return [];
    const nombre = Math.floor(this.version / 7) + 2;
    const pas = Math.floor((this.version * 8 + nombre * 3 + 5) / (nombre * 4 - 4)) * 2;
    const resultat = [6];
    for (let pos = this.taille - 7; resultat.length < nombre; pos -= pas) resultat.splice(1, 0, pos);
    return resultat;
  }

  motifsDeFonction() {
    for (let i = 0; i < this.taille; i++) {
      this.poser(6, i, i % 2 === 0);
      this.poser(i, 6, i % 2 === 0);
    }
    this.reperePosition(3, 3);
    this.reperePosition(this.taille - 4, 3);
    this.reperePosition(3, this.taille - 4);
    const positions = this.positionsAlignement();
    const n = positions.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) this.repereAlignement(positions[i], positions[j]);
    this.bitsFormat("M", 0);
    this.bitsVersion();
  }

  reperePosition(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.taille && yy >= 0 && yy < this.taille) this.poser(xx, yy, dist !== 2 && dist !== 4);
      }
  }

  repereAlignement(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.poser(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  bitsFormat(niveau: NiveauCorrection, masque: number) {
    const donnees = (BITS_NIVEAU[niveau] << 3) | masque;
    let r = donnees;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const bits = ((donnees << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) this.poser(8, i, bit(bits, i));
    this.poser(8, 7, bit(bits, 6));
    this.poser(8, 8, bit(bits, 7));
    this.poser(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.poser(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.poser(this.taille - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.poser(8, this.taille - 15 + i, bit(bits, i));
    this.poser(8, this.taille - 8, true);
  }

  bitsVersion() {
    if (this.version < 7) return;
    let r = this.version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const bits = (this.version << 12) | r;
    for (let i = 0; i < 18; i++) {
      const sombre = bit(bits, i);
      const a = this.taille - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.poser(a, b, sombre);
      this.poser(b, a, sombre);
    }
  }

  placerDonnees(octets: number[]) {
    let i = 0;
    for (let droite = this.taille - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let v = 0; v < this.taille; v++)
        for (let j = 0; j < 2; j++) {
          const x = droite - j;
          const montant = ((droite + 1) & 2) === 0;
          const y = montant ? this.taille - 1 - v : v;
          if (!this.fonction[y][x] && i < octets.length * 8) {
            this.modules[y][x] = bit(octets[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
    }
  }

  appliquerMasque(masque: number) {
    for (let y = 0; y < this.taille; y++)
      for (let x = 0; x < this.taille; x++) {
        let inverser: boolean;
        switch (masque) {
          case 0: inverser = (x + y) % 2 === 0; break;
          case 1: inverser = y % 2 === 0; break;
          case 2: inverser = x % 3 === 0; break;
          case 3: inverser = (x + y) % 3 === 0; break;
          case 4: inverser = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inverser = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inverser = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inverser = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!this.fonction[y][x] && inverser) this.modules[y][x] = !this.modules[y][x];
      }
  }

  penalite(): number {
    let resultat = 0;
    const n = this.taille;
    const compterMotifs = (historique: number[]) => {
      const c = historique[1];
      const centre = c > 0 && historique[2] === c && historique[3] === c * 3 && historique[4] === c && historique[5] === c;
      return (centre && historique[0] >= c * 4 && historique[6] >= c ? 1 : 0) + (centre && historique[6] >= c * 4 && historique[0] >= c ? 1 : 0);
    };
    const ajouterHistorique = (longueur: number, historique: number[]) => {
      if (historique[0] === 0) longueur += n;
      historique.pop();
      historique.unshift(longueur);
    };
    const terminer = (couleur: boolean, longueur: number, historique: number[]) => {
      if (couleur) {
        ajouterHistorique(longueur, historique);
        longueur = 0;
      }
      longueur += n;
      ajouterHistorique(longueur, historique);
      return compterMotifs(historique);
    };
    for (let passe = 0; passe < 2; passe++) {
      for (let a = 0; a < n; a++) {
        let couleur = false;
        let longueur = 0;
        const historique = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < n; b++) {
          const m = passe === 0 ? this.modules[a][b] : this.modules[b][a];
          if (m === couleur) {
            longueur++;
            if (longueur === 5) resultat += 3;
            else if (longueur > 5) resultat++;
          } else {
            ajouterHistorique(longueur, historique);
            if (!couleur) resultat += compterMotifs(historique) * 40;
            couleur = m;
            longueur = 1;
          }
        }
        resultat += terminer(couleur, longueur, historique) * 40;
      }
    }
    for (let y = 0; y < n - 1; y++)
      for (let x = 0; x < n - 1; x++) {
        const c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) resultat += 3;
      }
    const sombres = this.modules.reduce((s, ligne) => s + ligne.filter(Boolean).length, 0);
    const total = n * n;
    const k = Math.ceil(Math.abs(sombres * 20 - total * 10) / total) - 1;
    resultat += k * 10;
    return resultat;
  }
}

/** Encode un texte (UTF-8, mode octet) au plus petit QR qui le contient. */
export function encoderQr(texte: string, niveau: NiveauCorrection = "M"): MatriceQr {
  const octets = [...new TextEncoder().encode(texte)];

  let version = 1;
  for (; ; version++) {
    if (version > 40) throw new Error("Texte trop long pour un QR code.");
    const bitsCompte = version <= 9 ? 8 : 16;
    if (4 + bitsCompte + octets.length * 8 <= octetsDeDonnees(version, niveau) * 8) break;
  }

  // Segment octet, terminateur, bourrage.
  const bits: number[] = [];
  const ajouter = (valeur: number, longueur: number) => {
    for (let i = longueur - 1; i >= 0; i--) bits.push((valeur >>> i) & 1);
  };
  ajouter(0b0100, 4);
  ajouter(octets.length, version <= 9 ? 8 : 16);
  for (const o of octets) ajouter(o, 8);
  const capacite = octetsDeDonnees(version, niveau) * 8;
  ajouter(0, Math.min(4, capacite - bits.length));
  ajouter(0, (8 - (bits.length % 8)) % 8);
  for (let rembourrage = 0xec; bits.length < capacite; rembourrage ^= 0xec ^ 0x11) ajouter(rembourrage, 8);
  const donnees: number[] = [];
  for (let i = 0; i < bits.length; i += 8) donnees.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Blocs, correction d'erreur, entrelacement.
  const nombreBlocs = BLOCS[niveau][version];
  const eccParBloc = ECC_PAR_BLOC[niveau][version];
  const brut = Math.floor(modulesBruts(version) / 8);
  const courts = nombreBlocs - (brut % nombreBlocs);
  const longueurCourte = Math.floor(brut / nombreBlocs);
  const div = diviseur(eccParBloc);
  const blocs: number[][] = [];
  for (let i = 0, k = 0; i < nombreBlocs; i++) {
    const morceau = donnees.slice(k, k + longueurCourte - eccParBloc + (i < courts ? 0 : 1));
    k += morceau.length;
    const ecc = reste(morceau, div);
    if (i < courts) morceau.push(0);
    blocs.push([...morceau, ...ecc]);
  }
  const entrelaces: number[] = [];
  for (let i = 0; i < blocs[0].length; i++)
    blocs.forEach((bloc, j) => {
      if (i !== longueurCourte - eccParBloc || j >= courts) entrelaces.push(bloc[i]);
    });

  // Dessin et choix du masque.
  const grille = new Grille(version);
  grille.motifsDeFonction();
  grille.placerDonnees(entrelaces);
  let meilleur = 0;
  let plusFaible = Infinity;
  for (let masque = 0; masque < 8; masque++) {
    grille.appliquerMasque(masque);
    grille.bitsFormat(niveau, masque);
    const p = grille.penalite();
    if (p < plusFaible) {
      meilleur = masque;
      plusFaible = p;
    }
    grille.appliquerMasque(masque); // le masque est sa propre réciproque
  }
  grille.appliquerMasque(meilleur);
  grille.bitsFormat(niveau, meilleur);
  return { taille: grille.taille, modules: grille.modules, version };
}

/**
 * Le QR en SVG : un seul chemin, une marge de quatre modules (zone de
 * silence exigée par la norme), mise à l'échelle par la boîte de vue.
 */
export function qrEnSvg(texte: string, options: { niveau?: NiveauCorrection; couleur?: string } = {}): string {
  const { taille, modules } = encoderQr(texte, options.niveau ?? "M");
  const marge = 4;
  const cote = taille + marge * 2;
  let chemin = "";
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) if (modules[y][x]) chemin += `M${x + marge} ${y + marge}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${chemin}" fill="${options.couleur ?? "#000"}"/></svg>`;
}
