"use client";

import { useState } from "react";

import { confirmer } from "@/components/ui/dialogues";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { enregistrerContact, retirerContact } from "@/modules/tiers/actions-contacts";

export interface Contact {
  id: string;
  nom: string;
  fonction: string | null;
  telephone: string | null;
  email: string | null;
  principal: boolean;
  notes: string | null;
}

const VIDE = { nom: "", fonction: "", telephone: "", email: "", principal: false, notes: "" };

/**
 * Contacts d'un tiers : les personnes physiques derrière l'entreprise. Le
 * principal est proposé par défaut sur les devis, factures et bons de commande.
 */
export function ContactsTiers({ tiersId, contacts, modifiable }: { tiersId: string; contacts: Contact[]; modifiable: boolean }) {
  const op = useOperation();
  const [edition, setEdition] = useState<{ id: string | null; f: typeof VIDE } | null>(null);
  const maj = (champ: Partial<typeof VIDE>) => setEdition((e) => (e ? { ...e, f: { ...e.f, ...champ } } : e));

  return (
    <div>
      {contacts.length === 0 && !edition && <p className="text-sm text-[var(--encre-faible)]">Aucun contact.</p>}
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{c.nom}</span>
              {c.principal && <span className="ml-1.5 rounded bg-marque-50 px-1.5 py-0.5 text-[10px] font-semibold text-marque-600">principal</span>}
              {c.fonction && <span className="block text-xs text-[var(--encre-douce)]">{c.fonction}</span>}
              <span className="block text-xs text-[var(--encre-faible)]">
                {[c.telephone, c.email].filter(Boolean).map((x, i) =>
                  x === c.telephone ? (
                    <a key={i} href={`tel:${c.telephone!.replace(/\s/g, "")}`} className="mr-2 hover:underline">
                      {x}
                    </a>
                  ) : (
                    <a key={i} href={`mailto:${c.email}`} className="mr-2 hover:underline">
                      {x}
                    </a>
                  ),
                )}
              </span>
            </span>
            {modifiable && (
              <span className="flex shrink-0 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEdition({ id: c.id, f: { nom: c.nom, fonction: c.fonction ?? "", telephone: c.telephone ?? "", email: c.email ?? "", principal: c.principal, notes: c.notes ?? "" } })}
                  className="text-marque-600 hover:underline"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  disabled={op.enCours}
                  onClick={async () => (await confirmer(`Retirer ${c.nom} des contacts ?`)) && op.lancer(() => retirerContact(c.id))}
                  className="text-[var(--encre-faible)] hover:underline"
                >
                  Retirer
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {modifiable && !edition && (
        <button type="button" onClick={() => setEdition({ id: null, f: { ...VIDE, principal: contacts.length === 0 } })} className="mt-2 text-sm font-semibold text-marque-600 hover:underline">
          + Ajouter un contact
        </button>
      )}

      {edition && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(
              () =>
                enregistrerContact(tiersId, edition.id, {
                  nom: edition.f.nom,
                  fonction: edition.f.fonction || null,
                  telephone: edition.f.telephone || null,
                  email: edition.f.email || null,
                  principal: edition.f.principal,
                  notes: edition.f.notes || null,
                }),
              () => setEdition(null),
            );
          }}
          className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)] p-3 text-xs"
        >
          <input required placeholder="Nom et prénoms" value={edition.f.nom} onChange={(e) => maj({ nom: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} col-span-2 h-9`} />
          <input placeholder="Fonction (achats, comptabilité…)" value={edition.f.fonction} onChange={(e) => maj({ fonction: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} col-span-2 h-9`} />
          <input placeholder="Téléphone" inputMode="tel" value={edition.f.telephone} onChange={(e) => maj({ telephone: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} h-9`} />
          <input placeholder="E-mail" type="email" value={edition.f.email} onChange={(e) => maj({ email: e.target.value })} className={`${CLASSE_CHAMP_COMPACT} h-9`} />
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={edition.f.principal} onChange={(e) => maj({ principal: e.target.checked })} />
            Contact principal, proposé par défaut sur les pièces
          </label>
          <div className="col-span-2 flex justify-end gap-3">
            <button type="button" onClick={() => setEdition(null)} className="text-[var(--encre-faible)] hover:underline">
              Fermer
            </button>
            <button type="submit" disabled={op.enCours} className="h-8 rounded-lg bg-marque-600 px-3 font-semibold text-white disabled:opacity-50">
              {op.enCours ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
      {op.resultat && (
        <div className="mt-2">
          <Retour resultat={op.resultat} />
        </div>
      )}
    </div>
  );
}
