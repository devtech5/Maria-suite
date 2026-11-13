"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { apercuCampagne, creerCampagne, envoyerCampagne, supprimerBrouillon } from "@/modules/communication/actions";
import { Fenetre } from "@/components/ui/fenetre";

type Public = "personnel" | "clients";
type Apercu = Awaited<ReturnType<typeof apercuCampagne>>;

const CANAUX_PUBLIC: Record<Public, { cle: "email" | "whatsapp" | "application"; libelle: string }[]> = {
  personnel: [
    { cle: "application", libelle: "Dans l'application" },
    { cle: "email", libelle: "E-mail" },
    { cle: "whatsapp", libelle: "WhatsApp" },
  ],
  clients: [
    { cle: "email", libelle: "E-mail" },
    { cle: "whatsapp", libelle: "WhatsApp" },
  ],
};

/**
 * Préparation d'un message groupé : le public, les canaux, le filtre, le
 * texte — et, avant d'envoyer quoi que ce soit, combien de personnes seront
 * effectivement jointes sur chaque canal.
 */
export function NouvelleCampagne() {
  const [ouvert, setOuvert] = useState(false);
  const [publicVise, setPublic] = useState<Public>("personnel");
  const [filtre, setFiltre] = useState({ cible: "tous", ville: "", secteur: "" });
  const [apercu, setApercu] = useState<Apercu>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  const op = useOperation();

  useEffect(() => {
    if (!ouvert) return;
    let vivant = true;
    const delai = window.setTimeout(async () => {
      const a = await apercuCampagne(publicVise, filtre);
      if (vivant) setApercu(a);
    }, 300);
    return () => {
      vivant = false;
      window.clearTimeout(delai);
    };
  }, [ouvert, publicVise, filtre]);

  return (
    <>
      <div className="flex items-center gap-3">
        {op.resultat?.ok && <span className="text-sm text-valide-600">{op.resultat.message}</span>}
        <button type="button" onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600">
          Nouveau message groupé
        </button>
      </div>
      <Fenetre ouverte={ouvert} titre="Nouveau message groupé" presentation="ample" onFermer={() => setOuvert(false)}>
        <form
          ref={formulaire}
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            op.lancer(
              () => creerCampagne(donnees),
              () => {
                formulaire.current?.reset();
                setOuvert(false);
              },
            );
          }}
          className="space-y-4 px-5 py-4"
        >

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Titre (interne)">
              <input name="titre" required placeholder="Fermeture exceptionnelle du 15 août" className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="À qui">
              <select name="public" value={publicVise} onChange={(e) => setPublic(e.target.value as Public)} className={CLASSE_CHAMP}>
                <option value="personnel">Tout le personnel</option>
                <option value="clients">Les clients</option>
              </select>
            </Champ>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium">Canaux</legend>
              <div className="flex flex-wrap gap-3 pt-2">
                {CANAUX_PUBLIC[publicVise].map((c) => (
                  <label key={`${publicVise}-${c.cle}`} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="canaux" value={c.cle} defaultChecked={c.cle !== "whatsapp"} className="size-4" />
                    {c.libelle}
                  </label>
                ))}
              </div>
            </fieldset>
            {publicVise === "clients" && (
              <>
                <Champ libelle="Quels clients">
                  <select name="cible" value={filtre.cible} onChange={(e) => setFiltre({ ...filtre, cible: e.target.value })} className={CLASSE_CHAMP}>
                    <option value="tous">Tous les clients</option>
                    <option value="impayes">Avec une facture en retard</option>
                    <option value="entreprises">Les entreprises</option>
                    <option value="particuliers">Les particuliers</option>
                  </select>
                </Champ>
                <Champ libelle="Ville (facultatif)">
                  <input name="ville" value={filtre.ville} onChange={(e) => setFiltre({ ...filtre, ville: e.target.value })} placeholder="Abidjan" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Secteur (facultatif)">
                  <input name="secteur" value={filtre.secteur} onChange={(e) => setFiltre({ ...filtre, secteur: e.target.value })} className={CLASSE_CHAMP} />
                </Champ>
              </>
            )}
          </div>

          <Champ libelle="Objet (e-mail)">
            <input name="objet" placeholder="Information importante" className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Message" precision="{nom} est remplacé par le nom de chaque destinataire, {entreprise} par le vôtre.">
            <textarea name="corps" required rows={6} placeholder={"Bonjour {nom},\n\n…"} className={`${CLASSE_CHAMP} h-auto py-2`} />
          </Champ>

          {apercu && (
            <p className="rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm">
              <span className="font-semibold">{apercu.total} destinataire{apercu.total > 1 ? "s" : ""}</span>
              {" — "}
              {CANAUX_PUBLIC[publicVise]
                .map((c) => `${c.libelle} : ${apercu.parCanal[c.cle].joignables} joignable${apercu.parCanal[c.cle].joignables > 1 ? "s" : ""}${apercu.parCanal[c.cle].sansAdresse ? ` (${apercu.parCanal[c.cle].sansAdresse} sans adresse)` : ""}`)
                .join(" · ")}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <Retour resultat={op.resultat && !op.resultat.ok ? op.resultat : null} />
            <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
              {op.enCours ? "Enregistrement…" : "Enregistrer le brouillon"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}

/** Envoi ou suppression d'un brouillon. L'envoi demande confirmation : il ne se rattrape pas. */
export function ActionsBrouillon({ id, titre }: { id: string; titre: string }) {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const routeur = useRouter();
  const agir = (op: () => Promise<Resultat>) =>
    demarrer(async () => {
      const r = await op();
      setResultat(r);
      if (r.ok) routeur.refresh();
    });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {resultat && <span className={`text-xs ${resultat.ok ? "text-valide-600" : "text-danger-600"}`}>{resultat.message}</span>}
      <button
        type="button"
        disabled={enCours}
        onClick={() => window.confirm(`Supprimer le brouillon « ${titre} » ?`) && agir(() => supprimerBrouillon(id))}
        className="h-9 rounded-lg px-3 text-sm text-danger-600 hover:bg-danger-50"
      >
        Supprimer
      </button>
      <button
        type="button"
        disabled={enCours}
        onClick={() => window.confirm(`Envoyer « ${titre} » maintenant ? Un envoi ne se rattrape pas.`) && agir(() => envoyerCampagne(id))}
        className="h-9 rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {enCours ? "Envoi…" : "Envoyer"}
      </button>
    </div>
  );
}
