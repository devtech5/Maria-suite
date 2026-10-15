import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier, fmtTauxBp } from "@/lib/format";
import { divideMoney } from "@/lib/money";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { listerTiers } from "@/modules/tiers/requetes";
import {
  consommationBudget,
  evolutionBp,
  FAMILLES_CHARGE,
  familleConnue,
  libelleMois,
  moisDe,
  moisGlissants,
  moisPrecedent,
  moisSuivant,
  moyenneMensuelle,
  ORDRE_FAMILLES,
  regrouperCharges,
  type FamilleCharge,
} from "@/modules/tresorerie/charges";
import { budgetsParFamille, detailCharges, engagements, listerChargesRecurrentes, mouvementsCharges } from "@/modules/tresorerie/requetes-charges";

import { CelluleBudget } from "./budget";
import { ChargesRecurrentes, FormulaireCharge } from "./charges-recurrentes";
import { GraphiqueMois } from "./graphique-mois";

export const metadata: Metadata = { title: "Charges" };

/** D'où vient l'écriture : le module qui l'a passée, dit simplement. */
const ORIGINE: Record<string, string> = {
  achat: "Facture fournisseur",
  bon_caisse: "Bon de caisse",
  avance: "Avance justifiée",
  reglement: "Règlement",
  paie: "Paie",
  bon_paiement: "Intervenant",
  releve: "Relevé bancaire",
  arrete_caisse: "Arrêté de caisse",
  saisie: "Saisie comptable",
  tva: "TVA",
  commission: "Commission",
  prestation: "Prestataire",
  vente_pos: "Caisse",
  facture: "Facture",
  avoir: "Avoir",
  virement: "Virement",
  reprise: "Reprise",
  mouvement: "Mouvement de trésorerie",
};

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/**
 * Charges de l'entreprise : ce qui sort, regroupé par nature et par mois.
 *
 * Tout vient de la comptabilité — bons de caisse, dépenses, factures
 * fournisseurs, paie, frais bancaires — pour que cet écran et le compte de
 * résultat disent la même chose. S'y ajoutent ce que la comptabilité ne sait
 * pas encore : les dépenses décidées mais pas payées, et les charges qui
 * reviennent chaque mois.
 */
