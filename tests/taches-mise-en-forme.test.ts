import { describe, expect, it } from "vitest";

import { analyserMessage, basculerCoche, mentionsDe, segmentsDe, texteSimple } from "@/modules/taches/mise-en-forme";
import { avancement, normaliserMessage, phraseActivite, tailleLisible, verifierFichier } from "@/modules/taches/suivi-regles";

const COMPTE = "01a1d607-8a7c-76cc-b48a-fea2e68679d7";

describe("mise en forme d'une mise à jour", () => {
  it("lit les marques, imbriquées ou non", () => {
    expect(segmentsDe("Un **mot gras** et *italique*")).toEqual([
      { texte: "Un " },
      { texte: "mot gras", gras: true },
      { texte: " et " },
      { texte: "italique", italique: true },
    ]);
    expect(segmentsDe("**gras __et souligné__**")).toEqual([
      { texte: "gras ", gras: true },
      { texte: "et souligné", gras: true, souligne: true },
    ]);
    expect(segmentsDe("~~barré~~")).toEqual([{ texte: "barré", barre: true }]);
  });

  it("laisse une marque non fermée telle quelle", () => {
    expect(segmentsDe("2 * 3 = 6")).toEqual([{ texte: "2 * 3 = 6" }]);
    expect(segmentsDe("**")).toEqual([{ texte: "**" }]);
  });

  it("garde une balise comme du texte", () => {
    expect(segmentsDe("<script>alert(1)</script>")).toEqual([{ texte: "<script>alert(1)</script>" }]);
  });

  it("reconnaît liens et mentions, et rien d'autre qu'http(s)", () => {
    expect(segmentsDe(`Voir https://maria-groupe.com/devis. Merci @[Awa Koné](u:${COMPTE})`)).toEqual([
      { texte: "Voir " },
      { texte: "https://maria-groupe.com/devis", lien: "https://maria-groupe.com/devis" },
      { texte: ". Merci " },
      { texte: "@Awa Koné", mention: COMPTE },
    ]);
    expect(segmentsDe("javascript:alert(1)")).toEqual([{ texte: "javascript:alert(1)" }]);
  });

  it("découpe en blocs : puces, numéros, cases, filet", () => {
    const blocs = analyserMessage("Bilan\n- béton livré\n1. coffrage\n[ ] ferraillage\n[x] terrassement\n---\n");
    expect(blocs.map((b) => b.type)).toEqual(["paragraphe", "puce", "numero", "coche", "coche", "filet", "vide"]);
    expect(blocs[3]).toMatchObject({ faite: false, rang: 0 });
    expect(blocs[4]).toMatchObject({ faite: true, rang: 1 });
  });

  it("coche la bonne case, et seulement elle", () => {
    const corps = "[ ] un\ntexte\n[x] deux\n[ ] trois";
    expect(basculerCoche(corps, 2)).toBe("[ ] un\ntexte\n[x] deux\n[x] trois");
    expect(basculerCoche(corps, 1)).toBe("[ ] un\ntexte\n[ ] deux\n[ ] trois");
    expect(basculerCoche(corps, 5)).toBeNull();
  });

  it("relève les mentions et réduit le texte pour une notification", () => {
    const corps = `**Urgent** : @[Awa](u:${COMPTE}) et encore @[Awa](u:${COMPTE.toUpperCase()})\n[ ] appeler`;
    expect(mentionsDe(corps)).toEqual([COMPTE]);
    expect(texteSimple(corps)).toBe("Urgent : @Awa et encore @Awa ☐ appeler");
  });
});

describe("suivi d'une tâche", () => {
  it("refuse une mise à jour vide et resserre les lignes vides", () => {
    expect(normaliserMessage("  \n ").ok).toBe(false);
    expect(normaliserMessage("a\n\n\n\n\n\nb")).toEqual({ ok: true, valeur: "a\n\n\nb" });
  });

  it("n'admet que les formats prévus, 10 Mo au plus", () => {
    expect(verifierFichier({ taille: 1000, typeMime: "application/pdf" })).toEqual({ ok: true, valeur: "pdf" });
    expect(verifierFichier({ taille: 1000, typeMime: "application/x-msdownload" }).ok).toBe(false);
    expect(verifierFichier({ taille: 11 * 1024 * 1024, typeMime: "image/png" }).ok).toBe(false);
    expect(tailleLisible(2_516_582)).toBe("2,4 Mo");
  });

  it("compte l'avancement des sous-tâches", () => {
    expect(avancement([{ faite: true }, { faite: false }, { faite: true }])).toEqual({ faites: 2, total: 3 });
  });

  it("dit chaque activité en français", () => {
    expect(phraseActivite("tache.demarrer", { statut: "en_cours" }, { statut: "a_faire" })).toBe("a commencé la tâche");
    expect(phraseActivite("tache.champ", { colonne: "Montant", valeur: "1250000" }, null)).toBe("a renseigné Montant : 1250000");
    expect(phraseActivite("tache.champ", { colonne: "Visa", valeur: "e2", affiche: "Validé" }, null)).toBe("a renseigné Visa : Validé");
    expect(phraseActivite("tache.sous_tache.cocher", { titre: "Coffrage", faite: true }, null)).toBe("a coché « Coffrage »");
    expect(phraseActivite("tache.modifier", { titre: "A", priorite: "haute", echeance: null }, { titre: "A", priorite: "normale", echeance: "2026-11-20" })).toBe(
      "a modifié la priorité (Haute), l'échéance (retirée)",
    );
    expect(phraseActivite("tache.inconnue", null, null)).toBe("inconnue");
  });
});
