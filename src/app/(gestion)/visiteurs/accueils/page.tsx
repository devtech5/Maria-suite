import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteAccueil } from "@/components/visiteurs/carte-accueil";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { enregistrerAccueil } from "@/modules/visiteurs/actions";
import { accueilsDe, agentsDe, personnesVisitables } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Points d'accueil" };

/**
 * Les points d'accueil — siège, chantiers, sites miniers — et leurs agents.
 * Un agent ne voit que le registre des accueils qu'il tient ; la
 * supervision les voit tous.
 */
export default async function PageAccueils() {
  const acces = await accesVisiteurs();
  if (!acces.superviser) return <AccesRefuse droit="visiteurs.superviser" />;
  const org = acces.session.organizationId;
  const [accueils, agents, membres] = await Promise.all([accueilsDe(org), agentsDe(org), personnesVisitables(org)]);

  return (
    <>
      <EnTetePage
        titre="Points d'accueil"
        sousTitre={`${accueils.length} point${accueils.length > 1 ? "s" : ""} d'accueil`}
        actions={
          <FormulaireRepliable libelle="Nouveau point d'accueil" titre="Nouveau point d'accueil" action={enregistrerAccueil}>
            <div className="space-y-3">
              <Champ libelle="Nom">
                <input name="nom" required maxLength={80} placeholder="Siège Cocody, Chantier Bingerville, Site minier…" className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Lieu (facultatif)">
                <input name="lieu" maxLength={160} className={CLASSE_CHAMP} />
              </Champ>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="pieceExigee" defaultChecked className="accent-marque-600" /> Pièce d&apos;identité exigée à l&apos;arrivée
              </label>
            </div>
          </FormulaireRepliable>
        }
      />
      {accueils.length === 0 ? (
        <EtatVide titre="Aucun point d'accueil" message="Créez le siège, puis chaque chantier ou site qui reçoit des visiteurs, et désignez qui les tient." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {accueils.map((a) => (
            <CarteAccueil
              key={a.id}
              membres={membres}
              accueil={{ id: a.id, nom: a.nom, lieu: a.lieu, pieceExigee: a.pieceExigee, actif: a.actif, agents: agents.filter((g) => g.accueilId === a.id) }}
            />
          ))}
        </div>
      )}
    </>
  );
}
