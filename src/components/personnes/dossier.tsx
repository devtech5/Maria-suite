"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Portrait, reduirePhoto } from "@/components/personnes/photo";
import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ, Pastille, type TonPastille } from "@/components/ui/primitives";
import { LIENS_URGENCE } from "@/modules/personnes/calcul";
import {
  ajouterPiece,
  changerPhoto,
  modifierEtatCivil,
  modifierEtatProfessionnel,
  ouvrirPiece,
  retirerPiece,
} from "@/modules/personnes/actions-dossier";
import {
  GROUPES_PIECE,
  NATURES_PIECE,
  PIECES,
  type EtatPiece,
  type NaturePiece,
} from "@/modules/personnes/pieces";

export interface PieceAffichee {
  id: string;
  nature: NaturePiece;
  numero: string | null;
  organisme: string | null;
  precision: string | null;
  delivreeLe: string | null;
  expireLe: string | null;
  nomFichier: string | null;
  notes: string | null;
  etat: EtatPiece;
  jours: number | null;
}

const ETAT: Record<EtatPiece, { libelle: (j: number | null) => string; ton: TonPastille }> = {
  valide: { libelle: () => "Valide", ton: "valide" },
  expire_bientot: { libelle: (j) => (j === 0 ? "Expire aujourd'hui" : `Expire dans ${j} j`), ton: "alerte" },
  expiree: { libelle: () => "Expirée", ton: "danger" },
  remplacee: { libelle: () => "Remplacée", ton: "neutre" },
  sans_echeance: { libelle: () => "Sans échéance", ton: "neutre" },
};

