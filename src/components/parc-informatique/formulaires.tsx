"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import {
  attribuerLicence,
  creerEquipement,
  creerLicence,
  desattribuerLicence,
  modifierEquipement,
  retirerLicence,
} from "@/modules/parc-informatique/actions";
import { CATEGORIES_EQUIPEMENT, masquerCle } from "@/modules/parc-informatique/calcul";

export interface OptionUtilisateur {
  id: string;
  nom: string;
  matricule: string;
}

export interface FicheEquipementAffichee {
  categorie: string;
  marque: string | null;
  modele: string | null;
  numeroSerie: string | null;
  systeme: string | null;
  processeur: string | null;
  memoireGo: number | null;
  stockageGo: number | null;
  nomReseau: string | null;
  adresseIp: string | null;
  adresseMac: string | null;
  accessoires: string | null;
  utilisateurId: string | null;
}

const VIDE: FicheEquipementAffichee = {
  categorie: "portable",
  marque: null,
  modele: null,
  numeroSerie: null,
  systeme: null,
  processeur: null,
  memoireGo: null,
  stockageGo: null,
  nomReseau: null,
  adresseIp: null,
  adresseMac: null,
  accessoires: null,
  utilisateurId: null,
};

function ChampsEquipement({ initial, utilisateurs }: { initial: FicheEquipementAffichee; utilisateurs: OptionUtilisateur[] }) {
  const v = (x: string | number | null) => (x ?? "").toString();
  return (
    <>
      <Champ libelle="Catégorie">
        <select name="categorie" defaultValue={initial.categorie} className={CLASSE_CHAMP}>
          {Object.entries(CATEGORIES_EQUIPEMENT).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Marque">
        <input name="marque" defaultValue={v(initial.marque)} placeholder="HP" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Modèle">
        <input name="modele" defaultValue={v(initial.modele)} placeholder="ProBook 450 G9" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Numéro de série">
        <input name="numeroSerie" defaultValue={v(initial.numeroSerie)} className={`${CLASSE_CHAMP} chiffres uppercase`} />
      </Champ>
      <Champ libelle="Utilisateur">
        <select name="utilisateurId" defaultValue={v(initial.utilisateurId)} className={CLASSE_CHAMP}>
          <option value="">Non attribué</option>
          {utilisateurs.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nom} ({u.matricule})
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Système">
        <input name="systeme" defaultValue={v(initial.systeme)} placeholder="Windows 11 Pro" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Processeur">
        <input name="processeur" defaultValue={v(initial.processeur)} placeholder="Intel Core i5-1235U" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Mémoire (Go)">
        <input name="memoireGo" inputMode="numeric" defaultValue={v(initial.memoireGo)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Stockage (Go)">
        <input name="stockageGo" inputMode="numeric" defaultValue={v(initial.stockageGo)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Nom sur le réseau">
        <input name="nomReseau" defaultValue={v(initial.nomReseau)} placeholder="PC-COMPTA-01" className={`${CLASSE_CHAMP} chiffres uppercase`} />
      </Champ>
      <Champ libelle="Adresse IP">
        <input name="adresseIp" defaultValue={v(initial.adresseIp)} placeholder="192.168.1.20" className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Adresse MAC">
        <input name="adresseMac" defaultValue={v(initial.adresseMac)} placeholder="AA:BB:CC:DD:EE:FF" className={`${CLASSE_CHAMP} chiffres uppercase`} />
      </Champ>
      <Champ libelle="Accessoires">
        <input name="accessoires" defaultValue={v(initial.accessoires)} placeholder="Chargeur, sacoche, souris" className={CLASSE_CHAMP} />
      </Champ>
    </>
  );
}

export function FormulaireNouvelEquipement({ utilisateurs }: { utilisateurs: OptionUtilisateur[] }) {
  const [ouvert, setOuvert] = useState(false);
  const formulaire = useRef<HTMLFormElement>(null);
  const op = useOperation();

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {op.resultat?.ok && <span className="text-sm text-valide-600">{op.resultat.message}</span>}
        <button type="button" onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600">
          Nouvel équipement
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formulaire}
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(
          () => creerEquipement(donnees),
          () => {
            formulaire.current?.reset();
            setOuvert(false);
          },
        );
      }}
      className="mb-5 w-full space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Nouvel équipement</h2>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Désignation" precision="Par défaut : marque et modèle.">
          <input name="designation" placeholder="Portable de la comptabilité" className={CLASSE_CHAMP} />
        </Champ>
        <ChampsEquipement initial={VIDE} utilisateurs={utilisateurs} />
        <Champ libelle="Date d'achat">
          <input name="dateAcquisition" type="date" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Valeur d'achat (FCFA)">
          <input name="valeurAcquisition" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Fin de garantie" precision="Une alerte prévient avant d'en sortir.">
          <input name="garantieFin" type="date" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Site">
          <input name="site" placeholder="Siège" className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat && !op.resultat.ok ? op.resultat : null} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Ouvrir l'équipement"}
        </button>
      </div>
    </form>
  );
}

