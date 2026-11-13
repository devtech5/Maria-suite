import type { Metadata } from "next";

import { FormulaireRepliable } from "@/components/ui/operations";
import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { ajouterService } from "@/modules/personnes/actions-services";
import { listerServices } from "@/modules/personnes/referentiel-services";
import { LISTE_POLES, POLES } from "@/modules/personnes/services";

import { CarteService, ChampsService } from "./carte-service";

export const metadata: Metadata = { title: "Services" };

/**
 * Services : l'organigramme de l'entreprise, rangé par pôle — direction,
 * fonctions support, métiers. Chaque poste se range dans un service (onglet
 * Postes), et le service d'un collaborateur se choisit dans cette liste.
 */
export default async function PageServices() {
  const session = await exigerEntreprise();
  const [services, gerer] = await Promise.all([listerServices(session.organizationId), peut("personnes.salarie.gerer")]);
  const actifs = services.filter((s) => s.actif).length;
  const effectif = services.reduce((total, s) => total + s.effectif, 0);

  return (
    <>
      <EnTetePage
        titre="Services"
        sousTitre={
          services.length === 0
            ? "Aucun service"
            : `${actifs} service${actifs > 1 ? "s" : ""} · ${effectif} collaborateur${effectif > 1 ? "s" : ""} rattaché${effectif > 1 ? "s" : ""}`
        }
        actions={
          gerer ? (
            <FormulaireRepliable libelle="Ajouter un service" titre="Ajouter un service" action={ajouterService}>
              <ChampsService />
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {services.length === 0 ? (
        <EtatVide titre="Aucun service" message="Ajoutez les services de l'entreprise : chaque poste s'y range, et le service d'un collaborateur s'y choisit." />
      ) : (
        <div className="space-y-6">
          {LISTE_POLES.map((pole) => {
            const duPole = services.filter((s) => s.pole === pole);
            if (duPole.length === 0) return null;
            return (
              <section key={pole}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="text-base font-semibold">{POLES[pole].libelle}</h2>
                  <p className="text-xs text-[var(--encre-faible)]">{POLES[pole].description}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {duPole.map((s) => (
                    <CarteService key={s.id} service={s} gerer={gerer} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
