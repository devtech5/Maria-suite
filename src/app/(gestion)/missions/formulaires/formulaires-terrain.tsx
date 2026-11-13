"use client";

import { useActionState, useState } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { creerFormulaire, type EtatFormulaire } from "@/modules/missions/actions";
import type { ChampFormulaire } from "@/modules/missions/schema";
import { libellePosition, versMicroDegres } from "@/modules/missions/suivi";

import { useRemontee } from "../suivi/use-remontee";
import { Fenetre } from "@/components/ui/fenetre";

const LIBELLE_CHAMP: Record<ChampFormulaire["type"], string> = {
  texte: "Texte",
  nombre: "Nombre",
  choix: "Liste",
  photo: "Photo",
  position: "Position",
  oui_non: "Oui / Non",
};

/**
 * Composition d'un formulaire : une ligne par champ.
 *
 * « Libellé | type | * | choix, séparés, par des virgules » — l'étoile marque
 * le champ obligatoire. Un éditeur de blocs viendra ; en attendant, une ligne
 * de texte se tape au téléphone et se corrige sans glisser-déposer.
 */
export function NouveauFormulaire() {
  const [ouvert, setOuvert] = useState(false);
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(
    creerFormulaire,
    {},
  );

  const [dernier, setDernier] = useState(etat.nom);
  if (etat.nom !== dernier) {
    setDernier(etat.nom);
    if (etat.nom) setOuvert(false);
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.nom && <span className="text-sm text-valide-600">« {etat.nom} » créé.</span>}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          Nouveau formulaire
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouveau formulaire" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          action={action}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ libelle="Nom">
              <input name="nom" required placeholder="Fiche point de vente" className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Usage">
              <input name="usage" placeholder="Recensement terrain" className={CLASSE_CHAMP} />
            </Champ>
          </div>

          <div className="mt-4">
            <Champ
              libelle="Champs"
              precision={`Une ligne par champ : libellé | type | * si obligatoire. Types : ${Object.keys(LIBELLE_CHAMP).join(", ")}. Une liste : « Commerce | choix | * | Boutique, Kiosque, Marché ».`}
            >
              <textarea
                name="champs"
                required
                rows={6}
                defaultValue={"Enseigne | texte | *\nNom du gérant | texte | *\nAccepte le mobile money | oui_non"}
                className={`${CLASSE_CHAMP} h-auto py-2 font-mono text-sm`}
              />
            </Champ>
          </div>

          {etat.erreur && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600"
            >
              {etat.erreur}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={enCours}
              className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Créer le formulaire"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}

/**
 * Saisie d'une réponse, depuis l'appareil.
 *
 * Passe par la même file que les preuves : une réponse saisie sans réseau
 * attend sur l'appareil et part au retour de la connexion. L'heure retenue est
 * celle de la saisie.
 */
export function RepondreFormulaire({
  formulaireId,
  champs,
}: {
  formulaireId: string;
  champs: ChampFormulaire[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [valeurs, setValeurs] = useState<Record<string, string | number | boolean>>({});
  const [message, setMessage] = useState<{ ton: "ok" | "erreur"; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const { rapporter } = useRemontee();

  const saisissables = champs.filter((c) => c.type !== "photo");

  function poser(cle: string, valeur: string | number | boolean) {
    setValeurs((actuel) => ({ ...actuel, [cle]: valeur }));
  }

  async function envoyer(event: React.FormEvent) {
    event.preventDefault();
    setOccupe(true);
    setMessage(null);
    const issue = await rapporter({
      genre: "reponse",
      id: crypto.randomUUID(),
      formulaireId,
      valeurs,
      priseLe: new Date().toISOString(),
    });
    setOccupe(false);

    if (issue.genre === "refusee") setMessage({ ton: "erreur", texte: issue.message });
    else {
      setMessage({
        ton: "ok",
        texte:
          issue.genre === "en_file"
            ? "Pas de réseau : conservée sur l'appareil, elle partira toute seule."
            : "Réponse enregistrée.",
      });
      setValeurs({});
    }
  }

  function localiser(cle: string) {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        poser(
          cle,
          libellePosition(
            versMicroDegres(pos.coords.latitude),
            versMicroDegres(pos.coords.longitude),
          ),
        ),
      () => setMessage({ ton: "erreur", texte: "Position refusée ou introuvable." }),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <>
      <div className="border-t border-[var(--filet)] p-3">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible w-full rounded-lg border border-[var(--filet)] text-sm font-medium"
        >
          Saisir une réponse
        </button>
        {message?.ton === "ok" && (
          <p role="status" className="mt-2 text-xs font-medium text-valide-600">
            {message.texte}
          </p>
        )}
      </div>
      <Fenetre ouverte={ouvert} titre="Saisir une réponse" presentation="ample" onFermer={() => setOuvert(false)}>
    <form onSubmit={envoyer} className="space-y-3 px-5 py-4">
      {saisissables.map((champ) => (
        <label key={champ.cle} className="block text-sm">
          <span className="mb-1 block font-medium">
            {champ.libelle}
            {champ.obligatoire && <span className="ml-1 text-danger-600">*</span>}
          </span>

          {champ.type === "texte" && (
            <input
              className={CLASSE_CHAMP}
              value={String(valeurs[champ.cle] ?? "")}
              onChange={(e) => poser(champ.cle, e.target.value)}
            />
          )}
          {champ.type === "nombre" && (
            <input
              className={`${CLASSE_CHAMP} chiffres`}
              inputMode="decimal"
              value={String(valeurs[champ.cle] ?? "")}
              onChange={(e) => poser(champ.cle, e.target.value)}
            />
          )}
          {champ.type === "choix" && (
            <select
              className={CLASSE_CHAMP}
              value={String(valeurs[champ.cle] ?? "")}
              onChange={(e) => poser(champ.cle, e.target.value)}
            >
              <option value="">—</option>
              {(champ.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          {champ.type === "oui_non" && (
            <select
              className={CLASSE_CHAMP}
              value={valeurs[champ.cle] === undefined ? "" : String(valeurs[champ.cle])}
              onChange={(e) =>
                e.target.value === ""
                  ? setValeurs((actuel) =>
                      Object.fromEntries(
                        Object.entries(actuel).filter(([cle]) => cle !== champ.cle),
                      ),
                    )
                  : poser(champ.cle, e.target.value === "true")
              }
            >
              <option value="">—</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          )}
          {champ.type === "position" && (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => localiser(champ.cle)}
                className="h-cible rounded-lg border border-[var(--filet)] px-3 text-sm"
              >
                Prendre la position
              </button>
              <span className="chiffres text-xs text-[var(--encre-douce)]">
                {String(valeurs[champ.cle] ?? "")}
              </span>
            </span>
          )}
        </label>
      ))}

      {champs.some((c) => c.type === "photo") && (
        <p className="text-xs text-[var(--encre-faible)]">
          Les photos se joignent à l&apos;étape de la mission, pas à la réponse.
        </p>
      )}

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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={occupe}
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer la réponse
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Fermer
        </button>
      </div>
    </form>
      </Fenetre>
    </>
  );
}
