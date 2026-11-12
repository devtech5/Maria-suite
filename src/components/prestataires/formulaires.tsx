"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ChoixOrigine } from "@/components/tiers/choix-origine";
import { Fenetre } from "@/components/ui/fenetre";
import { Retour, useOperation, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import {
  changerStatutPrestation,
  confierPrestation,
  evaluerPrestation,
  inscrirePrestataire,
  modifierPrestataire,
  payerPrestation,
} from "@/modules/prestataires/actions";
import { referentielPays } from "@/lib/pays";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS } from "@/modules/tiers/natures";
import type { OrigineTiers } from "@/modules/tiers/origine";
import { COMPTES_CHARGE, METIERS_COURANTS, UNITES_TARIF, type CompteCharge, type StatutPrestation } from "@/modules/prestataires/calcul";

export interface ProfilAffiche {
  metiers: string[];
  specialites: string | null;
  zone: string | null;
  tarif: number | null;
  uniteTarif: string | null;
  formel: boolean;
  mobileMoney: string | null;
  disponible: boolean;
  notes: string | null;
}

function ChampsProfil({ initial }: { initial?: ProfilAffiche }) {
  const autres = (initial?.metiers ?? []).filter((m) => !(METIERS_COURANTS as readonly string[]).includes(m));
  return (
    <>
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="mb-1.5 text-sm font-medium">Métiers</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {METIERS_COURANTS.map((m) => (
            <label key={m} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="metiers" value={m} defaultChecked={initial?.metiers.includes(m)} className="size-4" />
              {m}
            </label>
          ))}
        </div>
        <input name="autreMetier" defaultValue={autres.join(", ")} placeholder="Autre métier (séparés par des virgules)" className={`${CLASSE_CHAMP} mt-2`} />
      </fieldset>
      <Champ libelle="Spécialités">
        <input name="specialites" defaultValue={initial?.specialites ?? ""} placeholder="Chauffe-eau, fuites, sanitaires" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Zone d'intervention">
        <input name="zone" defaultValue={initial?.zone ?? ""} placeholder="Cocody, Plateau, Marcory" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle="Tarif indicatif (FCFA)">
        <input name="tarif" inputMode="numeric" defaultValue={initial?.tarif ?? ""} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Par">
        <select name="uniteTarif" defaultValue={initial?.uniteTarif ?? "prestation"} className={CLASSE_CHAMP}>
          {Object.entries(UNITES_TARIF).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Numéro mobile money">
        <input name="mobileMoney" defaultValue={initial?.mobileMoney ?? ""} placeholder="07 07 00 00 00" className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="formel" defaultChecked={initial?.formel} className="size-4" />
        Déclaré (NCC, RCCM)
      </label>
      {initial && (
        <Champ libelle="Disponibilité">
          <select name="disponible" defaultValue={initial.disponible ? "on" : "off"} className={CLASSE_CHAMP}>
            <option value="on">Disponible</option>
            <option value="off">Indisponible pour l&apos;instant</option>
          </select>
        </Champ>
      )}
      <Champ libelle="Remarques">
        <input name="notes" defaultValue={initial?.notes ?? ""} className={CLASSE_CHAMP} />
      </Champ>
    </>
  );
}

/**
 * Inscription d'un prestataire, dans une modale centrée : son type
 * (particulier, entreprise, ONG, mutuelle, association, coopérative), s'il est
 * local ou international, puis son profil.
 */
export function FormulaireInscription({ paysEntreprise }: { paysEntreprise: string }) {
  const [ouvert, setOuvert] = useState(false);
  const op = useOperation();
  const routeur = useRouter();
  const [origine, setOrigine] = useState<OrigineTiers>("local");
  const [pays, setPays] = useState("");
  // Le libellé de l'identifiant fiscal suit le pays du prestataire : « NCC » en Côte d'Ivoire, le sigle de son pays à l'étranger.
  const fiscal = referentielPays(origine === "international" ? pays : paysEntreprise);

  return (
    <>
      <div className="flex items-center gap-3">
        {op.resultat?.ok && <span className="text-sm text-valide-600">{op.resultat.message}</span>}
        <button type="button" onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600">
          Inscrire un prestataire
        </button>
      </div>
      {ouvert && (
        <Fenetre ouverte titre="Nouveau prestataire" presentation="ample" onFermer={() => setOuvert(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const donnees = new FormData(e.currentTarget);
              op.lancer(
                () => inscrirePrestataire(donnees),
                (r) => {
                  setOuvert(false);
                  if ("id" in r && r.id) routeur.push(`/prestataires/${r.id}`);
                },
              );
            }}
            className="flex flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 px-5 py-4">
              <ChoixOrigine libelle="Le prestataire est" paysEntreprise={paysEntreprise} origine={origine} pays={pays} onOrigine={setOrigine} onPays={setPays} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Champ libelle="Nom">
                  <input name="nom" required autoFocus placeholder="Koné Plomberie" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Type de prestataire">
                  <select name="nature" defaultValue="particulier" className={CLASSE_CHAMP}>
                    {NATURES_TIERS.map((n) => (
                      <option key={n} value={n}>
                        {LIBELLE_NATURE_TIERS[n]}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Téléphone">
                  <input name="telephone" placeholder={origine === "international" ? "+33 1 00 00 00 00" : "07 07 00 00 00"} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="E-mail">
                  <input name="email" type="email" className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle="Ville">
                  <input name="ville" placeholder={origine === "international" ? "Paris" : "Abidjan"} className={CLASSE_CHAMP} />
                </Champ>
                <Champ libelle={fiscal.identifiantFiscal}>
                  <input name="identifiantFiscal" className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <ChampsProfil />
              </div>
            </div>
            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-[var(--filet)] bg-[var(--surface)] px-5 py-3">
              <Retour resultat={op.resultat && !op.resultat.ok ? op.resultat : null} />
              <button type="button" onClick={() => setOuvert(false)} className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
                Annuler
              </button>
              <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
                {op.enCours ? "Enregistrement…" : "Inscrire"}
              </button>
            </div>
          </form>
        </Fenetre>
      )}
    </>
  );
}

export function FormulaireProfil({ id, initial }: { id: string; initial: ProfilAffiche }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => modifierPrestataire(id, donnees));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ChampsProfil initial={initial} />
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

export function FormulairePrestation({ prestataires, fixe }: { prestataires: { id: string; nom: string }[]; fixe?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const formulaire = useRef<HTMLFormElement>(null);
  const op = useOperation();
  if (!ouvert) {
    return (
      <div className="flex items-center gap-3">
        {op.resultat?.ok && <span className="text-sm text-valide-600">{op.resultat.message}</span>}
        <button type="button" disabled={prestataires.length === 0} onClick={() => setOuvert(true)} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white hover:bg-marque-600 disabled:opacity-50">
          Confier une prestation
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
          () => confierPrestation(donnees),
          () => {
            formulaire.current?.reset();
            setOuvert(false);
          },
        );
      }}
      className="mb-5 w-full space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Nouvelle prestation</h2>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fixe ? (
          <input type="hidden" name="prestataireId" value={fixe} />
        ) : (
          <Champ libelle="Prestataire">
            <select name="prestataireId" className={CLASSE_CHAMP}>
              {prestataires.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}
        <Champ libelle="Objet">
          <input name="objet" required placeholder="Réparation fuite cuisine" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Lieu">
          <input name="lieu" placeholder="Boutique de Treichville" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Prévue le">
          <input name="prevueLe" type="date" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Montant convenu (FCFA)">
          <input name="montantConvenu" inputMode="numeric" className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Détails">
          <input name="description" className={CLASSE_CHAMP} />
        </Champ>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat && !op.resultat.ok ? op.resultat : null} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

/** Gestes sur une prestation : confirmer, constater, annuler, noter, payer. */
export function ActionsPrestation({
  id,
  statut,
  note,
  montantConvenu,
  compteDefaut,
  comptes,
  peutGerer,
  peutPayer,
}: {
  id: string;
  statut: StatutPrestation;
  note: number | null;
  montantConvenu: number | null;
  compteDefaut: CompteCharge;
  comptes: { id: string; nom: string }[];
  peutGerer: boolean;
  peutPayer: boolean;
}) {
  const [panneau, setPanneau] = useState<"noter" | "payer" | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const agir = (op: () => Promise<Resultat>) =>
    demarrer(async () => {
      const r = await op();
      setResultat(r);
      if (r.ok) {
        setPanneau(null);
        routeur.refresh();
      }
    });
  const bouton = "h-8 rounded-lg border border-[var(--filet)] px-2.5 text-xs font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        {peutGerer && statut === "demandee" && (
          <button type="button" disabled={enCours} onClick={() => agir(() => changerStatutPrestation(id, "confirmee"))} className={bouton}>
            Confirmer
          </button>
        )}
        {peutGerer && (statut === "demandee" || statut === "confirmee") && (
          <button type="button" disabled={enCours} onClick={() => agir(() => changerStatutPrestation(id, "realisee"))} className={bouton}>
            Réalisée
          </button>
        )}
        {peutGerer && (statut === "demandee" || statut === "confirmee") && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => {
              const motif = window.prompt("Motif de l'annulation ?");
              if (motif) agir(() => changerStatutPrestation(id, "annulee", motif));
            }}
            className={`${bouton} text-danger-600`}
          >
            Annuler
          </button>
        )}
        {peutGerer && (statut === "realisee" || statut === "payee") && (
          <button type="button" disabled={enCours} onClick={() => setPanneau(panneau === "noter" ? null : "noter")} className={bouton}>
            {note ? "Modifier l'avis" : "Noter"}
          </button>
        )}
        {peutPayer && statut === "realisee" && (
          <button type="button" disabled={enCours} onClick={() => setPanneau(panneau === "payer" ? null : "payer")} className={`${bouton} border-marque-500 text-marque-600`}>
            Payer
          </button>
        )}
      </div>

      {panneau === "noter" && <Notation note={note} enCours={enCours} onValider={(n, avis) => agir(() => evaluerPrestation(id, n, avis))} />}

      {panneau === "payer" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const donnees = new FormData(e.currentTarget);
            agir(() => payerPrestation(id, donnees));
          }}
          className="grid gap-2 rounded-lg bg-[var(--surface-creuse)] p-3 text-left sm:grid-cols-2"
        >
          <Champ libelle="Montant payé (FCFA)">
            <input name="montant" required inputMode="numeric" defaultValue={montantConvenu ?? ""} className={`${CLASSE_CHAMP} chiffres h-9`} />
          </Champ>
          <Champ libelle="Retenue à la source (%)" precision="Selon le régime du prestataire — à vérifier avec votre comptable.">
            <input name="retenue" inputMode="decimal" defaultValue="0" className={`${CLASSE_CHAMP} chiffres h-9`} />
          </Champ>
          <Champ libelle="Compte de charge">
            <select name="compteCharge" defaultValue={compteDefaut} className={`${CLASSE_CHAMP} h-9`}>
              {Object.entries(COMPTES_CHARGE).map(([numero, libelle]) => (
                <option key={numero} value={numero}>
                  {numero} — {libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Payé depuis">
            <select name="compteTresorerieId" required className={`${CLASSE_CHAMP} h-9`}>
              {comptes.length === 0 && <option value="">Aucun compte de trésorerie</option>}
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Date">
            <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={`${CLASSE_CHAMP} chiffres h-9`} />
          </Champ>
          <div className="flex items-end justify-end">
            <button type="submit" disabled={enCours || comptes.length === 0} className="h-9 rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {enCours ? "Paiement…" : "Payer et comptabiliser"}
            </button>
          </div>
        </form>
      )}
      {resultat && <p className={`text-right text-xs ${resultat.ok ? "text-valide-600" : "text-danger-600"}`}>{resultat.message}</p>}
    </div>
  );
}

