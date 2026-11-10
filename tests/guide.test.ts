import { describe, expect, it } from "vitest";

import { GROUPES_MODULES } from "@/lib/navigation";
import { CHAPITRES, RACINES } from "@/modules/guide/chapitres";
import { QUESTIONS_MAX, SEUIL_REUSSITE, aideDe, chapitresPour, cheminsAide, corriger, parcoursTermine, progression, tirerQuiz } from "@/modules/guide/regles";

/**
 * Guide d'utilisation. Ce qui compte : ne montrer que ce que la personne
 * peut ouvrir, et corriger le quiz juste — une bonne réponse comptée fausse
 * bloquerait un nouveau venu sans qu'il comprenne pourquoi.
 */

const entrees = new Set(GROUPES_MODULES.flatMap((g) => g.modules.map((m) => m.href)));

describe("contenu du guide", () => {
  it("ne déclare pas deux fois le même chapitre ni la même question", () => {
    const cles = CHAPITRES.map((c) => c.cle);
    expect(new Set(cles).size).toBe(cles.length);
    const questions = CHAPITRES.flatMap((c) => c.quiz.map((q) => q.cle));
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("rattache chaque chapitre à une entrée réelle du menu", () => {
    for (const c of CHAPITRES) if (c.entree) expect(entrees.has(c.entree), c.cle).toBe(true);
  });

  it("donne à chaque question une bonne réponse parmi ses choix", () => {
    for (const c of CHAPITRES)
      for (const q of c.quiz) {
        expect(q.choix.length, q.cle).toBeGreaterThanOrEqual(2);
        expect(q.bonne >= 0 && q.bonne < q.choix.length, q.cle).toBe(true);
        expect(new Set(q.choix).size, q.cle).toBe(q.choix.length);
      }
  });

  it("garde des ancres uniques dans chaque chapitre, et des captures nommées une fois", () => {
    for (const c of CHAPITRES) {
      const ancres = c.sections.map((s) => s.ancre);
      expect(new Set(ancres).size, c.cle).toBe(ancres.length);
    }
    const fichiers = CHAPITRES.flatMap((c) => c.sections.flatMap((s) => (s.capture ? [s.capture.fichier] : [])));
    expect(new Set(fichiers).size).toBe(fichiers.length);
  });

  it("place les chapitres de tous en tête", () => {
    expect(CHAPITRES[0].cle).toBe("premiers-pas");
    expect(CHAPITRES[0].entree).toBeNull();
  });
});

describe("chapitres d'une personne", () => {
  it("suit le menu : rien d'un module fermé", () => {
    const siens = chapitresPour(CHAPITRES, ["/taches", "/planning"]).map((c) => c.cle);
    expect(siens).toEqual(["premiers-pas", "reglement-interieur", "planning", "taches"]);
  });

  it("garde les chapitres de tous, même sans aucun module", () => {
    expect(chapitresPour(CHAPITRES, []).every((c) => c.entree === null)).toBe(true);
  });
});

describe("aide « ? »", () => {
  const aides = cheminsAide(chapitresPour(CHAPITRES, ["/planning", "/stock", "/tresorerie", "/tresorerie/caisse"]), RACINES);

  it("mène à la section du sous-écran, sinon au chapitre", () => {
    expect(aideDe("/planning/equipe", aides)).toBe("/guide/planning#equipe");
    expect(aideDe("/planning", aides)).toBe("/guide/planning#mon-planning");
    expect(aideDe("/stock/articles/abc", aides)).toBe("/guide/stock#articles");
    expect(aideDe("/stock", aides)).toBe("/guide/stock");
  });

  it("préfère l'entrée la plus précise du menu", () => {
    expect(aideDe("/tresorerie/caisse", aides)).toBe("/guide/bons");
    expect(aideDe("/tresorerie/previsions", aides)).toBe("/guide/tresorerie#previsions");
  });

  it("renvoie au sommaire sur un écran qu'aucun chapitre ne couvre", () => {
    expect(aideDe("/comptabilite", aides)).toBe("/guide");
    expect(aideDe("/stockage", aides)).toBe("/guide");
  });
});

describe("parcours et quiz", () => {
  const siens = chapitresPour(CHAPITRES, [...entrees]);

  it("compte la progression et désigne le chapitre suivant", () => {
    const p = progression(siens, [siens[0].cle, "chapitre-disparu"]);
    expect(p.lus).toBe(1);
    expect(p.suivant).toBe(siens[1].cle);
    expect(progression(siens, siens.map((c) => c.cle)).pourcent).toBe(100);
  });

  it("tire un quiz stable pour une même graine, différent à l'essai suivant", () => {
    const a = tirerQuiz(siens, "u:0").map((q) => q.cle);
    expect(tirerQuiz(siens, "u:0").map((q) => q.cle)).toEqual(a);
    expect(tirerQuiz(siens, "u:1").map((q) => q.cle)).not.toEqual(a);
    expect(a.length).toBe(QUESTIONS_MAX);
    expect(new Set(a).size).toBe(a.length);
  });

  it("couvre d'abord un chapitre par question", () => {
    const petits = chapitresPour(CHAPITRES, ["/taches", "/planning"]);
    const questions = tirerQuiz(petits, "x");
    const parChapitre = new Map(petits.flatMap((c) => c.quiz.map((q) => [q.cle, c.cle])));
    const premiers = new Set(questions.slice(0, petits.length).map((q) => parChapitre.get(q.cle)));
    expect(premiers.size).toBe(petits.length);
  });

  it("corrige juste, et compte faux une question sans réponse ou hors des choix", () => {
    const questions = tirerQuiz(siens, "u:0").slice(0, 5);
    const toutJuste = Object.fromEntries(questions.map((q) => [q.cle, q.bonne]));
    expect(corriger(questions, toutJuste)).toMatchObject({ bonnes: 5, total: 5, pourcent: 100, reussi: true });

    const quatre = { ...toutJuste, [questions[0].cle]: 99 };
    expect(corriger(questions, quatre)).toMatchObject({ bonnes: 4, pourcent: 80, reussi: SEUIL_REUSSITE <= 80 });
    const trois = { ...quatre, [questions[1].cle]: undefined };
    expect(corriger(questions, trois)).toMatchObject({ bonnes: 3, pourcent: 60, reussi: false });
  });

  it("ne termine le parcours qu'avec tout lu ET le quiz réussi", () => {
    const tout = progression(siens, siens.map((c) => c.cle));
    expect(parcoursTermine(tout, true)).toBe(true);
    expect(parcoursTermine(tout, false)).toBe(false);
    expect(parcoursTermine(progression(siens, []), true)).toBe(false);
  });
});
