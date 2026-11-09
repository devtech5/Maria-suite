import type { Metadata } from "next";

import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { modulesCoupes, modulesDesactivesParRole, niveauxParMembre, restrictionsParMembre } from "@/lib/auth/acces";
import { listerMembres, rolesAttribuables } from "@/lib/auth/membres";
import { rolesDeLEntreprise } from "@/lib/auth/roles";
import { modulesDuRole } from "@/lib/droits/acces";
import { TOUS_LES_DROITS } from "@/lib/droits/catalogue";
import { iconeDuModule } from "@/lib/modules/icones";
import { modulesOuverts } from "@/lib/modules/garde";
import { getModule } from "@/modules/registry";
import { fmtDateIso, fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { FormulaireMembre } from "./formulaire-membre";
import { ListeMembres, type LigneMembre } from "./liste-membres";

export const metadata: Metadata = { title: "Utilisateurs" };

/** Statut tel que la liste l'affiche : on le cherche comme on le lit. */
const STATUT = { actif: "Actif", invite: "Invité", suspendu: "Suspendu" } as const;

export default async function PageMembres({ searchParams }: PageProps<"/membres">) {
  const session = await exigerEntreprise();
  const { q } = lireFiltresListe(await searchParams);

  const [membres, roles, restrictions, tousLesRoles, niveaux, desactivesParRole, coupes] = await Promise.all([
    listerMembres(session.organizationId),
    rolesAttribuables(session.organizationId),
    restrictionsParMembre(session.organizationId),
    rolesDeLEntreprise(session.organizationId),
    niveauxParMembre(session.organizationId),
    modulesDesactivesParRole(session.organizationId),
    modulesCoupes(session.organizationId),
  ]);

  // Les modules proposés à une personne : ceux que son rôle ouvre, parmi les
  // modules en service. Le propriétaire les a tous, sans désactivation.
  const enService = modulesOuverts().filter((cle) => !coupes.has(cle) && getModule(cle));
  const droitsDuRole = new Map(tousLesRoles.map((r) => [r.id, r.droits]));
  const horodatage = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

  const actifs = membres.filter((membre) => membre.statut === "actif").length;

  // La date est mise en forme ici, pas dans le composant client : un rendu
  // client dépendrait du fuseau du navigateur et ne retomberait pas sur le
  // rendu serveur, ce que React signale comme une erreur d'hydratation.
  const lignes: LigneMembre[] = membres.map((membre) => ({
    membershipId: membre.membershipId,
    userId: membre.userId,
    nom: membre.nom,
    email: membre.email,
    roleId: membre.roleId,
    roleNom: membre.roleNom,
    statut: membre.statut,
    proprietaire: membre.proprietaire,
    restrictions: restrictions.get(membre.membershipId) ?? 0,
    derniereConnexion: membre.derniereConnexion ? horodatage.format(membre.derniereConnexion) : null,
    modules: (() => {
      const ouverts = modulesDuRole(membre.proprietaire ? TOUS_LES_DROITS : (droitsDuRole.get(membre.roleId) ?? []));
      const sesNiveaux = niveaux.get(membre.membershipId);
      const duRole = membre.proprietaire ? undefined : desactivesParRole.get(membre.roleId);
      return enService
        .filter((cle) => ouverts.has(cle))
        .map((cle) => {
          const niveau = membre.proprietaire ? "complet" : (sesNiveaux?.get(cle) ?? "complet");
          return {
            cle,
            nom: getModule(cle)!.name,
            icone: iconeDuModule(cle),
            actif: niveau !== "aucun",
            consultation: niveau === "consultation",
            roleDesactive: duRole?.has(cle) ?? false,
          };
        });
    })(),
    depuis: membre.rejointLe
      ? fmtDateIso(membre.rejointLe.toISOString().slice(0, 10))
      : null,
  }));
  const affichees = lignes.filter((l) =>
    correspond(q, [l.nom, l.email, l.roleNom, STATUT[l.statut], l.proprietaire ? "Propriétaire" : null]),
  );

  return (
    <>
      <EnTetePage
        titre="Utilisateurs"
        sousTitre={
          membres.length === 1
            ? "Vous êtes seul à ouvrir le logiciel"
            : `${membres.length} accès · ${actifs} en activité`
        }
        actions={<FormulaireMembre roles={roles} />}
      />

      <Recherche
        chemin="/membres"
        valeur={q}
        placeholder="Nom, adresse, rôle, statut…"
        resultats={q ? `${fmtEntier(affichees.length)} sur ${fmtEntier(lignes.length)}` : undefined}
      />

      {affichees.length === 0 ? (
        <EtatVide titre="Aucun utilisateur ne répond" message="Retirez un mot de la recherche." />
      ) : (
        <ListeMembres membres={affichees} roles={roles} moiId={session.userId} />
      )}
    </>
  );
}
