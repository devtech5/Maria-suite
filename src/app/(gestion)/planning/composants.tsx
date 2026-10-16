"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Retour, useOperation } from "@/components/ui/operations";
import { Champ, CLASSE_CHAMP, CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { enregistrerCreneau, enregistrerHoraires, poserStatut, supprimerCreneau, terminerStatut } from "@/modules/planning/actions";
import { DUREES_RAPIDES, LIBELLES_JOURS, LISTE_STATUTS, minutesEnHeure, STATUTS, type Bloc, type CleDuree, type Origine, type StatutPlanning } from "@/modules/planning/calcul";
import { libelleOrigine, SOURCES } from "@/modules/planning/deduites";

// ------------------------------------------------------------- pastille

export function PastilleStatut({ libelle, couleur, petite = false }: { libelle: string; couleur: string; petite?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--surface-creuse)] font-semibold ${petite ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: couleur }} />
      {libelle}
    </span>
  );
}

// ---------------------------------------------------------- choix membre

/** Pour l'encadrement : changer la personne dont on tient le planning. */
export function ChoixMembre({ membres, actuel, moi, base }: { membres: { userId: string; nom: string }[]; actuel: string; moi: string; base: string }) {
  const routeur = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--encre-douce)]">Planning de</span>
      <select
        value={actuel}
        onChange={(e) => routeur.push(e.target.value === moi ? base : `${base}?pour=${e.target.value}`)}
        className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3 text-sm outline-none focus:border-marque-500"
      >
        {membres.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.userId === moi ? `${m.nom} (moi)` : m.nom}
          </option>
        ))}
      </select>
    </label>
  );
}

// --------------------------------------------------------- statut actuel

export interface EtatAffiche {
  libelle: string;
  couleur: string;
  /** Déjà formaté : « 18:00 » ou « mar. 07/10 à 08:00 ». */
  jusqua: string | null;
  source: "creneau" | "deduite" | "horaires" | "aucune";
  lieu: string | null;
  origine: Origine | null;
}

export function CarteStatut({ etat, pourUserId, nom }: { etat: EtatAffiche; pourUserId: string | null; nom: string | null }) {
  const [duree, setDuree] = useState<CleDuree>("1h");
  const [lieu, setLieu] = useState("");
  const { resultat, enCours, lancer } = useOperation();
  const pour = pourUserId ?? undefined;

  return (
    <section className="mb-5 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="size-4 shrink-0 rounded-full ring-4 ring-[var(--surface-creuse)]" style={{ background: etat.couleur }} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--encre-faible)]">{nom ? `Statut de ${nom}, maintenant` : "Mon statut, maintenant"}</p>
          <p className="text-lg font-semibold leading-tight">{etat.libelle}</p>
          <p className="text-sm text-[var(--encre-douce)]">
            {etat.jusqua ? (etat.source === "horaires" && etat.libelle !== "Disponible" ? `Reprise ${etat.jusqua}` : `Jusqu'à ${etat.jusqua}`) : etat.source === "aucune" ? "Aucun horaire ni statut déclaré." : ""}
            {etat.lieu && ` · ${etat.lieu}`}
          </p>
          {etat.origine && <p className="mt-0.5 text-xs text-[var(--encre-faible)]">D&apos;après {libelleOrigine(etat.origine)}</p>}
        </div>
        {etat.origine?.lien && (
          <Link href={etat.origine.lien} className="flex h-cible items-center rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]">
            {SOURCES[etat.origine.source].ouvrir}
          </Link>
        )}
        {etat.source === "creneau" && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => lancer(() => terminerStatut(pour))}
            className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50"
          >
            {nom ? "Lever ce statut" : "Je suis de retour"}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--filet)] pt-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Nouveau statut, pour</legend>
          <div className="flex flex-wrap gap-1">
            {DUREES_RAPIDES.map((d) => (
              <button
                key={d.cle}
                type="button"
                onClick={() => setDuree(d.cle)}
                aria-pressed={duree === d.cle}
                className={`h-9 rounded-lg px-3 text-sm ${duree === d.cle ? "bg-marque-600 font-semibold text-white" : "border border-[var(--filet)] hover:bg-[var(--surface-creuse)]"}`}
              >
                {d.libelle}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="min-w-48 flex-1">
          <span className="mb-1.5 block text-sm font-medium">Où (facultatif)</span>
          <input value={lieu} onChange={(e) => setLieu(e.target.value)} maxLength={160} placeholder="Chantier Cocody, banque, client…" className={`${CLASSE_CHAMP} h-9`} />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {LISTE_STATUTS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={enCours}
            onClick={() => lancer(() => poserStatut(s, duree, pour, lieu.trim() || undefined), () => setLieu(""))}
            className="flex h-cible items-center gap-2 rounded-lg border border-[var(--filet)] px-3 text-left text-sm hover:bg-[var(--surface-creuse)] disabled:opacity-50"
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: STATUTS[s].couleur }} />
            <span className="truncate">{STATUTS[s].libelle}</span>
          </button>
        ))}
      </div>
      <Retour resultat={resultat} />
    </section>
  );
}

