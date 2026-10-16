"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useApercu } from "@/components/ui/apercu";
import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Pastille } from "@/components/ui/primitives";
import { correspond, dansPeriode, lirePeriode, type Periode } from "@/lib/recherche";
import { ouvrirArchive, retirerArchive, verifierArchive } from "@/modules/archives/actions";
import { familleDe, heuresAvantScellement, LIBELLE_FAMILLE, tailleLisible, type Famille } from "@/modules/archives/calcul";

export interface ArchiveAffichee {
  id: string;
  numero: string;
  titre: string;
  dossier: string | null;
  dossierPartage: { id: string; nom: string } | null;
  description: string | null;
  nomFichier: string;
  typeMime: string;
  tailleOctets: number;
  empreinte: string;
  deposeLeIso: string;
  retireeLeIso: string | null;
  motifRetrait: string | null;
  auteur: string;
  auteurId: string;
  consultationsParAutres: number;
  verification: { leIso: string; etat: string } | null;
}

const MOMENT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Abidjan",
});

const TEINTE: Record<Famille, string> = {
  pdf: "bg-danger-50 text-danger-600",
  image: "bg-marque-50 text-marque-600",
  texte: "bg-marque-50 text-marque-600",
  tableur: "bg-valide-50 text-valide-600",
  presentation: "bg-alerte-50 text-alerte-600",
  donnees: "bg-[var(--surface-creuse)] text-[var(--encre-douce)]",
  compresse: "bg-[var(--surface-creuse)] text-[var(--encre-douce)]",
  audio: "bg-alerte-50 text-alerte-600",
  video: "bg-alerte-50 text-alerte-600",
  autre: "bg-[var(--surface-creuse)] text-[var(--encre-douce)]",
};

const extension = (nom: string) => (nom.includes(".") ? nom.split(".").pop()!.slice(0, 4).toUpperCase() : "—");

/**
 * Liste d'archives, dans l'espace de chacun ou en supervision.
 *
 * Le fichier s'ouvre par une URL demandée AU CLIC, jamais posée dans la page,
 * et l'ouverture est journalisée côté serveur avant que l'URL parte.
 */
