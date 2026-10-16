"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Champ, CLASSE_CHAMP, EtatVide, Pastille, type TonPastille } from "@/components/ui/primitives";
import { fmt, fmtDateIso, fmtTauxBp } from "@/lib/format";
import { formaterQuantite, type CodeUnite } from "@/lib/quantite";
import {
  annulerFacture,
  convertirDevis,
  deciderDevis,
  emettrePiece,
  encaisserFacture,
  supprimerBrouillon,
  type Resultat,
} from "@/modules/facturation/actions";
import { envoyerPiece } from "@/modules/communication/actions";
import { resteDu, totaliserPiece } from "@/modules/facturation/calcul";
import { ChoixCompteTresorerie } from "@/components/tresorerie/choix-compte";
import type {
  LignePieceVue,
  OptionsPiece,
  PieceListee,
  ReglementVue,
} from "@/modules/facturation/requetes";

import { EditeurPiece, type PieceAEditer } from "./editeur-piece";

const NATURE = { devis: "Devis", facture: "Facture", avoir: "Avoir" } as const;

type Filtre = "tout" | "devis" | "facture" | "avoir";

const ONGLET: Record<Filtre, string> = {
  tout: "Toutes",
  facture: "Factures",
  devis: "Devis",
  avoir: "Avoirs",
};

/** Statut tel que le lit l'utilisateur : « payée » se déduit des règlements. */
function etat(piece: PieceListee): { libelle: string; ton: TonPastille } {
  if (piece.statut === "brouillon") return { libelle: "Brouillon", ton: "neutre" };
  if (piece.statut === "annulee") return { libelle: "Annulée", ton: "neutre" };
  if (piece.nature === "devis") {
    return {
      emise: { libelle: "Envoyé", ton: "marque" as TonPastille },
      acceptee: { libelle: "Accepté", ton: "valide" as TonPastille },
      refusee: { libelle: "Refusé", ton: "danger" as TonPastille },
      convertie: { libelle: "Facturé", ton: "valide" as TonPastille },
    }[piece.statut as "emise" | "acceptee" | "refusee" | "convertie"];
  }
  if (piece.nature === "avoir") return { libelle: "Émis", ton: "marque" };
  const reste = resteDu(piece.totalTtc, piece.regle);
  if (reste === 0) return { libelle: "Payée", ton: "valide" };
  if (piece.enRetard) return { libelle: "En retard", ton: "danger" };
  if (piece.regle > 0) return { libelle: "Partiellement payée", ton: "alerte" };
  return { libelle: "À encaisser", ton: "marque" };
}

const MOYENS = [
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "mobile_money", libelle: "Mobile money" },
  { valeur: "banque", libelle: "Virement / chèque" },
] as const;

