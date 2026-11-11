import { BandeauDemo } from "@/components/coque/bandeau-demo";
import { BarreLaterale, EnTete } from "@/components/coque/barre-laterale";
import { Calculette } from "@/components/coque/calculette";
import { Cloche } from "@/components/coque/cloche";
import { FilAriane } from "@/components/coque/fil-ariane";
import type { OptionSelecteur } from "@/components/coque/selecteur";
import { VerrouInactivite } from "@/components/coque/verrou-inactivite";
import { AideContextuelle } from "@/components/guide/aide-contextuelle";
import { exigerEntreprise } from "@/lib/auth/dal";
import { droitsActifs } from "@/lib/droits/garde";
import { modulesOuverts } from "@/lib/modules/garde";
import { groupesVisibles } from "@/lib/navigation";
import { CHAPITRES, RACINES } from "@/modules/guide/chapitres";
import { chapitresPour, cheminsAide } from "@/modules/guide/regles";
import { annoncerApresReponse } from "@/modules/personnes/anniversaires-annonces";
import { pointerApresReponse } from "@/modules/presences/pointage";
import { purgerApresReponse } from "@/modules/visiteurs/requetes";
import { relancerApresReponse } from "@/modules/courrier/requetes";

/**
 * Coque des écrans de gestion.
 *
 * Une barre latérale bleu nuit porte tous les domaines en intertitres
 * (FINANCE) et leurs entrées (Comptabilité, Trésorerie) ; chaque module garde
 * ses sections en pastilles. Au-dessus du contenu, un en-tête clair : le
 * contexte de travail — entreprise, exercice — la recherche, les outils et
 * le compte. Sur téléphone, la barre latérale passe en tiroir.
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
  // Les anniversaires du jour s'annoncent au premier passage, après la réponse.
  annoncerApresReponse(session.organizationId);
  // Photos des visiteurs de plus de trois mois : effacées après la réponse, au plus une fois l'heure.
  purgerApresReponse(session.organizationId);
  // Courrier imputé resté sans réponse à son délai : relancé, au plus une fois par jour et par pli.
  relancerApresReponse(session.organizationId);
  const droits = [...(await droitsActifs())];
  const ouverts = modulesOuverts();
  // Le « ? » de chaque écran : les sections du guide que cette session peut lire.
  const visibles = groupesVisibles(droits, ouverts);
  const aides = visibles.some((g) => g.modules.some((m) => m.href === "/guide"))
    ? cheminsAide(chapitresPour(CHAPITRES, visibles.flatMap((g) => g.modules.map((m) => m.href))), RACINES)
    : null;

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
     * C'est ce qui garde la barre latérale et l'en-tête à l'écran en
     * permanence. Avec une page qui défile d'un bloc, ils disparaissaient dès
     * le premier écran de liste — et sur un catalogue de quatre cents articles,
     * changer de module obligeait à remonter tout le tableau.
     *
     * `dvh` et non `vh` : sur un téléphone, la barre d'adresse se rétracte au
     * défilement et `vh` laisse alors une bande morte en bas de l'écran.
     */
    <>
      <div id="coque-gestion" className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
        {/* À l'impression, seule la page sort : ni bandeaux, ni menu, ni en-tête. */}
        <div className="contents print:hidden">
          <BarreLaterale droits={droits} modulesOuverts={ouverts} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col print:block">
          <div className="contents print:hidden">
            <BandeauDemo />
            <EnTete
              droits={droits}
              modulesOuverts={ouverts}
              nomUtilisateur={session.nom}
              entrepriseActive={session.organizationNom}
              contexte={<FilAriane entreprise={session.organizationNom} exercice={exerciceCourant} exercices={[exerciceCourant]} />}
              outils={
                <>
                  {aides && <AideContextuelle aides={aides} />}
                  <Calculette />
                  <Cloche />
                </>
              }
            />
          </div>

          {/*
            Le contenu est le conteneur de défilement. `min-h-0` est
            indispensable : un enfant de flexbox refuse par défaut de devenir
            plus petit que son contenu, et sans lui `overflow-y-auto` n'a rien
            à faire déborder — la page recommencerait à défiler d'un bloc.
          */}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 lg:px-8 lg:py-6 print:overflow-visible print:p-0">
            {children}
          </main>
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
