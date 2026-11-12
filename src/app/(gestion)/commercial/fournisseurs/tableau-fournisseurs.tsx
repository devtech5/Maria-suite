"use client";

import { useState, type MouseEvent } from "react";

import { ContactsTiers } from "@/components/tiers/contacts";
import { ActionsFiche } from "@/components/ui/actions-fiche";
import { Fenetre } from "@/components/ui/fenetre";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { fmt, fmtDateIso, fmtEntier } from "@/lib/format";
import { referentielPays } from "@/lib/pays";
import { changerOrigineTiers } from "@/modules/tiers/actions";
import { LIBELLE_NATURE_TIERS } from "@/modules/tiers/natures";
import { nomPays, origineDe, type OrigineTiers } from "@/modules/tiers/origine";
import type { FicheTiers } from "@/modules/tiers/requetes";

import { PAYS_CLASSES } from "../formulaire-tiers";

const LIBELLE_ORIGINE: Record<OrigineTiers, string> = { local: "Local", international: "International" };

/** Un clic sur un bouton, un lien ou le volet des contacts ne doit pas ouvrir la fiche. */
const surControle = (e: MouseEvent<HTMLElement>) => Boolean(e.target instanceof Element && e.target.closest("button, a, summary, details, input, select, textarea"));

/**
 * Le fichier fournisseurs : un tableau dont chaque ligne ouvre la fiche du
 * fournisseur dans une modale centrée — identité, origine (local ou
 * international), contacts, achats, solde dû, derniers mouvements.
 */
