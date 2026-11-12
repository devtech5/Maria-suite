import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ActionsFiche } from "@/components/ui/actions-fiche";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { listerMembres } from "@/lib/auth/membres";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier, fmtTauxBp } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { tableauCommissions } from "@/modules/commerciaux/requetes";
import { libelleMois, moisCourant } from "@/modules/paie/calcul";
import { listerSalaries } from "@/modules/personnes/requetes";
import { listerComptes } from "@/modules/tresorerie/requetes";

import { ActionsCommission, ChoixMois, FicheCommercial, type Personnel } from "./edition";

export const metadata: Metadata = { title: "Commercial" };

const moisValide = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/**
 * Commerciaux et commissions : qui a vendu quoi ce mois-ci, ce que lui
 * rapporte sa règle (part fixe et part variable, sur le CA ou la marge), et
 * le geste de fin de mois — valider, puis payer ou reporter en paie.
 */
export default async function PageCommerciaux({ searchParams }: PageProps<"/commercial/commerciaux">) {
  if (!(await peut("commercial.commission.gerer"))) return <AccesRefuse droit="commercial.commission.gerer" />;
  const session = await exigerEntreprise();
  const parametres = await searchParams;
  const { mois: demande } = parametres;
  // La période, c'est le mois choisi en haut : la recherche ne porte que sur le texte.
  const filtres = lireFiltresListe({ q: parametres.q });
  // Suivi : tous, les internes (personnel) ou les externes (apporteurs d'affaires).
  const origine = parametres.origine === "interne" || parametres.origine === "externe" ? parametres.origine : null;
  const courant = moisCourant();
  const mois = moisValide(demande) && demande <= courant ? demande : courant;
  const payer = await peut("commercial.commission.payer");
  const supprimer = await peut("tiers.fiche.supprimer");

  const [lignes, membres, salaries, comptes] = await Promise.all([
    tableauCommissions(session.organizationId, mois),
    listerMembres(session.organizationId),
    listerSalaries(session.organizationId),
    payer ? listerComptes(session.organizationId) : Promise.resolve([]),
  ]);
  const ca = lignes.reduce((s, l) => s + l.realisation.caHt, 0);
  const commissionsMois = lignes.reduce((s, l) => s + (l.validee?.total ?? l.calcul.total), 0);
  const aPayer = lignes.filter((l) => l.validee?.statut === "validee");
  const termine = mois < courant;
  const nomMembre = new Map(membres.map((m) => [m.userId, m.nom]));
  const nomSalarie = new Map(salaries.map((s) => [s.id, `${s.nom} (${s.matricule})`]));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  // Les indicateurs portent sur tous les commerciaux du mois ; seul le tableau suit la recherche.
  const visibles = lignes.filter(
    ({ commercial: c }) =>
      (origine === null || c.origine === origine) &&
      correspond(filtres.q, [c.nom, c.telephone, c.email, c.organisme, c.ville, c.origine === "externe" ? "Externe" : "Interne", c.employeeId ? nomSalarie.get(c.employeeId) : null, c.userId ? nomMembre.get(c.userId) : null]),
  );
  const nombreExternes = lignes.filter((l) => l.commercial.origine === "externe").length;

  // Tout le personnel : les collaborateurs en poste, puis les comptes sans fiche de collaborateur (l'associé, le comptable externe).
  const compteDeSalarie = new Set(salaries.map((s) => s.userId).filter(Boolean));
  const dejaSalaries = new Set(lignes.map((l) => l.commercial.employeeId).filter(Boolean));
  const dejaComptes = new Set(lignes.map((l) => l.commercial.userId).filter(Boolean));
  const personnel: Personnel[] = [
    ...salaries.map((s) => ({ cle: `e:${s.id}`, nom: s.nom, detail: s.poste, pris: dejaSalaries.has(s.id) || Boolean(s.userId && dejaComptes.has(s.userId)) })),
    ...membres
      .filter((m) => m.statut === "actif" && !compteDeSalarie.has(m.userId))
      .map((m) => ({ cle: `u:${m.userId}`, nom: m.nom, detail: "compte sans fiche de collaborateur", pris: dejaComptes.has(m.userId) })),
  ].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  return (
    <>
      <EnTetePage titre="Commercial" sousTitre={`Réalisations et commissions — ${libelleMois(mois)}${termine ? "" : " (mois en cours)"}`} actions={<ChoixMois mois={mois} max={courant} />} />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="CA HT des commerciaux" valeur={fmtCompact(ca)} unite="FCFA" precision="Factures moins avoirs, et tickets de caisse" />
        <CarteIndicateur libelle={termine ? "Commissions du mois" : "Commissions à date"} valeur={fmtCompact(commissionsMois)} unite="FCFA" precision={ca > 0 ? `${fmtTauxBp(Math.round((commissionsMois * 10_000) / ca))} du CA` : undefined} />
        <CarteIndicateur libelle="Validées, à payer" valeur={fmtCompact(aPayer.reduce((s, l) => s + (l.validee?.total ?? 0), 0))} unite="FCFA" ton={aPayer.length ? "alerte" : "neutre"} precision={`${aPayer.length} commercial${aPayer.length > 1 ? "aux" : ""}`} />
        <CarteIndicateur libelle="Commerciaux actifs" valeur={String(lignes.filter((l) => l.commercial.actif).length)} precision={`${lignes.length - nombreExternes} internes · ${nombreExternes} externes`} />
      </section>

      <FicheCommercial personnel={personnel} />

      {lignes.length === 0 ? (
        <EtatVide titre="Aucun commercial" message="Créez un commercial, liez-le à un utilisateur pour lui attribuer ses tickets de caisse, ou choisissez-le sur chaque devis et facture." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([[null, "Tous", lignes.length], ["interne", "Internes", lignes.length - nombreExternes], ["externe", "Externes", nombreExternes]] as const).map(([valeur, libelle, n]) => (
              <Link
                key={libelle}
                href={`/commercial/commerciaux?mois=${mois}${valeur ? `&origine=${valeur}` : ""}${filtres.q ? `&q=${encodeURIComponent(filtres.q)}` : ""}`}
                aria-current={origine === valeur ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${origine === valeur ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--filet)] bg-[var(--surface)] hover:bg-[var(--surface-creuse)]"}`}
              >
                {libelle} <span className="chiffres opacity-80">{n}</span>
              </Link>
            ))}
          </div>
          <Recherche
            // Le mois et le suivi survivent à la soumission (champs cachés) comme à « Tout afficher » (adresse).
            chemin={`/commercial/commerciaux?mois=${mois}${origine ? `&origine=${origine}` : ""}`}
            valeur={filtres.q}
            placeholder="Nom, téléphone, structure, collaborateur ou caissier lié…"
            filtres={
              <>
                <input type="hidden" name="mois" value={mois} />
                {origine && <input type="hidden" name="origine" value={origine} />}
              </>
            }
            resultats={filtres.actif ? `${fmtEntier(visibles.length)} sur ${fmtEntier(lignes.length)}` : undefined}
          />

          {visibles.length === 0 ? (
            <EtatVide titre="Aucun commercial ne répond" message="Retirez un mot de la recherche, ou cherchez par téléphone." />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Commercial</Th>
                  <Th>Règle</Th>
                  <Th aligne="droite">CA HT</Th>
                  <Th aligne="droite">Marge</Th>
                  <Th aligne="droite">Objectif</Th>
                  <Th aligne="droite">Commission</Th>
                  <Th>État</Th>
                  <Th aligne="droite">Gestes</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ commercial: c, realisation: r, calcul, objectif, validee }) => {
                  const regle = c.paliers?.length
                    ? `Paliers : ${c.paliers.map((p) => `${fmtTauxBp(p.tauxBp)} dès ${fmtCompact(p.seuil)}`).join(", ")}`
                    : `${fmtTauxBp(c.tauxBp)}`;
                  const ecart = validee && validee.total !== calcul.total ? calcul.total - validee.total : 0;
                  return (
                    <tr key={c.id} className={c.actif ? "" : "opacity-60"}>
                      <Td fort>
                        {c.nom}
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-[var(--encre-faible)]">
                          <Pastille ton={c.origine === "externe" ? "alerte" : "marque"}>{c.origine === "externe" ? "Externe" : "Interne"}</Pastille>
                          {c.origine === "externe"
                            ? [c.organisme, c.ville, c.telephone].filter(Boolean).join(" · ")
                            : [c.employeeId ? nomSalarie.get(c.employeeId) : "compte sans fiche", c.userId ? `caisse de ${nomMembre.get(c.userId) ?? "?"}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-xs">
                          {regle} {c.base === "marge" ? "de la marge" : "du CA"}
                          {c.fixeMensuel > 0 && ` + ${fmt(c.fixeMensuel)} F fixe`}
                        </span>
                      </Td>
                      <Td aligne="droite" chiffres>
                        {fmt(r.caHt)}
                      </Td>
                      <Td aligne="droite" chiffres>
                        {fmt(r.marge)}
                      </Td>
                      <Td aligne="droite" chiffres>
                        {objectif === null ? "—" : <span className={objectif >= 10_000 ? "font-semibold text-valide-600" : ""}>{fmtTauxBp(objectif)}</span>}
                      </Td>
                      <Td aligne="droite" chiffres fort>
                        {fmt(validee?.total ?? calcul.total)}
                        {ecart !== 0 && <span className="block text-[11px] font-normal text-alerte-600">{ecart > 0 ? "+" : ""}{fmt(ecart)} depuis la validation</span>}
                      </Td>
                      <Td>
                        {validee ? (
                          <Pastille ton={validee.statut === "payee" ? "valide" : "alerte"}>
                            {validee.statut === "payee" ? (validee.modePaiement === "paie" ? "En paie" : "Payée") : "Validée"}
                          </Pastille>
                        ) : (
                          <Pastille ton="neutre">{termine ? "À valider" : "En cours"}</Pastille>
                        )}
                      </Td>
                      <Td aligne="droite">
                        <ActionsCommission
                          commercialId={c.id}
                          mois={mois}
                          termine={termine}
                          salarie={Boolean(c.employeeId)}
                          validee={validee ? { id: validee.id, statut: validee.statut, total: validee.total } : null}
                          peutPayer={payer}
                          comptes={comptes.filter((x) => x.actif).map((x) => ({ id: x.id, nom: x.nom, nature: x.nature, solde: x.solde }))}
                          aujourdhui={aujourdhui}
                          fiche={{
                            id: c.id,
                            origine: c.origine === "externe" ? "externe" : "interne",
                            personne: c.employeeId ? `e:${c.employeeId}` : c.userId ? `u:${c.userId}` : "",
                            nom: c.nom,
                            telephone: c.telephone ?? "",
                            email: c.email ?? "",
                            organisme: c.organisme ?? "",
                            ville: c.ville ?? "",
                            base: c.base,
                            tauxBp: c.tauxBp,
                            paliers: c.paliers ?? [],
                            fixeMensuel: c.fixeMensuel,
                            objectifMensuel: c.objectifMensuel,
                            actif: c.actif,
                          }}
                          personnel={personnel}
                        />
                        {/* La mise en off passe par la fiche ; ici, l'effacement d'une saisie erronée. */}
                        <ActionsFiche type="commercial" id={c.id} libelle={c.nom} peutGerer={false} peutSupprimer={supprimer} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tableau>
          )}
        </>
      )}

      <p className="mt-4 max-w-[75ch] text-xs text-[var(--encre-faible)]">
        Une vente compte pour le commercial choisi sur le devis ou la facture ; un ticket de caisse, pour le commercial lié au caissier. Les paliers sont progressifs : chaque
        taux ne s&apos;applique qu&apos;à sa tranche. La commission d&apos;un collaborateur passe par sa paie (cotisée et imposée) ; celle d&apos;un externe se paie depuis la
        trésorerie, en charge au compte 6322.
      </p>
    </>
  );
}
