"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

import { IconeFichier, TEINTE_FICHIER } from "@/components/archives/icones";
import { useApercu } from "@/components/ui/apercu";
import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, CLASSE_CHAMP_COMPACT, Pastille } from "@/components/ui/primitives";
import { correspond, dansPeriode, lirePeriode, type Periode } from "@/lib/recherche";
import { ouvrirArchive, retirerArchive, verifierArchive, vignettesArchives } from "@/modules/archives/actions";
import {
  extensionDe,
  familleDe,
  heuresAvantScellement,
  LIBELLE_FAMILLE,
  libelleFormat,
  tailleLisible,
  type Famille,
} from "@/modules/archives/calcul";

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

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Abidjan" });

/** Fond de la vignette quand le fichier ne se montre pas : la teinte de sa famille, très douce. */
const FOND_FAMILLE: Record<Famille, string> = {
  pdf: "bg-danger-50",
  image: "bg-marque-50",
  texte: "bg-marque-50",
  tableur: "bg-valide-50",
  presentation: "bg-alerte-50",
  donnees: "bg-[var(--surface-creuse)]",
  compresse: "bg-or-50",
  audio: "bg-[var(--surface-creuse)]",
  video: "bg-[var(--surface-creuse)]",
  autre: "bg-[var(--surface-creuse)]",
};

const TRIS = {
  recentes: "Plus récentes",
  anciennes: "Plus anciennes",
  titre: "Titre (A → Z)",
  lourdes: "Plus lourdes",
} as const;
type Tri = keyof typeof TRIS;

