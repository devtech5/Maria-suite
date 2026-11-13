"use client";

import { useState } from "react";
import Link from "next/link";

import { CLASSE_CHAMP, Pastille, type TonPastille } from "@/components/ui/primitives";
import { correspond } from "@/lib/recherche";
import { dateEnLettres } from "@/modules/documents/courriers-calcul";
import { LIBELLE_STATUT, LIBELLE_TYPE_COURT, referencePv, type StatutPv, type TypePv } from "@/modules/pv/regles";

export interface LignePvAffichee {
  id: string;
  numero: string | null;
  revision: number;
  type: TypePv;
  statut: StatutPv;
  objet: string;
  dateSeance: string;
  redacteur: string;
  redigeParUserId: string;
  accuseRequis: boolean;
  confidentiel: boolean;
  destinataire: boolean;
  luLeIso: string | null;
  remplace: boolean;
  aSigner: boolean;
  participant: boolean;
}

type Onglet = "recus" | "redaction" | "a_valider" | "tous";

const TON_STATUT: Record<StatutPv, TonPastille> = { brouillon: "neutre", a_valider: "alerte", publie: "valide" };

/** La liste des PV, en onglets, avec recherche sur l'objet, le numéro et le rédacteur. */
export function ListePv({ liste, moi, valideur, ongletInitial }: { liste: LignePvAffichee[]; moi: string; valideur: boolean; ongletInitial?: string }) {
  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: "recus", libelle: "Diffusés à moi" },
    { cle: "redaction", libelle: "Mes rédactions" },
    ...(valideur ? ([{ cle: "a_valider", libelle: "À valider" }, { cle: "tous", libelle: "Tous" }] as const) : []),
  ];
  // L'onglet utile d'abord : ce qui attend la direction, sinon ce qu'on m'a diffusé, sinon ce que je rédige.
  const ongletParDefaut = (): Onglet => {
    if (onglets.some((o) => o.cle === ongletInitial)) return ongletInitial as Onglet;
    if (valideur && liste.some((l) => l.statut === "a_valider")) return "a_valider";
    if (liste.some((l) => l.statut === "publie" && (l.destinataire || l.participant))) return "recus";
    if (liste.some((l) => l.redigeParUserId === moi)) return "redaction";
    return valideur ? "tous" : "recus";
  };
  const [onglet, setOnglet] = useState<Onglet>(ongletParDefaut);
  const [recherche, setRecherche] = useState("");

  const dans = (l: LignePvAffichee, o: Onglet) =>
    o === "recus" ? l.statut === "publie" && (l.destinataire || l.participant) : o === "redaction" ? l.redigeParUserId === moi : o === "a_valider" ? l.statut === "a_valider" : true;
  const visibles = liste.filter((l) => dans(l, onglet) && correspond(recherche, [l.objet, l.numero, l.redacteur, LIBELLE_TYPE_COURT[l.type]]));

  return (
    <div>
      <nav aria-label="Onglets" className="mb-3 flex gap-1 overflow-x-auto border-b border-[var(--filet)] pb-2">
        {onglets.map((o) => {
          const n = liste.filter((l) => dans(l, o.cle)).length;
          return (
            <button
              key={o.cle}
              type="button"
              aria-pressed={onglet === o.cle}
              onClick={() => setOnglet(o.cle)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                onglet === o.cle ? "bg-[var(--surface-creuse)] text-[var(--encre)]" : "text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
              }`}
            >
              {o.libelle} <span className="text-xs text-[var(--encre-faible)]">({n})</span>
            </button>
          );
        })}
      </nav>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un objet, un numéro, un rédacteur…"
        aria-label="Rechercher un procès-verbal"
        className={`${CLASSE_CHAMP} mb-3`}
      />
      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">
          {recherche ? "Aucun procès-verbal ne répond à cette recherche." : onglet === "recus" ? "Aucun procès-verbal ne vous a encore été diffusé." : "Rien ici pour l'instant."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {visibles.map((l) => {
            const aLire = l.statut === "publie" && l.destinataire && l.accuseRequis && !l.luLeIso && !l.remplace;
            return (
              <li key={l.id}>
                <Link href={`/pv/${l.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--surface-creuse)]">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${l.remplace ? "text-[var(--encre-faible)]" : ""}`}>{l.objet}</span>
                    <span className="chiffres block text-xs text-[var(--encre-faible)]">
                      {referencePv(l.numero, l.revision)} · {LIBELLE_TYPE_COURT[l.type]} · {dateEnLettres(l.dateSeance)} · {l.redacteur}
                    </span>
                  </span>
                  {l.confidentiel && <Pastille ton="danger">Confidentiel</Pastille>}
                  {l.remplace && <Pastille ton="neutre">Remplacé</Pastille>}
                  {l.aSigner && !l.remplace && <Pastille ton="alerte">À signer</Pastille>}
                  {aLire && <Pastille ton="alerte">À lire</Pastille>}
                  {l.statut === "publie" && l.destinataire && l.luLeIso && <Pastille ton="valide">Lu</Pastille>}
                  {l.statut !== "publie" && <Pastille ton={TON_STATUT[l.statut]}>{LIBELLE_STATUT[l.statut]}</Pastille>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
