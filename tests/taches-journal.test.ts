import { describe, expect, it } from "vitest";

import { presetRole, resoudreDroits } from "@/lib/droits/catalogue";
import { appareil, categorieAction, libelleAction, moduleAction, resumeDetail } from "@/lib/journal";
import {
  comparerTaches,
  enRetard,
  gestePermis,
  gestesPossibles,
  joursAvantEcheance,
  statutApres,
  type Triable,
} from "@/modules/taches/calcul";

const awa = "awa";
const kone = "kone";
const chef = "chef";
const confiee = { creeParUserId: chef, assigneeUserId: awa };

describe("cycle d'une tâche", () => {
  it("avance à faire → en cours → terminée, et se rouvre", () => {
    expect(statutApres("demarrer", "a_faire")).toBe("en_cours");
    expect(statutApres("terminer", "en_cours")).toBe("terminee");
    expect(statutApres("terminer", "a_faire")).toBe("terminee");
    expect(statutApres("rouvrir", "terminee")).toBe("a_faire");
  });

  it("refuse les gestes impossibles", () => {
    expect(statutApres("demarrer", "en_cours")).toBeNull();
    expect(statutApres("terminer", "annulee")).toBeNull();
    expect(statutApres("annuler", "terminee")).toBeNull();
  });
});

describe("qui fait quoi", () => {
  it("laisse l'exécutant commencer et terminer, pas annuler", () => {
    const executant = { userId: awa, attribue: false };
    expect(gestePermis("demarrer", confiee, executant)).toBe(true);
    expect(gestePermis("terminer", confiee, executant)).toBe(true);
    expect(gestePermis("annuler", confiee, executant)).toBe(false);
  });

  it("laisse le créateur annuler et rouvrir, pas exécuter à la place", () => {
    const createur = { userId: chef, attribue: false };
    expect(gestePermis("annuler", confiee, createur)).toBe(true);
    expect(gestePermis("terminer", confiee, createur)).toBe(false);
  });

  it("n'ouvre rien à un tiers, tout à qui attribue", () => {
    expect(gestesPossibles("a_faire", confiee, { userId: kone, attribue: false })).toEqual([]);
    expect(gestesPossibles("a_faire", confiee, { userId: kone, attribue: true })).toEqual(["demarrer", "terminer", "annuler"]);
  });
});

describe("échéances et tri", () => {
  it("compte les jours et signale le retard", () => {
    expect(joursAvantEcheance("2026-10-03", "a_faire", "2026-10-04")).toBe(-1);
    expect(joursAvantEcheance("2026-10-04", "en_cours", "2026-10-04")).toBe(0);
    expect(enRetard("2026-10-03", "a_faire", "2026-10-04")).toBe(true);
    expect(enRetard("2026-10-03", "terminee", "2026-10-04")).toBe(false);
    expect(joursAvantEcheance(null, "a_faire", "2026-10-04")).toBeNull();
  });

  it("met l'ouvert avant le clos, l'échéance proche d'abord, puis la priorité", () => {
    const t = (x: Partial<Triable>): Triable => ({ statut: "a_faire", priorite: "normale", echeance: null, creeLe: "2026-10-01", ...x });
    const liste = [
      t({ statut: "terminee", echeance: "2026-10-01" }),
      t({ echeance: null, priorite: "urgente" }),
      t({ echeance: "2026-10-10", priorite: "basse" }),
      t({ echeance: "2026-10-05" }),
      t({ echeance: "2026-10-10", priorite: "haute" }),
    ].sort(comparerTaches);
    expect(liste.map((x) => `${x.echeance}/${x.priorite}/${x.statut}`)).toEqual([
      "2026-10-05/normale/a_faire",
      "2026-10-10/haute/a_faire",
      "2026-10-10/basse/a_faire",
      "null/urgente/a_faire",
      "2026-10-01/normale/terminee",
    ]);
  });
});

describe("droits des tâches et du journal", () => {
  it("donne à chacun sa liste, l'attribution et le journal à l'encadrement", () => {
    const magasinier = resoudreDroits({ cleRole: "magasinier", estProprietaire: false });
    expect(magasinier.has("taches.executer")).toBe(true);
    expect(magasinier.has("taches.attribuer")).toBe(false);
    expect(magasinier.has("organisation.journal.consulter")).toBe(false);
    expect(presetRole("gerant")?.droits).toContain("taches.attribuer");
    expect(presetRole("gerant")?.droits).toContain("organisation.journal.consulter");
  });
});

describe("lecture du journal", () => {
  it("range chaque geste dans sa famille", () => {
    expect(categorieAction("connexion.reussie")).toBe("connexion");
    expect(categorieAction("deconnexion")).toBe("connexion");
    expect(categorieAction("facture.emettre")).toBe("creation");
    expect(categorieAction("tache.attribuer")).toBe("affectation");
    expect(categorieAction("membre.role")).toBe("affectation");
    expect(categorieAction("document.supprimer")).toBe("suppression");
    expect(categorieAction("vente.annuler")).toBe("suppression");
    expect(categorieAction("projet.modifier")).toBe("modification");
    expect(categorieAction("archive.ouvrir")).toBe("consultation");
    expect(categorieAction("inconnu.bidouiller")).toBe("modification");
  });

  it("traduit un geste, connu ou non", () => {
    expect(libelleAction("connexion.refusee")).toBe("connexion refusée");
    expect(libelleAction("tache.terminer")).toBe("a terminé une tâche");
    expect(libelleAction("chose.faire_bien")).toBe("faire bien — chose");
    expect(moduleAction("facture.emettre")).toBe("Facturation");
  });

  it("résume le détail sans identifiants, avec les noms des personnes", () => {
    const noms = new Map([[awa, "Awa Koné"]]);
    // Intl sépare les milliers d'une espace insécable : on la ramène à une espace simple pour comparer.
    expect(resumeDetail({ numero: "TCH-2026-00001", tacheId: "x", assigneeUserId: awa, montant: 50000 }, noms).replace(/\s/g, " ")).toBe(
      "numero : TCH-2026-00001 · assignee : Awa Koné · montant : 50 000",
    );
    expect(resumeDetail(null)).toBe("");
  });

  it("reconnaît grossièrement l'appareil", () => {
    expect(appareil("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe("Chrome · Android");
    expect(appareil("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120")).toBe("Edge · Windows");
    expect(appareil(null)).toBe("—");
  });
});