export function PiecesCommerciales({
  pieces,
  filtrees = false,
  recherche,
  lignes,
  reglements,
  options,
  aujourdHui,
  droits,
  ouvrir,
}: {
  /** Pièces à lister, déjà filtrées par la recherche de la page. */
  pieces: PieceListee[];
  /** Vrai si une recherche est posée : une liste vide veut alors dire « aucun résultat ». */
  filtrees?: boolean;
  /** Formulaire de recherche (`?q=`, `?du=`, `?au=`), rendu au-dessus de la liste. */
  recherche?: ReactNode;
  lignes: Record<string, LignePieceVue[]>;
  reglements: Record<string, ReglementVue[]>;
  options: OptionsPiece;
  aujourdHui: string;
  droits: { gerer: boolean; annuler: boolean; encaisser: boolean; envoyer: boolean };
  /** Pièce à ouvrir d'emblée, demandée depuis la fiche d'un client. */
  ouvrir?: { nature: "devis" | "facture"; clientId: string };
}) {
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [selectionId, setSelectionId] = useState<string | null>(pieces[0]?.id ?? null);
  const [edition, setEdition] = useState<PieceAEditer | null>(() =>
    ouvrir
      ? {
          nature: ouvrir.nature,
          clientId: ouvrir.clientId,
          projetId: null,
          datePiece: aujourdHui,
          echeance: null,
          depotId: null,
          notes: null,
          lignes: [],
        }
      : null,
  );
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  const visibles = pieces.filter((p) => filtre === "tout" || p.nature === filtre);
  const selection = pieces.find((p) => p.id === selectionId) ?? null;

  function agir(action: () => Promise<Resultat>, apres?: (r: Resultat) => void) {
    setMessage(null);
    demarrer(async () => {
      const resultat = await action();
      setMessage({ ok: resultat.ok, texte: resultat.message ?? (resultat.ok ? "Fait." : "") });
      if (resultat.ok) {
        apres?.(resultat);
        routeur.refresh();
      }
    });
  }

  function nouvelle(nature: "devis" | "facture") {
    setMessage(null);
    setEdition({
      nature,
      clientId: "",
      projetId: null,
      datePiece: aujourdHui,
      echeance: null,
      depotId: null,
      notes: null,
      lignes: [],
    });
  }

  if (edition) {
    return (
      <EditeurPiece
        options={options}
        initiale={edition}
        onAnnuler={() => setEdition(null)}
        onTermine={(id) => {
          setEdition(null);
          setSelectionId(id);
          setMessage({ ok: true, texte: "Brouillon enregistré. Relisez-le, puis émettez-le." });
          routeur.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1 rounded-lg bg-[var(--surface-creuse)] p-1 text-sm">
          {(["tout", "facture", "devis", "avoir"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filtre === f}
              onClick={() => setFiltre(f)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                filtre === f ? "bg-[var(--surface)] shadow-sm" : "text-[var(--encre-douce)]"
              }`}
            >
              {ONGLET[f]}
            </button>
          ))}
        </div>
        {droits.gerer && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => nouvelle("devis")}
              className="h-cible rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium"
            >
              Nouveau devis
            </button>
            <button
              type="button"
              onClick={() => nouvelle("facture")}
              disabled={options.clients.length === 0}
              className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
            >
              Nouvelle facture
            </button>
          </div>
        )}
      </div>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
            message.ok ? "bg-valide-50 text-valide-600" : "bg-danger-50 text-danger-600"
          }`}
        >
          {message.texte}
        </p>
      )}

      {recherche}

      {pieces.length === 0 && filtrees ? (
        <EtatVide titre="Aucune pièce ne répond" message="Élargissez la période ou retirez un mot de la recherche." />
      ) : pieces.length === 0 ? (
        <EtatVide
          titre="Aucun devis, aucune facture"
          message={
            options.clients.length === 0
              ? "Créez d'abord un client : une pièce commerciale s'adresse toujours à quelqu'un."
              : "Un devis se prépare en brouillon, s'envoie, puis se convertit en facture. L'émission d'une facture sort le stock et passe l'écriture d'un seul geste."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <ul className="h-fit divide-y divide-[var(--filet)] overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
            {visibles.map((piece) => {
              const e = etat(piece);
              const actif = piece.id === selectionId;
              return (
                <li key={piece.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectionId(piece.id);
                      setMessage(null);
                    }}
                    aria-current={actif ? "true" : undefined}
                    className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left ${
                      actif ? "bg-[var(--surface-creuse)]" : "hover:bg-[var(--surface-creuse)]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="chiffres block text-xs text-[var(--encre-faible)]">
                        {piece.numero ?? `${NATURE[piece.nature]} · brouillon`} ·{" "}
                        {fmtDateIso(piece.datePiece)}
                      </span>
                      <span className="block truncate text-sm font-medium">{piece.clientNom}</span>
                      <span className="mt-1 inline-block">
                        <Pastille ton={e.ton}>{e.libelle}</Pastille>
                      </span>
                    </span>
                    <span className="chiffres shrink-0 text-sm font-semibold">
                      {fmt(piece.totalTtc)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selection && (
            <DetailPiece
              key={selection.id}
              piece={selection}
              lignes={lignes[selection.id] ?? []}
              reglements={reglements[selection.id] ?? []}
              aujourdHui={aujourdHui}
              droits={droits}
              enCours={enCours}
              agir={agir}
              onModifier={() =>
                setEdition({
                  id: selection.id,
                  nature: selection.nature === "devis" ? "devis" : "facture",
                  clientId: selection.clientId,
                  projetId: selection.projetId,
                  datePiece: selection.datePiece,
                  echeance: selection.echeance,
                  depotId: selection.depotId,
                  commercialId: selection.commercialId,
                  contactId: selection.contactId,
                  notes: selection.notes,
                  lignes: (lignes[selection.id] ?? []).map((l) => ({
                    articleId: l.articleId,
                    designation: l.designation,
                    quantite: l.quantite,
                    prixUnitaireHt: l.prixUnitaireHt,
                    remise: l.remise,
                  })),
                })
              }
              onSelectionner={setSelectionId}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DetailPiece({
  piece,
  lignes,
  reglements,
  aujourdHui,
  droits,
  enCours,
  agir,
  onModifier,
  onSelectionner,
}: {
  piece: PieceListee;
  lignes: LignePieceVue[];
  reglements: ReglementVue[];
  aujourdHui: string;
  droits: { gerer: boolean; annuler: boolean; encaisser: boolean; envoyer: boolean };
  enCours: boolean;
  agir: (action: () => Promise<Resultat>, apres?: (r: Resultat) => void) => void;
  onModifier: () => void;
  onSelectionner: (id: string) => void;
}) {
  const [panneau, setPanneau] = useState<"encaisser" | "annuler" | "envoyer" | null>(null);
  const e = etat(piece);
  const reste = resteDu(piece.totalTtc, piece.regle);
  const parTaux = totaliserPiece(
    lignes.map((l) => ({
      designation: l.designation,
      quantite: l.quantite,
      prixUnitaireHt: l.prixUnitaireHt,
      remise: l.remise,
      tauxTva: l.tauxTva,
      compteVente: l.compteVente,
    })),
  ).parTaux;

  const factureOuverte = piece.nature === "facture" && piece.statut === "emise";

  return (
    <section className="min-w-0 rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--filet)] p-4">
        <div>
          <p className="chiffres text-xs text-[var(--encre-faible)]">
            {NATURE[piece.nature]} {piece.numero ?? "— brouillon, sans numéro"}
            {piece.origineNumero && ` · issu de ${piece.origineNumero}`}
          </p>
          <h2 className="text-base font-semibold">{piece.clientNom}</h2>
          <p className="chiffres mt-0.5 text-xs text-[var(--encre-douce)]">
            Du {fmtDateIso(piece.datePiece)}
            {piece.echeance &&
              ` · ${piece.nature === "devis" ? "valable jusqu'au" : "échéance"} ${fmtDateIso(piece.echeance)}`}
            {piece.ecritureNumero && ` · écriture ${piece.ecritureNumero}`}
          </p>
        </div>
        <Pastille ton={e.ton}>{e.libelle}</Pastille>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--encre-faible)]">
              <th className="px-4 py-2 font-medium">Désignation</th>
              <th className="px-2 py-2 text-right font-medium">Qté</th>
              <th className="px-2 py-2 text-right font-medium">PU HT</th>
              <th className="px-2 py-2 text-right font-medium">TVA</th>
              <th className="px-4 py-2 text-right font-medium">Montant HT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--filet)]">
            {lignes.map((l, index) => (
              <tr key={index}>
                <td className="px-4 py-2">
                  {l.designation}
                  {l.remise > 0 && (
                    <span className="block text-xs text-[var(--encre-faible)]">
                      remise {fmt(l.remise)}
                    </span>
                  )}
                </td>
                <td className="chiffres px-2 py-2 text-right">
                  {formaterQuantite(l.quantite, l.unite as CodeUnite)}
                </td>
                <td className="chiffres px-2 py-2 text-right">{fmt(l.prixUnitaireHt)}</td>
                <td className="chiffres px-2 py-2 text-right text-[var(--encre-douce)]">
                  {fmtTauxBp(l.tauxTva)}
                </td>
                <td className="chiffres px-4 py-2 text-right font-medium">{fmt(l.montantHt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="chiffres ml-auto max-w-xs space-y-1 border-t border-[var(--filet)] p-4 text-sm">
        <div className="flex justify-between">
          <dt>Total HT</dt>
          <dd>{fmt(piece.totalHt)}</dd>
        </div>
        {parTaux.map((t) => (
          <div key={t.tauxTva} className="flex justify-between text-[var(--encre-douce)]">
            <dt>TVA {fmtTauxBp(t.tauxTva)} sur {fmt(t.base)}</dt>
            <dd>{fmt(t.tva)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-[var(--filet)] pt-1 text-base font-bold">
          <dt>Total TTC</dt>
          <dd>{fmt(piece.totalTtc)} F</dd>
        </div>
        {piece.nature === "facture" && piece.statut === "emise" && (
          <>
            {reglements.map((r) => (
              <div key={r.numero} className="flex justify-between text-xs text-[var(--encre-douce)]">
                <dt>
                  {r.numero} · {fmtDateIso(r.date)}
                </dt>
                <dd>−{fmt(r.montant)}</dd>
              </div>
            ))}
            <div className={`flex justify-between font-semibold ${reste > 0 ? "text-alerte-600" : "text-valide-600"}`}>
              <dt>Reste dû</dt>
              <dd>{fmt(reste)} F</dd>
            </div>
          </>
        )}
      </dl>

      {/* ------------------------------------------------------- actions */}
      <div className="flex flex-wrap gap-2 border-t border-[var(--filet)] p-4">
        {piece.statut === "brouillon" && droits.gerer && (
          <>
            <BoutonAction principal disabled={enCours} onClick={() => agir(() => emettrePiece(piece.id))}>
              {piece.nature === "devis" ? "Émettre le devis" : "Émettre la facture"}
            </BoutonAction>
            <BoutonAction disabled={enCours} onClick={onModifier}>
              Modifier
            </BoutonAction>
            <BoutonAction
              danger
              disabled={enCours}
              onClick={() => agir(() => supprimerBrouillon(piece.id))}
            >
              Supprimer
            </BoutonAction>
          </>
        )}

        {piece.nature === "devis" && piece.statut === "emise" && droits.gerer && (
          <>
            <BoutonAction disabled={enCours} onClick={() => agir(() => deciderDevis(piece.id, "acceptee"))}>
              Accepté par le client
            </BoutonAction>
            <BoutonAction danger disabled={enCours} onClick={() => agir(() => deciderDevis(piece.id, "refusee"))}>
              Refusé
            </BoutonAction>
          </>
        )}

        {piece.nature === "devis" &&
          (piece.statut === "emise" || piece.statut === "acceptee") &&
          droits.gerer && (
            <BoutonAction
              principal
              disabled={enCours}
              onClick={() =>
                agir(
                  () => convertirDevis(piece.id),
                  (r) => r.ok && r.id && onSelectionner(r.id),
                )
              }
            >
              Convertir en facture
            </BoutonAction>
          )}

        {factureOuverte && reste > 0 && droits.encaisser && (
          <BoutonAction principal disabled={enCours} onClick={() => setPanneau("encaisser")}>
            Encaisser
          </BoutonAction>
        )}

        {factureOuverte && piece.regle === 0 && droits.annuler && (
          <BoutonAction danger disabled={enCours} onClick={() => setPanneau("annuler")}>
            Annuler par avoir
          </BoutonAction>
        )}

        {piece.numero && piece.statut !== "annulee" && droits.envoyer && (
          <BoutonAction disabled={enCours} onClick={() => setPanneau("envoyer")}>
            {piece.enRetard ? "Relancer le client" : "Envoyer au client"}
          </BoutonAction>
        )}

        {piece.numero && (
          <a
            href={`/imprimer/piece/${piece.id}`}
            target="_blank"
            rel="noopener"
            className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] px-3.5 text-sm font-medium"
          >
            Imprimer
          </a>
        )}
      </div>

      {panneau === "encaisser" && (
        <FormulaireEncaissement
          pieceId={piece.id}
          reste={reste}
          aujourdHui={aujourdHui}
          enCours={enCours}
          onFermer={() => setPanneau(null)}
          agir={agir}
        />
      )}

      {panneau === "envoyer" && (
        <FormulaireEnvoiClient
          pieceId={piece.id}
          relance={piece.enRetard}
          enCours={enCours}
          onFermer={() => setPanneau(null)}
          agir={agir}
        />
      )}

      {panneau === "annuler" && (
        <FormulaireAnnulation
          pieceId={piece.id}
          numero={piece.numero ?? ""}
          enCours={enCours}
          onFermer={() => setPanneau(null)}
          agir={agir}
        />
      )}
    </section>
  );
}

function BoutonAction({
  children,
  onClick,
  disabled,
  principal,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  principal?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-cible rounded-lg px-3.5 text-sm font-semibold disabled:opacity-50 ${
        principal
          ? "bg-marque-600 text-white hover:bg-marque-700"
          : danger
            ? "border border-[var(--filet)] text-danger-600 hover:bg-danger-50"
            : "border border-[var(--filet)] hover:bg-[var(--surface-creuse)]"
      }`}
    >
      {children}
    </button>
  );
}

function FormulaireEncaissement({
  pieceId,
  reste,
  aujourdHui,
  enCours,
  onFermer,
  agir,
}: {
  pieceId: string;
  reste: number;
  aujourdHui: string;
  enCours: boolean;
  onFermer: () => void;
  agir: (action: () => Promise<Resultat>, apres?: (r: Resultat) => void) => void;
}) {
  const [montant, setMontant] = useState(String(reste));
  const [moyen, setMoyen] = useState<(typeof MOYENS)[number]["valeur"]>("especes");
  const [date, setDate] = useState(aujourdHui);
  const [reference, setReference] = useState("");
  const [compteId, setCompteId] = useState("");

  return (
    <div className="grid gap-3 border-t border-[var(--filet)] bg-[var(--surface-creuse)] p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Champ libelle="Montant reçu" precision={`Reste dû : ${fmt(reste)} F`}>
        <input
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          inputMode="numeric"
          className={`${CLASSE_CHAMP} chiffres`}
        />
      </Champ>
      <Champ libelle="Moyen">
        <select
          value={moyen}
          onChange={(e) => setMoyen(e.target.value as typeof moyen)}
          className={CLASSE_CHAMP}
        >
          {MOYENS.map((m) => (
            <option key={m.valeur} value={m.valeur}>
              {m.libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${CLASSE_CHAMP} chiffres`} />
      </Champ>
      <Champ libelle="Référence" precision="N° de transaction, de chèque…">
        <input value={reference} onChange={(e) => setReference(e.target.value)} className={CLASSE_CHAMP} />
      </Champ>
      <div className="sm:col-span-2 lg:col-span-4">
        <ChoixCompteTresorerie moyen={moyen} valeur={compteId} onChange={setCompteId} libelle="Compte qui reçoit" />
      </div>
      <div className="flex gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="button"
          disabled={enCours}
          onClick={() =>
            agir(
              () =>
                encaisserFacture({
                  pieceId,
                  montant: Number(montant.replace(/[\s  ]/g, "")),
                  moyen,
                  date,
                  reference: reference.trim() || null,
                  compteTresorerieId: compteId || null,
                }),
              () => onFermer(),
            )
          }
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer le règlement
        </button>
        <button type="button" onClick={onFermer} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>
    </div>
  );
}

function FormulaireAnnulation({
  pieceId,
  numero,
  enCours,
  onFermer,
  agir,
}: {
  pieceId: string;
  numero: string;
  enCours: boolean;
  onFermer: () => void;
  agir: (action: () => Promise<Resultat>, apres?: (r: Resultat) => void) => void;
}) {
  const [motif, setMotif] = useState("");

  return (
    <div className="space-y-3 border-t border-[var(--filet)] bg-[var(--surface-creuse)] p-4">
      <p className="text-sm text-[var(--encre-douce)]">
        Un avoir du même montant sera émis : il reprend la marchandise en stock et
        contrepasse l&apos;écriture. La facture {numero} restera visible, marquée annulée.
      </p>
      <input
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        placeholder="Motif : erreur de prix, marchandise refusée…"
        aria-label="Motif de l'annulation"
        className={CLASSE_CHAMP}
      />
      <div className="flex gap-3">
        <button
          type="button"
          disabled={enCours || motif.trim().length < 3}
          onClick={() => agir(() => annulerFacture(pieceId, motif), () => onFermer())}
          className="h-cible rounded-lg bg-danger-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Émettre l&apos;avoir
        </button>
        <button type="button" onClick={onFermer} className="text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>
    </div>
  );
}

/**
 * Envoi de la pièce au client, ou relance d'une facture échue : par e-mail ou
 * WhatsApp, au contact de la pièce ou au client, sauf adresse saisie. Le
 * message porte un lien qui ouvre la pièce sans compte.
 */
function FormulaireEnvoiClient({
  pieceId,
  relance,
  enCours,
  onFermer,
  agir,
}: {
  pieceId: string;
  relance: boolean;
  enCours: boolean;
  onFermer: () => void;
  agir: (action: () => Promise<Resultat>, apres?: (r: Resultat) => void) => void;
}) {
  const [canal, setCanal] = useState<"email" | "whatsapp">("email");
  const [adresse, setAdresse] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        agir(
          () => envoyerPiece(pieceId, canal, relance ? "relance" : "envoi", adresse || undefined),
          (r) => r.ok && onFermer(),
        );
      }}
      className="mt-4 space-y-3 rounded-xl border border-[var(--filet)] bg-[var(--surface-creuse)] p-3"
    >
      <p className="text-sm font-semibold">{relance ? "Relancer le client" : "Envoyer au client"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Canal">
          <select value={canal} onChange={(e) => setCanal(e.target.value as "email" | "whatsapp")} className={CLASSE_CHAMP}>
            <option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </Champ>
        <Champ libelle={canal === "email" ? "Adresse (facultatif)" : "Numéro (facultatif)"} precision="Vide : celle du contact de la pièce, ou du client.">
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={CLASSE_CHAMP} inputMode={canal === "email" ? "email" : "tel"} />
        </Champ>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFermer} className="h-cible rounded-lg px-3 text-sm text-[var(--encre-douce)] hover:underline">
          Fermer
        </button>
        <button type="submit" disabled={enCours} className="h-cible rounded-lg bg-marque-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {enCours ? "Envoi…" : relance ? "Envoyer la relance" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}
