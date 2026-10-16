"use client";

import { useMemo, useState } from "react";

import { useApercu } from "@/components/ui/apercu";
import { Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmtEntier } from "@/lib/format";
import { ouvrirDocument } from "@/modules/documents/actions";
import type {
  TypeEntiteDocument,
  VisibiliteDocument,
} from "@/modules/documents/schema";

export interface DocumentAffiche {
  id: string;
  nom: string;
  categorie: string | null;
  entiteType: TypeEntiteDocument | null;
  entiteLibelle: string | null;
  visibilite: VisibiliteDocument;
  avecFichier: boolean;
  nomFichier: string | null;
  tailleOctets: number | null;
  joursAvantExpiration: number | null;
  deposeLeIso: string;
}

const LIBELLE_ENTITE: Record<TypeEntiteDocument, string> = {
  tiers: "Client ou fournisseur",
  employe: "Salarié",
  intervenant: "Intervenant",
  actif: "Actif",
  article: "Article",
  vente: "Vente",
  ecriture: "Écriture",
  contrat: "Contrat",
  mission: "Mission",
  organisation: "Entreprise",
};

const LIBELLE_VISIBILITE: Record<VisibiliteDocument, string> = {
  prive: "Privé",
  restreint: "Restreint",
  equipe: "Toute l'équipe",
};

const TON_VISIBILITE: Record<VisibiliteDocument, TonPastille> = {
  prive: "danger",
  restreint: "alerte",
  equipe: "neutre",
};

const NON_RATTACHE = "aucun";

/** Taille lisible. Les kilo-octets suffisent : c'est un ordre de grandeur. */
function taille(octets: number | null): string {
  if (octets === null) return "—";
  if (octets >= 1024 * 1024) {
    return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
  }
  return `${fmtEntier(Math.max(1, Math.round(octets / 1024)))} Ko`;
}

/**
 * Bibliothèque.
 *
 * Le filtre porte sur le rattachement, pas sur des dossiers. Un arbre de
 * dossiers oblige à décider où ranger un contrat qui concerne à la fois un
 * client et un actif ; le rattachement à l'entité répond à la seule question
 * qu'on se pose réellement devant l'écran : « quels papiers ai-je sur ce
 * client, ce véhicule, cet employé ? »
 */
export function Bibliotheque({ documents }: { documents: DocumentAffiche[] }) {
  const [recherche, setRecherche] = useState("");
  const [entite, setEntite] = useState<string | null>(null);
  const apercu = useApercu();

  const resultats = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return documents.filter((doc) => {
      if (entite === NON_RATTACHE && doc.entiteType !== null) return false;
      if (entite && entite !== NON_RATTACHE && doc.entiteType !== entite) {
        return false;
      }
      if (!terme) return true;
      return (
        doc.nom.toLowerCase().includes(terme) ||
        (doc.entiteLibelle ?? "").toLowerCase().includes(terme) ||
        (doc.categorie ?? "").toLowerCase().includes(terme)
      );
    });
  }, [documents, recherche, entite]);

  // Seules les entités effectivement représentées sont proposées au filtre.
  const entitesPresentes = useMemo(() => {
    const compte = new Map<string, number>();
    for (const doc of documents) {
      const cle = doc.entiteType ?? NON_RATTACHE;
      compte.set(cle, (compte.get(cle) ?? 0) + 1);
    }
    return [...compte.entries()].sort((a, b) => b[1] - a[1]);
  }, [documents]);

  /**
   * L'URL est demandée AU CLIC, jamais rendue dans la page.
   *
   * Une adresse signée posée dans le HTML resterait valable pour quiconque
   * retrouve la page en cache — alors que ce module existe précisément pour que
   * les pièces personnelles ne circulent pas.
   */
  function ouvrir(doc: DocumentAffiche) {
    apercu.ouvrir({ titre: doc.nom, nomFichier: doc.nomFichier, signer: () => ouvrirDocument(doc.id) });
  }

  return (
    <>
      <div className="mb-4 space-y-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom du document, client, véhicule, employé…"
          className="h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm outline-none focus:border-marque-500"
        />

        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setEntite(null)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
              entite === null
                ? "bg-marque-600 text-white"
                : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"
            }`}
          >
            Tout ({documents.length})
          </button>

          {entitesPresentes.map(([type, nombre]) => (
            <button
              key={type}
              type="button"
              onClick={() => setEntite(type)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
                entite === type
                  ? "bg-marque-600 text-white"
                  : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"
              }`}
            >
              {type === NON_RATTACHE
                ? "Sans rattachement"
                : LIBELLE_ENTITE[type as TypeEntiteDocument]}{" "}
              ({nombre})
            </button>
          ))}
        </div>
      </div>

      {resultats.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">
          Aucun document ne correspond.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {resultats.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <button
                type="button"
                onClick={() => doc.avecFichier && ouvrir(doc)}
                disabled={!doc.avecFichier}
                title={
                  doc.avecFichier
                    ? "Ouvrir la pièce"
                    : "Fiche sans pièce jointe : l'original est ailleurs"
                }
                className={`chiffres flex size-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                  doc.avecFichier
                    ? "bg-marque-50 text-marque-600 hover:bg-marque-100"
                    : "bg-[var(--surface-creuse)] text-[var(--encre-faible)]"
                }`}
              >
                {doc.avecFichier ? "PJ" : "—"}
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.nom}</p>
                <p className="truncate text-xs text-[var(--encre-faible)]">
                  {/* Le rattachement d'abord : c'est l'information qui sert. */}
                  {doc.entiteType
                    ? `${LIBELLE_ENTITE[doc.entiteType]} · ${doc.entiteLibelle ?? "—"}`
                    : "Sans rattachement"}
                  {doc.categorie && ` · ${doc.categorie}`}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {doc.joursAvantExpiration !== null && (
                  <Pastille
                    ton={
                      doc.joursAvantExpiration < 0
                        ? "danger"
                        : doc.joursAvantExpiration <= 30
                          ? "alerte"
                          : "neutre"
                    }
                  >
                    {doc.joursAvantExpiration < 0
                      ? "Expiré"
                      : `Expire dans ${doc.joursAvantExpiration} j`}
                  </Pastille>
                )}

                <Pastille ton={TON_VISIBILITE[doc.visibilite]}>
                  {LIBELLE_VISIBILITE[doc.visibilite]}
                </Pastille>

                <span className="chiffres w-20 text-right text-xs text-[var(--encre-faible)]">
                  {taille(doc.tailleOctets)}
                </span>

                <span className="chiffres w-24 text-right text-xs text-[var(--encre-faible)]">
                  {doc.deposeLeIso}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {apercu.fenetre}
    </>
  );
}