export function TableauFournisseurs({
  fournisseurs,
  gerer,
  supprimer,
  paysEntreprise,
}: {
  fournisseurs: FicheTiers[];
  gerer: boolean;
  supprimer: boolean;
  paysEntreprise: string;
}) {
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  const ouvert = fournisseurs.find((f) => f.id === ouvertId) ?? null;

  return (
    <>
      <Tableau>
        <thead>
          <tr>
            <Th>Référence</Th>
            <Th>Fournisseur</Th>
            <Th>Origine</Th>
            <Th>Secteur</Th>
            <Th>Téléphone</Th>
            <Th>Contacts</Th>
            <Th aligne="droite">Délai</Th>
            <Th aligne="droite">Achats</Th>
            <Th aligne="droite">Solde dû</Th>
            {(gerer || supprimer) && <Th aligne="droite">Fiche</Th>}
          </tr>
        </thead>
        <tbody>
          {fournisseurs.map((f) => {
            const origine = origineDe(f.paysCode, paysEntreprise);
            return (
              <tr
                key={f.id}
                onClick={(e) => !surControle(e) && setOuvertId(f.id)}
                className={`cursor-pointer hover:bg-[var(--surface-creuse)] ${f.actif ? "" : "opacity-60"}`}
              >
                <Td chiffres>{f.code}</Td>
                <Td fort>
                  <button type="button" onClick={() => setOuvertId(f.id)} className="text-left font-semibold hover:underline" aria-label={`Ouvrir la fiche de ${f.nom}`}>
                    {f.nom}
                  </button>
                  {!f.actif && (
                    <span className="ml-1.5 align-middle">
                      <Pastille ton="alerte">En off</Pastille>
                    </span>
                  )}
                  {f.identifiantFiscal && <span className="chiffres block text-xs font-normal text-[var(--encre-faible)]">{f.identifiantFiscal}</span>}
                </Td>
                <Td>
                  <Pastille ton={origine === "local" ? "valide" : "marque"}>{LIBELLE_ORIGINE[origine]}</Pastille>
                  {origine === "international" && <span className="mt-0.5 block text-xs text-[var(--encre-faible)]">{nomPays(f.paysCode)}</span>}
                </Td>
                <Td>
                  <span className="text-xs text-[var(--encre-douce)]">{f.secteur ?? "—"}</span>
                </Td>
                <Td chiffres>{f.telephone ?? "—"}</Td>
                <Td>
                  {/* Volet repliable : le tableau reste lisible, les contacts à un clic. */}
                  <details className="group text-xs">
                    <summary className="cursor-pointer list-none text-marque-600 hover:underline">
                      {f.contacts[0] ? `${f.contacts[0].nom}${f.contacts.length > 1 ? ` +${f.contacts.length - 1}` : ""}` : gerer ? "Ajouter" : "—"}
                    </summary>
                    <div className="mt-2 w-72">
                      <ContactsTiers tiersId={f.id} contacts={f.contacts} modifiable={gerer} />
                    </div>
                  </details>
                </Td>
                <Td aligne="droite" chiffres>
                  {f.delaiLivraisonJours > 0 ? `${fmtEntier(f.delaiLivraisonJours)} j` : "—"}
                </Td>
                <Td aligne="droite" chiffres>
                  {fmt(f.achatsFournisseur)}
                </Td>
                <Td aligne="droite" chiffres fort>
                  <span className={f.duFournisseur > 0 ? "text-alerte-600" : ""}>{fmt(f.duFournisseur)}</span>
                </Td>
                {(gerer || supprimer) && (
                  <Td aligne="droite">
                    <ActionsFiche type="tiers" id={f.id} libelle={f.nom} actif={f.actif} peutGerer={gerer} peutSupprimer={supprimer} />
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
      </Tableau>

      {ouvert && (
        <Fenetre
          ouverte
          titre={ouvert.nom}
          sousTitre={`${ouvert.code} · ${LIBELLE_ORIGINE[origineDe(ouvert.paysCode, paysEntreprise)]}${ouvert.paysCode ? ` — ${nomPays(ouvert.paysCode)}` : ` — ${nomPays(paysEntreprise)}`}`}
          presentation="ample"
          onFermer={() => setOuvertId(null)}
        >
          <FicheFournisseur f={ouvert} gerer={gerer} supprimer={supprimer} paysEntreprise={paysEntreprise} />
        </Fenetre>
      )}
    </>
  );
}

function Ligne({ libelle, valeur, chiffres = false }: { libelle: string; valeur: string | null; chiffres?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-[var(--encre-faible)]">{libelle}</dt>
      <dd className={`text-right ${chiffres ? "chiffres" : ""}`}>{valeur || "—"}</dd>
    </div>
  );
}

function FicheFournisseur({ f, gerer, supprimer, paysEntreprise }: { f: FicheTiers; gerer: boolean; supprimer: boolean; paysEntreprise: string }) {
  const origine = origineDe(f.paysCode, paysEntreprise);
  const fiscal = referentielPays(f.paysCode ?? paysEntreprise);
  return (
    <div className="space-y-5 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Pastille ton={origine === "local" ? "valide" : "marque"}>{LIBELLE_ORIGINE[origine]}</Pastille>
        <Pastille>{LIBELLE_NATURE_TIERS[f.nature]}</Pastille>
        {!f.actif && <Pastille ton="alerte">En off</Pastille>}
        <span className="ml-auto">
          <ActionsFiche type="tiers" id={f.id} libelle={f.nom} actif={f.actif} peutGerer={gerer} peutSupprimer={supprimer} retour="/commercial/fournisseurs" />
        </span>
      </div>

      {gerer && <ChoixOrigine key={`${f.id}-${f.paysCode ?? ""}`} id={f.id} paysCode={f.paysCode} paysEntreprise={paysEntreprise} />}

      <div className="grid grid-cols-2 divide-x divide-[var(--filet)] rounded-xl border border-[var(--filet)]">
        <div className="p-3">
          <p className="text-xs text-[var(--encre-faible)]">Achats</p>
          <p className="chiffres mt-0.5 text-lg font-bold">{fmt(f.achatsFournisseur)} F</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-[var(--encre-faible)]">Solde dû</p>
          <p className={`chiffres mt-0.5 text-lg font-bold ${f.duFournisseur > 0 ? "text-alerte-600" : ""}`}>{fmt(f.duFournisseur)} F</p>
        </div>
      </div>

      <dl className="grid gap-x-8 sm:grid-cols-2">
        <Ligne libelle="Référence" valeur={f.code} chiffres />
        <Ligne libelle="Compte auxiliaire" valeur={f.compteFournisseur} chiffres />
        <Ligne libelle="Pays" valeur={nomPays(f.paysCode ?? paysEntreprise)} />
        <Ligne libelle="Ville" valeur={f.ville} />
        <Ligne libelle="Téléphone" valeur={f.telephone} chiffres />
        <Ligne libelle="E-mail" valeur={f.email} />
        <Ligne libelle={fiscal.identifiantFiscalLong} valeur={f.identifiantFiscal} chiffres />
        <Ligne libelle="Secteur" valeur={f.secteur} />
        <Ligne libelle="Délai de livraison" valeur={f.delaiLivraisonJours > 0 ? `${fmtEntier(f.delaiLivraisonJours)} jours` : null} chiffres />
        <Ligne libelle="Adresse" valeur={f.adresse} />
      </dl>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">Contacts</h3>
        <ContactsTiers key={f.id} tiersId={f.id} contacts={f.contacts} modifiable={gerer} />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-[var(--encre-faible)]">Derniers mouvements</h3>
        {f.mouvements.length === 0 ? (
          <p className="text-[var(--encre-faible)]">Aucune écriture sur ce compte.</p>
        ) : (
          <ul className="divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)]">
            {f.mouvements.map((m) => (
              <li key={`${m.numero}-${m.date}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="chiffres block truncate text-xs">{m.numero}</span>
                  <span className="block text-xs text-[var(--encre-faible)]">{fmtDateIso(m.date)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {m.lettree ? <Pastille ton="valide">Soldé</Pastille> : m.credit > 0 ? <Pastille ton="alerte">À payer</Pastille> : null}
                  <span className="chiffres w-24 text-right font-semibold">{fmt(m.credit || m.debit)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Corriger l'origine sur la fiche : local, ou international avec son pays. */
function ChoixOrigine({ id, paysCode, paysEntreprise }: { id: string; paysCode: string | null; paysEntreprise: string }) {
  const op = useOperation();
  const [origine, setOrigine] = useState<OrigineTiers>(origineDe(paysCode, paysEntreprise));
  const [pays, setPays] = useState(paysCode ?? "");
  const modifie = origine !== origineDe(paysCode, paysEntreprise) || (origine === "international" && pays !== (paysCode ?? ""));
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--filet)] bg-[var(--surface-creuse)] p-3">
      <label className="text-sm">
        <span className="mb-1 block font-medium">Type de fournisseur</span>
        <select value={origine} onChange={(e) => setOrigine(e.target.value === "international" ? "international" : "local")} className={`${CLASSE_CHAMP_COMPACT} h-9`}>
          <option value="local">Local — {nomPays(paysEntreprise)}</option>
          <option value="international">International</option>
        </select>
      </label>
      {origine === "international" && (
        <label className="text-sm">
          <span className="mb-1 block font-medium">Pays</span>
          <select value={pays} onChange={(e) => setPays(e.target.value)} className={`${CLASSE_CHAMP_COMPACT} h-9`}>
            <option value="" disabled>
              — Choisir —
            </option>
            {PAYS_CLASSES.filter((p) => p.code !== paysEntreprise.toUpperCase()).map((p) => (
              <option key={p.code} value={p.code}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        disabled={!modifie || op.enCours}
        onClick={() => op.lancer(() => changerOrigineTiers(id, origine, pays))}
        className="h-9 rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        Enregistrer
      </button>
      {op.resultat && <Retour resultat={op.resultat} />}
    </div>
  );
}
