"use client";

import { useState, useTransition } from "react";

import { confirmer } from "@/components/ui/dialogues";
import { FormulaireRepliable, Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { configurationDuRelais, creerCamera, creerSite, emettreCleRelais, reglerCamera } from "@/modules/securite/actions";
import { LIBELLE_MARQUE, LIBELLE_NATURE } from "@/modules/securite/calcul";

export function FormulaireSite() {
  return (
    <FormulaireRepliable libelle="Ajouter un site" titre="Nouveau site surveillé" action={creerSite}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Nom">
          <input name="nom" required maxLength={80} placeholder="Magasin Yopougon" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Nature">
          <select name="nature" defaultValue="magasin" className={CLASSE_CHAMP}>
            {Object.entries(LIBELLE_NATURE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Adresse" precision="Facultatif">
          <input name="adresse" maxLength={200} placeholder="Carrefour Siporex, Yopougon" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Marque de l'enregistreur">
          <select name="marque" defaultValue="hikvision" className={CLASSE_CHAMP}>
            {Object.entries(LIBELLE_MARQUE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Adresse de l'enregistreur" precision="Sur le réseau du site, telle que le relais la joint.">
          <input name="enregistreurAdresse" required placeholder="192.168.1.64" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Port RTSP" precision="554 par défaut">
          <input name="enregistreurPort" inputMode="numeric" placeholder="554" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
      </div>
    </FormulaireRepliable>
  );
}

export function FormulaireCamera({ siteId, prochainCanal }: { siteId: string; prochainCanal: number }) {
  return (
    <FormulaireRepliable libelle="Ajouter une caméra" titre="Nouvelle caméra" action={(d) => creerCamera(siteId, d)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Nom">
          <input name="nom" required maxLength={80} placeholder="Caisse principale" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Emplacement" precision="Ce qu'elle filme">
          <input name="emplacement" maxLength={120} placeholder="Comptoir, vue sur le tiroir" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Canal de l'enregistreur" precision="Numéro affiché sur l'enregistreur : D1, CH1 → 1">
          <input name="canal" required inputMode="numeric" defaultValue={prochainCanal} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" name="hd" />
          Haute définition au plein écran
        </label>
      </div>
    </FormulaireRepliable>
  );
}

export function ReglageCamera({ cameraId, actif, hd }: { cameraId: string; actif: boolean; hd: boolean }) {
  const { resultat, enCours, lancer } = useOperation();
  return (
    <div className="flex flex-wrap justify-end gap-3 text-xs">
      <button type="button" disabled={enCours} onClick={() => lancer(() => reglerCamera(cameraId, { hd: !hd }))} className="font-medium text-marque-600 hover:underline disabled:opacity-50">
        {hd ? "Sans HD" : "Avec HD"}
      </button>
      <button type="button" disabled={enCours} onClick={() => lancer(() => reglerCamera(cameraId, { actif: !actif }))} className="font-medium text-marque-600 hover:underline disabled:opacity-50">
        {actif ? "Retirer du mur" : "Remettre au mur"}
      </button>
      {resultat && !resultat.ok && <Retour resultat={resultat} />}
    </div>
  );
}

/**
 * Mise en service du relais : la clé (montrée une fois) et le fichier de
 * configuration à poser sur le boîtier.
 */
export function PanneauRelais({ siteId, nomSite, aUneCle }: { siteId: string; nomSite: string; aUneCle: boolean }) {
  const [cle, setCle] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();

  async function emettre() {
    if (aUneCle && !(await confirmer("Une nouvelle clé coupe l'ancienne : le relais devra être reconfiguré. Continuer ?"))) return;
    demarrer(async () => {
      const r = await emettreCleRelais(siteId);
      setResultat(r);
      if (r.ok && r.cle) setCle(r.cle);
    });
  }

  function telecharger() {
    demarrer(async () => {
      const r = await configurationDuRelais(siteId);
      setResultat(r.ok ? null : r);
      if (!r.ok || !r.contenu) return;
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(new Blob([r.contenu], { type: "text/yaml" }));
      lien.download = `go2rtc-${nomSite.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}.yaml`;
      lien.click();
      URL.revokeObjectURL(lien.href);
    });
  }

  return (
    <div className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-semibold">Relais du site</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--encre-douce)]">
        <li>Installez go2rtc sur un petit ordinateur du site, branché au même réseau que l&apos;enregistreur.</li>
        <li>Émettez la clé du relais et téléchargez la configuration.</li>
        <li>
          Sur le boîtier, définissez <code className="text-xs">NVR_UTILISATEUR</code>, <code className="text-xs">NVR_MOT_DE_PASSE</code> et{" "}
          <code className="text-xs">RELAIS_CLE</code>, puis lancez go2rtc avec ce fichier.
        </li>
      </ol>
      <p className="mt-2 text-xs text-[var(--encre-faible)]">
        Le fichier ne contient aucun secret : il peut s&apos;envoyer à l&apos;installateur. Rien n&apos;est à ouvrir sur la box du site.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={enCours} onClick={emettre} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50">
          {aUneCle ? "Émettre une nouvelle clé" : "Émettre la clé du relais"}
        </button>
        <button type="button" disabled={enCours} onClick={telecharger} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          Télécharger la configuration
        </button>
      </div>
      {cle && (
        <div className="mt-3 rounded-lg border border-alerte-600 bg-alerte-50 p-3 text-sm">
          <p className="font-semibold text-alerte-600">Clé du relais — copiez-la maintenant, elle ne sera plus affichée :</p>
          <p className="chiffres mt-1 select-all break-all">{cle}</p>
        </div>
      )}
      <Retour resultat={resultat} />
    </div>
  );
}