export default async function PageCharges({ searchParams }: { searchParams: Promise<{ mois?: string; famille?: string; q?: string }> }) {
  const session = await exigerEntreprise();
  if (!(await peut("tresorerie.consulter"))) redirect("/tresorerie/caisse");

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const courant = moisDe(aujourdhui);
  const params = await searchParams;
  const mois = params.mois && /^\d{4}-\d{2}$/.test(params.mois) && params.mois <= courant ? params.mois : courant;
  const famille = params.famille && familleConnue(params.famille) ? params.famille : undefined;
  // Le mois se choisit par la navigation : la recherche ne porte que sur le texte du détail.
  const recherche = lireFiltresListe({ q: params.q }).q;

  // Douze mois finissant au mois choisi : le graphique suit la navigation.
  const periode = moisGlissants(mois, 12);
  const [mouvements, budgets, engage, recurrentes, detail, fournisseurs, gerer] = await Promise.all([
    mouvementsCharges(session.organizationId, periode[0], mois),
    budgetsParFamille(session.organizationId),
    engagements(session.organizationId),
    listerChargesRecurrentes(session.organizationId, aujourdhui),
    detailCharges(session.organizationId, mois, famille),
    listerTiers(session.organizationId, "fournisseur"),
    peut("tresorerie.charges.gerer"),
  ]);

  const charges = regrouperCharges(mouvements, periode);
  const precedent = moisPrecedent(mois);
  const totalMois = charges.parMois[mois];
  const totalPrecedent = charges.parMois[precedent] ?? 0;
  const evolution = evolutionBp(totalMois, totalPrecedent);
  const moyenne = moyenneMensuelle(periode.map((m) => charges.parMois[m]));
  const actives = recurrentes.filter((c) => c.actif);
  const mensuelRecurrent = actives.reduce((s, c) => s + c.equivalentMensuel, 0);
  const enRetard = actives.filter((c) => c.prochaine && c.prochaine.date < aujourdhui).length;

  // Une famille budgétée apparaît même sans mouvement : « rien dépensé » est une information.
  const parFamille = new Map(charges.familles.map((f) => [f.famille, f]));
  const lignes = ORDRE_FAMILLES.filter((f) => parFamille.has(f) || budgets.has(f)).map((f) => {
    const montants = parFamille.get(f)?.parMois ?? {};
    const reel = montants[mois] ?? 0;
    const budget = budgets.get(f) ?? null;
    return {
      famille: f,
      reel,
      precedent: montants[precedent] ?? 0,
      moyenne: moyenneMensuelle(periode.map((m) => montants[m] ?? 0)),
      budget,
      conso: consommationBudget(reel, budget),
    };
  });

  // Le graphique, les totaux et les natures gardent tout le mois ; seul le détail suit la recherche.
  const detailAffiche = detail.filter((d) => correspond(recherche, [d.piece, d.libelle, d.compte, d.libelleCompte, ORIGINE[d.origine] ?? d.origine]));

  const lien = (p: { mois?: string; famille?: FamilleCharge | null }) => {
    const q = new URLSearchParams();
    const m = p.mois ?? mois;
    if (m !== courant) q.set("mois", m);
    const f = p.famille === null ? undefined : (p.famille ?? famille);
    if (f) q.set("famille", f);
    const s = q.toString();
    return `/tresorerie/charges${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <EnTetePage
        titre="Charges"
        sousTitre="Ce que l'entreprise dépense, par nature et par mois — tiré de la comptabilité, toutes origines confondues"
        actions={
          <nav className="flex items-center gap-1" aria-label="Changer de mois">
            <Link href={lien({ mois: precedent })} scroll={false} className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] px-3 text-sm hover:bg-[var(--surface-creuse)]" aria-label="Mois précédent">
              ‹
            </Link>
            <span className="min-w-36 text-center text-sm font-semibold first-letter:uppercase">{libelleMois(mois)}</span>
            {mois < courant ? (
              <Link href={lien({ mois: moisSuivant(mois) })} scroll={false} className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] px-3 text-sm hover:bg-[var(--surface-creuse)]" aria-label="Mois suivant">
                ›
              </Link>
            ) : (
              <span className="h-cible inline-flex items-center rounded-lg border border-[var(--filet)] px-3 text-sm opacity-40" aria-hidden>
                ›
              </span>
            )}
          </nav>
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur
          libelle={`Charges de ${libelleMois(mois)}`}
          valeur={fmt(totalMois)}
          unite="FCFA"
          ton="marque"
          precision={
            evolution === null
              ? "Rien le mois précédent"
              : `${evolution > 0 ? "+" : ""}${fmtTauxBp(arrondiPourcent(evolution))} sur ${libelleMois(precedent).split(" ")[0]}`
          }
        />
        <CarteIndicateur libelle="Moyenne mensuelle" valeur={fmt(moyenne)} unite="FCFA" precision="Sur les douze mois affichés" />
        <CarteIndicateur
          libelle="Décidé, pas encore payé"
          valeur={fmt(engage.depensesApprouvees + engage.bonsApprouves)}
          unite="FCFA"
          ton={engage.depensesApprouvees + engage.bonsApprouves > 0 ? "alerte" : "neutre"}
          precision={engage.depensesDemandees > 0 ? `Et ${fmt(engage.depensesDemandees)} F de demandes à trancher` : "Dépenses et bons approuvés"}
          href="/projets/depenses"
        />
        <CarteIndicateur
          libelle="Charges récurrentes"
          valeur={fmt(mensuelRecurrent)}
          unite="F / mois"
          ton={enRetard > 0 ? "danger" : "neutre"}
          precision={enRetard > 0 ? `${enRetard} échéance${enRetard > 1 ? "s" : ""} en retard` : `${actives.length} charge${actives.length > 1 ? "s" : ""} suivie${actives.length > 1 ? "s" : ""}`}
        />
      </section>

      <section className="mb-6">
        <GraphiqueMois mois={periode} totaux={charges.parMois} choisi={mois} lien={(m) => lien({ mois: m })} />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">Par nature</h2>
        {lignes.length === 0 ? (
          <EtatVide
            titre="Aucune charge comptabilisée"
            message="Les charges apparaissent ici dès qu'un bon de caisse est décaissé, une dépense payée, une facture fournisseur saisie ou une paie validée."
          />
        ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>Nature</Th>
                <Th aligne="droite">{libelleMois(mois)}</Th>
                <Th aligne="droite">Mois précédent</Th>
                <Th aligne="droite">Moyenne 12 mois</Th>
                <Th aligne="droite">Budget mensuel</Th>
                <Th>Consommation</Th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.famille} className={famille === l.famille ? "bg-[var(--surface-creuse)]" : undefined}>
                  <Td>
                    <Link href={lien({ famille: famille === l.famille ? null : l.famille })} scroll={false} className="font-medium hover:underline">
                      {FAMILLES_CHARGE[l.famille].libelle}
                    </Link>
                  </Td>
                  <Td aligne="droite" chiffres fort>
                    {l.reel ? fmt(l.reel) : "—"}
                  </Td>
                  <Td aligne="droite" chiffres>
                    <span className="text-[var(--encre-douce)]">{l.precedent ? fmt(l.precedent) : "—"}</span>
                  </Td>
                  <Td aligne="droite" chiffres>
                    <span className="text-[var(--encre-douce)]">{l.moyenne ? fmt(l.moyenne) : "—"}</span>
                  </Td>
                  <Td aligne="droite">
                    <CelluleBudget famille={l.famille} budget={l.budget} modifiable={gerer} />
                  </Td>
                  <Td>
                    <Consommation reel={l.reel} budget={l.budget} conso={l.conso} />
                  </Td>
                </tr>
              ))}
              <tr>
                <Td fort>Total</Td>
                <Td aligne="droite" chiffres fort>
                  {fmt(totalMois)}
                </Td>
                <Td aligne="droite" chiffres>
                  {fmt(totalPrecedent)}
                </Td>
                <Td aligne="droite" chiffres>
                  {fmt(moyenne)}
                </Td>
                <Td aligne="droite" chiffres>
                  {budgets.size ? fmt([...budgets.values()].reduce((s, v) => s + v, 0)) : "—"}
                </Td>
                <Td>{""}</Td>
              </tr>
            </tbody>
          </Tableau>
        )}
        {gerer && lignes.length > 0 && (
          <p className="mt-2 text-xs text-[var(--encre-faible)]">
            Cliquez un budget pour fixer l&apos;enveloppe mensuelle d&apos;une nature. Elle n&apos;interdit rien : elle signale le dépassement.
          </p>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Charges récurrentes</h2>
            <p className="text-sm text-[var(--encre-douce)]">
              Loyer, électricité, internet, assurance : rappelées à chaque échéance et comptées dans le plan de trésorerie.
            </p>
          </div>
          {gerer && <FormulaireCharge fournisseurs={fournisseurs.map((f) => ({ id: f.id, nom: f.nom }))} aujourdhui={aujourdhui} />}
        </div>
        <ChargesRecurrentes charges={recurrentes} gerer={gerer} aujourdhui={aujourdhui} />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold first-letter:uppercase">Détail de {libelleMois(mois)}</h2>
          {famille && (
            <Link href={lien({ famille: null })} scroll={false}>
              <Pastille ton="marque">{FAMILLES_CHARGE[famille].libelle} ✕</Pastille>
            </Link>
          )}
        </div>
        {detail.length > 0 && (
          <Recherche
            chemin={lien({})}
            valeur={recherche}
            placeholder="Pièce, libellé, compte, origine…"
            filtres={
              <>
                {mois !== courant && <input type="hidden" name="mois" value={mois} />}
                {famille && <input type="hidden" name="famille" value={famille} />}
              </>
            }
            resultats={recherche ? `${fmtEntier(detailAffiche.length)} sur ${fmtEntier(detail.length)}` : undefined}
          />
        )}
        {detail.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--encre-douce)]">
            Aucune charge comptabilisée {famille ? "dans cette nature " : ""}ce mois-ci.
          </p>
        ) : detailAffiche.length === 0 ? (
          <EtatVide titre="Aucune charge ne répond" message="Retirez un mot de la recherche, ou changez de mois." />
        ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Pièce</Th>
                <Th>Libellé</Th>
                <Th>Compte</Th>
                <Th>Origine</Th>
                <Th aligne="droite">Montant</Th>
              </tr>
            </thead>
            <tbody>
              {detailAffiche.map((d, i) => (
                <tr key={`${d.piece}-${d.compte}-${i}`}>
                  <Td chiffres>{DATE.format(new Date(`${d.date}T00:00:00Z`))}</Td>
                  <Td chiffres>{d.piece}</Td>
                  <Td>{d.libelle}</Td>
                  <Td>
                    <span className="chiffres">{d.compte}</span>
                    <span className="block text-xs text-[var(--encre-faible)]">{d.libelleCompte}</span>
                  </Td>
                  <Td>
                    <span className="text-[var(--encre-douce)]">{ORIGINE[d.origine] ?? d.origine}</span>
                  </Td>
                  <Td aligne="droite" chiffres fort>
                    {fmt(d.montant)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        )}
      </section>
    </>
  );
}

/** Jauge de consommation : la couleur dit l'état, le texte aussi. */
function Consommation({ reel, budget, conso }: { reel: number; budget: number | null; conso: ReturnType<typeof consommationBudget> }) {
  if (conso.etat === "sans_budget" || conso.bp === null || budget === null) {
    return <span className="text-xs text-[var(--encre-faible)]">Pas de budget</span>;
  }
  const couleur = conso.etat === "depasse" ? "bg-danger-500" : conso.etat === "proche" ? "bg-alerte-500" : "bg-valide-500";
  const texte =
    conso.etat === "depasse"
      ? `Dépassé de ${fmt(reel - budget)} F`
      : `${fmtTauxBp(arrondiPourcent(conso.bp))}${conso.etat === "proche" ? " — proche" : ""}`;
  return (
    <span className="flex min-w-40 items-center gap-2">
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--surface-creuse)]" aria-hidden>
        <span className={`block h-full rounded-full ${couleur}`} style={{ width: `${Math.min(conso.bp / 100, 100)}%` }} />
      </span>
      <span className={`text-xs ${conso.etat === "depasse" ? "font-semibold text-danger-600" : conso.etat === "proche" ? "text-alerte-600" : "text-[var(--encre-douce)]"}`}>
        {texte}
      </span>
    </span>
  );
}

/** Un pourcentage d'écran se lit à l'unité : 1 250 pb → « 13 % ». */
function arrondiPourcent(bp: number): number {
  return divideMoney(bp, 100) * 100;
}
