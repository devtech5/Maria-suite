import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GROUPES_MODULES } from "@/lib/navigation";
import { TEXTE_SIGNATURE } from "@/components/coque/signature";

/**
 * La signature de la plateforme — « Maria Suite — propulsé par Fiessou ERP » —
 * se pose au pied des écrans. Jamais sur un document qui sort de l'entreprise :
 * courrier papier à en-tête, facture, bulletin, bordereau, badge.
 */

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? sources(chemin) : /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

describe("signature de la plateforme", () => {
  it("dit « Maria Suite — propulsé par Fiessou ERP »", () => {
    expect(TEXTE_SIGNATURE).toBe("Maria Suite — propulsé par Fiessou ERP");
  });

  it("n'apparaît dans aucun document imprimé de l'entreprise", () => {
    const fichiers = [...sources("src/app/imprimer"), ...sources("src/components/impression")];
    expect(fichiers.length).toBeGreaterThan(5);
    for (const f of fichiers) {
      const texte = readFileSync(f, "utf8");
      expect(texte, f).not.toMatch(/Fiessou|SignatureMaria|TEXTE_SIGNATURE|propulsé par/);
    }
  });

  it("disparaît même d'un écran imprimé", () => {
    expect(readFileSync("src/components/coque/signature.tsx", "utf8")).toContain("print:hidden");
  });

  it("est écrite à un seul endroit : aucun écran n'en recopie le texte", () => {
    const copies = sources("src").filter((f) => !f.endsWith("signature.tsx") && readFileSync(f, "utf8").includes("propulsé par Fiessou"));
    expect(copies).toEqual([]);
  });
});

describe("menu : le journal d'activité suit les utilisateurs", () => {
  it("est dans Administration, juste après « Utilisateurs »", () => {
    const admin = GROUPES_MODULES.find((g) => g.cle === "administration")!;
    const hrefs = admin.modules.map((m) => m.href);
    expect(hrefs.indexOf("/journal")).toBe(hrefs.indexOf("/membres") + 1);
    expect(GROUPES_MODULES.find((g) => g.cle === "pilotage")!.modules.some((m) => m.href === "/journal")).toBe(false);
  });
});
