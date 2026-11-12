import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { CANAUX, LIBELLE_CANAL } from "@/modules/prospection/regles";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS } from "@/modules/tiers/natures";

/** Champs d'un nouveau plan de prospection. */
export function ChampsPlan({ commerciaux, aujourdhui }: { commerciaux: { id: string; nom: string }[] | null; aujourdhui: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {commerciaux && (
        <Champ libelle="Commercial">
          <select name="commercialId" required className={CLASSE_CHAMP}>
            {commerciaux.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>
      )}
      <div className="sm:col-span-2">
        <Champ libelle="Titre">
          <input name="titre" required minLength={3} placeholder="Mutuelles et coopératives de Yopougon — décembre" className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <Champ libelle="Début">
        <input name="debut" type="date" required defaultValue={aujourdhui} className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Fin">
        <input name="fin" type="date" required className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Zone" precision="Communes, quartiers ou villes couverts.">
        <input name="zone" placeholder="Yopougon, Abobo" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Cibles" precision="Qui vous visez, et pourquoi.">
        <input name="cibles" placeholder="Mutuelles de santé, offre de groupe" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Contacts à réaliser" precision="Visites, appels… à faire sur la période.">
        <input name="objectifContacts" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Nouveaux clients visés">
        <input name="objectifClients" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Chiffre d'affaires visé" precision="En francs CFA ; indicatif.">
        <input name="objectifCa" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <div className="sm:col-span-2">
        <Champ libelle="Notes">
          <textarea name="notes" rows={3} className={`${CLASSE_CHAMP} h-auto py-2`} />
        </Champ>
      </div>
    </div>
  );
}

/** Champs d'un prospect : qui, de quel type, qui y voir, ce qu'on pense lui vendre. */
export function ChampsProspect() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Champ libelle="Nom">
        <input name="nom" required minLength={2} placeholder="Mutuelle des enseignants de Yopougon" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Type">
        <select name="nature" defaultValue="entreprise" className={CLASSE_CHAMP}>
          {NATURES_TIERS.map((n) => (
            <option key={n} value={n}>
              {LIBELLE_NATURE_TIERS[n]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Personne à voir">
        <input name="contact" placeholder="M. Koffi" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Fonction">
        <input name="fonction" placeholder="Président, gérant, responsable achats…" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Téléphone">
        <input name="telephone" inputMode="tel" placeholder="+225 07 00 00 00 00" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="E-mail">
        <input name="email" type="email" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Ville">
        <input name="ville" placeholder="Abidjan" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Secteur">
        <input name="secteur" placeholder="Santé, éducation, agriculture…" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Potentiel" precision="Affaires estimées, en francs CFA.">
        <input name="potentiel" inputMode="numeric" defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <div className="sm:col-span-2">
        <Champ libelle="Besoin repéré">
          <textarea name="besoin" rows={2} className={`${CLASSE_CHAMP} h-auto py-2`} />
        </Champ>
      </div>
    </div>
  );
}

/** Date, heure, canal et objet d'une action ; `prefixe` pour l'action suivante d'un compte rendu. */
export function ChampsAction({ aujourdhui, prefixe = "", requis = true }: { aujourdhui: string; prefixe?: string; requis?: boolean }) {
  const nom = (c: string) => (prefixe ? `${prefixe}${c.charAt(0).toUpperCase()}${c.slice(1)}` : c);
  const nomDate = prefixe ? `${prefixe}Date` : "datePrevue";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Champ libelle="Date">
        <input name={nomDate} type="date" required={requis} defaultValue={requis ? aujourdhui : undefined} min={aujourdhui} className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Heure" precision="Facultative.">
        <input name={nom("heure")} type="time" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Canal">
        <select name={nom("canal")} defaultValue="visite" className={CLASSE_CHAMP}>
          {CANAUX.map((c) => (
            <option key={c} value={c}>
              {LIBELLE_CANAL[c]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Objet">
        <input name={nom("objet")} required={requis} placeholder="Présentation de l'offre" className={CLASSE_CHAMP} />
      </Champ>
    </div>
  );
}
