import type { Metadata } from "next";

import { EnTetePage } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { rolesDeLEntreprise } from "@/lib/auth/roles";
import { modulesCoupes, modulesDesactivesParRole } from "@/lib/auth/acces";
import { modulesDuRole } from "@/lib/droits/acces";
import { DROITS_DE_TOUS, droitsParModule } from "@/lib/droits/catalogue";
import { iconeDuModule, modulesParGroupe } from "@/lib/modules/icones";
import { modulesOuverts } from "@/lib/modules/garde";
import { droitsActifs } from "@/lib/droits/garde";
import { getModule } from "@/modules/registry";
import { GrilleModulesRoles } from "./grille-modules-roles";
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

  const [roles, detenus, desactives, coupes] = await Promise.all([
    rolesDeLEntreprise(session.organizationId),
    droitsActifs(),
    modulesDesactivesParRole(session.organizationId),
    modulesCoupes(session.organizationId),
  ]);

  // La grille « Modules par rôle » : modules en service, rôles hors propriétaire.
  const enService = modulesOuverts().filter((cle) => !coupes.has(cle) && getModule(cle));
  const colonnes = roles
    .filter((r) => r.cle !== "proprietaire")
    .map((r) => ({ id: r.id, nom: r.nom, modules: [...modulesDuRole(r.droits)].filter((cle) => enService.includes(cle)) }));
  // Un module qu'aucun rôle n'ouvre n'a pas de case : sa ligne ne serait que des tirets.
  const ouvertsParUnRole = enService.filter((cle) => colonnes.some((c) => c.modules.includes(cle)));
  const groupesModules = modulesParGroupe(ouvertsParUnRole).map((g) => ({
    titre: g.titre,
    modules: g.cles.map((cle) => ({ cle, nom: getModule(cle)!.name, icone: iconeDuModule(cle) })),
  }));

  // Les droits d'un module coupé ne se proposent plus : le module n'existe pas
  // pour l'entreprise. Ils restent aux rôles qui les portaient (l'action
  // serveur conserve ce que l'écran ne montre pas) et reviennent avec lui.
  const groupes: GroupeDroits[] = droitsParModule()
    .filter((groupe) => !coupes.has(groupe.moduleKey))
    .map((groupe) => ({
    moduleKey: groupe.moduleKey,
    libelle: getModule(groupe.moduleKey)?.name ?? LIBELLE_TRANSVERSE,
    // Un droit de tout compte (lire le règlement) n'a pas de case : il ne se retire pas.
    droits: groupe.droits.filter((droit) => !DROITS_DE_TOUS.includes(droit.cle)).map((droit) => ({
      cle: droit.cle,
      libelle: droit.libelle,
      description: droit.description ?? null,
    })),
  }))
    .filter((groupe) => groupe.droits.length > 0);

  const visibles = new Set(groupes.flatMap((g) => g.droits.map((d) => d.cle)));
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

      <ListeRoles
        roles={roles.map((r) => ({ ...r, droits: r.droits.filter((d) => visibles.has(d)) }))}
        groupes={groupes}
        detenus={[...detenus]}
        totalDroits={visibles.size}
      />

      {session.estProprietaire && (
        <GrilleModulesRoles
          roles={colonnes}
          groupes={groupesModules}
          desactives={[...desactives].flatMap(([roleId, cles]) => [...cles].map((moduleKey) => ({ roleId, moduleKey })))}
        />
      )}
    </>
  );
}
