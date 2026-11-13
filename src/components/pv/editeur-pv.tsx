"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ApercuA4 } from "@/components/impression/feuille-a4";
import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { correspond } from "@/lib/recherche";
import type { IdentiteEntreprise } from "@/lib/identite";
import { enregistrerPv, publierPv, renvoyerPv, soumettrePv, supprimerPv, type SaisiePv } from "@/modules/pv/actions";
import {
  LIBELLE_PRESENCE,
  LIBELLE_TYPE,
  normaliserPoints,
  OBJET_MAX,
  refusSoumission,
  TYPES_PV,
  type Diffusion,
  type Participant,
  type Point,
  type Presence,
  type StatutPv,
  type TypePv,
} from "@/modules/pv/regles";

import { DocumentPv } from "./document-pv";

interface ActionSaisie {
  id: string | null;
  libelle: string;
  responsableEmployeId: string | null;
  echeance: string | null;
}

interface PointSaisi {
  titre: string;
  texte: string;
  /** Une décision par ligne. */
  decisions: string;
}

export interface InitialPv {
  type: TypePv;
  objet: string;
  dateSeance: string;
  lieu: string;
  participants: Participant[];
  points: Point[];
  conclusion: string;
  diffusion: Diffusion;
  accuseRequis: boolean;
  confidentiel: boolean;
  actions: ActionSaisie[];
}

const libelle = "mb-1 block text-xs font-semibold text-[var(--encre-faible)]";
const petitBouton = "rounded-md px-2 py-1 text-xs font-semibold text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] disabled:opacity-30";

