import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { formatDe, lireTexte, texteDeDocumentXml } from "@/lib/texte-fichier";
import { decouperReglement } from "@/modules/reglement/import";

/**
 * Import d'un règlement déposé en fichier. Ce qui compte : retrouver le
 * titre, le préambule et chaque article sans en perdre, et dire ce qu'on n'a
 * pas pu garder plutôt que de se tromper en silence.
 */

const REGLEMENT = `RÈGLEMENT INTÉRIEUR DE MARIA GROUP SARL

Le présent règlement s'applique à tout le personnel.
Il est établi en application du Code du travail.

TITRE I : DISPOSITIONS GÉNÉRALES
Article 1 : Objet
Le règlement fixe les règles de discipline et d'hygiène.

Article 2 – Horaires
Du lundi au vendredi, de 8 h à 17 h.
Le samedi, de 8 h à 12 h.

CHAPITRE II – CONGÉS
ARTICLE 3. Congés payés
Deux jours et demi par mois de service.

Article 4
Absences
Toute absence est justifiée sous 48 heures.
`;

describe("découpage d'un règlement", () => {
  const lu = decouperReglement(REGLEMENT);

  it("retrouve le titre et le préambule", () => {
    expect(lu.titre).toBe("RÈGLEMENT INTÉRIEUR DE MARIA GROUP SARL");
    expect(lu.preambule).toBe("Le présent règlement s'applique à tout le personnel.\nIl est établi en application du Code du travail.");
  });

  it("retrouve chaque article, titre et texte, quel que soit le style du titre", () => {
    expect(lu.articles.map((a) => a.titre)).toEqual(["Objet", "Horaires", "Congés payés", "Absences"]);
    expect(lu.articles[0].texte).toBe("TITRE I : DISPOSITIONS GÉNÉRALES\nLe règlement fixe les règles de discipline et d'hygiène.");
    expect(lu.articles[1].texte).toBe("Du lundi au vendredi, de 8 h à 17 h.\nLe samedi, de 8 h à 12 h.");
    expect(lu.articles[3].texte).toBe("Toute absence est justifiée sous 48 heures.");
  });

  it("garde les intertitres : ils ouvrent l'article qui les suit", () => {
    expect(lu.articles[0].texte.startsWith("TITRE I : DISPOSITIONS GÉNÉRALES")).toBe(true);
    expect(lu.articles[2].texte.startsWith("CHAPITRE II – CONGÉS")).toBe(true);
    expect(lu.articles[1].texte).not.toMatch(/CHAPITRE/);
  });

  it("ne signale rien quand tout est en ordre", () => {
    expect(lu.avertissements).toEqual([]);
  });

  it("lit « Article premier » comme l'article 1", () => {
    const l = decouperReglement("Article premier : Objet\nTexte un.\nArticle 2 : Suite\nTexte deux.");
    expect(l.articles.map((a) => a.titre)).toEqual(["Objet", "Suite"]);
  });

  it("ne prend pas une phrase qui cite un article pour un titre", () => {
    const l = decouperReglement("Article 1 : Objet\nVoir l'article 2 : il s'applique à tous les collaborateurs de l'entreprise, sans exception, pour toute la durée du contrat de travail signé avec elle et au-delà, selon les cas prévus par le code.\nArticle 2 : Suite\nTexte.");
    expect(l.articles).toHaveLength(2);
  });

  it("se rabat sur une numérotation « 1. », « 2. » quand il y a au moins trois entrées consécutives", () => {
    const l = decouperReglement("Règlement\n1. Objet\nTexte.\n2. Horaires\nTexte.\n3. Congés\nTexte.");
    expect(l.articles.map((a) => a.titre)).toEqual(["Objet", "Horaires", "Congés"]);
    expect(l.avertissements.join(" ")).toMatch(/numérotation/);
    // Deux lignes numérotées ne font pas un règlement.
    expect(decouperReglement("1. Un\n2. Deux").articles).toEqual([]);
  });

  it("dit qu'il n'a rien trouvé, au lieu d'inventer", () => {
    const l = decouperReglement("Un texte libre\nsans aucun article.");
    expect(l.articles).toEqual([]);
    expect(l.avertissements[0]).toMatch(/Aucun article/);
  });

  it("signale une numérotation qui saute et un article sans texte", () => {
    const l = decouperReglement("Article 1 : Objet\nTexte.\nArticle 3 : Suite\n");
    expect(l.avertissements.join(" ")).toMatch(/saute/);
    expect(l.avertissements.join(" ")).toMatch(/n'a pas de texte/);
  });

  it("coupe ce qui dépasse les limites, en le disant", () => {
    const l = decouperReglement(`Article 1 : ${"T".repeat(200)}\n${"x".repeat(21_000)}`);
    expect(l.articles[0].titre).toHaveLength(160);
    expect(l.articles[0].texte).toHaveLength(20_000);
    expect(l.avertissements.length).toBeGreaterThanOrEqual(2);
  });

  it("refuse plus de 200 articles", () => {
    const beaucoup = Array.from({ length: 201 }, (_, i) => `Article ${i + 1} : A\nT.`).join("\n");
    expect(decouperReglement(beaucoup).articles).toEqual([]);
  });
});

describe("lecture d'un fichier Word", () => {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
    <w:p><w:r><w:t>Article 1 : Objet &amp; champ</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Colonne A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>B</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ligne</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>suivante &#233;t&#xE9;</w:t></w:r></w:p>
    <w:p/>
  </w:body></w:document>`;

  it("rend un paragraphe par ligne, avec tabulations, sauts et entités", () => {
    expect(texteDeDocumentXml(xml).split("\n").map((l) => l.trim()).filter(Boolean)).toEqual(["Article 1 : Objet & champ", "Colonne A\tB", "Ligne", "suivante été"]);
  });

  it("lit un vrai .docx et en tire des articles", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `<w:document xmlns:w="x"><w:body>${REGLEMENT.split("\n").map((l) => `<w:p><w:r><w:t>${l.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
    const octets = await zip.generateAsync({ type: "arraybuffer" });
    const lu = decouperReglement(await lireTexte(octets, "docx"));
    expect(lu.titre).toBe("RÈGLEMENT INTÉRIEUR DE MARIA GROUP SARL");
    expect(lu.articles).toHaveLength(4);
  });

  it("refuse un fichier qui n'est pas un Word", async () => {
    const zip = new JSZip();
    zip.file("autre.txt", "rien");
    await expect(lireTexte(await zip.generateAsync({ type: "arraybuffer" }), "docx")).rejects.toThrow(/Word/);
    await expect(lireTexte(new TextEncoder().encode("pas un zip").buffer as ArrayBuffer, "docx")).rejects.toThrow();
  });

  it("lit un texte brut, BOM compris", async () => {
    const octets = new TextEncoder().encode("﻿Article 1 : Objet\nTexte.").buffer as ArrayBuffer;
    const texte = await lireTexte(octets, "texte");
    expect(decouperReglement(texte).articles[0].titre).toBe("Objet");
  });

  it("reconnaît le format par le nom ou le type, et écarte le PDF", () => {
    expect(formatDe("reglement.DOCX", "")).toBe("docx");
    expect(formatDe("notes.txt", "")).toBe("texte");
    expect(formatDe("scan", "application/pdf")).toBe("pdf");
    expect(formatDe("photo.png", "image/png")).toBeNull();
  });
});