function trier(liste: ArchiveAffichee[], tri: Tri): ArchiveAffichee[] {
  const copie = [...liste];
  if (tri === "anciennes") copie.sort((a, b) => a.deposeLeIso.localeCompare(b.deposeLeIso));
  else if (tri === "titre") copie.sort((a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base", numeric: true }));
  else if (tri === "lourdes") copie.sort((a, b) => b.tailleOctets - a.tailleOctets);
  else copie.sort((a, b) => b.deposeLeIso.localeCompare(a.deposeLeIso));
  return copie;
}

// ---- Vue grille ou liste : le choix de chacun, retenu par le navigateur.
type Vue = "grille" | "liste";
const CLE_VUE = "maria-archives-vue";
const abonnesVue = new Set<() => void>();
// Navigation privée : le choix vit le temps de la page.
let vueMemoire: Vue = "grille";

function abonnerVue(rappel: () => void) {
  abonnesVue.add(rappel);
  window.addEventListener("storage", rappel);
  return () => {
    abonnesVue.delete(rappel);
    window.removeEventListener("storage", rappel);
  };
}
function lireVue(): Vue {
  try {
    const v = localStorage.getItem(CLE_VUE);
    if (v === "grille" || v === "liste") return v;
  } catch {
    // Stockage indisponible.
  }
  return vueMemoire;
}
function choisirVue(v: Vue) {
  vueMemoire = v;
  try {
    localStorage.setItem(CLE_VUE, v);
  } catch {
    // Stockage indisponible : la mémoire de la page suffit.
  }
  for (const rappel of abonnesVue) rappel();
}

/**
 * Liste d'archives, dans l'espace de chacun, un dossier partagé ou en supervision.
 *
 * Le fichier s'ouvre par une URL demandée AU CLIC, jamais posée dans la page,
 * et l'ouverture est journalisée côté serveur avant que l'URL parte.
 *
 * Les vignettes ne montrent que les images que la personne a ELLE-MÊME
 * déposées : celles des autres ne se voient qu'ouvertes, donc tracées.
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
  const [famille, setFamille] = useState<Famille | null>(null);
  const [tri, setTri] = useState<Tri>("recentes");
  const [retrait, setRetrait] = useState<{ id: string; motif: string } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [vignettes, setVignettes] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const apercu = useApercu();
  const vue = useSyncExternalStore(abonnerVue, lireVue, () => "grille" as Vue);
  // Une seule horloge par rendu : toutes les lignes jugent le délai au même instant.
  const [maintenant] = useState(() => Date.now());

  const dossiers = useMemo(() => {
    const compte = new Map<string, number>();
    for (const a of archives) compte.set(a.dossier ?? "", (compte.get(a.dossier ?? "") ?? 0) + 1);
    return [...compte.entries()].sort((x, y) => x[0].localeCompare(y[0], "fr"));
  }, [archives]);

  const familles = useMemo(() => {
    const compte = new Map<Famille, number>();
    for (const a of archives) compte.set(familleDe(a.typeMime), (compte.get(familleDe(a.typeMime)) ?? 0) + 1);
    return [...compte.entries()].sort((x, y) => y[1] - x[1]);
  }, [archives]);

  // Ses propres images, demandées une fois la page affichée.
  const imagesPropres = useMemo(
    () =>
      archives
        .filter((a) => a.retireeLeIso === null && familleDe(a.typeMime) === "image" && (mode === "personnel" || a.auteurId === moi))
        .map((a) => a.id)
        .join(","),
    [archives, mode, moi],
  );
  useEffect(() => {
    if (!imagesPropres) return;
    let actif = true;
    vignettesArchives(imagesPropres.split(","))
      .then((r) => {
        if (actif) setVignettes(r);
      })
      .catch(() => {
        // Sans vignette, l'icône du format s'affiche : rien de perdu.
      });
    return () => {
      actif = false;
    };
  }, [imagesPropres]);

  // Période sur la date d'archivage, celle du dépôt qui scelle le fichier.
  const periode = lirePeriode(du, au);
  const visibles = trier(
    archives.filter(
      (a) =>
        (dossier === null || (a.dossier ?? "") === dossier) &&
        (famille === null || familleDe(a.typeMime) === famille) &&
        correspond(recherche, [
          a.titre,
          a.numero,
          a.nomFichier,
          a.dossier,
          a.dossierPartage?.nom,
          a.description,
          a.auteur,
          libelleFormat(a.typeMime),
        ]) &&
        dansPeriode(a.deposeLeIso, periode),
    ),
    tri,
  );
  const filtre = recherche.trim() !== "" || du !== "" || au !== "" || famille !== null || dossier !== null;

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

  function etatDe(a: ArchiveAffichee) {
    const heures = heuresAvantScellement(new Date(a.deposeLeIso), new Date(maintenant));
    const retiree = a.retireeLeIso !== null;
    const retirable =
      (mode === "personnel" || (mode === "dossier" && a.auteurId === moi)) && peutRetirer && !retiree && heures > 0 && retrait?.id !== a.id;
    return { heures, retiree, retirable };
  }

  function pastilleEtat(a: ArchiveAffichee) {
    const { heures, retiree } = etatDe(a);
    if (retiree) return <Pastille ton="danger">Retirée par son auteur</Pastille>;
    if (heures > 0) return <Pastille ton="alerte">Retirable encore {heures} h</Pastille>;
    return <Pastille ton="valide">Scellée</Pastille>;
  }

  function pastillesSuivi(a: ArchiveAffichee) {
    return (
      <>
        {mode === "personnel" && a.dossierPartage && <Pastille ton="marque">Dossier « {a.dossierPartage.nom} »</Pastille>}
        {mode === "personnel" && a.consultationsParAutres > 0 && (
          <Pastille ton="neutre">Ouverte {a.consultationsParAutres} fois par d&apos;autres</Pastille>
        )}
        {a.verification && (
          <Pastille ton={a.verification.etat === "conforme" ? "valide" : "danger"}>
            {a.verification.etat === "conforme" ? "Intègre" : a.verification.etat === "absent" ? "Fichier absent" : "Altérée"} au{" "}
            {MOMENT.format(new Date(a.verification.leIso)).slice(0, 10)}
          </Pastille>
        )}
      </>
    );
  }

  function boutons(a: ArchiveAffichee) {
    const { retirable } = etatDe(a);
    return (
      <>
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
        {retirable && (
          <button
            type="button"
            onClick={() => setRetrait({ id: a.id, motif: "" })}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-danger-600 hover:bg-danger-50"
          >
            Retirer
          </button>
        )}
      </>
    );
  }

  function formulaireRetrait(a: ArchiveAffichee) {
    if (retrait?.id !== a.id) return null;
    return (
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
          <button type="button" onClick={() => setRetrait(null)} className="h-cible rounded-lg px-3 text-sm text-[var(--encre-faible)] hover:underline">
            Annuler
          </button>
        </div>
      </form>
    );
  }

  const puce = (actif: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
      actif ? "bg-nuit text-white ring-2 ring-or/60" : "bg-[var(--surface-creuse)] text-[var(--encre-douce)] hover:bg-[var(--filet)]"
    }`;

  return (
    <div>
      <div className="mb-4 space-y-2.5 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <svg viewBox="0 0 20 20" aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--encre-faible)]">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={mode === "personnel" ? "Titre, numéro, fichier, rubrique, format…" : "Titre, numéro, fichier, auteur, format…"}
              aria-label="Rechercher une archive"
              className={`${CLASSE_CHAMP} pl-9`}
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-[var(--encre-faible)]">Trier</span>
            <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} aria-label="Trier les archives" className={CLASSE_CHAMP_COMPACT}>
              {(Object.keys(TRIS) as Tri[]).map((t) => (
                <option key={t} value={t}>
                  {TRIS[t]}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Affichage" className="flex rounded-lg border border-[var(--filet)] p-0.5">
            {(["grille", "liste"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => choisirVue(v)}
                aria-pressed={vue === v}
                title={v === "grille" ? "Grille avec aperçu" : "Liste détaillée"}
                className={`flex size-9 items-center justify-center rounded-md ${vue === v ? "bg-nuit text-white" : "text-[var(--encre-faible)] hover:bg-[var(--surface-creuse)]"}`}
              >
                <span className="sr-only">{v === "grille" ? "Grille" : "Liste"}</span>
                {v === "grille" ? (
                  <svg viewBox="0 0 20 20" aria-hidden className="size-4" fill="currentColor">
                    <rect x="2" y="2" width="7" height="7" rx="1.5" />
                    <rect x="11" y="2" width="7" height="7" rx="1.5" />
                    <rect x="2" y="11" width="7" height="7" rx="1.5" />
                    <rect x="11" y="11" width="7" height="7" rx="1.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" aria-hidden className="size-4" fill="currentColor">
                    <rect x="2" y="3" width="16" height="3" rx="1.2" />
                    <rect x="2" y="8.5" width="16" height="3" rx="1.2" />
                    <rect x="2" y="14" width="16" height="3" rx="1.2" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {familles.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrer par format">
            <button type="button" onClick={() => setFamille(null)} aria-pressed={famille === null} className={puce(famille === null)}>
              Tous les formats ({archives.length})
            </button>
            {familles.map(([f, n]) => (
              <button key={f} type="button" onClick={() => setFamille(f)} aria-pressed={famille === f} className={puce(famille === f)}>
                <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: TEINTE_FICHIER[f] }} />
                {LIBELLE_FAMILLE[f]} ({n})
              </button>
            ))}
          </div>
        )}

        {dossiers.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrer par rubrique">
            <button type="button" onClick={() => setDossier(null)} aria-pressed={dossier === null} className={puce(dossier === null)}>
              Toutes les rubriques
            </button>
            {dossiers.map(([nom, n]) => (
              <button key={nom} type="button" onClick={() => setDossier(nom)} aria-pressed={dossier === nom} className={puce(dossier === nom)}>
                {nom || "Sans rubrique"} ({n})
              </button>
            ))}
          </div>
        )}

        <fieldset className="flex flex-wrap items-center gap-1.5 text-sm">
          <legend className="sr-only">Archivée</legend>
          <span className="text-[var(--encre-faible)]">Archivée du</span>
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Archivée : du" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          <span className="text-[var(--encre-faible)]">au</span>
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Archivée : au" className={`${CLASSE_CHAMP_COMPACT} chiffres`} />
          <span className="chiffres ml-auto text-xs text-[var(--encre-faible)]">
            {visibles.length === archives.length ? `${archives.length} archive${archives.length > 1 ? "s" : ""}` : `${visibles.length} sur ${archives.length}`}
          </span>
          {filtre && (
            <button
              type="button"
              onClick={() => {
                setRecherche("");
                setDu("");
                setAu("");
                setFamille(null);
                setDossier(null);
              }}
              className="text-xs font-semibold text-marque-600 hover:underline"
            >
              Tout afficher
            </button>
          )}
        </fieldset>
      </div>

      {resultat && (
        <div className="mb-3">
          <Retour resultat={resultat} />
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--encre-faible)]">Aucune archive ne correspond.</p>
      ) : vue === "grille" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {visibles.map((a) => {
            const f = familleDe(a.typeMime);
            const { retiree } = etatDe(a);
            const vignette = vignettes[a.id];
            return (
              <li
                key={a.id}
                className={`group flex flex-col overflow-hidden rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm transition hover:-translate-y-0.5 hover:border-or hover:shadow-md ${
                  retiree ? "opacity-70" : ""
                } ${retrait?.id === a.id ? "col-span-2" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => ouvrir(a)}
                  disabled={enCours}
                  aria-label={`Ouvrir ${a.titre}`}
                  title={`Ouvrir ${a.nomFichier}`}
                  className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden ${vignette ? "bg-[var(--surface-creuse)]" : FOND_FAMILLE[f]}`}
                >
                  {vignette ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vignette} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />
                  ) : (
                    <IconeFichier famille={f} extension={extensionDe(a.nomFichier)} className="h-[58%] w-auto drop-shadow-sm transition duration-300 group-hover:scale-105" />
                  )}
                  <span className="absolute top-2 left-2 rounded-md bg-nuit/85 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase backdrop-blur-sm">
                    {libelleFormat(a.typeMime)}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center bg-nuit/80 py-1.5 text-xs font-semibold text-white transition group-hover:translate-y-0">
                    Aperçu
                  </span>
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                  <p className={`line-clamp-2 text-sm leading-snug font-semibold ${retiree ? "line-through decoration-1" : ""}`} title={a.titre}>
                    {a.titre}
                  </p>
                  <p className="chiffres truncate text-[11px] text-[var(--encre-faible)]" title={a.nomFichier}>
                    {a.numero} · {tailleLisible(a.tailleOctets)}
                  </p>
                  <p className="chiffres truncate text-[11px] text-[var(--encre-faible)]">
                    {JOUR.format(new Date(a.deposeLeIso))}
                    {mode !== "personnel" && ` · ${a.auteur}`}
                    {a.dossier && ` · ${a.dossier}`}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    {pastilleEtat(a)}
                    {pastillesSuivi(a)}
                  </div>
                  {(etatDe(a).retirable || mode === "supervision") && <div className="flex flex-wrap justify-end gap-1">{boutons(a)}</div>}
                  {retiree && <p className="text-[11px] text-danger-600">Motif : {a.motifRetrait}</p>}
                  {formulaireRetrait(a)}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="divide-y divide-[var(--filet)] overflow-hidden rounded-2xl border border-[var(--filet)] bg-[var(--surface)] shadow-sm">
          {visibles.map((a) => {
            const f = familleDe(a.typeMime);
            const { retiree } = etatDe(a);
            return (
              <li key={a.id} className={`px-4 py-3 transition-colors hover:bg-[var(--surface-creuse)]/40 ${retiree ? "bg-[var(--surface-creuse)]/50" : ""}`}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => ouvrir(a)}
                    disabled={enCours}
                    title={`Ouvrir ${a.nomFichier}`}
                    aria-label={`Ouvrir ${a.titre}`}
                    className="shrink-0 transition hover:scale-105"
                  >
                    <IconeFichier famille={f} extension={extensionDe(a.nomFichier)} className="h-12 w-auto" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`truncate text-sm font-semibold ${retiree ? "line-through decoration-1" : ""}`}>{a.titre}</span>
                      {pastilleEtat(a)}
                      {pastillesSuivi(a)}
                    </p>
                    <p className="chiffres mt-0.5 truncate text-xs text-[var(--encre-faible)]">
                      {a.numero} · <span className="font-semibold text-[var(--encre-douce)]">{libelleFormat(a.typeMime)}</span> · {tailleLisible(a.tailleOctets)}
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

                  <div className="flex shrink-0 flex-col items-end gap-1.5">{boutons(a)}</div>
                </div>
                {formulaireRetrait(a)}
              </li>
            );
          })}
        </ul>
      )}
      {apercu.fenetre}
    </div>
  );
}
