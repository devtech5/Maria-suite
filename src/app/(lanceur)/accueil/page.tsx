import type { Metadata } from "next";
import Link from "next/link";

import { MenuCompte } from "@/components/coque/barre-laterale";
import { Calculette } from "@/components/coque/calculette";
import { Cloche } from "@/components/coque/cloche";
import { IconeModule } from "@/components/coque/icone-module";
import { EmblemeMaria, SignatureMaria } from "@/components/coque/signature";
import { exigerEntreprise } from "@/lib/auth/dal";
import { nomDuRole } from "@/lib/auth/roles";
import { droitsActifs } from "@/lib/droits/garde";
import { modulesOuverts } from "@/lib/modules/garde";
import { groupesVisibles, raccourcisCompte, type CleIcone } from "@/lib/navigation";

export const metadata: Metadata = { title: "Accueil" };

/**
 * Écran d'arrivée après connexion : tous les modules que CETTE session peut
 * ouvrir, rangés par famille comme dans la barre latérale.
 *
 * Un lanceur plein écran, sans barre latérale ni fil d'Ariane, à la manière
 * d'un écran de téléphone : une icône, un nom, rien d'autre — on reconnaît une icône plus vite qu'on ne lit une phrase. La
 * description reste en infobulle et pour les lecteurs d'écran.
 *
 * Un caissier y voit la caisse et ses tâches ; un gérant, l'entreprise
 * entière. Rien n'y figure qui refuserait ensuite l'entrée : même filtre que
 * la barre (droit du rôle ET module ouvert), même liste (`lib/navigation`).
 */
export default async function PageAccueil() {
  const session = await exigerEntreprise();
  const [droits, role] = await Promise.all([droitsActifs(), nomDuRole(session.roleId)]);
  const ouverts = modulesOuverts();
  const groupes = groupesVisibles(droits, ouverts);
  const total = groupes.reduce((s, g) => s + g.modules.length, 0);

  type EntreeTuile = { href: string; libelle: string; description: string; icone: CleIcone };
  const tableauDeBord: EntreeTuile = { href: "/", libelle: "Tableau de bord", description: "Où est l'argent, ce que la journée a produit, ce qui attend une décision.", icone: "tableau-de-bord" };
  const caisse: EntreeTuile = { href: "/caisse", libelle: "Caisse", description: "Encaisser au comptoir, même sans réseau.", icone: "caisse" };

  // Le tableau de bord ouvre la grille ; la caisse suit la trésorerie, dont
  // elle alimente les tiroirs. Sans trésorerie visible, elle ferme la
  // famille Finance, ou à défaut suit le tableau de bord.
  const tuiles: EntreeTuile[] = [tableauDeBord, ...groupes.flatMap((g) => g.modules)];
  if (droits.has("pos.vente.encaisser")) {
    const finance = groupes.find((g) => g.titre === "Finance")?.modules ?? [];
    const apres = tuiles.findIndex((t) => t.href === "/tresorerie");
    const repli = finance.length ? tuiles.indexOf(finance[finance.length - 1]) : 0;
    tuiles.splice((apres >= 0 ? apres : repli) + 1, 0, caisse);
  }

  return (
    <main className="flex flex-1 flex-col px-4 pt-3 lg:px-10">
      {/* Seul reste du bandeau : le coin des notifications et du compte. */}
      <div className="flex items-center justify-end gap-1">
        <Calculette />
        <Cloche />
        <MenuCompte
          ouverture="bas"
          nomUtilisateur={session.nom}
          entrepriseActive={session.organizationNom}
          gereLesMembres={droits.has("organisation.membre.gerer")}
          raccourcis={raccourcisCompte(ouverts)}
        />
      </div>

      {/*
        Grille centrée dans l'écran, sans défilement sur un ordinateur : une
        seule grille, rangée par famille (même ordre que la barre latérale),
        sans intertitres — cinq titres de section coûtent cinq rangées.
        Tailles et écarts suivent la hauteur de l'écran (vh), pour tenir sur
        un portable de 768 px comme sur un grand moniteur.
      */}
      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <EmblemeMaria className="mb-3 size-[clamp(3rem,8vh,4.5rem)]" />
        <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">{session.organizationNom}</h1>
        <span aria-hidden className="mt-2 h-0.5 w-10 rounded-full bg-or" />
        <p className="mt-2 text-center text-sm text-[var(--encre-douce)]">
          {session.nom}
          {role && <> · {role}</>} · {total} module{total > 1 ? "s" : ""}
        </p>

        {groupes.length === 0 && (
          <p className="mt-6 max-w-md rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] p-5 text-center text-sm text-[var(--encre-douce)]">
            Aucun module ne vous est encore ouvert dans cette entreprise. Adressez-vous à son responsable pour qu&apos;il vous attribue un rôle.
          </p>
        )}

        {/* `flex-wrap` et non `grid` : une dernière rangée incomplète reste centrée. */}
        <ul className="mt-[clamp(1.5rem,5vh,3rem)] flex max-w-[56rem] flex-wrap justify-center gap-y-[clamp(0.75rem,3vh,1.75rem)]">
          {tuiles.map((t) => (
            <Tuile key={t.href} {...t} />
          ))}
        </ul>
      </div>

      <footer className="flex justify-center pb-3 pt-2">
        <SignatureMaria />
      </footer>
    </main>
  );
}

function Tuile({ href, libelle, description, icone }: { href: string; libelle: string; description: string; icone: CleIcone }) {
  return (
    <li className="w-24 sm:w-32">
      <Link href={href} title={description} className="group flex flex-col items-center gap-2 rounded-xl p-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-marque-500">
        <span className="flex size-16 items-center justify-center rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm transition duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md sm:size-[clamp(3.5rem,8.5vh,4.5rem)]">
          <IconeModule cle={icone} className="size-[62%]" />
        </span>
        <span className="text-xs font-medium leading-tight text-[var(--encre)] sm:text-sm">{libelle}</span>
        <span className="sr-only">{description}</span>
      </Link>
    </li>
  );
}
