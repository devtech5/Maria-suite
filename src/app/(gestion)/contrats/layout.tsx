import { AccesRefuse } from "@/components/coque/acces-refuse";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

/**
 * Contrats : ceux des salariés et ceux des fournisseurs, sur un même écran.
 *
 * Aucune donnée propre. Le contrat d'un salarié vit sur sa fiche (type,
 * entrée, terme, essai) ; celui d'un fournisseur est une convention au sens
 * « Fournisseur » (Marchés et conventions), avec son préavis, sa reconduction
 * et ses avenants. Cet écran les rassemble pour voir d'un coup d'œil ce qui
 * arrive à échéance — les dupliquer ferait deux vérités.
 *
 * Chaque moitié suit son propre droit : le responsable des achats voit les
 * contrats fournisseurs sans lire ceux du personnel.
 */
export default async function LayoutContrats({ children }: LayoutProps<"/contrats">) {
  const [salaries, fournisseurs] = await Promise.all([peut("personnes.consulter"), peut("marches.consulter")]);
  const voitFournisseurs = fournisseurs && moduleOuvert("marches");
  if (!salaries && !voitFournisseurs) return <AccesRefuse droit="personnes.consulter" />;

  return (
    <>
      <SousNavigation
        entrees={[
          ...(salaries ? [{ href: "/contrats", libelle: "Salariés" }] : []),
          ...(voitFournisseurs ? [{ href: "/contrats/fournisseurs", libelle: "Fournisseurs" }] : []),
        ]}
      />
      {children}
    </>
  );
}
