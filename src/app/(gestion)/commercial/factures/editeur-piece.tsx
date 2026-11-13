"use client";

import { useMemo, useState, useTransition } from "react";

import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmt, fmtTauxBp } from "@/lib/format";
import { ECHELLE_QUANTITE } from "@/lib/quantite";
import { enregistrerBrouillon, type BrouillonEntrant } from "@/modules/facturation/actions";
import { LIBELLE_NATURE_TIERS, NATURES_TIERS, type NatureTiers } from "@/modules/tiers/natures";
import { montantHtLigne, totaliserPiece } from "@/modules/facturation/calcul";
import type { OptionsPiece } from "@/modules/facturation/requetes";

export interface PieceAEditer {
  id?: string;
  nature: "devis" | "facture";
  clientId: string;
  projetId: string | null;
  datePiece: string;
  echeance: string | null;
  depotId: string | null;
  notes: string | null;
  commercialId?: string | null;
  contactId?: string | null;
  lignes: {
    articleId: string | null;
    designation: string;
    quantite: number;
    prixUnitaireHt: number;
    remise: number;
  }[];
}

interface LigneEdition {
  cle: number;
  articleId: string | null;
  designation: string;
  /** Saisie libre : « 2 », « 1,5 ». */
  quantite: string;
  prix: string;
  remise: string;
}

