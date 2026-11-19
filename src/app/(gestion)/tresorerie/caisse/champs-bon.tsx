"use client";

import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { NATURES_BON, type NatureBon } from "@/modules/tresorerie/calcul";
import type { FicheProposee } from "@/modules/tresorerie/requetes";

import { libelleChamp, OptionsComptes, type CompteChoix } from "../champs";
import { ChoixBeneficiaire } from "./choix-beneficiaire";

/** Ce qu'il faut pour remplir un bon : les caisses et les bénéficiaires proposés. */
export interface ChoixBon {
  caisses: CompteChoix[];
  fournisseurs: FicheProposee[];
  personnel: FicheProposee[];
  intervenants: FicheProposee[];
  /** Qui demande un bon sans consulter la trésorerie ne lit pas les soldes. */
  masquerSolde: boolean;
}

/** Le bon tel qu'il est, quand on le modifie. */
export interface ValeursBon {
  caisseId: string;
  nature: NatureBon;
  montant: number;
  beneficiaireRef: string | null;
  beneficiaire: string;
  motif: string;
}

/** Les champs d'un bon de caisse, à la demande comme à la modification. */
export function ChampsBon({ choix, valeurs }: { choix: ChoixBon; valeurs?: ValeursBon }) {
  const caisseParDefaut = valeurs?.caisseId ?? (choix.caisses.length === 1 ? choix.caisses[0].id : "");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={libelleChamp}>Nature de la dépense</span>
        <select name="nature" required defaultValue={valeurs?.nature ?? ""} className={CLASSE_CHAMP}>
          <option value="" disabled>
            Choisir…
          </option>
          {(Object.keys(NATURES_BON) as NatureBon[]).map((n) => (
            <option key={n} value={n}>
              {NATURES_BON[n].libelle}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={libelleChamp}>Montant (F)</span>
        <input name="montant" required inputMode="numeric" defaultValue={valeurs?.montant} className={`${CLASSE_CHAMP} chiffres`} />
      </label>
      <ChoixBeneficiaire
        libelle="Bénéficiaire"
        libelleNom="Nom et prénom du bénéficiaire"
        groupes={[
          { libelle: "Fournisseurs", fiches: choix.fournisseurs },
          { libelle: "Personnel", fiches: choix.personnel },
          { libelle: "Intervenants", fiches: choix.intervenants },
        ]}
        exemple="Kouassi Aya"
        initiale={valeurs ? { ref: valeurs.beneficiaireRef, nom: valeurs.beneficiaire } : undefined}
      />
      <label className="block">
        <span className={libelleChamp}>Caisse qui paie</span>
        <select name="caisseId" required defaultValue={caisseParDefaut} className={CLASSE_CHAMP}>
          <option value="" disabled>
            Choisir…
          </option>
          <OptionsComptes comptes={choix.caisses} sansBanque masquerSolde={choix.masquerSolde} />
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={libelleChamp}>À quoi sert la dépense</span>
        <input name="motif" required minLength={3} maxLength={500} defaultValue={valeurs?.motif} className={CLASSE_CHAMP} />
      </label>
    </div>
  );
}