export function ListeArchives({
  archives,
  mode,
  peutRetirer = false,
  moi,
  rechercheInitiale = "",
  periodeInitiale = { du: null, au: null },
}: {
  archives: ArchiveAffichee[];
  /** personnel : son espace · dossier : un dossier partagé · supervision : tout. */
  mode: "personnel" | "dossier" | "supervision";
  peutRetirer?: boolean;
  /** Utilisateur courant : dans un dossier partagé, on ne retire que ce qu'on a déposé. */
  moi?: string;
  /** `?q=` de l'adresse : la recherche globale y renvoie avec le mot déjà posé. */
  rechercheInitiale?: string;
  periodeInitiale?: Periode;
}) {
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [du, setDu] = useState(periodeInitiale.du ?? "");
  const [au, setAu] = useState(periodeInitiale.au ?? "");
  const [dossier, setDossier] = useState<string | null>(null);
  const [retrait, setRetrait] = useState<{ id: string; motif: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const apercu = useApercu();
  // Une seule horloge par rendu : toutes les lignes jugent le délai au même instant.
  const [maintenant] = useState(() => Date.now());

  const dossiers = useMemo(() => {
    const compte = new Map<string, number>();
    for (const a of archives) compte.set(a.dossier ?? "", (compte.get(a.dossier ?? "") ?? 0) + 1);
    return [...compte.entries()].sort((x, y) => x[0].localeCompare(y[0], "fr"));
  }, [archives]);

  // Période sur la date d'archivage, celle du dépôt qui scelle le fichier.
  const periode = lirePeriode(du, au);
  const visibles = archives.filter(
    (a) =>
      (dossier === null || (a.dossier ?? "") === dossier) &&
      correspond(recherche, [a.titre, a.numero, a.nomFichier, a.dossier, a.dossierPartage?.nom, a.description, a.auteur]) &&
      dansPeriode(a.deposeLeIso, periode),
  );

  function ouvrir(a: ArchiveAffichee) {
    setResultat(null);
    apercu.ouvrir({
      titre: a.titre,
      nomFichier: a.nomFichier,
      typeMime: a.typeMime,
      signer: async () => {
        // Chaque ouverture est tracée côté serveur : la liste se remet à jour.
        const url = await ouvrirArchive(a.id);
        if (url) routeur.refresh();
        return url;
      },
    });
  }

  function lancer(action: () => Promise<Resultat>) {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      setResultat(r);
      if (r.ok) setRetrait(null);
      routeur.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 space-y-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={mode === "personnel" ? "Titre, numéro, fichier, rubrique…" : "Titre, numéro, fichier, auteur…"}
          aria-label="Rechercher une archive"
          className={CLASSE_CHAMP}
        />
        <fieldset className="flex flex-wrap items-center gap-1.5 text-sm">
          <legend className="sr-only">Archivée</legend>
          <span className="text-[var(--encre-faible)]">Archivée du</span>
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Archivée : du" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          <span className="text-[var(--encre-faible)]">au</span>
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Archivée : au" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          {(recherche.trim() !== "" || du !== "" || au !== "") && (
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
        {dossiers.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setDossier(null)}
              aria-pressed={dossier === null}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
                dossier === null ? "bg-marque-600 text-white" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"
              }`}
            >
              Tout ({archives.length})
            </button>
            {dossiers.map(([nom, n]) => (
              <button
                key={nom}
                type="button"
                onClick={() => setDossier(nom)}
                aria-pressed={dossier === nom}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
                  dossier === nom ? "bg-marque-600 text-white" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)]"
                }`}
              >
                {nom || "Sans rubrique"} ({n})
              </button>
            ))}
          </div>
        )}
      </div>

      {resultat && <div className="mb-3"><Retour resultat={resultat} /></div>}

      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Aucune archive ne correspond.</p>
      ) : (
        <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {visibles.map((a) => {
            const famille = familleDe(a.typeMime);
            const heures = heuresAvantScellement(new Date(a.deposeLeIso), new Date(maintenant));
            const retiree = a.retireeLeIso !== null;
            return (
              <li key={a.id} className={`px-4 py-3 ${retiree ? "bg-[var(--surface-creuse)]/50" : ""}`}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => ouvrir(a)}
                    disabled={enCours}
                    title={`Ouvrir ${a.nomFichier}`}
                    aria-label={`Ouvrir ${a.titre}`}
                    className={`chiffres flex size-11 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-bold hover:opacity-80 ${TEINTE[famille]}`}
                  >
                    {extension(a.nomFichier)}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`truncate text-sm font-semibold ${retiree ? "line-through decoration-1" : ""}`}>{a.titre}</span>
                      {retiree ? (
                        <Pastille ton="danger">Retirée par son auteur</Pastille>
                      ) : heures > 0 ? (
                        <Pastille ton="alerte">Retirable encore {heures} h</Pastille>
                      ) : (
                        <Pastille ton="valide">Scellée</Pastille>
                      )}
                      {mode === "personnel" && a.dossierPartage && (
                        <Pastille ton="marque">Dossier « {a.dossierPartage.nom} »</Pastille>
                      )}
                      {mode === "personnel" && a.consultationsParAutres > 0 && (
                        <Pastille ton="neutre">
                          Ouverte {a.consultationsParAutres} fois par d&apos;autres
                        </Pastille>
                      )}
                      {a.verification && (
                        <Pastille ton={a.verification.etat === "conforme" ? "valide" : "danger"}>
                          {a.verification.etat === "conforme" ? "Intègre" : a.verification.etat === "absent" ? "Fichier absent" : "Altérée"} au{" "}
                          {MOMENT.format(new Date(a.verification.leIso)).slice(0, 10)}
                        </Pastille>
                      )}
                    </p>
                    <p className="chiffres mt-0.5 truncate text-xs text-[var(--encre-faible)]">
                      {a.numero} · {LIBELLE_FAMILLE[famille]} · {tailleLisible(a.tailleOctets)}
                      {a.dossier && ` · ${a.dossier}`}
                      {mode !== "personnel" && ` · ${a.auteur}`}
                      {mode === "supervision" && a.dossierPartage && ` · dossier « ${a.dossierPartage.nom} »`} · {MOMENT.format(new Date(a.deposeLeIso))}
                    </p>
                    {a.description && <p className="mt-1 text-xs text-[var(--encre-douce)]">{a.description}</p>}
                    {retiree && (
                      <p className="mt-1 text-xs text-danger-600">
                        Retirée le {MOMENT.format(new Date(a.retireeLeIso!))} — motif : {a.motifRetrait}
                      </p>
                    )}
                    <p className="chiffres mt-1 truncate text-[10px] text-[var(--encre-faible)]" title={`SHA-256 ${a.empreinte}`}>
                      SHA-256 {a.empreinte.slice(0, 16)}…{a.empreinte.slice(-8)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {mode === "supervision" && (
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => lancer(() => verifierArchive(a.id))}
                        className="rounded-lg border border-[var(--filet)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
                      >
                        Vérifier
                      </button>
                    )}
                    {(mode === "personnel" || (mode === "dossier" && a.auteurId === moi)) &&
                      peutRetirer &&
                      !retiree &&
                      heures > 0 &&
                      retrait?.id !== a.id && (
                      <button
                        type="button"
                        onClick={() => setRetrait({ id: a.id, motif: "" })}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-50"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>

                {retrait?.id === a.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      lancer(() => retirerArchive(a.id, retrait.motif));
                    }}
                    className="mt-3 rounded-lg border border-danger-500/40 bg-danger-50 p-3"
                  >
                    <p className="mb-2 text-xs text-danger-600">
                      L&apos;archive disparaîtra de votre espace, mais l&apos;administration la conserve, avec ce motif.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        autoFocus
                        value={retrait.motif}
                        onChange={(e) => setRetrait({ id: a.id, motif: e.target.value })}
                        placeholder="Motif : mauvais fichier, doublon…"
                        aria-label="Motif du retrait"
                        className={`${CLASSE_CHAMP} min-w-0 flex-1`}
                      />
                      <button
                        type="submit"
                        disabled={enCours || retrait.motif.trim().length < 3}
                        className="h-cible rounded-lg bg-danger-500 px-3.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Retirer
                      </button>
                      <button
                        type="button"
                        onClick={() => setRetrait(null)}
                        className="h-cible rounded-lg px-3 text-sm text-[var(--encre-faible)] hover:underline"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {apercu.fenetre}
    </div>
  );
}