/** « 1,5 » → 1500 millièmes. Rend NaN sur une saisie illisible. */
function lireQuantite(saisie: string): number {
  const valeur = Number(saisie.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(valeur) ? Math.round(valeur * ECHELLE_QUANTITE) : Number.NaN;
}

/** « 12 500 » → 12500. Les montants sont des francs entiers. */
function lireMontant(saisie: string): number {
  const valeur = Number(saisie.replace(/[\s  ]/g, ""));
  return Number.isInteger(valeur) && valeur >= 0 ? valeur : Number.NaN;
}

/** Valeur du choix « client qui n'existe pas encore ». */
const NOUVEAU_CLIENT = "__nouveau__";

/** Sans casse ni accents : « pose et montage » retrouve « Pose et Montage ». */
const normaliser = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

let compteur = 0;
const nouvelleCle = () => (compteur += 1);

/**
 * Saisie d'un devis ou d'une facture.
 *
 * Les totaux se recalculent à chaque frappe avec la MÊME fonction que le
 * serveur (`totaliserPiece`) : ce que l'écran annonce est ce qui sera émis,
 * au franc près. Le taux de TVA affiché vient de l'article ; le serveur le
 * relit de toute façon, il ne fait pas confiance au navigateur.
 */
export function EditeurPiece({
  options,
  initiale,
  onTermine,
  onAnnuler,
}: {
  options: OptionsPiece;
  initiale: PieceAEditer;
  onTermine: (id: string) => void;
  onAnnuler: () => void;
}) {
  const [nature, setNature] = useState(initiale.nature);
  const [clientId, setClientId] = useState(initiale.clientId);
  // Client absent du fichier : enregistré avec la pièce, son type précisé.
  const [nouveau, setNouveau] = useState<{ nom: string; nature: NatureTiers; telephone: string; email: string }>({ nom: "", nature: "entreprise", telephone: "", email: "" });
  const nouveauClient = clientId === NOUVEAU_CLIENT;
  const principalDe = (client: string) => options.contacts[client]?.find((c) => c.principal)?.id ?? "";
  const [contactId, setContactId] = useState(initiale.id ? (initiale.contactId ?? "") : (initiale.contactId ?? principalDe(initiale.clientId)));
  const contactsDuClient = nouveauClient ? [] : (options.contacts[clientId] ?? []);
  const [projetId, setProjetId] = useState(initiale.projetId ?? "");
  const [datePiece, setDatePiece] = useState(initiale.datePiece);
  const [echeance, setEcheance] = useState(initiale.echeance ?? "");
  const [depotId, setDepotId] = useState(initiale.depotId ?? "");
  const [notes, setNotes] = useState(initiale.notes ?? "");
  const [commercialId, setCommercialId] = useState(initiale.id ? (initiale.commercialId ?? "") : (initiale.commercialId ?? options.commercialParDefaut ?? ""));
  const [lignes, setLignes] = useState<LigneEdition[]>(() =>
    initiale.lignes.length > 0
      ? initiale.lignes.map((l) => ({
          cle: nouvelleCle(),
          articleId: l.articleId,
          designation: l.designation,
          quantite: String(l.quantite / ECHELLE_QUANTITE).replace(".", ","),
          prix: String(l.prixUnitaireHt),
          remise: String(l.remise),
        }))
      : [{ cle: nouvelleCle(), articleId: null, designation: "", quantite: "1", prix: "0", remise: "0" }],
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const articles = useMemo(() => new Map(options.articles.map((a) => [a.id, a])), [options.articles]);
  // Les services d'abord : c'est ce que la liste propose. Un article de marchandise reste choisissable, par son nom.
  const parNom = useMemo(() => new Map(options.articles.map((a) => [normaliser(a.designation), a])), [options.articles]);

  const lues = lignes.map((l) => {
    const article = l.articleId ? articles.get(l.articleId) : undefined;
    return {
      designation: l.designation,
      quantite: lireQuantite(l.quantite),
      prixUnitaireHt: lireMontant(l.prix),
      remise: lireMontant(l.remise || "0"),
      tauxTva: article?.tauxTva ?? 1800,
      compteVente: article?.compteVente ?? "706",
    };
  });
  const lisibles = lues.every(
    (l) => l.quantite > 0 && !Number.isNaN(l.prixUnitaireHt) && !Number.isNaN(l.remise),
  );
  const totaux = lisibles ? totaliserPiece(lues) : null;

  function modifier(cle: number, champ: Partial<LigneEdition>) {
    setLignes((actuel) => actuel.map((l) => (l.cle === cle ? { ...l, ...champ } : l)));
  }

  /**
   * Le service saisi ou choisi. Un nom connu rattache le service du catalogue
   * (et son prix, si la ligne n'en a pas encore) ; un nom nouveau reste sans
   * article, et le serveur l'ajoute au catalogue à l'enregistrement.
   */
  function saisirService(cle: number, saisie: string) {
    const connu = parNom.get(normaliser(saisie));
    setLignes((actuel) =>
      actuel.map((l) =>
        l.cle !== cle
          ? l
          : {
              ...l,
              designation: saisie,
              articleId: connu?.id ?? null,
              prix: connu && (l.prix === "" || l.prix === "0") ? String(connu.prixHt) : l.prix,
            },
      ),
    );
  }

  function enregistrer() {
    setErreur(null);
    if (!clientId) return setErreur("Choisissez un client, ou enregistrez-le sur place.");
    if (nouveauClient && nouveau.nom.trim().length < 2) return setErreur("Indiquez le nom du nouveau client.");
    if (!lisibles) return setErreur("Une quantité ou un montant est illisible.");

    const brouillon: BrouillonEntrant = {
      id: initiale.id,
      nature,
      clientId: nouveauClient ? null : clientId,
      nouveauClient: nouveauClient ? { nom: nouveau.nom, nature: nouveau.nature, telephone: nouveau.telephone || null, email: nouveau.email || null } : null,
      projetId: projetId || null,
      datePiece,
      echeance: echeance || null,
      depotId: depotId || null,
      commercialId: commercialId || null,
      contactId: contactId || null,
      notes: notes.trim() || null,
      lignes: lignes.map((l, i) => ({
        articleId: l.articleId,
        designation: l.designation,
        quantite: lues[i].quantite,
        prixUnitaireHt: lues[i].prixUnitaireHt,
        remise: lues[i].remise,
      })),
    };

    demarrer(async () => {
      const resultat = await enregistrerBrouillon(brouillon);
      if (resultat.ok && resultat.id) onTermine(resultat.id);
      else if (!resultat.ok) setErreur(resultat.message);
    });
  }

  return (
    <section className="rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {initiale.id ? "Modifier le brouillon" : "Nouvelle pièce"}
        </h2>
        <button
          type="button"
          onClick={onAnnuler}
          className="text-sm text-[var(--encre-faible)] hover:underline"
        >
          Fermer
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Nature">
          <select
            value={nature}
            onChange={(e) => setNature(e.target.value as "devis" | "facture")}
            disabled={Boolean(initiale.id)}
            className={CLASSE_CHAMP}
          >
            <option value="facture">Facture</option>
            <option value="devis">Devis</option>
          </select>
        </Champ>

        <Champ libelle="Client">
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              // Le contact appartient au client : changer de client propose son principal.
              setContactId(principalDe(e.target.value));
            }}
            className={CLASSE_CHAMP}
          >
            <option value="">— choisir —</option>
            {options.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
            <option value={NOUVEAU_CLIENT}>+ Nouveau client…</option>
          </select>
        </Champ>

        {nouveauClient && (
          <fieldset className="grid gap-3 rounded-xl border border-marque-300 bg-[var(--surface-creuse)] p-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
            <legend className="px-1 text-xs font-semibold text-[var(--encre-douce)]">Nouveau client — enregistré avec la pièce</legend>
            <Champ libelle="Nom">
              <input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} autoFocus className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Type de client">
              <select value={nouveau.nature} onChange={(e) => setNouveau({ ...nouveau, nature: e.target.value as NatureTiers })} className={CLASSE_CHAMP}>
                {NATURES_TIERS.map((n) => (
                  <option key={n} value={n}>
                    {LIBELLE_NATURE_TIERS[n]}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Téléphone">
              <input value={nouveau.telephone} inputMode="tel" onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="E-mail">
              <input type="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} className={CLASSE_CHAMP} />
            </Champ>
          </fieldset>
        )}

        {contactsDuClient.length > 0 && (
          <Champ libelle="À l'attention de" precision="Interlocuteur chez le client, imprimé sur la pièce.">
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={CLASSE_CHAMP}>
              <option value="">— aucun —</option>
              {contactsDuClient.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </Champ>
        )}

        {options.projets.length > 0 && (
          <Champ libelle="Projet">
            <select value={projetId} onChange={(e) => setProjetId(e.target.value)} className={CLASSE_CHAMP}>
              <option value="">Aucun</option>
              {options.projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle}
                </option>
              ))}
            </select>
          </Champ>
        )}

        <Champ libelle="Date">
          <input
            type="date"
            value={datePiece}
            onChange={(e) => setDatePiece(e.target.value)}
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        <Champ
          libelle={nature === "devis" ? "Valable jusqu'au" : "Échéance"}
          precision={nature === "facture" ? "Vide : date + délai de règlement du client." : undefined}
        >
          <input
            type="date"
            value={echeance}
            onChange={(e) => setEcheance(e.target.value)}
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>

        {options.commerciaux.length > 0 && (
          <Champ libelle="Commercial" precision="Sa commission compte cette pièce.">
            <select value={commercialId} onChange={(e) => setCommercialId(e.target.value)} className={CLASSE_CHAMP}>
              <option value="">— aucun —</option>
              {options.commerciaux.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}

        {nature === "facture" && options.depots.length > 0 && (
          <Champ libelle="Dépôt de sortie" precision="D'où part la marchandise facturée.">
            <select value={depotId} onChange={(e) => setDepotId(e.target.value)} className={CLASSE_CHAMP}>
              <option value="">— dépôt principal —</option>
              {options.depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
          </Champ>
        )}
      </div>

      {/* --------------------------------------------------------- lignes */}
      <datalist id="services-catalogue">
        {options.articles.map((a) => (
          <option key={a.id} value={a.designation} />
        ))}
      </datalist>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--encre-faible)]">
              <th className="pb-2 font-medium">Service</th>
              <th className="w-20 pb-2 font-medium">Qté</th>
              <th className="w-28 pb-2 font-medium">PU HT</th>
              <th className="w-24 pb-2 font-medium">Remise</th>
              <th className="w-16 pb-2 font-medium">TVA</th>
              <th className="w-28 pb-2 text-right font-medium">Montant HT</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const lue = lues[index];
              const montant =
                lue.quantite > 0 && !Number.isNaN(lue.prixUnitaireHt) && !Number.isNaN(lue.remise)
                  ? montantHtLigne(lue)
                  : null;
              return (
                <tr key={ligne.cle} className="align-top">
                  <td className="py-1 pr-2">
                    <input
                      value={ligne.designation}
                      onChange={(e) => saisirService(ligne.cle, e.target.value)}
                      list="services-catalogue"
                      aria-label="Service"
                      placeholder="Choisir ou saisir un service"
                      className={`${CLASSE_CHAMP} min-w-56`}
                    />
                    {ligne.designation.trim() !== "" && !ligne.articleId && (
                      <span className="mt-0.5 block text-[11px] text-valide-600">Nouveau service : ajouté au catalogue à l&apos;enregistrement.</span>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={ligne.quantite}
                      onChange={(e) => modifier(ligne.cle, { quantite: e.target.value })}
                      inputMode="decimal"
                      aria-label="Quantité"
                      className={`${CLASSE_CHAMP} chiffres`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={ligne.prix}
                      onChange={(e) => modifier(ligne.cle, { prix: e.target.value })}
                      inputMode="numeric"
                      aria-label="Prix unitaire hors taxes"
                      className={`${CLASSE_CHAMP} chiffres`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={ligne.remise}
                      onChange={(e) => modifier(ligne.cle, { remise: e.target.value })}
                      inputMode="numeric"
                      aria-label="Remise"
                      className={`${CLASSE_CHAMP} chiffres`}
                    />
                  </td>
                  <td className="chiffres py-3 pr-2 text-xs text-[var(--encre-douce)]">
                    {fmtTauxBp(lue.tauxTva)}
                  </td>
                  <td className="chiffres py-3 pr-2 text-right font-medium">
                    {montant === null ? "—" : fmt(montant)}
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => setLignes((a) => a.filter((l) => l.cle !== ligne.cle))}
                      disabled={lignes.length === 1}
                      aria-label="Retirer la ligne"
                      className="h-cible px-2 text-[var(--encre-faible)] hover:text-danger-600 disabled:opacity-30"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() =>
          setLignes((a) => [
            ...a,
            { cle: nouvelleCle(), articleId: null, designation: "", quantite: "1", prix: "0", remise: "0" },
          ])
        }
        className="mt-2 text-sm font-medium text-marque-600 hover:underline"
      >
        + Ajouter une ligne
      </button>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <Champ libelle="Note sur la pièce">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Conditions, référence de commande…"
            className={`${CLASSE_CHAMP} h-auto py-2`}
          />
        </Champ>

        <dl className="chiffres space-y-1 self-end rounded-lg bg-[var(--surface-creuse)] p-3 text-sm">
          <div className="flex justify-between">
            <dt>Total HT</dt>
            <dd>{totaux ? fmt(totaux.totalHt) : "—"}</dd>
          </div>
          {totaux?.parTaux.map((t) => (
            <div key={t.tauxTva} className="flex justify-between text-[var(--encre-douce)]">
              <dt>TVA {fmtTauxBp(t.tauxTva)}</dt>
              <dd>{fmt(t.tva)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-[var(--filet)] pt-1 text-base font-bold">
            <dt>Total TTC</dt>
            <dd>{totaux ? `${fmt(totaux.totalTtc)} F` : "—"}</dd>
          </div>
        </dl>
      </div>

      {erreur && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-600">
          {erreur}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Enregistrer le brouillon"}
        </button>
      </div>
    </section>
  );
}