// -------------------------------------------------------------- semaine

export interface CreneauAffiche {
  id: string;
  statut: StatutPlanning;
  jourDebut: string;
  heureDebut: string;
  jourFin: string;
  heureFin: string;
  lieu: string | null;
  note: string | null;
}

export interface JourAffiche {
  jour: string;
  titre: string;
  aujourdhui: boolean;
  horaires: string | null;
  blocs: Bloc[];
}

type Edition = { mode: "nouveau"; jour: string } | { mode: "modifier"; creneau: CreneauAffiche };

export function Semaine({ jours, creneaux, pourUserId }: { jours: JourAffiche[]; creneaux: CreneauAffiche[]; pourUserId: string | null }) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const aujourdhui = jours.find((j) => j.aujourdhui)?.jour ?? jours[0].jour;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Créneaux de la semaine</h2>
          <p className="text-xs text-[var(--encre-faible)]">Congés accordés, missions et réunions s&apos;ajoutent d&apos;eux-mêmes, en pointillé ; ils se corrigent dans leur module.</p>
        </div>
        <button
          type="button"
          onClick={() => setEdition({ mode: "nouveau", jour: aujourdhui })}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          Nouveau créneau
        </button>
      </div>

      {edition && (
        <FormulaireCreneau
          key={edition.mode === "modifier" ? edition.creneau.id : `n-${edition.jour}`}
          edition={edition}
          pourUserId={pourUserId}
          fermer={() => setEdition(null)}
        />
      )}

      <div className="grid gap-2 md:grid-cols-7">
        {jours.map((j) => (
          <div
            key={j.jour}
            className={`flex min-h-36 flex-col rounded-xl border bg-[var(--surface)] p-2 ${j.aujourdhui ? "border-marque-500 ring-1 ring-marque-500" : "border-[var(--filet)]"}`}
          >
            <div className="mb-1.5 flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className={`text-sm font-semibold capitalize ${j.aujourdhui ? "text-marque-600" : ""}`}>{j.titre}</p>
                <p className="truncate text-[11px] text-[var(--encre-faible)]" title={j.horaires ?? undefined}>
                  {j.horaires ?? "Pas d'horaires"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEdition({ mode: "nouveau", jour: j.jour })}
                aria-label={`Ajouter un créneau le ${j.titre}`}
                title="Ajouter un créneau"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
              >
                +
              </button>
            </div>
            <ul className="space-y-1">
              {j.blocs.map((b) => {
                const creneau = creneaux.find((c) => c.id === b.id);
                const contenu = (
                  <>
                    <span className="chiffres block text-[11px] text-[var(--encre-faible)]">
                      {b.depuisAvant ? "…" : ""}
                      {minutesEnHeure(b.debutMinutes)} – {minutesEnHeure(b.finMinutes)}
                      {b.continueApres ? "…" : ""}
                    </span>
                    <span className="block truncate text-xs font-semibold">{STATUTS[b.statut].libelle}</span>
                    {b.lieu && <span className="block truncate text-[11px] text-[var(--encre-douce)]">{b.lieu}</span>}
                    {b.origine && <span className="block truncate text-[10px] text-[var(--encre-faible)]">{libelleOrigine(b.origine)}</span>}
                  </>
                );
                const classe = "block w-full rounded-md border-l-4 bg-[var(--surface-creuse)] px-2 py-1 text-left";
                const style = { borderLeftColor: STATUTS[b.statut].couleur };
                return (
                  <li key={`${b.id}-${j.jour}`}>
                    {/* Une période déduite ne se modifie pas ici : elle renvoie à sa pièce, quand on peut l'ouvrir. */}
                    {b.origine ? (
                      b.origine.lien ? (
                        <Link href={b.origine.lien} title={`${libelleOrigine(b.origine)} — ${SOURCES[b.origine.source].ouvrir.toLowerCase()}`} className={`${classe} border-dashed hover:brightness-95`} style={style}>
                          {contenu}
                        </Link>
                      ) : (
                        <div title={libelleOrigine(b.origine)} className={`${classe} border-dashed`} style={style}>
                          {contenu}
                        </div>
                      )
                    ) : (
                      <button type="button" onClick={() => creneau && setEdition({ mode: "modifier", creneau })} className={`${classe} hover:brightness-95`} style={style}>
                        {contenu}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function FormulaireCreneau({ edition, pourUserId, fermer }: { edition: Edition; pourUserId: string | null; fermer: () => void }) {
  const { resultat, enCours, lancer } = useOperation();
  const c = edition.mode === "modifier" ? edition.creneau : null;
  const jour = edition.mode === "nouveau" ? edition.jour : c!.jourDebut;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        lancer(() => enregistrerCreneau(d), fermer);
      }}
      className="mb-3 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{c ? "Modifier le créneau" : "Nouveau créneau"}</h3>
        <button type="button" onClick={fermer} className="text-sm text-[var(--encre-douce)] hover:underline">
          Annuler
        </button>
      </div>
      {c && <input type="hidden" name="id" value={c.id} />}
      {pourUserId && <input type="hidden" name="userId" value={pourUserId} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Champ libelle="Statut">
          <select name="statut" defaultValue={c?.statut ?? "en_mission"} className={CLASSE_CHAMP}>
            {LISTE_STATUTS.map((s) => (
              <option key={s} value={s}>
                {STATUTS[s].libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Lieu">
          <input name="lieu" defaultValue={c?.lieu ?? ""} maxLength={160} placeholder="Facultatif" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Du">
          <div className="flex gap-2">
            <input type="date" name="jourDebut" required defaultValue={jour} className={`${CLASSE_CHAMP} min-w-0`} />
            <input type="time" name="heureDebut" required defaultValue={c?.heureDebut ?? "08:00"} className={`${CLASSE_CHAMP_COMPACT} w-28 shrink-0`} />
          </div>
        </Champ>
        <Champ libelle="Au">
          <div className="flex gap-2">
            <input type="date" name="jourFin" required defaultValue={c?.jourFin ?? jour} className={`${CLASSE_CHAMP} min-w-0`} />
            <input type="time" name="heureFin" required defaultValue={c?.heureFin ?? "12:00"} className={`${CLASSE_CHAMP_COMPACT} w-28 shrink-0`} />
          </div>
        </Champ>
      </div>
      <div className="mt-3">
        <Champ libelle="Note">
          <input name="note" defaultValue={c?.note ?? ""} maxLength={500} placeholder="Facultatif : client visité, numéro joignable…" className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {c && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => window.confirm("Supprimer ce créneau ?") && lancer(() => supprimerCreneau(c.id), fermer)}
            className="h-cible rounded-lg px-3.5 text-sm font-medium text-danger-600 hover:bg-danger-50 disabled:opacity-50"
          >
            Supprimer
          </button>
        )}
        <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <Retour resultat={resultat} />
    </form>
  );
}

// ------------------------------------------------------------- horaires

type PlageSaisie = { debut: string; fin: string };

const MODELES: { libelle: string; plages: Record<number, PlageSaisie[]> }[] = [
  {
    libelle: "Bureau : 8 h – 12 h et 14 h – 18 h, lundi au vendredi",
    plages: Object.fromEntries([1, 2, 3, 4, 5].map((j) => [j, [{ debut: "08:00", fin: "12:00" }, { debut: "14:00", fin: "18:00" }]])),
  },
  {
    libelle: "Journée continue : 7 h 30 – 16 h 30, lundi au vendredi",
    plages: Object.fromEntries([1, 2, 3, 4, 5].map((j) => [j, [{ debut: "07:30", fin: "16:30" }]])),
  },
  {
    libelle: "Commerce : 8 h – 20 h, lundi au samedi",
    plages: Object.fromEntries([1, 2, 3, 4, 5, 6].map((j) => [j, [{ debut: "08:00", fin: "20:00" }]])),
  },
];

export function EditeurHoraires({ initial, pourUserId }: { initial: Record<number, PlageSaisie[]>; pourUserId: string | null }) {
  const [plages, setPlages] = useState<Record<number, PlageSaisie[]>>(initial);
  const { resultat, enCours, lancer } = useOperation();
  const changer = (jour: number, liste: PlageSaisie[]) => setPlages((p) => ({ ...p, [jour]: liste }));

  return (
    <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap gap-2">
        {MODELES.map((m) => (
          <button
            key={m.libelle}
            type="button"
            onClick={() => setPlages(structuredClone(m.plages))}
            className="rounded-lg border border-[var(--filet)] px-3 py-1.5 text-xs hover:bg-[var(--surface-creuse)]"
          >
            {m.libelle}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-[var(--filet)]">
        {LIBELLES_JOURS.map((libelle, i) => {
          const jour = i + 1;
          const liste = plages[jour] ?? [];
          return (
            <li key={jour} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-24 text-sm font-medium capitalize">{libelle}</span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {liste.length === 0 && <span className="text-sm text-[var(--encre-faible)]">Repos</span>}
                {liste.map((p, k) => (
                  <span key={k} className="flex items-center gap-1 rounded-lg bg-[var(--surface-creuse)] px-2 py-1">
                    <input
                      type="time"
                      value={p.debut}
                      aria-label={`Début de la plage ${k + 1}, ${libelle}`}
                      onChange={(e) => changer(jour, liste.map((x, n) => (n === k ? { ...x, debut: e.target.value } : x)))}
                      className="chiffres bg-transparent text-sm outline-none"
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="time"
                      value={p.fin}
                      aria-label={`Fin de la plage ${k + 1}, ${libelle}`}
                      onChange={(e) => changer(jour, liste.map((x, n) => (n === k ? { ...x, fin: e.target.value } : x)))}
                      className="chiffres bg-transparent text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => changer(jour, liste.filter((_, n) => n !== k))}
                      aria-label={`Retirer la plage ${k + 1}, ${libelle}`}
                      className="ml-1 text-[var(--encre-faible)] hover:text-danger-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => changer(jour, [...liste, liste.length ? { debut: "14:00", fin: "18:00" } : { debut: "08:00", fin: "12:00" }])}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-marque-600 hover:bg-[var(--surface-creuse)]"
                >
                  + Plage
                </button>
              </div>
              {jour > 1 && (
                <button
                  type="button"
                  onClick={() => changer(jour, structuredClone(plages[jour - 1] ?? []))}
                  className="text-xs text-[var(--encre-douce)] hover:underline"
                >
                  Comme la veille
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={enCours}
          onClick={() =>
            lancer(() =>
              enregistrerHoraires(
                pourUserId,
                Object.entries(plages).flatMap(([jour, liste]) => liste.map((p) => ({ jour: Number(jour), debut: p.debut, fin: p.fin }))),
              ),
            )
          }
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Enregistrer les horaires"}
        </button>
      </div>
      <Retour resultat={resultat} />
    </section>
  );
}

