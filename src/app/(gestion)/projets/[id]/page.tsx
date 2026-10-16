import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonApercu } from "@/components/ui/apercu";
import { Visionneuse } from "@/components/ui/fichiers";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtTauxBp } from "@/lib/format";
import { moduleOuvert } from "@/lib/modules/garde";
import { listerEnquetes } from "@/modules/enquetes/requetes";
import { ouvrirPieceProjet, signerPiecesProjet } from "@/modules/projets/actions";
import { LIBELLE_STATUT_PROJET } from "@/modules/projets/calcul";
import { ficheProjet, membresActifs, type PieceVue } from "@/modules/projets/requetes";
import { listerTiers } from "@/modules/tiers/requetes";

import { FormulaireDepense } from "../formulaire-depense";
import { AjoutPiece, PilotageProjet, RetraitPiece } from "../outils";
import { TableauDepenses } from "../tableau-depenses";

export const metadata: Metadata = { title: "Projet" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const NATURE_PIECE: Record<string, string> = { devis: "Devis", facture: "Facture", avoir: "Avoir" };
const STATUT_PIECE: Record<string, string> = {
  brouillon: "Brouillon",
  emise: "Émise",
  acceptee: "Acceptée",
  refusee: "Refusée",
  convertie: "Convertie",
  annulee: "Annulée",
};
const NATURE = { photo: "Photo", preuve_paiement: "Preuve de paiement", facture: "Facture / devis", autre: "Pièce" } as const;

/**
 * Fiche d'un projet : affectation, budget, dépenses tracées, photos et
 * preuves. Tout ce qu'il faut pour rendre compte de l'argent dépensé.
 */
export default async function PageProjet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await exigerEntreprise();

  const [fiche, gerer, approuver, payer, demander, membres, fournisseurs] = await Promise.all([
    ficheProjet(session.organizationId, id),
    peut("projet.gerer"),
    peut("depense.approuver"),
    peut("depense.payer"),
    peut("depense.demander"),
    membresActifs(session.organizationId),
    listerTiers(session.organizationId, "fournisseur"),
  ]);
  if (!fiche) notFound();
  const { projet, depenses, pieces, factures } = fiche;
  // Les enquêtes du projet, si le module est ouvert et la session les voit.
  const enquetes =
    moduleOuvert("enquetes") && (await peut("enquetes.consulter")) ? await listerEnquetes(session.organizationId, id) : null;
  const { bilan } = projet;
  const benefice = bilan.resultat >= 0;
  // Sans facture ni prix convenu, le projet ne doit rien rapporter : c'est un coût, pas une perte.
  const interne = projet.facture === 0 && projet.prixVente === null;

  const photos = pieces.filter((p) => p.nature === "photo" && p.typeMime.startsWith("image/"));
  const autres = pieces.filter((p) => !photos.includes(p));
  const parDepense = new Map<string, PieceVue[]>();
  for (const p of pieces) if (p.depenseId) parDepense.set(p.depenseId, [...(parDepense.get(p.depenseId) ?? []), p]);
  const ouvert = projet.statut !== "termine" && projet.statut !== "annule";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/projets" className="text-marque-600 hover:underline">
          ← Projets
        </Link>
      </p>
      <EnTetePage
        titre={projet.nom}
        sousTitre={[
          projet.code,
          projet.client ?? (projet.prixVente === null ? "Projet interne" : "Client non désigné"),
          projet.debut ? `du ${JOUR.format(new Date(projet.debut))}` : null,
          projet.fin ? `au ${JOUR.format(new Date(projet.fin))}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={<Pastille ton={projet.statut === "en_cours" ? "marque" : "neutre"}>{LIBELLE_STATUT_PROJET[projet.statut]}</Pastille>}
      />
      {projet.description && <p className="mb-4 max-w-[80ch] text-sm text-[var(--encre-douce)]">{projet.description}</p>}

      <section className="mb-6 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Bilan du projet</h2>
            <p className="text-xs text-[var(--encre-faible)]">Hors taxes : la TVA n&apos;est ni un gain ni une perte.</p>
          </div>
          {bilan.tauxReussite !== null && (
            <div className="text-right">
              <p className="text-xs text-[var(--encre-faible)]">
                {projet.statut === "termine" ? "Taux de réussite" : "Taux de réussite à date"}
              </p>
              <p
                className={`chiffres text-2xl font-bold ${
                  bilan.tauxReussite === 100 ? "text-valide-600" : bilan.tauxReussite >= 50 ? "text-alerte-600" : "text-danger-600"
                }`}
              >
                {bilan.tauxReussite} %
              </p>
            </div>
          )}
        </div>

        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-[var(--surface-creuse)] p-3">
            <dt className="text-xs text-[var(--encre-faible)]">Facturé au client</dt>
            <dd className="chiffres text-lg font-bold">{fmt(projet.facture)}</dd>
            <dd className="chiffres text-xs text-[var(--encre-faible)]">{fmt(projet.encaisse)} F TTC encaissés</dd>
          </div>
          <div className="rounded-lg bg-[var(--surface-creuse)] p-3">
            <dt className="text-xs text-[var(--encre-faible)]">Coûts engagés</dt>
            <dd className="chiffres text-lg font-bold">{fmt(projet.coutEngageHt)}</dd>
            <dd className="chiffres text-xs text-[var(--encre-faible)]">dont {fmt(projet.coutPayeHt)} payés</dd>
          </div>
          {interne ? (
            <div className="rounded-lg bg-[var(--surface-creuse)] p-3">
              <dt className="text-xs text-[var(--encre-faible)]">Coût du projet</dt>
              <dd className="chiffres text-lg font-bold">{fmt(projet.coutEngageHt)}</dd>
              <dd className="text-xs text-[var(--encre-faible)]">Projet interne : aucune recette attendue</dd>
            </div>
          ) : (
          <div className={`rounded-lg p-3 ${benefice ? "bg-valide-50" : "bg-danger-50"}`}>
            <dt className={`text-xs font-medium ${benefice ? "text-valide-600" : "text-danger-600"}`}>{benefice ? "Bénéfice" : "Perte"}</dt>
            <dd className={`chiffres text-lg font-bold ${benefice ? "text-valide-600" : "text-danger-600"}`}>
              {benefice ? "" : "− "}
              {fmt(Math.abs(bilan.resultat))}
            </dd>
            <dd className="text-xs text-[var(--encre-faible)]">
              {bilan.margeBp !== null ? `Marge ${fmtTauxBp(bilan.margeBp)}` : "Rien de facturé pour l'instant"}
            </dd>
          </div>
          )}
          <div className="rounded-lg bg-[var(--surface-creuse)] p-3">
            <dt className="text-xs text-[var(--encre-faible)]">Résultat prévu</dt>
            <dd className="chiffres text-lg font-bold">
              {bilan.resultatPrevu === null ? "—" : `${bilan.resultatPrevu < 0 ? "− " : ""}${fmt(Math.abs(bilan.resultatPrevu))}`}
            </dd>
            <dd className="text-xs text-[var(--encre-faible)]">
              {projet.prixVente === null ? "Fixez un prix de vente pour le calculer" : `Prix convenu ${fmt(projet.prixVente)} HT`}
            </dd>
          </div>
        </dl>

        <h3 className="mt-4 text-xs font-semibold text-[var(--encre-faible)]">Écarts avec le prévu</h3>
        <ul className="mt-1.5 grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-lg border border-[var(--filet)] px-3 py-2">
            <span className="block text-xs text-[var(--encre-faible)]">Budget (TTC)</span>
            {bilan.ecarts.budget === null ? (
              <span className="text-[var(--encre-faible)]">Pas de budget</span>
            ) : (
              <span className={`chiffres font-semibold ${bilan.ecarts.budget < 0 ? "text-danger-600" : "text-valide-600"}`}>
                {bilan.ecarts.budget < 0 ? `${fmt(-bilan.ecarts.budget)} de dépassement` : `${fmt(bilan.ecarts.budget)} disponibles`}
              </span>
            )}
          </li>
          <li className="rounded-lg border border-[var(--filet)] px-3 py-2">
            <span className="block text-xs text-[var(--encre-faible)]">Chiffre d&apos;affaires (HT)</span>
            {bilan.ecarts.chiffre === null ? (
              <span className="text-[var(--encre-faible)]">Pas de prix convenu</span>
            ) : (
              <span className={`chiffres font-semibold ${bilan.ecarts.chiffre < 0 ? "text-alerte-600" : "text-valide-600"}`}>
                {bilan.ecarts.chiffre < 0
                  ? `${fmt(-bilan.ecarts.chiffre)} à facturer`
                  : bilan.ecarts.chiffre === 0
                    ? "Tout facturé"
                    : `${fmt(bilan.ecarts.chiffre)} au-delà du prix`}
              </span>
            )}
          </li>
          <li className="rounded-lg border border-[var(--filet)] px-3 py-2">
            <span className="block text-xs text-[var(--encre-faible)]">Délai</span>
            {projet.fin === null ? (
              <span className="text-[var(--encre-faible)]">Pas d&apos;échéance</span>
            ) : bilan.ecarts.delaiJours === null ? (
              <span className="text-[var(--encre-douce)]">Échéance le {JOUR.format(new Date(projet.fin))}</span>
            ) : (
              <span className={`chiffres font-semibold ${bilan.ecarts.delaiJours > 0 ? "text-danger-600" : "text-valide-600"}`}>
                {bilan.ecarts.delaiJours > 0
                  ? `${bilan.ecarts.delaiJours} j de retard`
                  : bilan.ecarts.delaiJours < 0
                    ? `${-bilan.ecarts.delaiJours} j d'avance`
                    : "À l'échéance"}
              </span>
            )}
          </li>
        </ul>

        {bilan.criteres.length > 0 && (
          <>
            <h3 className="mt-4 text-xs font-semibold text-[var(--encre-faible)]">
              Critères de réussite ({bilan.criteres.filter((c) => c.atteint).length} sur {bilan.criteres.length})
            </h3>
            <ul className="mt-1.5 space-y-1 text-sm">
              {bilan.criteres.map((c) => (
                <li key={c.cle} className="flex flex-wrap items-baseline gap-x-2">
                  <span aria-hidden className={c.atteint ? "text-valide-600" : "text-danger-600"}>
                    {c.atteint ? "✓" : "✗"}
                  </span>
                  <span className="font-medium">{c.libelle}</span>
                  <span className="text-xs text-[var(--encre-faible)]">{c.detail}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
        <CarteIndicateur
          libelle="Budget"
          valeur={projet.budget === null ? "—" : fmtCompact(projet.budget)}
          unite={projet.budget === null ? undefined : "FCFA"}
          precision={projet.budget === null ? "Pas de plafond fixé" : undefined}
        />
        <CarteIndicateur
          libelle="Engagé"
          valeur={fmtCompact(projet.suivi.engage)}
          unite="FCFA"
          ton={projet.suivi.reste !== null && projet.suivi.reste < 0 ? "danger" : "marque"}
          precision={projet.suivi.taux !== null ? `${projet.suivi.taux} % du budget` : undefined}
        />
        <CarteIndicateur libelle="Payé" valeur={fmtCompact(projet.suivi.paye)} unite="FCFA" ton="valide" />
        <CarteIndicateur
          libelle={projet.suivi.reste !== null && projet.suivi.reste < 0 ? "Dépassement" : "Reste"}
          valeur={projet.suivi.reste === null ? "—" : fmt(Math.abs(projet.suivi.reste))}
          unite={projet.suivi.reste === null ? undefined : "FCFA"}
          ton={projet.suivi.reste !== null && projet.suivi.reste < 0 ? "danger" : "valide"}
          precision={projet.suivi.enAttente > 0 ? `${fmt(projet.suivi.enAttente)} F en attente d'approbation` : undefined}
        />
      </section>

      {gerer && (
        <section className="mb-6 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Affectation et pilotage</h2>
          <PilotageProjet
            id={projet.id}
            statut={projet.statut}
            responsableUserId={projet.responsableUserId}
            budget={projet.budget}
            prixVente={projet.prixVente}
            membres={membres}
          />
        </section>
      )}
      {!gerer && (
        <p className="mb-6 text-sm text-[var(--encre-douce)]">Responsable : {projet.responsable ?? "non affecté"}</p>
      )}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Photos ({photos.length})</h2>
          {gerer && <AjoutPiece projetId={projet.id} />}
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">
            Aucune photo. Avant, pendant, après : la photo datée est la meilleure preuve de l&apos;avancement.
          </p>
        ) : (
          <Visionneuse
            taille="grande"
            signer={signerPiecesProjet}
            elements={photos.map((p) => ({
              id: p.id,
              typeMime: p.typeMime,
              nomFichier: p.nomFichier,
              titre: p.legende ?? p.nomFichier,
              sousTitre: `${JOUR.format(p.depose)}${p.auteur ? ` · ${p.auteur}` : ""}`,
            }))}
            pieds={gerer ? Object.fromEntries(photos.map((p) => [p.id, <RetraitPiece key={p.id} id={p.id} />])) : undefined}
          />
        )}
      </section>

      {autres.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Preuves et pièces ({autres.length})</h2>
          <ul className="divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
            {autres.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <BoutonApercu
                    piece={{ titre: p.legende ?? p.nomFichier, nomFichier: p.nomFichier, typeMime: p.typeMime, signer: ouvrirPieceProjet.bind(null, p.id) }}
                    className="text-left text-marque-600 hover:underline"
                  >
                    {p.legende ?? p.nomFichier}
                  </BoutonApercu>
                  <span className="block text-xs text-[var(--encre-faible)]">
                    {NATURE[p.nature]}
                    {p.depenseId ? ` · ${depenses.find((d) => d.id === p.depenseId)?.numero ?? "dépense"}` : ""} ·{" "}
                    {JOUR.format(p.depose)}
                    {p.auteur ? ` · ${p.auteur}` : ""}
                  </span>
                </span>
                {gerer && <RetraitPiece id={p.id} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Devis et factures ({factures.length})</h2>
          <Link href="/commercial/factures" className="text-xs font-semibold text-marque-600 hover:underline">
            Facturer ce projet →
          </Link>
        </div>
        {factures.length === 0 ? (
          <p className="text-sm text-[var(--encre-faible)]">
            Aucune pièce rattachée. Choisissez ce projet dans le champ « Projet » d&apos;un devis ou d&apos;une facture :
            c&apos;est ce qui donne la recette du bilan.
          </p>
        ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>Pièce</Th>
                <Th>Date</Th>
                <Th>Statut</Th>
                <Th aligne="droite">HT</Th>
                <Th aligne="droite">TTC</Th>
                <Th aligne="droite">Réglé</Th>
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => (
                <tr key={f.id}>
                  <Td chiffres fort>
                    {f.numero ?? "Brouillon"}
                    <span className="block text-xs font-normal text-[var(--encre-faible)]">{NATURE_PIECE[f.nature] ?? f.nature}</span>
                  </Td>
                  <Td chiffres>{f.datePiece ? JOUR.format(new Date(f.datePiece)) : "—"}</Td>
                  <Td>{STATUT_PIECE[f.statut] ?? f.statut}</Td>
                  <Td aligne="droite" chiffres>{fmt(f.totalHt)}</Td>
                  <Td aligne="droite" chiffres>{fmt(f.totalTtc)}</Td>
                  <Td aligne="droite" chiffres>{fmt(f.regle)}</Td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Dépenses ({depenses.length})</h2>
          {demander && ouvert && (
            <FormulaireDepense projets={[]} projetId={projet.id} fournisseurs={fournisseurs.map((f) => ({ id: f.id, nom: f.nom }))} />
          )}
        </div>
        {depenses.length === 0 ? (
          <EtatVide titre="Aucune dépense" message="Les achats de ce projet apparaîtront ici, avec qui les a demandés, approuvés et payés." />
        ) : (
          <TableauDepenses depenses={depenses} pieces={parDepense} droits={{ approuver, payer, demander }} afficherProjet={false} />
        )}
      </section>

      {enquetes && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Enquêtes et satisfaction ({enquetes.length})</h2>
          {enquetes.length === 0 ? (
            <p className="text-sm text-[var(--encre-faible)]">
              Aucune enquête sur ce projet.{" "}
              <Link href="/enquetes" className="font-medium text-marque-600 hover:underline">
                Mesurer la satisfaction de ses clients
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-[var(--filet)] rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
              {enquetes.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
                  <Link href={`/enquetes/${e.id}`} className="font-medium hover:underline">
                    {e.titre}
                  </Link>
                  <span className="chiffres text-[var(--encre-douce)]">
                    {e.reponses} réponse{e.reponses > 1 ? "s" : ""}
                    {e.satisfaction !== null && <> · satisfaction {e.satisfaction} / 100</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
