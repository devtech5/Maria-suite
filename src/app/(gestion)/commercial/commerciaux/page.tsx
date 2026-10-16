import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { ActionsFiche } from "@/components/ui/actions-fiche";
import { listerMembres } from "@/lib/auth/membres";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtTauxBp } from "@/lib/format";
import { tableauCommissions } from "@/modules/commerciaux/requetes";
import { libelleMois, moisCourant } from "@/modules/paie/calcul";
import { listerSalaries } from "@/modules/personnes/requetes";
import { listerComptes } from "@/modules/tresorerie/requetes";

import { ActionsCommission, ChoixMois, FicheCommercial } from "./edition";

export const metadata: Metadata = { title: "Commerciaux" };

const moisValide = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/**
 * Commerciaux et commissions : qui a vendu quoi ce mois-ci, ce que lui
 * rapporte sa règle (part fixe et part variable, sur le CA ou la marge), et
 * le geste de fin de mois — valider, puis payer ou reporter en paie.
 */
export default async function PageCommerciaux({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await peut("commercial.commission.gerer"))) return <AccesRefuse droit="commercial.commission.gerer" />;
  const session = await exigerEntreprise();
  const { mois: demande } = await searchParams;
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

  return (
    <>
      <EnTetePage titre="Commerciaux" sousTitre={`Réalisations et commissions — ${libelleMois(mois)}${termine ? "" : " (mois en cours)"}`} actions={<ChoixMois mois={mois} max={courant} />} />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <CarteIndicateur libelle="CA HT des commerciaux" valeur={fmtCompact(ca)} unite="FCFA" precision="Factures moins avoirs, et tickets de caisse" />
        <CarteIndicateur libelle={termine ? "Commissions du mois" : "Commissions à date"} valeur={fmtCompact(commissionsMois)} unite="FCFA" precision={ca > 0 ? `${fmtTauxBp(Math.round((commissionsMois * 10_000) / ca))} du CA` : undefined} />
        <CarteIndicateur libelle="Validées, à payer" valeur={fmtCompact(aPayer.reduce((s, l) => s + (l.validee?.total ?? 0), 0))} unite="FCFA" ton={aPayer.length ? "alerte" : "neutre"} precision={`${aPayer.length} commercial${aPayer.length > 1 ? "aux" : ""}`} />
        <CarteIndicateur libelle="Commerciaux actifs" valeur={String(lignes.filter((l) => l.commercial.actif).length)} />
      </section>

      <FicheCommercial
        membres={membres.filter((m) => m.statut === "actif").map((m) => ({ id: m.userId, nom: m.nom }))}
        salaries={salaries.map((s) => ({ id: s.id, nom: `${s.nom} — ${s.poste}` }))}
      />

      {lignes.length === 0 ? (
        <EtatVide titre="Aucun commercial" message="Créez un commercial, liez-le à un utilisateur pour lui attribuer ses tickets de caisse, ou choisissez-le sur chaque devis et facture." />
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
            {lignes.map(({ commercial: c, realisation: r, calcul, objectif, validee }) => {
              const regle = c.paliers?.length
                ? `Paliers : ${c.paliers.map((p) => `${fmtTauxBp(p.tauxBp)} dès ${fmtCompact(p.seuil)}`).join(", ")}`
                : `${fmtTauxBp(c.tauxBp)}`;
              const ecart = validee && validee.total !== calcul.total ? calcul.total - validee.total : 0;
              return (
                <tr key={c.id} className={c.actif ? "" : "opacity-60"}>
                  <Td fort>
                    {c.nom}
                    <span className="block text-[11px] font-normal text-[var(--encre-faible)]">
                      {c.employeeId ? `Salarié · ${nomSalarie.get(c.employeeId) ?? "?"}` : "Externe"}
                      {c.userId ? ` · caisse de ${nomMembre.get(c.userId) ?? "?"}` : ""}
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
                        nom: c.nom,
                        telephone: c.telephone ?? "",
                        userId: c.userId ?? "",
                        employeeId: c.employeeId ?? "",
                        base: c.base,
                        tauxBp: c.tauxBp,
                        paliers: c.paliers ?? [],
                        fixeMensuel: c.fixeMensuel,
                        objectifMensuel: c.objectifMensuel,
                        actif: c.actif,
                      }}
                      membres={membres.filter((m) => m.statut === "actif").map((m) => ({ id: m.userId, nom: m.nom }))}
                      salaries={salaries.map((s) => ({ id: s.id, nom: `${s.nom} — ${s.poste}` }))}
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

      <p className="mt-4 max-w-[75ch] text-xs text-[var(--encre-faible)]">
        Une vente compte pour le commercial choisi sur le devis ou la facture ; un ticket de caisse, pour le commercial lié au caissier. Les paliers sont progressifs : chaque
        taux ne s&apos;applique qu&apos;à sa tranche. La commission d&apos;un salarié passe par sa paie (cotisée et imposée) ; celle d&apos;un externe se paie depuis la
        trésorerie, en charge au compte 6322.
      </p>
    </>
  );
}