function dateFr(iso: string | null): string {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

/** Pièces du dossier, rangées par groupe. Le fichier s'ouvre au clic, tracé. */
export function ListePieces({ pieces, peutGerer }: { pieces: PieceAffichee[]; peutGerer: boolean }) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  if (pieces.length === 0) {
    return <p className="text-sm text-[var(--encre-faible)]">Aucune pièce au dossier.</p>;
  }

  function ouvrir(id: string) {
    setResultat(null);
    // La fenêtre s'ouvre AVANT l'appel : ouverte après un `await`, elle serait
    // bloquée comme fenêtre surgissante.
    const fenetre = window.open("about:blank", "_blank");
    demarrer(async () => {
      const url = await ouvrirPiece(id);
      if (!url) {
        fenetre?.close();
        setResultat({ ok: false, message: "Fichier indisponible : dépôt de fichiers muet, ou accès refusé." });
        return;
      }
      if (fenetre) {
        fenetre.opener = null;
        fenetre.location.href = url;
      } else {
        window.location.href = url;
      }
    });
  }

  function retirer(id: string, libelle: string) {
    if (!window.confirm(`Retirer « ${libelle} » du dossier ? Le fichier sera effacé.`)) return;
    setResultat(null);
    demarrer(async () => {
      const r = await retirerPiece(id);
      setResultat(r);
      if (r.ok) routeur.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {GROUPES_PIECE.map((groupe) => {
        const dugroupe = pieces.filter((p) => PIECES[p.nature].groupe === groupe.cle);
        if (dugroupe.length === 0) return null;
        return (
          <section key={groupe.cle}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--encre-faible)]">{groupe.libelle}</h3>
            <ul className="divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
              {dugroupe.map((p) => {
                const def = PIECES[p.nature];
                const titre = p.nature === "autre" || p.nature === "diplome" ? (p.precision ?? def.libelle) : def.libelle;
                const etat = ETAT[p.etat];
                return (
                  <li key={p.id} className={`flex flex-wrap items-start gap-3 p-3 ${p.etat === "remplacee" ? "opacity-60" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {titre}
                        <Pastille ton={etat.ton}>{etat.libelle(p.jours)}</Pastille>
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--encre-douce)]">
                        {[
                          p.numero && `${def.numero ?? "N°"} : ${p.numero}`,
                          p.organisme,
                          p.nature !== "autre" && p.nature !== "diplome" && p.precision,
                          p.delivreeLe && `délivrée le ${dateFr(p.delivreeLe)}`,
                          p.expireLe && `valable jusqu'au ${dateFr(p.expireLe)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {p.notes && <p className="mt-0.5 text-xs text-[var(--encre-faible)]">{p.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.nomFichier ? (
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => ouvrir(p.id)}
                          className="h-8 rounded-lg border border-[var(--filet)] px-3 text-xs font-medium hover:bg-[var(--surface-creuse)]"
                          title={p.nomFichier}
                        >
                          Ouvrir
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--encre-faible)]">Sans fichier</span>
                      )}
                      {peutGerer && (
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => retirer(p.id, titre)}
                          className="h-8 rounded-lg px-2 text-xs text-danger-600 hover:bg-danger-50"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <Retour resultat={resultat} />
    </div>
  );
}

/** Ajout d'une pièce : le formulaire ne montre que les champs que la nature porte. */
export function FormulairePiece({ employeeId, depotActif }: { employeeId: string; depotActif: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [nature, setNature] = useState<NaturePiece>("cni");
  const formulaire = useRef<HTMLFormElement>(null);
  const op = useOperation();
  const def = PIECES[nature];

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600"
      >
        Ajouter une pièce
      </button>
    );
  }

  return (
    <form
      ref={formulaire}
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(
          () => ajouterPiece(employeeId, donnees),
          () => {
            formulaire.current?.reset();
            setOuvert(false);
          },
        );
      }}
      className="space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nouvelle pièce</h3>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Pièce">
          <select name="nature" value={nature} onChange={(e) => setNature(e.target.value as NaturePiece)} className={CLASSE_CHAMP}>
            {GROUPES_PIECE.map((g) => (
              <optgroup key={g.cle} label={g.libelle}>
                {NATURES_PIECE.filter((n) => PIECES[n].groupe === g.cle).map((n) => (
                  <option key={n} value={n}>
                    {PIECES[n].libelle}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Champ>
        {def.precision && (
          <Champ libelle={def.precision}>
            <input name="precision" required={nature === "autre"} className={CLASSE_CHAMP} />
          </Champ>
        )}
        {def.numero && (
          <Champ libelle={def.numero}>
            <input name="numero" className={`${CLASSE_CHAMP} chiffres`} autoComplete="off" />
          </Champ>
        )}
        {def.organisme && (
          <Champ libelle={def.organisme}>
            <input name="organisme" className={CLASSE_CHAMP} />
          </Champ>
        )}
        {def.delivrance && (
          <Champ libelle="Délivrée le">
            <input name="delivreeLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
        )}
        {def.expiration && (
          <Champ libelle="Valable jusqu'au" precision="Une alerte prévient 30 jours avant.">
            <input name="expireLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
          </Champ>
        )}
        <Champ
          libelle={def.fichierRequis ? "Document" : "Scan ou photo (facultatif)"}
          precision={depotActif ? "PDF, photo ou Word, 10 Mo au plus." : "Dépôt de fichiers inactif : la pièce s'enregistre sans fichier."}
        >
          <input
            name="fichier"
            type="file"
            disabled={!depotActif}
            required={def.fichierRequis && depotActif}
            accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx"
            className="block w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-[var(--filet)] file:bg-[var(--surface)] file:px-3"
          />
        </Champ>
        <Champ libelle="Remarque">
          <input name="notes" className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Envoi…" : "Enregistrer la pièce"}
        </button>
      </div>
    </form>
  );
}

export interface EtatCivilAffiche {
  dateNaissance: string | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  sexe: string | null;
  situationFamiliale: string | null;
  enfantsACharge: number | null;
  contactUrgence: string | null;
  contactUrgenceLien: string | null;
  contactUrgenceTelephone: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  numeroCnps: string | null;
}

export const SITUATIONS: Record<string, string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  union_libre: "Union libre",
  divorce: "Divorcé(e)",
  veuf: "Veuf ou veuve",
};

/** État civil et coordonnées, modifiables par qui tient les dossiers. */
export function FormulaireEtatCivil({ employeeId, initial }: { employeeId: string; initial: EtatCivilAffiche }) {
  const op = useOperation();
  const v = (cle: keyof EtatCivilAffiche) => (initial[cle] ?? "").toString();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => modifierEtatCivil(employeeId, donnees));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Date de naissance">
          <input name="dateNaissance" type="date" defaultValue={v("dateNaissance")} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Lieu de naissance">
          <input name="lieuNaissance" defaultValue={v("lieuNaissance")} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Nationalité">
          <input name="nationalite" defaultValue={v("nationalite")} placeholder="Ivoirienne" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Sexe">
          <select name="sexe" defaultValue={v("sexe")} className={CLASSE_CHAMP}>
            <option value="">—</option>
            <option value="F">Femme</option>
            <option value="M">Homme</option>
          </select>
        </Champ>
        <Champ libelle="Situation familiale">
          <select name="situationFamiliale" defaultValue={v("situationFamiliale")} className={CLASSE_CHAMP}>
            <option value="">—</option>
            {Object.entries(SITUATIONS).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Enfants à charge" precision="Compte dans les parts de l'impôt sur salaire.">
          <input name="enfantsACharge" type="number" min={0} max={30} defaultValue={v("enfantsACharge")} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Téléphone">
          <input name="telephone" defaultValue={v("telephone")} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Adresse électronique">
          <input name="email" type="email" defaultValue={v("email")} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Numéro CNPS">
          <input name="numeroCnps" defaultValue={v("numeroCnps")} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Adresse">
          <input name="adresse" defaultValue={v("adresse")} placeholder="Commune, quartier, repère" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Personne à prévenir" precision="En cas d'urgence : nom et prénoms.">
          <input name="contactUrgence" defaultValue={v("contactUrgence")} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Lien avec le salarié">
          <select name="contactUrgenceLien" defaultValue={v("contactUrgenceLien")} className={CLASSE_CHAMP}>
            <option value="">—</option>
            {Object.entries(LIENS_URGENCE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Téléphone de la personne à prévenir">
          <input name="contactUrgenceTelephone" type="tel" defaultValue={v("contactUrgenceTelephone")} placeholder="07 00 00 00 00" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
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

export interface EtatProfessionnelAffiche {
  emailProfessionnel: string | null;
  poste: string;
  service: string | null;
  superieurId: string | null;
  finPeriodeEssai: string | null;
}

/**
 * État professionnel : ce qui se modifie. Matricule, contrat et dates
 * d'entrée s'affichent au-dessus, en lecture : ils viennent de l'embauche et
 * le matricule en dérive.
 */
export function FormulaireEtatProfessionnel({
  employeeId,
  initial,
  collegues,
}: {
  employeeId: string;
  initial: EtatProfessionnelAffiche;
  collegues: { id: string; nom: string; poste: string; actif: boolean }[];
}) {
  const op = useOperation();
  const v = (cle: keyof EtatProfessionnelAffiche) => (initial[cle] ?? "").toString();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => modifierEtatProfessionnel(employeeId, donnees));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Adresse e-mail professionnelle" precision="Celle de l'entreprise, distincte de l'adresse personnelle.">
          <input name="emailProfessionnel" type="email" defaultValue={v("emailProfessionnel")} placeholder="prenom.nom@maria-groupe.com" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Fonction">
          <input name="poste" required defaultValue={v("poste")} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Service">
          <input name="service" defaultValue={v("service")} placeholder="Comptabilité, Logistique…" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Supérieur hiérarchique">
          <select name="superieurId" defaultValue={v("superieurId")} className={CLASSE_CHAMP}>
            <option value="">— Aucun —</option>
            {collegues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} · {c.poste}
                {c.actif ? "" : " (sorti)"}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Fin de la période d'essai" precision="Vide s'il n'y a pas d'essai.">
          <input name="finPeriodeEssai" type="date" defaultValue={v("finPeriodeEssai")} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
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

/** Photo de la fiche, changée sur place. */
export function PhotoSalarie({ employeeId, photo, nom, peutGerer }: { employeeId: string; photo: string | null; nom: string; peutGerer: boolean }) {
  const champ = useRef<HTMLInputElement>(null);
  const op = useOperation();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <Portrait photo={photo} nom={nom} taille="grande" />
      {peutGerer && (
        <>
          <input
            ref={champ}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choisir une photo"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setErreur(null);
              try {
                const reduite = await reduirePhoto(f);
                op.lancer(() => changerPhoto(employeeId, reduite));
              } catch (err) {
                setErreur(err instanceof Error ? err.message : "Photo illisible.");
              }
            }}
          />
          <div className="flex gap-2 text-xs">
            <button type="button" disabled={op.enCours} onClick={() => champ.current?.click()} className="text-marque-600 hover:underline">
              {photo ? "Changer" : "Ajouter une photo"}
            </button>
            {photo && (
              <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => changerPhoto(employeeId, null))} className="text-danger-600 hover:underline">
                Retirer
              </button>
            )}
          </div>
          {erreur && <p className="text-xs text-danger-600">{erreur}</p>}
          {op.resultat && !op.resultat.ok && <p className="text-xs text-danger-600">{op.resultat.message}</p>}
        </>
      )}
    </div>
  );
}
