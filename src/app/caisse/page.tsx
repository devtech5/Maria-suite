import type { Metadata } from "next";
import Link from "next/link";

import { ServiceWorkerCaisse } from "@/components/service-worker";
import { VerrouInactivite } from "@/components/coque/verrou-inactivite";
import { exigerEntreprise } from "@/lib/auth/dal";
import { pointerApresReponse } from "@/modules/presences/pointage";
import { identiteEntreprise, lignesTicket } from "@/lib/identite";
import { peut } from "@/lib/droits/garde";
import { listerArticles } from "@/modules/catalogue/requetes";
import { stocksParArticle } from "@/modules/stock/requetes";
import { dernierRang, posteDeLAppareil } from "@/modules/ventes/requetes";
import { attenduDeSession, sessionOuverte } from "@/modules/ventes/session";
import { EcranCaisse } from "./ecran-caisse";
import type { ArticleCaisse } from "./types";

export const metadata: Metadata = { title: "Caisse" };

export default async function PageCaisse() {
  // Exemptée du verrou d'inactivité : la caisse reste ouverte entre deux
  // clients, même si un onglet de gestion voisin s'est voilé.
  const session = await exigerEntreprise({ malgreVerrou: true });
  pointerApresReponse(session.organizationId, session.userId);

  // La caisse est le seul écran plein cadre : pas de coque où loger un refus,
  // donc il occupe la page.
  if (!(await peut("pos.vente.encaisser"))) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-[var(--fond)] p-6 text-center">
        <h1 className="text-xl font-semibold">Caisse réservée</h1>
        <p className="max-w-[52ch] text-sm text-[var(--encre-douce)]">
          Votre rôle ne permet pas d&apos;encaisser. Le responsable de
          l&apos;entreprise peut vous accorder ce droit.
        </p>
        <Link
          href="/"
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold leading-[var(--h-cible)] text-white hover:bg-marque-700"
        >
          Revenir au tableau de bord
        </Link>
      </main>
    );
  }

  // Le poste est celui de l'appareil : c'est lui qui porte le compteur de
  // tickets, et donc la capacité à numéroter sans réseau.
  const poste = await posteDeLAppareil(session.organizationId, session.deviceId);

  if (!poste) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-[var(--fond)] p-6 text-center">
        <h1 className="text-xl font-semibold">Aucun poste de caisse</h1>
        <p className="max-w-[52ch] text-sm text-[var(--encre-douce)]">
          Une caisse encaisse depuis un dépôt et numérote ses tickets dans sa
          propre suite. Ouvrez un poste — et d&apos;abord un dépôt, si vous
          n&apos;en avez aucun.
        </p>
        <div className="flex gap-3">
          <Link
            href="/stock"
            className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-4 text-sm font-medium leading-[var(--h-cible)] hover:bg-[var(--surface-creuse)]"
          >
            Ouvrir un dépôt
          </Link>
          <Link
            href="/commercial/ventes"
            className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold leading-[var(--h-cible)] text-white hover:bg-marque-700"
          >
            Ouvrir un poste de caisse
          </Link>
        </div>
      </main>
    );
  }

  const [catalogue, stocks, rang, tiroir, identite] = await Promise.all([
    listerArticles(session.organizationId),
    stocksParArticle(session.organizationId),
    dernierRang(session.organizationId, poste.id),
    sessionOuverte(session.organizationId, poste.id),
    identiteEntreprise(session.organizationId),
  ]);

  // L'attendu ne se calcule que si un tiroir est ouvert : sans session, il n'y
  // a rien à comparer et la requête serait un aller-retour pour rien.
  const attendu = tiroir
    ? await attenduDeSession(session.organizationId, tiroir)
    : null;

  /**
   * Le stock affiché est celui du DÉPÔT de ce poste, pas le stock global.
   * Un caissier de Treichville qui verrait les cartons de Yopougon vendrait ce
   * qu'il n'a pas dans son rayon.
   */
  const articles: ArticleCaisse[] = catalogue.map((article) => ({
    id: article.id,
    sku: article.reference,
    designation: article.designation,
    categorie: article.familleNom ?? "Divers",
    prix: article.prixVente,
    unite: article.unite,
    conditionnement: article.conditionnement ?? "",
    stock: article.suiviStock
      ? (stocks
          .get(article.id)
          ?.parDepot.find((part) => part.depotId === poste.depotId)?.quantite ?? 0)
      : 0,
    service: !article.suiviStock,
  }));

  return (
    <>
      {/* La caisse doit pouvoir S'OUVRIR sans réseau. La vente, elle, est déjà
          hors ligne par la file locale. */}
      <ServiceWorkerCaisse />
      {/* Ses gestes comptent comme activité. Elle ne se voile que sur un
          verrou demandé à la main. */}
      <VerrouInactivite
        mode="presence"
        cible="coque-caisse"
        sessionVerrouillee={session.verrouillee}
        delaiMinutes={session.delaiVerrouillage}
        nom={session.nom}
        email={session.email}
        entreprise={session.organizationNom}
      />
      <EcranCaisse
        articles={articles}
        caissier={session.nom}
        poste={{
          id: poste.id,
          code: poste.code,
          nom: poste.nom,
          prefixe: poste.prefixe,
          depotNom: poste.depotNom,
          dernierRang: rang,
        }}
        nomBoutique={session.organizationNom ?? "Maria Suite"}
        identiteTicket={{ entete: lignesTicket(identite), piedDePage: identite.piedDePage, logo: identite.logo }}
        deviceId={session.deviceId}
        session={
          tiroir
            ? {
                id: tiroir.id,
                caissier: tiroir.caissier,
                fondInitial: tiroir.fondInitial,
                ouverteLe: tiroir.ouverteLe.toISOString(),
              }
            : null
        }
        attendu={attendu}
      />
    </>
  );
}
