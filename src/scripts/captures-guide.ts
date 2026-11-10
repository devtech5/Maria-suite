/**
 * Produit les captures annotées du guide d'utilisation.
 *
 *   GUIDE_EMAIL=… GUIDE_MOT_DE_PASSE=… npx tsx src/scripts/captures-guide.ts [adresse]
 *
 * À lancer contre une application de DÉMONSTRATION (`pnpm dev:local`, base
 * PGlite), jamais contre la production : les captures entrent dans le dépôt
 * et montrent ce que l'écran affiche. Le compte doit voir tous les modules
 * photographiés (le propriétaire de la base locale).
 *
 * Pour chaque capture déclarée dans les chapitres : la page s'ouvre, chaque
 * repère est cherché par son sélecteur ; le numéro se pose en pastille sur
 * le coin haut droit de l'élément, en pourcentage de l'image. Sortie : `public/guide/<fichier>.jpg`
 * et `src/modules/guide/captures.json`. Un repère introuvable est signalé et
 * reste sans numéro sur l'image ; sa légende s'affiche quand même. Toute
 * adresse e-mail affichée est remplacée par une adresse d'exemple avant la
 * prise : revoir chaque image avant de la committer.
 *
 * Playwright n'est pas une dépendance du projet : il est chargé à
 * l'exécution, depuis l'installation de la machine.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { CHAPITRES } from "../modules/guide/chapitres";

const LARGEUR = 1366;
const HAUTEUR = 860;

async function principal() {
  const base = process.argv[2] ?? "http://localhost:3000";
  const email = process.env.GUIDE_EMAIL;
  const motDePasse = process.env.GUIDE_MOT_DE_PASSE;
  if (!email || !motDePasse) throw new Error("Renseignez GUIDE_EMAIL et GUIDE_MOT_DE_PASSE (compte de la base de démonstration).");

  const charger = createRequire(import.meta.url);
  const { chromium } = charger("playwright");
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({ viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: 1 });

  await page.goto(`${base}/connexion`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="motDePasse"]', motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => !url.pathname.startsWith("/connexion"), { timeout: 30_000 });

  const dossier = join(process.cwd(), "public", "guide");
  mkdirSync(dossier, { recursive: true });
  const releves: Record<string, { largeur: number; hauteur: number; reperes: ([number, number] | null)[] }> = {};

  for (const chapitre of CHAPITRES) {
    for (const section of chapitre.sections) {
      const capture = section.capture;
      if (!capture) continue;
      await page.goto(`${base}${capture.page}`);
      await page.waitForLoadState("networkidle");
      // Ni l'indicateur du serveur de développement, ni le curseur clignotant.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}*{caret-color:transparent!important}" });
      // Aucune adresse e-mail réelle dans une image du dépôt : toutes sont remplacées avant la prise.
      await page.evaluate(() => {
        const motif = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
        const exemple = "prenom.nom@maria-groupe.com";
        const parcours = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        // `replace` sans `test` préalable : une expression globale garde sa position d'un appel à l'autre.
        for (let n = parcours.nextNode(); n; n = parcours.nextNode()) if (n.nodeValue) n.nodeValue = n.nodeValue.replace(motif, exemple);
        for (const champ of document.querySelectorAll("input, textarea")) {
          const c = champ as HTMLInputElement;
          c.value = c.value.replace(motif, exemple);
          c.placeholder = c.placeholder.replace(motif, exemple);
        }
      });
      await page.waitForTimeout(400);

      const reperes: ([number, number] | null)[] = [];
      for (const repere of capture.reperes) {
        const boite = await page.locator(repere.cible).first().boundingBox({ timeout: 2_000 }).catch(() => null);
        if (!boite || boite.x + boite.width > LARGEUR || boite.y + boite.height / 2 > HAUTEUR) {
          console.warn(`  repère introuvable ou hors cadre : ${capture.fichier} → ${repere.cible}`);
          reperes.push(null);
          continue;
        }
        // En pastille sur le coin haut droit de l'élément : le numéro ne cache pas son libellé.
        const x = (Math.min(boite.x + boite.width + 4, LARGEUR - 16) / LARGEUR) * 100;
        const y = (Math.max(boite.y - 2, 16) / HAUTEUR) * 100;
        reperes.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      }

      await page.screenshot({ path: join(dossier, `${capture.fichier}.jpg`), type: "jpeg", quality: 72 });
      releves[capture.fichier] = { largeur: LARGEUR, hauteur: HAUTEUR, reperes };
      console.log(`✓ ${capture.fichier} (${capture.page})`);
    }
  }

  await navigateur.close();
  writeFileSync(join(process.cwd(), "src", "modules", "guide", "captures.json"), `${JSON.stringify(releves, null, 2)}\n`);
  console.log(`${Object.keys(releves).length} captures écrites.`);
}

principal().catch((erreur) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