export function FormulaireFicheEquipement({ actifId, initial, utilisateurs }: { actifId: string; initial: FicheEquipementAffichee; utilisateurs: OptionUtilisateur[] }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => modifierEquipement(actifId, donnees));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ChampsEquipement initial={initial} utilisateurs={utilisateurs} />
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

/** Saisie d'une licence. Le fournisseur se choisit parmi les tiers ; le nom libre ne sert qu'à défaut de fiche. */
export function FormulaireLicence({ fournisseurs }: { fournisseurs: { id: string; nom: string }[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<"abonnement" | "perpetuelle">("abonnement");
  const [fournisseurId, setFournisseurId] = useState("");
  const formulaire = useRef<HTMLFormElement>(null);
  const op = useOperation();

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {op.resultat?.ok && <span className="text-sm text-valide-600">{op.resultat.message}</span>}
        <button type="button" onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600">
          Nouvelle licence
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formulaire}
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(
          () => creerLicence(donnees),
          () => {
            formulaire.current?.reset();
            setFournisseurId("");
            setOuvert(false);
          },
        );
      }}
      className="mb-5 w-full space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Nouvelle licence</h2>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Logiciel">
          <input name="logiciel" required placeholder="Microsoft 365 Business" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Éditeur">
          <input name="editeur" placeholder="Microsoft" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Type">
          <select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className={CLASSE_CHAMP}>
            <option value="abonnement">Abonnement</option>
            <option value="perpetuelle">Perpétuelle</option>
          </select>
        </Champ>
        <Champ libelle="Postes couverts">
          <input name="postes" required inputMode="numeric" defaultValue="1" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle={type === "abonnement" ? "Fin d'abonnement" : "Fin du support (facultatif)"}>
          <input name="expireLe" type="date" required={type === "abonnement"} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Coût (FCFA)">
          <input name="cout" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Fournisseur">
          <select name="fournisseurId" value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className={CLASSE_CHAMP}>
            <option value="">{fournisseurs.length ? "Sans fiche : saisir le nom" : "Aucun fournisseur en fiche"}</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </Champ>
        {fournisseurId === "" && (
          <Champ libelle="Nom du fournisseur">
            <input name="fournisseur" placeholder="Revendeur en ligne…" className={CLASSE_CHAMP} />
          </Champ>
        )}
        <Champ libelle="Clé d'activation">
          <input name="cle" autoComplete="off" spellCheck={false} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat && !op.resultat.ok ? op.resultat : null} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Enregistrer la licence"}
        </button>
      </div>
    </form>
  );
}

/** Clé masquée, dévoilée au clic : elle ne reste pas affichée sur un écran partagé. */
export function CleLicence({ cle }: { cle: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <button type="button" onClick={() => setVisible((v) => !v)} className="chiffres text-xs hover:underline" title={visible ? "Masquer" : "Afficher la clé"}>
      {visible ? cle : masquerCle(cle)}
    </button>
  );
}

function useAction() {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const routeur = useRouter();
  return {
    enCours,
    resultat,
    lancer(op: () => Promise<Resultat>) {
      setResultat(null);
      demarrer(async () => {
        const r = await op();
        setResultat(r);
        if (r.ok) routeur.refresh();
      });
    },
  };
}

export function RetirerLicence({ id, logiciel }: { id: string; logiciel: string }) {
  const a = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={a.enCours}
        onClick={() => window.confirm(`Retirer la licence ${logiciel} ? Ses installations tombent avec elle.`) && a.lancer(() => retirerLicence(id))}
        className="text-xs text-danger-600 hover:underline"
      >
        Retirer
      </button>
      {a.resultat && !a.resultat.ok && <span className="text-xs text-danger-600">{a.resultat.message}</span>}
    </span>
  );
}

/** Installer une licence sur un poste, depuis la fiche du poste. */
export function InstallerLicence({ actifId, licences }: { actifId: string; licences: { id: string; libelle: string }[] }) {
  const [choix, setChoix] = useState(licences[0]?.id ?? "");
  const a = useAction();
  if (licences.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={choix} onChange={(e) => setChoix(e.target.value)} className={`${CLASSE_CHAMP} h-9 w-auto`} aria-label="Licence à installer">
        {licences.map((l) => (
          <option key={l.id} value={l.id}>
            {l.libelle}
          </option>
        ))}
      </select>
      <button type="button" disabled={a.enCours || !choix} onClick={() => a.lancer(() => attribuerLicence(choix, actifId))} className="h-9 rounded-lg bg-marque-500 px-3 text-sm font-semibold text-white disabled:opacity-50">
        Installer
      </button>
      {a.resultat && <span className={`text-xs ${a.resultat.ok ? "text-valide-600" : "text-danger-600"}`}>{a.resultat.message}</span>}
    </div>
  );
}

export function DesinstallerLicence({ licenceId, actifId }: { licenceId: string; actifId: string }) {
  const a = useAction();
  return (
    <button type="button" disabled={a.enCours} onClick={() => a.lancer(() => desattribuerLicence(licenceId, actifId))} className="text-xs text-danger-600 hover:underline">
      Désinstaller
    </button>
  );
}
