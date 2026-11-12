"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ActionsFiche } from "@/components/ui/actions-fiche";
import { Pastille } from "@/components/ui/primitives";
import { fmt, fmtDateIso } from "@/lib/format";
import { ContactsTiers } from "@/components/tiers/contacts";
import { correspond } from "@/lib/recherche";
import { changerNatureTiers } from "@/modules/tiers/actions";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS, estNatureTiers, estPersonneMorale, type NatureTiers } from "@/modules/tiers/natures";
import type { FicheTiers } from "@/modules/tiers/requetes";
import { Retour, useOperation } from "@/components/ui/operations";

/**
 * Fichier clients avec panneau latéral.
 *
 * Le panneau est le seul emprunt franc au concurrent : sélectionner un client
 * ouvre son historique et ses actions sans quitter la liste. Sur un fichier de
 * plusieurs centaines de tiers, cela évite l'aller-retour permanent entre la
 * liste et la fiche.
 *
 * Les données viennent du serveur, déjà agrégées. Ce composant ne calcule
 * aucun solde : encours et facturé sont la conséquence des écritures, et se
 * déduisent là où les écritures sont — pas dans le navigateur.
 */
export function ListeClients({
  clients,
  modifiable = false,
  supprimable = false,
  rechercheInitiale = "",
}: {
  clients: FicheTiers[];
  modifiable?: boolean;
  supprimable?: boolean;
  /** `?q=` de l'adresse : la recherche globale renvoie ici avec le nom cherché. */
  rechercheInitiale?: string;
}) {
  const [recherche, setRecherche] = useState(rechercheInitiale);
  // Filtre par type : savoir d'un coup d'œil à qui l'on a affaire.
  const [type, setType] = useState<NatureTiers | null>(null);
  // Arrivé par lien sur un client précis, c'est sa fiche qui s'ouvre, pas celle du premier du fichier.
  const [selectionId, setSelectionId] = useState<string | null>(
    () => (clients.find((client) => correspond(rechercheInitiale, champs(client))) ?? clients[0])?.id ?? null,
  );

  // Même normalisation que la recherche globale : sans accents, tous les mots requis.
  const resultats = useMemo(
    () => clients.filter((client) => (type === null || client.nature === type) && correspond(recherche, champs(client))),
    [recherche, clients, type],
  );

  const selection =
    resultats.find((client) => client.id === selectionId) ?? resultats[0] ?? null;

  const parType = useMemo(() => {
    const comptes = new Map<NatureTiers, number>();
    for (const client of clients) comptes.set(client.nature, (comptes.get(client.nature) ?? 0) + 1);
    return comptes;
  }, [clients]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,380px)]">
      {/* ------------------------------------------------------- la liste */}
      <div className="min-w-0">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          type="search"
          aria-label="Rechercher un client"
          placeholder="Nom, référence, téléphone, ville, contact ou numéro de compte contribuable"
          className="h-cible mb-3 w-full rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm outline-none focus:border-marque-500"
        />

        <div role="group" aria-label="Filtrer par type de client" className="mb-3 flex flex-wrap gap-1.5">
          <BoutonType actif={type === null} onClick={() => setType(null)} libelle="Tous" nombre={clients.length} />
          {NATURES_TIERS.filter((n) => parType.has(n)).map((n) => (
            <BoutonType key={n} actif={type === n} onClick={() => setType(n)} libelle={LIBELLE_NATURE_TIERS[n]} nombre={parType.get(n) ?? 0} />
          ))}
        </div>

        <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {resultats.map((client) => {
            const actif = selection?.id === client.id;
            return (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => setSelectionId(client.id)}
                  aria-current={actif ? "true" : undefined}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                    actif ? "bg-[var(--surface-creuse)]" : "hover:bg-[var(--surface-creuse)]"
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marque-600 text-sm font-bold text-white">
                    {client.nom.charAt(0)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${client.actif ? "" : "text-[var(--encre-faible)] line-through"}`}>
                      {client.nom}
                    </span>
                    <span className="chiffres block truncate text-xs text-[var(--encre-faible)]">
                      {LIBELLE_NATURE_TIERS[client.nature]} · {client.telephone ?? client.code}
                    </span>
                  </span>

                  {client.encoursClient > 0 && (
                    <span className="shrink-0 text-right">
                      <span
                        className={`chiffres block text-sm font-semibold ${
                          depasse(client) ? "text-danger-600" : "text-alerte-600"
                        }`}
                      >
                        {fmt(client.encoursClient)}
                      </span>
                      <span className="block text-[11px] text-[var(--encre-faible)]">
                        encours
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {resultats.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--encre-faible)]">
            Aucun client ne correspond.
          </p>
        )}
      </div>

      {/* ----------------------------------------------------- le panneau */}
      {selection && (
        <aside className="h-fit rounded-xl border border-[var(--filet)] bg-[var(--surface)] lg:sticky lg:top-6">
          <header className="border-b border-[var(--filet)] p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold leading-snug">{selection.nom}</h2>
              <span className="flex shrink-0 gap-1">
                {!selection.actif && <Pastille ton="alerte">En off</Pastille>}
                <Pastille ton="marque">{LIBELLE_NATURE_TIERS[selection.nature]}</Pastille>
              </span>
            </div>

            <div className="mt-2">
              <ActionsFiche
                key={selection.id}
                type="tiers"
                id={selection.id}
                libelle={selection.nom}
                actif={selection.actif}
                peutGerer={modifiable}
                peutSupprimer={supprimable}
              />
            </div>

            {modifiable && <ChoixType key={`${selection.id}-${selection.nature}`} id={selection.id} nature={selection.nature} />}

            <dl className="mt-3 space-y-1.5 text-sm">
              <Ligne libelle="Référence" valeur={selection.code} chiffres />
              <Ligne libelle="Téléphone" valeur={selection.telephone} chiffres />
              {selection.email && <Ligne libelle="E-mail" valeur={selection.email} />}
              <Ligne libelle="Ville" valeur={selection.ville} />
              {/* Identifiant fiscal ivoirien. Le libellé suit le pays de
                  l'entreprise : jamais « NINEA » codé en dur. */}
              <Ligne
                libelle="N° compte contribuable"
                valeur={selection.identifiantFiscal}
                chiffres
              />
              <Ligne libelle="Compte auxiliaire" valeur={selection.compteClient} chiffres />
              {selection.delaiReglementJours > 0 && (
                <Ligne
                  libelle="Délai de règlement"
                  valeur={`${selection.delaiReglementJours} jours`}
                  chiffres
                />
              )}
            </dl>
          </header>

          <div className="grid grid-cols-2 divide-x divide-[var(--filet)] border-b border-[var(--filet)]">
            <div className="p-4">
              <p className="text-xs text-[var(--encre-faible)]">Facturé</p>
              <p className="chiffres mt-0.5 text-lg font-bold">
                {fmt(selection.factureClient)}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-[var(--encre-faible)]">Encours</p>
              <p
                className={`chiffres mt-0.5 text-lg font-bold ${
                  depasse(selection)
                    ? "text-danger-600"
                    : selection.encoursClient > 0
                      ? "text-alerte-600"
                      : ""
                }`}
              >
                {fmt(selection.encoursClient)}
              </p>
              {/* Un encours au-delà du plafond n'est pas une statistique :
                  c'est une décision à prendre avant la prochaine livraison. */}
              {depasse(selection) && (
                <p className="mt-0.5 text-[11px] font-medium text-danger-600">
                  Plafond {fmt(selection.plafondEncours)} dépassé
                </p>
              )}
            </div>
          </div>

          {estPersonneMorale(selection.nature) && (
            <div className="border-b border-[var(--filet)] p-4">
              <h3 className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">Contacts</h3>
              <ContactsTiers key={selection.id} tiersId={selection.id} contacts={selection.contacts} modifiable={modifiable} />
            </div>
          )}

          <div className="p-4">
            <h3 className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">
              Derniers mouvements
            </h3>

            {selection.mouvements.length === 0 ? (
              <p className="text-sm text-[var(--encre-faible)]">
                Aucune écriture sur ce compte.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {selection.mouvements.map((mouvement) => (
                  <li
                    key={`${mouvement.numero}-${mouvement.date}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="chiffres block truncate text-xs">
                        {mouvement.numero}
                      </span>
                      <span className="block text-xs text-[var(--encre-faible)]">
                        {fmtDateIso(mouvement.date)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {/* « Soldé » : la ligne est rapprochée de ce qui la compense
                          (règlement, avoir). Une facture non soldée reste
                          « À régler » ; un règlement isolé n'a pas d'étiquette. */}
                      {mouvement.lettree ? (
                        <Pastille ton="valide">Soldé</Pastille>
                      ) : mouvement.debit > 0 ? (
                        <Pastille ton="alerte">À régler</Pastille>
                      ) : null}
                      <span className="chiffres w-24 text-right font-semibold">
                        {fmt(mouvement.debit || mouvement.credit)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              <Link
                href={`/commercial/factures?nouvelle=devis&client=${selection.id}`}
                className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]"
              >
                Devis
              </Link>
              <Link
                href={`/commercial/factures?nouvelle=facture&client=${selection.id}`}
                className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
              >
                Facture
              </Link>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

/** Ce que la recherche lit d'une fiche client. */
function champs(client: FicheTiers): (string | null)[] {
  return [
    client.nom,
    client.code,
    client.telephone,
    client.email,
    client.ville,
    client.identifiantFiscal,
    LIBELLE_NATURE_TIERS[client.nature],
    ...client.contacts.map((contact) => contact.nom),
  ];
}

/** L'encours dépasse-t-il le crédit accordé ? Sans plafond, rien à dépasser. */
function depasse(client: FicheTiers): boolean {
  return client.plafondEncours > 0 && client.encoursClient > client.plafondEncours;
}

function Ligne({
  libelle,
  valeur,
  chiffres = false,
}: {
  libelle: string;
  valeur: string | null;
  chiffres?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--encre-faible)]">{libelle}</dt>
      <dd className={`text-right ${chiffres ? "chiffres" : "truncate"}`}>
        {valeur ?? "—"}
      </dd>
    </div>
  );
}

function BoutonType({ actif, onClick, libelle, nombre }: { actif: boolean; onClick: () => void; libelle: string; nombre: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        actif ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--filet)] bg-[var(--surface)] hover:bg-[var(--surface-creuse)]"
      }`}
    >
      {libelle} <span className="chiffres opacity-80">{nombre}</span>
    </button>
  );
}

/** Le type se corrige sur la fiche : un fichier repris classe tout en entreprise. */
function ChoixType({ id, nature }: { id: string; nature: NatureTiers }) {
  const op = useOperation();
  return (
    <div className="mt-3">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[var(--encre-faible)]">Type de client</span>
        <select
          defaultValue={nature}
          disabled={op.enCours}
          onChange={(e) => {
            const choisi = e.target.value;
            if (estNatureTiers(choisi)) op.lancer(() => changerNatureTiers(id, choisi));
          }}
          className="h-9 rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-2 text-sm"
        >
          {NATURES_TIERS.map((n) => (
            <option key={n} value={n}>
              {LIBELLE_NATURE_TIERS[n]}
            </option>
          ))}
        </select>
      </label>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
    </div>
  );
}
