import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesCalculs } from "@/modules/calculs/acces";
import { reglagesCalculsDe } from "@/modules/calculs/donnees";

export default async function LayoutCalculs({ children }: { children: React.ReactNode }) {
  if (!moduleOuvert("calculs")) return <ModuleEnPreparation cle="calculs" />;
  const a = await accesCalculs();
  if (!a.utiliser) return <AccesRefuse droit="calculs.utiliser" />;
  const r = await reglagesCalculsDe(a.session.organizationId);
  return (
    <>
      <SousNavigation
        entrees={[
          { href: "/calculs", libelle: "Tous les calculs" },
          { href: "/calculs/beton", libelle: "Béton et fer" },
          { href: "/calculs/maconnerie", libelle: "Agglos" },
          { href: "/calculs/carrelage", libelle: "Carrelage" },
          { href: "/calculs/pente", libelle: "Pente" },
          { href: "/calculs/escalier", libelle: "Escalier" },
          { href: "/calculs/equerre", libelle: "Angle droit" },
          ...(a.regler ? [{ href: "/calculs/reglages", libelle: "Ratios" }] : []),
        ]}
      />
      {!r.verifie && (
        <p className="mb-4 rounded-lg bg-alerte-50 px-3 py-2 text-sm text-alerte-600 print:hidden">
          Ratios à vérifier : dosages, pertes et conditionnements sont les valeurs de départ des chantiers ivoiriens
          {r.personnalises ? ", modifiées depuis" : ""}, et personne ne les a encore attestés.
          {a.regler ? " Vérifiez-les dans « Ratios »." : " Un responsable doit les attester."}
        </p>
      )}
      {children}
    </>
  );
}