function Section({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-bold">{titre}</h2>
      {aide && <p className="mb-3 mt-0.5 text-xs text-[var(--encre-faible)]">{aide}</p>}
      <div className={aide ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/**
 * La rédaction d'un procès-verbal, la feuille imprimée à côté. Tout se garde
 * ensemble à « Enregistrer » ; soumettre ou publier enregistre d'abord.
 */
export function EditeurPv({
  pvId,
  statut,
  redacteur,
  valideur,
  remarque,
  identite,
  initial,
  meta,
  comptes,
  services,
  personnel,
}: {
  pvId: string;
  statut: StatutPv;
  redacteur: boolean;
  valideur: boolean;
  remarque: string | null;
  identite: IdentiteEntreprise;
  initial: InitialPv;
  meta: { numero: string | null; revision: number; redacteur: string };
  comptes: { userId: string; nom: string; service: string | null }[];
  services: { id: string; libelle: string }[];
  personnel: { id: string; nom: string; poste: string }[];
}) {
  const [type, setType] = useState<TypePv>(initial.type);
  const [objet, setObjet] = useState(initial.objet);
  const [dateSeance, setDateSeance] = useState(initial.dateSeance);
  const [lieu, setLieu] = useState(initial.lieu);
  const [participants, setParticipants] = useState<Participant[]>(initial.participants);
  const [points, setPoints] = useState<PointSaisi[]>(
    initial.points.length ? initial.points.map((p) => ({ titre: p.titre, texte: p.texte, decisions: p.decisions.join("\n") })) : [{ titre: "", texte: "", decisions: "" }],
  );
  const [conclusion, setConclusion] = useState(initial.conclusion);
  const [diffusion, setDiffusion] = useState<Diffusion>(initial.diffusion);
  const [accuseRequis, setAccuseRequis] = useState(initial.accuseRequis);
  const [confidentiel, setConfidentiel] = useState(initial.confidentiel);
  const [actions, setActions] = useState<ActionSaisie[]>(initial.actions);
  const [chercheLecteur, setChercheLecteur] = useState("");
  const [apercu, setApercu] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const changer = <T,>(f: (v: T) => void) => (v: T) => {
    setModifie(true);
    f(v);
  };

  const pointsPropres = normaliserPoints(points.map((p) => ({ titre: p.titre, texte: p.texte, decisions: p.decisions.split("\n") })));
  const saisie: SaisiePv = {
    type,
    objet,
    dateSeance,
    lieu: lieu || null,
    participants,
    points: pointsPropres,
    conclusion: conclusion || null,
    diffusion,
    accuseRequis,
    confidentiel,
    actions: actions.map((a) => ({ id: a.id, libelle: a.libelle, responsableEmployeId: a.responsableEmployeId || null, echeance: a.echeance || null })),
  };
  const manque = refusSoumission({ objet, type, participants: participants.filter((p) => p.nom.trim().length >= 2), points: pointsPropres, diffusion, confidentiel });

  const lancer = (action: () => Promise<Resultat>, apres?: () => void) => {
    setResultat(null);
    demarrer(async () => {
      const r = await action();
      if (r) setResultat(r);
      if (r?.ok) {
        setModifie(false);
        apres?.();
      }
      routeur.refresh();
    });
  };

  const parId = new Map(personnel.map((p) => [p.id, p]));
  const lecteurs = comptes.filter((c) => correspond(chercheLecteur, [c.nom, c.service]));
  const nombreLecteurs = diffusion.tous
    ? comptes.length
    : new Set([...comptes.filter((c) => c.service && services.some((s) => s.libelle === c.service && diffusion.services.includes(s.id))).map((c) => c.userId), ...diffusion.comptes]).size;

  const formulaire = (
    <div className="space-y-4">
      {remarque && statut === "brouillon" && (
        <div className="rounded-xl border border-alerte-500/50 bg-alerte-50 px-4 py-3 text-sm">
          <p className="font-semibold">Remarque de la direction</p>
          <p className="mt-0.5 whitespace-pre-line">{remarque}</p>
        </div>
      )}

      <Section titre="En-tête">
        <div className="grid gap-3 sm:grid-cols-3">
          {TYPES_PV.map((t) => (
            <label key={t} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium ${type === t ? "border-marque-600 ring-1 ring-marque-600" : "border-[var(--filet)]"}`}>
              <input type="radio" checked={type === t} onChange={() => changer(setType)(t)} className="sr-only" />
              {LIBELLE_TYPE[t]}
            </label>
          ))}
        </div>
        <label className="mt-3 block">
          <span className={libelle}>Objet</span>
          <input value={objet} onChange={(e) => changer(setObjet)(e.target.value)} maxLength={OBJET_MAX} className={CLASSE_CHAMP} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={libelle}>Date de la séance</span>
            <input type="date" value={dateSeance} onChange={(e) => changer(setDateSeance)(e.target.value)} className={CLASSE_CHAMP} />
          </label>
          <label className="block">
            <span className={libelle}>Lieu</span>
            <input value={lieu} onChange={(e) => changer(setLieu)(e.target.value)} maxLength={120} placeholder="Siège, chantier, en visioconférence…" className={CLASSE_CHAMP} />
          </label>
        </div>
      </Section>

      <Section titre="Participants" aide="Présents, excusés, absents. Les personnes extérieures se saisissent à la main, avec leur qualité.">
        <ul className="space-y-2">
          {participants.map((p, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_2rem] items-center gap-2">
              <input
                value={p.nom}
                onChange={(e) => changer(setParticipants)(participants.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))}
                placeholder="Nom"
                aria-label={`Participant ${i + 1} : nom`}
                className={`${CLASSE_CHAMP} h-9`}
              />
              <input
                value={p.qualite}
                onChange={(e) => changer(setParticipants)(participants.map((x, j) => (j === i ? { ...x, qualite: e.target.value } : x)))}
                placeholder="Fonction, qualité"
                aria-label={`Participant ${i + 1} : qualité`}
                className={`${CLASSE_CHAMP} h-9`}
              />
              <select
                value={p.presence}
                onChange={(e) => changer(setParticipants)(participants.map((x, j) => (j === i ? { ...x, presence: e.target.value as Presence } : x)))}
                aria-label={`Participant ${i + 1} : présence`}
                className={`${CLASSE_CHAMP} h-9 px-2`}
              >
                {(["present", "excuse", "absent"] as Presence[]).map((x) => (
                  <option key={x} value={x}>
                    {LIBELLE_PRESENCE[x]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => changer(setParticipants)(participants.filter((_, j) => j !== i))} aria-label={`Retirer ${p.nom || "ce participant"}`} className="grid size-8 place-items-center rounded-md text-[var(--encre-faible)] hover:bg-danger-50 hover:text-danger-600">
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => changer(setParticipants)([...participants, { nom: "", qualite: "", presence: "present", userId: null }])} className="text-sm font-semibold text-marque-600 hover:underline">
            + Participant extérieur
          </button>
          <select
            value=""
            onChange={(e) => {
              const c = comptes.find((x) => x.userId === e.target.value);
              if (c && !participants.some((p) => p.userId === c.userId)) changer(setParticipants)([...participants, { nom: c.nom, qualite: c.service ?? "", presence: "present", userId: c.userId }]);
            }}
            aria-label="Ajouter un collaborateur"
            className={`${CLASSE_CHAMP} h-9 w-auto px-2`}
          >
            <option value="">+ Ajouter un collaborateur…</option>
            {comptes
              .filter((c) => !participants.some((p) => p.userId === c.userId))
              .map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.nom}
                  {c.service ? ` — ${c.service}` : ""}
                </option>
              ))}
          </select>
        </div>
      </Section>

      <Section titre="Points traités" aide="Pour chaque point : les échanges, puis les décisions, une par ligne. Mise en forme : **gras**, *italique*, « - » pour une liste.">
        <ol className="space-y-4">
          {points.map((p, i) => (
            <li key={i} className="rounded-lg border border-[var(--filet)] p-3">
              <div className="flex items-center gap-2">
                <span className="chiffres text-sm font-bold text-[var(--encre-faible)]">{i + 1}.</span>
                <input
                  value={p.titre}
                  onChange={(e) => changer(setPoints)(points.map((x, j) => (j === i ? { ...x, titre: e.target.value } : x)))}
                  placeholder="Intitulé du point"
                  aria-label={`Point ${i + 1} : intitulé`}
                  className={`${CLASSE_CHAMP} h-9 flex-1 font-semibold`}
                />
                <button type="button" disabled={i === 0} onClick={() => changer(setPoints)(points.map((x, j) => (j === i - 1 ? points[i] : j === i ? points[i - 1] : x)))} className={petitBouton} aria-label="Monter le point">
                  ↑
                </button>
                <button type="button" disabled={i === points.length - 1} onClick={() => changer(setPoints)(points.map((x, j) => (j === i + 1 ? points[i] : j === i ? points[i + 1] : x)))} className={petitBouton} aria-label="Descendre le point">
                  ↓
                </button>
                <button type="button" onClick={() => changer(setPoints)(points.filter((_, j) => j !== i))} className={`${petitBouton} hover:text-danger-600`} aria-label={`Retirer le point ${i + 1}`}>
                  ×
                </button>
              </div>
              <textarea
                value={p.texte}
                onChange={(e) => changer(setPoints)(points.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)))}
                rows={4}
                placeholder="Ce qui a été dit, constaté, présenté…"
                aria-label={`Point ${i + 1} : échanges`}
                className={`${CLASSE_CHAMP} mt-2 h-auto py-2 leading-relaxed`}
              />
              <textarea
                value={p.decisions}
                onChange={(e) => changer(setPoints)(points.map((x, j) => (j === i ? { ...x, decisions: e.target.value } : x)))}
                rows={2}
                placeholder="Décisions, une par ligne"
                aria-label={`Point ${i + 1} : décisions`}
                className={`${CLASSE_CHAMP} mt-2 h-auto border-l-4 border-l-[#c9a96e] py-2`}
              />
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => changer(setPoints)([...points, { titre: "", texte: "", decisions: "" }])} className="mt-2 text-sm font-semibold text-marque-600 hover:underline">
          + Ajouter un point
        </button>
      </Section>

      <Section titre="Actions à mener" aide="Qui fait quoi, pour quand. Une fois le PV publié, chaque action devient une tâche d'un clic.">
        <ul className="space-y-2">
          {actions.map((a, i) => (
            <li key={a.id ?? `n${i}`} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9.5rem_2rem]">
              <input
                value={a.libelle}
                onChange={(e) => changer(setActions)(actions.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))}
                placeholder="Action à mener"
                aria-label={`Action ${i + 1}`}
                className={`${CLASSE_CHAMP} h-9`}
              />
              <select
                value={a.responsableEmployeId ?? ""}
                onChange={(e) => changer(setActions)(actions.map((x, j) => (j === i ? { ...x, responsableEmployeId: e.target.value || null } : x)))}
                aria-label={`Action ${i + 1} : responsable`}
                className={`${CLASSE_CHAMP} h-9 px-2`}
              >
                <option value="">Responsable…</option>
                {a.responsableEmployeId && !parId.has(a.responsableEmployeId) && <option value={a.responsableEmployeId}>Ancien collaborateur</option>}
                {personnel.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} — {p.poste}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={a.echeance ?? ""}
                onChange={(e) => changer(setActions)(actions.map((x, j) => (j === i ? { ...x, echeance: e.target.value || null } : x)))}
                aria-label={`Action ${i + 1} : échéance`}
                className={`${CLASSE_CHAMP} h-9 px-2`}
              />
              <button type="button" onClick={() => changer(setActions)(actions.filter((_, j) => j !== i))} aria-label={`Retirer l'action ${i + 1}`} className="grid size-8 place-items-center rounded-md text-[var(--encre-faible)] hover:bg-danger-50 hover:text-danger-600">
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => changer(setActions)([...actions, { id: null, libelle: "", responsableEmployeId: null, echeance: null }])} className="mt-2 text-sm font-semibold text-marque-600 hover:underline">
          + Ajouter une action
        </button>
      </Section>

      <Section titre="Conclusion (facultative)">
        <textarea value={conclusion} onChange={(e) => changer(setConclusion)(e.target.value)} rows={3} maxLength={5000} placeholder="Prochaine réunion, synthèse…" className={`${CLASSE_CHAMP} h-auto py-2`} />
      </Section>

      <Section titre="Diffusion" aide="À qui le PV part une fois publié. Chacun est prévenu dans la cloche.">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={diffusion.tous} disabled={confidentiel} onChange={(e) => changer(setDiffusion)({ ...diffusion, tous: e.target.checked })} className="size-4" />
          <span className="font-semibold">Tout le personnel</span>
          {confidentiel && <span className="text-xs text-[var(--encre-faible)]">(impossible pour un PV confidentiel)</span>}
        </label>
        {!diffusion.tous && (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <fieldset>
              <legend className={libelle}>Services</legend>
              {services.length === 0 ? (
                <p className="text-xs text-[var(--encre-faible)]">Aucun service au référentiel.</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--filet)] p-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={diffusion.services.includes(s.id)}
                        onChange={(e) => changer(setDiffusion)({ ...diffusion, services: e.target.checked ? [...diffusion.services, s.id] : diffusion.services.filter((x) => x !== s.id) })}
                        className="size-4"
                      />
                      {s.libelle}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <fieldset>
              <legend className={libelle}>Personnes</legend>
              <input value={chercheLecteur} onChange={(e) => setChercheLecteur(e.target.value)} placeholder="Chercher une personne…" aria-label="Chercher une personne" className={`${CLASSE_CHAMP} mb-1 h-8`} />
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--filet)] p-2">
                {lecteurs.map((c) => (
                  <label key={c.userId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={diffusion.comptes.includes(c.userId)}
                      onChange={(e) => changer(setDiffusion)({ ...diffusion, comptes: e.target.checked ? [...diffusion.comptes, c.userId] : diffusion.comptes.filter((x) => x !== c.userId) })}
                      className="size-4"
                    />
                    <span>{c.nom}</span>
                    {c.service && <span className="text-xs text-[var(--encre-faible)]">{c.service}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--encre-faible)]">Environ {nombreLecteurs} destinataire{nombreLecteurs > 1 ? "s" : ""}.</p>
        <div className="mt-3 space-y-2 border-t border-[var(--filet)] pt-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={accuseRequis} onChange={(e) => changer(setAccuseRequis)(e.target.checked)} className="mt-0.5 size-4" />
            <span>
              <span className="font-semibold">Demander un accusé de lecture</span>
              <span className="block text-xs text-[var(--encre-faible)]">Chaque destinataire confirme « J&apos;ai pris connaissance » ; vous voyez qui l&apos;a fait et pouvez relancer.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confidentiel}
              onChange={(e) => {
                changer(setConfidentiel)(e.target.checked);
                if (e.target.checked) setDiffusion((d) => ({ ...d, tous: false }));
              }}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-semibold">Confidentiel</span>
              <span className="block text-xs text-[var(--encre-faible)]">Diffusé seulement aux personnes et services choisis ; « Confidentiel » s&apos;imprime en tête.</span>
            </span>
          </label>
        </div>
      </Section>
    </div>
  );

  return (
    <div className="pb-24">
      <div className={`grid gap-5 ${apercu ? "2xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]" : ""}`}>
        <div className={apercu ? "" : "max-w-4xl"}>{formulaire}</div>
        {apercu && (
          <section aria-label="Aperçu de la feuille" className="2xl:sticky 2xl:top-4 2xl:self-start">
            <ApercuA4>
              <DocumentPv
                identite={identite}
                pv={{
                  numero: meta.numero,
                  revision: meta.revision,
                  type,
                  objet: objet || "…",
                  dateSeance,
                  lieu: lieu || null,
                  participants: participants.filter((p) => p.nom.trim().length >= 2),
                  points: pointsPropres,
                  conclusion: conclusion || null,
                  confidentiel,
                  redacteur: meta.redacteur,
                  publiePar: null,
                  publieLe: null,
                  actions: actions.filter((a) => a.libelle.trim()).map((a) => ({ libelle: a.libelle, responsable: a.responsableEmployeId ? (parId.get(a.responsableEmployeId)?.nom ?? null) : null, echeance: a.echeance })),
                }}
              />
            </ApercuA4>
          </section>
        )}
      </div>

      {/* Barre d'actions, toujours visible en bas de l'écran. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--filet)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur lg:pl-[17rem] print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <span className="mr-auto text-xs text-[var(--encre-faible)]">
            {manque ? `À compléter avant ${valideur ? "publication" : "soumission"} : ${manque}` : modifie ? "Modifications non enregistrées." : "Prêt."}
          </span>
          <button type="button" onClick={() => setApercu((a) => !a)} className="h-cible rounded-lg border border-[var(--filet)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
            {apercu ? "Masquer la feuille" : "Voir la feuille"}
          </button>
          {statut === "brouillon" && (
            <button
              type="button"
              disabled={enCours}
              onClick={() => {
                if (window.confirm("Supprimer ce brouillon ?")) lancer(() => supprimerPv(pvId));
              }}
              className="h-cible rounded-lg px-3 text-sm font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
            >
              Supprimer
            </button>
          )}
          {statut === "a_valider" && valideur && !redacteur && (
            <button
              type="button"
              disabled={enCours}
              onClick={() => {
                const remarque = window.prompt("Remarque au rédacteur : ce qu'il faut reprendre");
                if (remarque && remarque.trim().length >= 3) lancer(() => renvoyerPv(pvId, remarque));
              }}
              className="h-cible rounded-lg border border-[var(--filet)] px-3 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
            >
              Renvoyer avec une remarque
            </button>
          )}
          <button type="button" disabled={enCours} onClick={() => lancer(() => enregistrerPv(pvId, saisie))} className="h-cible rounded-lg border border-[var(--filet)] px-4 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50">
            Enregistrer
          </button>
          {valideur ? (
            <button
              type="button"
              disabled={enCours || manque !== null}
              onClick={() => {
                if (window.confirm(`Publier ? Le texte sera figé, numéroté et diffusé à environ ${nombreLecteurs} personne${nombreLecteurs > 1 ? "s" : ""}.`)) lancer(() => publierPv(pvId, saisie));
              }}
              className="h-cible rounded-lg bg-valide-500 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Valider et publier
            </button>
          ) : (
            statut === "brouillon" &&
            redacteur && (
              <button type="button" disabled={enCours || manque !== null} onClick={() => lancer(() => soumettrePv(pvId, saisie))} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
                Soumettre à la direction
              </button>
            )
          )}
        </div>
        {resultat && (
          <div className="mx-auto mt-2 max-w-6xl">
            <Retour resultat={resultat} />
          </div>
        )}
      </div>
    </div>
  );
}
