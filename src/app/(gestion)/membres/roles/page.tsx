import type { Metadata } from "next";

import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { rolesDeLEntreprise } from "@/lib/auth/roles";
import { droitsParModule } from "@/lib/droits/catalogue";
import { droitsActifs } from "@/lib/droits/garde";
import { getModule } from "@/modules/registry";
import { ListeRoles } from "./liste-roles";
import type { GroupeDroits } from "./formulaire-role";

export const metadata: Metadata = { title: "Rôles" };

/**
 * `organisation` est le transverse — les membres, les paramètres, l'abonnement.
 * Il n'a pas d'entrée au registre des modules parce qu'il ne se vend pas et ne
 * se coupe pas ; son libellé se pose donc ici.
 */
const LIBELLE_TRANSVERSE = "Entreprise";

export default async function PageRoles() {
  const session = await exigerEntreprise();

  const [roles, detenus] = await Promise.all([
    rolesDeLEntreprise(session.organizationId),
    droitsActifs(),
  ]);

  const groupes: GroupeDroits[] = droitsParModule().map((groupe) => ({
    moduleKey: groupe.moduleKey,
    libelle: getModule(groupe.moduleKey)?.name ?? LIBELLE_TRANSVERSE,
    droits: groupe.droits.map((droit) => ({
      cle: droit.cle,
      libelle: droit.libelle,
      description: droit.description ?? null,
    })),
  }));

  const composes = roles.filter((role) => !role.systeme).length;

  return (
    <>
      <EnTetePage
        titre="Rôles"
        sousTitre={
          composes === 0
            ? `${roles.length} rôles fournis par Maria Suite`
            : `${roles.length} rôles · ${composes} composé${composes > 1 ? "s" : ""} par vous`
        }
      />

      <ListeRoles roles={roles} groupes={groupes} detenus={[...detenus]} />
    </>
  );
}