function Notation({ note, enCours, onValider }: { note: number | null; enCours: boolean; onValider: (note: number, avis: string) => void }) {
  const [valeur, setValeur] = useState(note ?? 0);
  const [avis, setAvis] = useState("");
  return (
    <div className="space-y-2 rounded-lg bg-[var(--surface-creuse)] p-3 text-left">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Note sur 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={valeur === n} aria-label={`${n} sur 5`} onClick={() => setValeur(n)} className={`text-2xl leading-none ${n <= valeur ? "text-alerte-500" : "text-[var(--filet)]"}`}>
            ★
          </button>
        ))}
      </div>
      <textarea value={avis} onChange={(e) => setAvis(e.target.value)} rows={2} placeholder="Ponctuel, travail propre…" className={`${CLASSE_CHAMP} h-auto py-2`} />
      <div className="flex justify-end">
        <button type="button" disabled={enCours || valeur === 0} onClick={() => onValider(valeur, avis)} className="h-9 rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
          Enregistrer l&apos;avis
        </button>
      </div>
    </div>
  );
}

/** Étoiles en lecture seule. */
export function Etoiles({ dixiemes }: { dixiemes: number | null }) {
  if (dixiemes === null) return <span className="text-xs text-[var(--encre-faible)]">Pas encore noté</span>;
  const pleines = Math.round(dixiemes / 10);
  const lisible = `${Math.floor(dixiemes / 10)},${dixiemes % 10}`;
  return (
    <span className="inline-flex items-center gap-1" title={`${lisible} / 5`}>
      <span className="text-alerte-500" aria-hidden>
        {"★".repeat(pleines)}
        <span className="text-[var(--filet)]">{"★".repeat(5 - pleines)}</span>
      </span>
      <span className="chiffres text-xs text-[var(--encre-douce)]">{lisible}</span>
    </span>
  );
}
