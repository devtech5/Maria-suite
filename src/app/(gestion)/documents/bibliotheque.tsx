"use client";

import { useMemo, useState } from "react";

import { useApercu } from "@/components/ui/apercu";
import { CLASSE_CHAMP_COMPACT, Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmtEntier } from "@/lib/format";
import { correspond, dansPeriode, lirePeriode, type Periode } from "@/lib/recherche";
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
  /** Date d'expiration `AAAA-MM-JJ`, nulle pour une pièce sans échéance. */
  expireLe: string | null;
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
export function Bibliotheque({
  documents,
  rechercheInitiale = "",
  periodeInitiale = { du: null, au: null },
}: {
  documents: DocumentAffiche[];
  /** `?q=` de l'adresse : la recherche globale y renvoie avec le mot déjà posé. */
  rechercheInitiale?: string;
  periodeInitiale?: Periode;
}) {
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [du, setDu] = useState(periodeInitiale.du ?? "");
  const [au, setAu] = useState(periodeInitiale.au ?? "");
  const [entite, setEntite] = useState<string | null>(null);
  const apercu = useApercu();

  // La période porte sur l'expiration, pas sur le dépôt : la question posée
  // devant cet écran est « que dois-je renouveler d'ici fin juin ? ». Une
  // pièce sans échéance ne répond qu'à une période vide.
  const resultats = useMemo(() => {
    const periode = lirePeriode(du, au);
    return documents.filter((doc) => {
      if (entite === NON_RATTACHE && doc.entiteType !== null) return false;
      if (entite && entite !== NON_RATTACHE && doc.entiteType !== entite) {
        return false;
      }
      return (
        correspond(recherche, [doc.nom, doc.entiteLibelle, doc.categorie]) &&
        dansPeriode(doc.expireLe, periode)
      );
    });
  }, [documents, recherche, entite, du, au]);
  const cherche = recherche.trim() !== "" || du !== "" || au !== "";

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
          aria-label="Rechercher un document"
          className="h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm outline-none focus:border-marque-500"
        />

        <fieldset className="flex flex-wrap items-center gap-1.5 text-sm">
          <legend className="sr-only">Expiration</legend>
          <span className="text-[var(--encre-faible)]">Expire du</span>
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Expiration : du" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          <span className="text-[var(--encre-faible)]">au</span>
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Expiration : au" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          {cherche && (
            <button
              type="button"
              onClick={() => {
                setRecherche("");
                setDu("");
                setAu("");
              }}
              className="text-xs font-semibold text-marque-600 hover:underline"
            >
              Tout afficher
            </button>
          )}
        </fieldset>

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
