import { BandeauDemo } from "@/components/coque/bandeau-demo";
import { BarreLaterale } from "@/components/coque/barre-laterale";
import { Calculette } from "@/components/coque/calculette";
import { Cloche } from "@/components/coque/cloche";
import { FilAriane } from "@/components/coque/fil-ariane";
import type { OptionSelecteur } from "@/components/coque/selecteur";
import { VerrouInactivite } from "@/components/coque/verrou-inactivite";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { modulesOuverts } from "@/lib/modules/garde";
import { pointerApresReponse } from "@/modules/presences/pointage";

/**
 * Coque des écrans de gestion.
 *
 * Disposition reprise des tableaux de bord Vercel et Supabase : fil d'Ariane à
 * sélecteurs en haut, barre latérale groupée à gauche, menu de compte en pied
 * de barre. Le contexte de travail — entreprise, exercice — reste lisible en
 * permanence.
 *
 * La caisse n'en fait pas partie : elle occupe tout l'écran, sans navigation.
 * Un caissier n'a rien à chercher pendant un encaissement.
 *
 * La session est exigée ici et pas seulement dans `proxy.ts` : ce dernier ne
 * regarde que la présence d'un cookie, qui peut porter un jeton révoqué.
 */
export default async function LayoutGestion({ children }: LayoutProps<"/">) {
  // Sans rattachement actif à l'entreprise, il n'y a ni rôle ni droit :
  // `exigerEntreprise` renvoie vers l'écran qui l'explique.
  const session = await exigerEntreprise();
  // Ouvrir un écran, c'est être là : le pointage du jour se pose ou s'étend.
  pointerApresReponse(session.organizationId, session.userId);
  const droits = [...(await droitsActifs())];

  // L'exercice reste figé tant que le module comptable ne gère pas la clôture :
  // proposer d'en changer avant de savoir le faire serait un leurre.
  const exerciceCourant: OptionSelecteur = {
    id: "2026",
    libelle: "Exercice 2026",
    badge: "ouvert",
    detail: "Du 01/01/2026 au 31/12/2026",
  };

  return (
    /**
     * La coque occupe exactement la hauteur de la fenêtre et ne défile pas :
     * `h-dvh` plutôt que `min-h-dvh`, et le débordement est coupé ici. Le seul
     * élément qui défile est le contenu, plus bas.
     *
     * C'est ce qui garde la barre latérale et le fil d'Ariane à l'écran en
     * permanence. Avec une page qui défile d'un bloc, ils disparaissaient dès
     * le premier écran de liste — et sur un catalogue de quatre cents articles,
     * changer de module obligeait à remonter tout le tableau.
     *
     * `dvh` et non `vh` : sur un téléphone, la barre d'adresse se rétracte au
     * défilement et `vh` laisse alors une bande morte en bas de l'écran.
     */
    <>
      <div id="coque-gestion" className="flex h-dvh flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        {/* À l'impression, seule la page sort : ni bandeaux, ni menu, ni barre du haut. */}
        <div className="contents print:hidden">
          <BandeauDemo />
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row print:block">
          <div className="contents print:hidden">
          <BarreLaterale
            nomUtilisateur={session.nom}
            entrepriseActive={session.organizationNom}
            droits={droits}
            modulesOuverts={modulesOuverts()}
          />
          </div>

          {/*
            `min-h-0` ici aussi, et pas seulement sur le contenu. Sur téléphone
            la coque s'empile en colonne : sans lui, cette colonne refuse de
            descendre sous la hauteur de son contenu, le contenu ne déborde donc
            jamais, et tout ce qui dépasse l'écran se fait couper par le
            `overflow-hidden` du dessus — inatteignable, sans barre de défilement
            pour le signaler.
          */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col print:block">
            <header className="flex shrink-0 items-center gap-3 border-b border-[var(--filet)] bg-[var(--surface)] px-3 py-1.5 print:hidden">
              <FilAriane
                entreprise={session.organizationNom}
                exercice={exerciceCourant}
                exercices={[exerciceCourant]}
              />
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <Calculette />
                <Cloche />
              </div>
            </header>

            {/*
              Le contenu est le conteneur de défilement. `min-h-0` est
              indispensable : un enfant de flexbox refuse par défaut de devenir
              plus petit que son contenu, et sans lui `overflow-y-auto` n'a rien
              à faire déborder — la page recommencerait à défiler d'un bloc.
            */}
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 lg:p-6 print:overflow-visible print:p-0">
              {children}
            </main>
          </div>
        </div>
      </div>
      <VerrouInactivite
        cible="coque-gestion"
        delaiMinutes={session.delaiVerrouillage}
        nom={session.nom}
        email={session.email}
        entreprise={session.organizationNom}
      />
    </>
  );
}
