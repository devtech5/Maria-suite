import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { SousNavigation } from "@/components/coque/sous-navigation";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";

/**
 * Trois sections, et c'est délibéré.
 *
 * Ce module n'est pas un espace de stockage : c'est une pièce jointe
 * disponible partout, la signature, et le courrier officiel sur papier à
 * en-tête. Tout ce qui ressemblerait à une suite bureautique reconstruite —
 * tableur, traitement de texte — est hors périmètre : un courrier est un
 * objet, un corps en texte simple et un signataire, rien de plus.
 */
const SECTIONS = [
  { href: "/documents", libelle: "Documents" },
  { href: "/documents/courriers", libelle: "Courriers" },
  { href: "/documents/signatures", libelle: "Signatures" },
];

export default async function LayoutDocuments({
  children,
}: LayoutProps<"/documents">) {
  if (!moduleOuvert("documents")) return <ModuleEnPreparation cle="documents" />;

  if (!(await peut("documents.consulter"))) return <AccesRefuse droit="documents.consulter" />;

  return (
    <>
      <SousNavigation entrees={SECTIONS} />
      {children}
    </>
  );
}
