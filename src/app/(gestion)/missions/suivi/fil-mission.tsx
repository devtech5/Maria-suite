"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useApercu } from "@/components/ui/apercu";
import { Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import {
  cloreMission,
  joindrePhoto,
  ouvrirPhoto,
} from "@/modules/missions/actions";
import type { EtapeVue, MissionSuivie, PreuveVue } from "@/modules/missions/requetes";
import type { StatutMission, TypePreuve } from "@/modules/missions/schema";
import {
  LIBELLE_NATURE,
  LIBELLE_PREUVE,
  LIBELLE_STATUT,
  estOuverte,
  libellePosition,
  preuvesManquantes,
  pourcentage,
  versMicroDegres,
} from "@/modules/missions/suivi";

import { useRemontee, type IssueRemontee } from "./use-remontee";

const TON: Record<StatutMission, TonPastille> = {
  planifiee: "neutre",
  en_cours: "marque",
  terminee: "valide",
  echouee: "danger",
  annulee: "neutre",
};

const heure = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

interface Props {
  missions: MissionSuivie[];
  selectionId: string | null;
  etapes: EtapeVue[];
  peutSaisir: boolean;
  peutGerer: boolean;
}

/**
 * Fil d'une mission : les étapes dans l'ordre, avec la preuve attachée à
 * chacune.
 *
 * La preuve est le point du module. Une livraison contestée, une réserve de
 * chantier ou un relevé de terrain ne valent que par ce qui les atteste :
 * photo, position, signature, horodatage. Sans cela, il ne reste qu'une case
 * cochée, et une case cochée ne tranche aucun litige.
 */
export function FilMission({
  missions,
  selectionId,
  etapes,
  peutSaisir,
  peutGerer,
}: Props) {
  const remontee = useRemontee();
  const routeur = useRouter();
  const mission = missions.find((m) => m.id === selectionId) ?? null;

  return (
    <div className="space-y-3">
      {(remontee.enAttente > 0 || remontee.refusees.length > 0) && (
        <div
          role="status"
          className="rounded-lg border border-alerte-300 bg-alerte-50 px-3 py-2.5 text-sm"
        >
          {remontee.enAttente > 0 && (
            <p className="flex flex-wrap items-center gap-2 font-medium text-alerte-600">
              {remontee.enAttente} saisie{remontee.enAttente > 1 ? "s" : ""} encore sur
              cet appareil — elles partent dès que le réseau revient.
              <button
                type="button"
                onClick={() => void remontee.vider()}
                className="rounded border border-alerte-300 px-2 py-0.5 text-xs"
              >
                Réessayer
              </button>
            </p>
          )}
          {remontee.refusees.map((op) => (
            <p key={op.rang} className="mt-1 flex flex-wrap items-center gap-2 text-danger-600">
              Refusée par le serveur : {op.erreur}
              <button
                type="button"
                onClick={() => void remontee.ecarterRefusee(op.rang as number)}
                className="rounded border border-danger-300 px-2 py-0.5 text-xs"
              >
                Écarter
              </button>
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ la liste */}
        <ul className="h-fit divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
          {missions.map((m) => {
            const actif = selectionId === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => routeur.push(`/missions/suivi?mission=${m.id}`)}
                  aria-current={actif ? "true" : undefined}
                  className={`w-full px-4 py-3 text-left ${
                    actif ? "bg-[var(--surface-creuse)]" : "hover:bg-[var(--surface-creuse)]"
                  }`}
                >
                  <span className="chiffres block text-xs text-[var(--encre-faible)]">
                    {m.reference}
                  </span>
                  <span className="block truncate text-sm font-medium">{m.titre}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <Pastille ton={TON[m.statut]}>{LIBELLE_STATUT[m.statut]}</Pastille>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* ------------------------------------------------------ le détail */}
        {mission && (
          <DetailMission
            mission={mission}
            etapes={etapes}
            peutSaisir={peutSaisir}
            peutGerer={peutGerer}
            rapporter={remontee.rapporter}
          />
        )}
      </div>
    </div>
  );
}

function DetailMission({
  mission,
  etapes,
  peutSaisir,
  peutGerer,
  rapporter,
}: {
  mission: MissionSuivie;
  etapes: EtapeVue[];
  peutSaisir: boolean;
  peutGerer: boolean;
  rapporter: ReturnType<typeof useRemontee>["rapporter"];
}) {
  const ouverte = estOuverte(mission.statut);
  const courante = etapes.find((e) => e.faiteLe === null) ?? null;
  const progression = pourcentage(mission.etapesFaites, mission.etapes);

  return (
    <section className="min-w-0 rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
      <header className="border-b border-[var(--filet)] p-4">
        <p className="chiffres text-xs text-[var(--encre-faible)]">
          {mission.reference} · {LIBELLE_NATURE[mission.nature]}
        </p>
        <div className="mt-0.5 flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold">{mission.titre}</h2>
          <Pastille ton={TON[mission.statut]}>{LIBELLE_STATUT[mission.statut]}</Pastille>
        </div>
        <p className="mt-1 text-xs text-[var(--encre-douce)]">
          {mission.executant ?? "Non attribuée"}
          {mission.lieu ? ` · ${mission.lieu}` : ""}
          {mission.client ? ` · ${mission.client}` : ""}
          {mission.client ? ` · ${fmt(mission.montant)} FCFA` : ""}
        </p>
        {mission.motif && (
          <p className="mt-2 rounded bg-[var(--surface-creuse)] px-2.5 py-1.5 text-xs">
            Motif : {mission.motif}
          </p>
        )}
        <p className="chiffres mt-2 text-xs font-semibold">{progression} % accompli</p>
      </header>

      <ol className="divide-y divide-[var(--filet)]">
        {etapes.map((etape) => (
          <Etape
            key={etape.id}
            etape={etape}
            mission={mission}
            active={ouverte && courante?.id === etape.id}
            peutSaisir={peutSaisir}
            rapporter={rapporter}
          />
        ))}
      </ol>

      {peutGerer && ouverte && <ClotureMission missionId={mission.id} />}
    </section>
  );
}

function Etape({
  etape,
  mission,
  active,
  peutSaisir,
  rapporter,
}: {
  etape: EtapeVue;
  mission: MissionSuivie;
  active: boolean;
  peutSaisir: boolean;
  rapporter: ReturnType<typeof useRemontee>["rapporter"];
}) {
  const faite = etape.faiteLe !== null;
  const manque = preuvesManquantes(
    etape.preuvesRequises,
    etape.preuves.map((p) => p.type),
  );

  return (
    <li className="p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            faite
              ? "bg-valide-500 text-white"
              : active
                ? "border-2 border-marque-600 text-marque-600"
                : "border border-[var(--filet)] text-[var(--encre-faible)]"
          }`}
        >
          {faite ? "✓" : etape.ordre}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={`text-sm ${faite ? "text-[var(--encre-douce)]" : "font-medium"}`}>
              {etape.libelle}
            </p>
            {etape.faiteLe && (
              <span className="chiffres text-xs text-[var(--encre-faible)]">
                {heure.format(etape.faiteLe)}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {etape.preuvesRequises.map((type, index) => {
              const fournie = !manque.includes(type);
              return (
                <Pastille key={`${type}-${index}`} ton={fournie ? "valide" : "neutre"}>
                  {fournie ? "✓ " : ""}
                  {LIBELLE_PREUVE[type]}
                </Pastille>
              );
            })}
          </div>

          {etape.preuves.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-[var(--encre-douce)]">
              {etape.preuves.map((preuve) => (
                <LignePreuve key={preuve.id} preuve={preuve} />
              ))}
            </ul>
          )}

          {active && peutSaisir && (
            <SaisieEtape
              etape={etape}
              missionId={mission.id}
              manque={manque}
              rapporter={rapporter}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function LignePreuve({ preuve }: { preuve: PreuveVue }) {
  const apercu = useApercu();

  let detail: React.ReactNode = preuve.texte;
  if (preuve.type === "position" && preuve.latitudeMicro !== null && preuve.longitudeMicro !== null) {
    detail = libellePosition(preuve.latitudeMicro, preuve.longitudeMicro);
  }
  if (preuve.type === "photo") {
    detail = (
      <button type="button" onClick={() => apercu.ouvrir({ titre: "Photo de terrain", signer: () => ouvrirPhoto(preuve.id) })} className="text-marque-600 underline">
        Ouvrir la photo
      </button>
    );
  }
  if (preuve.type === "signature") detail = `Signé par ${preuve.texte}`;

  // L'heure de la prise fait foi ; l'écart avec la remontée dit combien de
  // temps la preuve a dormi hors réseau.
  const differe = preuve.recueLe.getTime() - preuve.priseLe.getTime() > 5 * 60 * 1000;

  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-medium text-[var(--encre)]">{LIBELLE_PREUVE[preuve.type]}</span>
      <span>{detail}</span>
      <span className="chiffres text-[var(--encre-faible)]">
        {heure.format(preuve.priseLe)}
        {differe ? " · remontée plus tard" : ""}
      </span>
      {apercu.fenetre}
    </li>
  );
}

function SaisieEtape({
  etape,
  missionId,
  manque,
  rapporter,
}: {
  etape: EtapeVue;
  missionId: string;
  manque: TypePreuve[];
  rapporter: ReturnType<typeof useRemontee>["rapporter"];
}) {
  const [message, setMessage] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [note, setNote] = useState("");
  const [signataire, setSignataire] = useState("");

  const peutPhoto = etape.preuvesRequises.includes("photo");
  const peutPosition = etape.preuvesRequises.includes("position");
  const peutSignature = etape.preuvesRequises.includes("signature");
  const peutNote = etape.preuvesRequises.includes("note");

  function dire(issue: IssueRemontee, succes: string) {
    if (issue.genre === "refusee") setMessage({ ton: "erreur", texte: issue.message });
    else if (issue.genre === "en_file") {
      setMessage({ ton: "ok", texte: "Pas de réseau : conservé sur l'appareil, il partira tout seul." });
    } else setMessage({ ton: "ok", texte: succes });
  }

  async function lancer(travail: () => Promise<void>) {
    setOccupe(true);
    setMessage(null);
    try {
      await travail();
    } finally {
      setOccupe(false);
    }
  }

  const base = () => ({
    id: crypto.randomUUID(),
    missionId,
    etapeId: etape.id,
    priseLe: new Date().toISOString(),
  });

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-[var(--surface-creuse)] p-3">
      <div className="flex flex-wrap gap-2">
        {peutPosition && (
          <button
            type="button"
            disabled={occupe}
            onClick={() =>
              lancer(
                () =>
                  new Promise<void>((resoudre) => {
                    if (!navigator.geolocation) {
                      setMessage({ ton: "erreur", texte: "Cet appareil ne donne pas sa position." });
                      resoudre();
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      async (pos) => {
                        const operation = {
                          genre: "preuve" as const,
                          ...base(),
                          type: "position" as const,
                          latitudeMicro: versMicroDegres(pos.coords.latitude),
                          longitudeMicro: versMicroDegres(pos.coords.longitude),
                          // L'heure du relevé GPS, pas celle du clic.
                          priseLe: new Date(pos.timestamp).toISOString(),
                        };
                        dire(await rapporter(operation), "Position enregistrée.");
                        resoudre();
                      },
                      () => {
                        setMessage({
                          ton: "erreur",
                          texte: "Position refusée ou introuvable. Autorisez la localisation.",
                        });
                        resoudre();
                      },
                      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
                    );
                  }),
              )
            }
            className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-medium"
          >
            Prendre la position
          </button>
        )}

        {peutPhoto && (
          <label className="flex h-cible cursor-pointer items-center rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-medium">
            Joindre une photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={occupe}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                e.target.value = "";
                if (!fichier) return;
                void lancer(async () => {
                  const donnees = new FormData();
                  donnees.set("missionId", missionId);
                  donnees.set("etapeId", etape.id);
                  donnees.set("photo", fichier);
                  try {
                    const reponse = await joindrePhoto(donnees);
                    setMessage(
                      reponse.ok
                        ? { ton: "ok", texte: "Photo enregistrée." }
                        : { ton: "erreur", texte: reponse.message },
                    );
                  } catch {
                    setMessage({
                      ton: "erreur",
                      texte: "Pas de réseau : une photo ne se conserve pas hors connexion. Reprenez-la quand le réseau revient.",
                    });
                  }
                });
              }}
            />
          </label>
        )}
      </div>

      {peutSignature && (
        <div className="flex flex-wrap gap-2">
          <input
            value={signataire}
            onChange={(e) => setSignataire(e.target.value)}
            placeholder="Nom de la personne qui signe"
            aria-label="Nom du signataire"
            className="h-cible min-w-0 flex-1 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm"
          />
          <button
            type="button"
            disabled={occupe || signataire.trim().length < 2}
            onClick={() =>
              lancer(async () => {
                const issue = await rapporter({
                  genre: "preuve",
                  ...base(),
                  type: "signature",
                  texte: signataire.trim(),
                });
                dire(issue, "Signature enregistrée.");
                if (issue.genre !== "refusee") setSignataire("");
              })
            }
            className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-medium disabled:opacity-50"
          >
            Enregistrer la signature
          </button>
        </div>
      )}

      {peutNote && (
        <div className="flex flex-wrap gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note de terrain"
            aria-label="Note de terrain"
            className="min-w-0 flex-1 rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={occupe || note.trim().length === 0}
            onClick={() =>
              lancer(async () => {
                const issue = await rapporter({
                  genre: "preuve",
                  ...base(),
                  type: "note",
                  texte: note.trim(),
                });
                dire(issue, "Note enregistrée.");
                if (issue.genre !== "refusee") setNote("");
              })
            }
            className="h-cible self-start rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm font-medium disabled:opacity-50"
          >
            Enregistrer la note
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={occupe}
          onClick={() =>
            lancer(async () => {
              const issue = await rapporter({
                genre: "etape",
                etapeId: etape.id,
                faiteLe: new Date().toISOString(),
              });
              dire(issue, "Étape validée.");
            })
          }
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          Valider l&apos;étape
        </button>
        {manque.length > 0 && (
          <span className="text-xs text-[var(--encre-faible)]">
            Encore à rapporter : {manque.map((t) => LIBELLE_PREUVE[t].toLowerCase()).join(", ")}
          </span>
        )}
      </div>

      {message && (
        <p
          role={message.ton === "erreur" ? "alert" : "status"}
          className={`text-sm font-medium ${
            message.ton === "erreur" ? "text-danger-600" : "text-valide-600"
          }`}
        >
          {message.texte}
        </p>
      )}
    </div>
  );
}

function ClotureMission({ missionId }: { missionId: string }) {
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <div className="border-t border-[var(--filet)] p-4">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Déclarer échouée ou annuler…
        </button>
      </div>
    );
  }

  return (
    <form action={cloreMission} className="space-y-3 border-t border-[var(--filet)] p-4">
      <input type="hidden" name="id" value={missionId} />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="issue" value="echouee" defaultChecked />
          Échouée
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="issue" value="annulee" />
          Annulée
        </label>
      </div>
      <input
        name="motif"
        required
        minLength={3}
        placeholder="Motif : destinataire absent, chantier suspendu…"
        aria-label="Motif"
        className="h-cible w-full rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3 text-sm"
      />
      <div className="flex gap-3">
        <button
          type="submit"
          className="h-cible rounded-lg bg-danger-500 px-4 text-sm font-semibold text-white"
        >
          Confirmer
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
