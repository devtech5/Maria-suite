import type { Metadata } from "next";

import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { restrictionsParMembre } from "@/lib/auth/acces";
import { listerMembres, rolesAttribuables } from "@/lib/auth/membres";
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

  const [membres, roles, restrictions] = await Promise.all([
    listerMembres(session.organizationId),
    rolesAttribuables(session.organizationId),
    restrictionsParMembre(session.organizationId),
  ]);

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
