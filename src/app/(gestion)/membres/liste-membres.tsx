"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";

import { Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import type { RoleAttribuable } from "@/lib/auth/membres";
import {
  changerRoleMembre,
  changerStatutMembre,
  reinitialiserMotDePasse,
  type ResultatReinitialisation,
} from "./actions";
import { FenetreModules, type ModuleDuMembre } from "./fenetre-modules";
import { MotDePasseRemis } from "./mot-de-passe-remis";

export interface LigneMembre {
  membershipId: string;
  userId: string;
  nom: string;
  email: string | null;
  roleId: string;
  roleNom: string;
  statut: "invite" | "actif" | "suspendu";
  proprietaire: boolean;
  /** Date de rattachement, déjà mise en forme par le serveur. */
  depuis: string | null;
  /** Modules restreints (consultation ou aucun) pour cette personne. */
  restrictions: number;
  /** Dernière connexion, déjà mise en forme par le serveur. */
  derniereConnexion: string | null;
  /** Modules que son rôle ouvre, et leur état pour elle. */
  modules: ModuleDuMembre[];
}

const Icone = ({ d, titre }: { d: string; titre: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <title>{titre}</title>
    <path d={d} />
  </svg>
);
const CLASSE_ICONE =
  "grid size-9 place-items-center rounded-lg text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)] disabled:opacity-40";

const TONS = {
  actif: "valide",
  invite: "alerte",
  suspendu: "danger",
} as const;

const ETIQUETTES = {
  actif: "Actif",
  invite: "Invité",
  suspendu: "Suspendu",
} as const;

/**
 * Qui ouvre le logiciel, et avec quel rôle.
 *
 * Deux lignes ne se modifient pas : celle du propriétaire, et la sienne. Les
 * contrôles y sont absents plutôt que désactivés puis refusés — un bouton qui
 * ne mène jamais nulle part n'a pas à être affiché. Le serveur refuse quand
 * même : l'écran cache, l'action refuse.
 */
export function ListeMembres({
  membres,
  roles,
  moiId,
}: {
  membres: LigneMembre[];
  roles: RoleAttribuable[];
  moiId: string;
}) {
  const [remis, setRemis] = useState<{
    nom: string;
    email: string;
    motDePasse: string;
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modulesDe, setModulesDe] = useState<LigneMembre | null>(null);
  const [enCours, demarrer] = useTransition();

  function reinitialiser(membre: LigneMembre) {
    setErreur(null);
    demarrer(async () => {
      const resultat: ResultatReinitialisation = await reinitialiserMotDePasse(
        membre.membershipId,
      );
      if (resultat.ok) {
        setRemis({ nom: membre.nom, email: resultat.email, motDePasse: resultat.motDePasse });
      } else {
        setErreur(resultat.message);
      }
    });
  }

  return (
    <>
      {remis && (
        <MotDePasseRemis
          nom={remis.nom}
          email={remis.email}
          motDePasse={remis.motDePasse}
          onFermer={() => setRemis(null)}
        />
      )}
      {erreur && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
        >
          {erreur}
        </p>
      )}
      {modulesDe && (
        <FenetreModules
          key={modulesDe.membershipId}
          ouverte
          onFermer={() => setModulesDe(null)}
          membershipId={modulesDe.membershipId}
          nom={modulesDe.nom}
          modules={modulesDe.modules}
        />
      )}
      <Tableau>
        <thead>
          <tr>
            <Th>Nom</Th>
            <Th>Identifiant</Th>
            <Th>Rôle</Th>
            <Th>Statut</Th>
            <Th>Dernière connexion</Th>
            <Th aligne="droite">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {membres.map((membre) => {
            const fige = membre.proprietaire || membre.userId === moiId;
            const indisponibles = membre.modules.filter((m) => !m.actif || m.roleDesactive).length;
            return (
              <tr key={membre.membershipId}>
                <Td>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{membre.nom}</span>
                    {membre.userId === moiId && <Pastille ton="valide">Vous</Pastille>}
                    {membre.proprietaire && <Pastille ton="marque">Propriétaire</Pastille>}
                    {indisponibles > 0 && (
                      <Pastille ton="alerte">
                        {indisponibles} module{indisponibles > 1 ? "s" : ""} indisponible{indisponibles > 1 ? "s" : ""}
                      </Pastille>
                    )}
                  </span>
                  {membre.depuis && <span className="block text-xs text-[var(--encre-faible)]">depuis le {membre.depuis}</span>}
                </Td>
                <Td>
                  <span className="font-mono text-[13px]">{membre.email ?? "—"}</span>
                  {!membre.email && <span className="block text-xs text-[var(--encre-faible)]">Sans adresse : ne peut pas se connecter</span>}
                </Td>
                <Td>{fige ? membre.roleNom : <SelecteurRole membre={membre} roles={roles} />}</Td>
                <Td>
                  <Pastille ton={TONS[membre.statut]}>{ETIQUETTES[membre.statut]}</Pastille>
                </Td>
                <Td chiffres>{membre.derniereConnexion ?? "—"}</Td>
                <Td aligne="droite">
                  {fige ? (
                    <span className="text-xs text-[var(--encre-faible)]">{membre.proprietaire ? "Accès complet" : "Vous"}</span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      <button type="button" onClick={() => setModulesDe(membre)} aria-label={`Modules de ${membre.nom}`} title="Modules" className={CLASSE_ICONE}>
                        <Icone titre="Modules" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
                      </button>
                      <button
                        type="button"
                        disabled={enCours || !membre.email}
                        onClick={() => reinitialiser(membre)}
                        aria-label={`Nouveau mot de passe pour ${membre.nom}`}
                        title="Nouveau mot de passe"
                        className={CLASSE_ICONE}
                      >
                        <Icone titre="Nouveau mot de passe" d="M15 7a4 4 0 1 1-3.9 4.9L4 19v-3h2v-2h2l1.1-1.1A4 4 0 0 1 15 7zm1.5 2.5h.01" />
                      </button>
                      <Link href={`/membres/${membre.membershipId}`} aria-label={`Accès détaillés de ${membre.nom}`} title="Accès détaillés" className={CLASSE_ICONE}>
                        <Icone titre="Accès détaillés" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
                      </Link>
                      <form action={changerStatutMembre} className="inline">
                        <input type="hidden" name="membershipId" value={membre.membershipId} />
                        <input type="hidden" name="suspendre" value={membre.statut === "suspendu" ? "0" : "1"} />
                        <button
                          type="submit"
                          className={`rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)] ${
                            membre.statut === "suspendu" ? "text-valide-600" : "text-danger-600"
                          }`}
                        >
                          {membre.statut === "suspendu" ? "Rétablir" : "Suspendre"}
                        </button>
                      </form>
                    </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Tableau>
    </>
  );
}

/**
 * Le rôle se change sur place, sans bouton de validation.
 *
 * Un « Enregistrer » par ligne ferait un tableau de boutons ; le changement
 * part au relâchement de la liste déroulante, comme partout ailleurs dans
 * l'application.
 */
function SelecteurRole({
  membre,
  roles,
}: {
  membre: LigneMembre;
  roles: RoleAttribuable[];
}) {
  const formulaire = useRef<HTMLFormElement>(null);

  // Un rôle qui n'est plus attribuable — le propriétaire, ou un rôle supprimé
  // depuis — reste affiché, sans pouvoir être repris. Sans cette option, le
  // navigateur retomberait sur la première de la liste et montrerait à ce
  // membre un rôle qui n'est pas le sien.
  const horsListe = !roles.some((role) => role.id === membre.roleId);

  return (
    <form ref={formulaire} action={changerRoleMembre}>
      <input type="hidden" name="membershipId" value={membre.membershipId} />
      <select
        name="roleId"
        defaultValue={membre.roleId}
        onChange={() => formulaire.current?.requestSubmit()}
        aria-label={`Rôle de ${membre.nom}`}
        className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-2.5 text-sm outline-none focus:border-marque-500"
      >
        {horsListe && (
          <option value={membre.roleId} disabled>
            {membre.roleNom}
          </option>
        )}
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.nom}
          </option>
        ))}
      </select>
    </form>
  );
}
