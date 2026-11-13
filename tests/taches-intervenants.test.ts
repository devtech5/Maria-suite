import { describe, expect, it } from "vitest";

import { lireRef, lireRefs, valeurRef } from "@/modules/taches/intervenants-regles";

const ID = "01a1d607-8a7c-76cc-b48a-fea2e68679d7";

describe("référence d'un intervenant", () => {
  it("distingue collaborateur et intervenant, et refuse le reste", () => {
    expect(lireRef(`e:${ID}`)).toEqual({ employeId: ID });
    expect(lireRef(`w:${ID}`)).toEqual({ workerId: ID });
    expect(lireRef(`u:${ID}`)).toBeNull();
    expect(lireRef("e:pas-un-id")).toBeNull();
    expect(lireRef(null)).toBeNull();
    expect(valeurRef({ workerId: ID })).toBe(`w:${ID}`);
  });

  it("lit un formulaire sans doublon ni valeur inconnue", () => {
    expect(lireRefs([`e:${ID}`, `e:${ID}`, "x", `w:${ID}`])).toEqual([{ employeId: ID }, { workerId: ID }]);
  });
});
