import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { creerCompte, modifierCompte } from "@/modules/tresorerie/actions";
import { LIBELLE_NATURE_COMPTE } from "@/modules/tresorerie/calcul";
import { enTransit, listerComptes, membresActifs } from "@/modules/tresorerie/requetes";

import { ChampsCompte } from "./champs";
import { ReprendreComptes } from "./reprendre";

export const metadata: Metadata = { title: "Trésorerie" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Où est l'argent, compte par compte. Chaque solde est la somme des écritures
 * du compte : ce qui n'est pas passé en comptabilité n'y est pas.
 */
export default async function PageTresorerie({ searchParams }: PageProps<"/tresorerie">) {
  const session = await exigerEntreprise();
  if (!(await peut("tresorerie.consulter"))) redirect("/tresorerie/caisse");
  const filtres = lireFiltresListe(await searchParams);
  const gerer = await peut("tresorerie.compte.gerer");

  const [comptes, transit, membres] = await Promise.all([
    listerComptes(session.organizationId),
    enTransit(session.organizationId),
    gerer ? membresActifs(session.organizationId) : Promise.resolve([]),
  ]);
  const actifs = comptes.filter((c) => c.actif);
  const somme = (n: string) => actifs.filter((c) => c.nature === n).reduce((s, c) => s + c.solde, 0);
  const total = actifs.reduce((s, c) => s + c.solde, 0) + transit.montant;
  // Les totaux restent ceux de toute la trésorerie ; seules les fiches suivent la recherche.
  const affiches = comptes.filter((c) =>
    correspond(filtres.q, [c.nom, c.compte, c.etablissement, c.reference, c.responsable, LIBELLE_NATURE_COMPTE[c.nature]]),
  );

  return (
    <>
      <EnTetePage
        titre="Trésorerie"
        sousTitre="Caisses, banques et portefeuilles mobile money — soldes lus dans les écritures"
        actions={
          gerer ? (
            <>
              <ReprendreComptes />
              <FormulaireRepliable libelle="Nouveau compte" titre="Nouveau compte de trésorerie" action={creerCompte}>
                <ChampsCompte membres={membres} comptesPris={comptes.map((c) => c.compte)} />
              </FormulaireRepliable>
            </>
          ) : undefined
        }
      />

      <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
        <CarteIndicateur libelle="Disponible au total" valeur={fmt(total)} unite="FCFA" ton={total < 0 ? "danger" : "marque"} precision={`${actifs.length} compte${actifs.length > 1 ? "s" : ""} en service`} />
        <CarteIndicateur libelle="Caisses" valeur={fmt(somme("caisse"))} unite="FCFA" />
        <CarteIndicateur libelle="Banques" valeur={fmt(somme("banque"))} unite="FCFA" />
        <CarteIndicateur libelle="Mobile money" valeur={fmt(somme("mobile_money"))} unite="FCFA" />
        <CarteIndicateur
          libelle="En route"
          valeur={fmt(transit.montant)}
          unite="FCFA"
          ton={transit.virements > 0 ? "alerte" : "neutre"}
          precision={transit.virements > 0 ? `${transit.virements} virement${transit.virements > 1 ? "s" : ""} à recevoir` : "Aucun virement en route"}
          href="/tresorerie/virements"
        />
      </section>

      {comptes.length === 0 ? (
        <EtatVide
          titre="Aucun compte de trésorerie"
          message="Déclarez vos caisses, vos banques et vos portefeuilles mobile money — ou reprenez d'un geste ceux que la comptabilité mouvemente déjà (caisse du comptoir, banque des factures, float du point de vente)."
          actions={gerer ? <ReprendreComptes /> : undefined}
        />
      ) : (
        <>
          <Recherche
            chemin="/tresorerie"
            valeur={filtres.q}
            placeholder="Nom, numéro de compte, banque, responsable…"
            resultats={filtres.q ? `${fmtEntier(affiches.length)} sur ${fmtEntier(comptes.length)}` : undefined}
          />
          {affiches.length === 0 ? (
            <EtatVide titre="Aucun compte ne répond" message="Retirez un mot de la recherche." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {affiches.map((c) => {
                const bas = c.actif && c.seuilAlerte > 0 && c.solde < c.seuilAlerte;
                return (
                  <li key={c.id} className={`rounded-xl border bg-[var(--surface)] p-4 ${bas ? "border-alerte-500" : "border-[var(--filet)]"} ${c.actif ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{c.nom}</p>
                        <p className="chiffres text-xs text-[var(--encre-faible)]">
                          {c.compte}
                          {c.etablissement && ` · ${c.etablissement}`}
                          {c.reference && ` · ${c.reference}`}
                        </p>
                      </div>
                      <Pastille ton={c.nature === "banque" ? "marque" : "neutre"}>{LIBELLE_NATURE_COMPTE[c.nature]}</Pastille>
                    </div>
                    <p className={`chiffres mt-3 text-2xl font-bold ${c.solde < 0 ? "text-danger-600" : bas ? "text-alerte-600" : ""}`}>
                      {fmt(c.solde)} <span className="text-sm font-medium text-[var(--encre-faible)]">FCFA</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.actif && (
                        <Link href={`/tresorerie/mouvements?compte=${c.id}`}>
                          <Pastille ton="marque">Mouvements</Pastille>
                        </Link>
                      )}
                      {!c.actif && <Pastille ton="neutre">Fermé</Pastille>}
                      {bas && <Pastille ton="alerte">Sous le seuil de {fmt(c.seuilAlerte)} F</Pastille>}
                      {c.solde < 0 && c.nature !== "banque" && <Pastille ton="danger">Solde négatif : écriture à vérifier</Pastille>}
                      {c.nonPointees > 0 && (
                        <Link href={`/tresorerie/rapprochement?compte=${c.id}`}>
                          <Pastille ton="alerte">{c.nonPointees} ligne{c.nonPointees > 1 ? "s" : ""} de relevé à pointer</Pastille>
                        </Link>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-[var(--encre-faible)]">
                      {c.responsable ? `Responsable : ${c.responsable}` : "Sans responsable désigné"}
                      {c.nature !== "banque" &&
                        (c.dernierArrete
                          ? ` · arrêtée le ${JOUR.format(new Date(`${c.dernierArrete.le}T00:00:00Z`))}${c.dernierArrete.ecart !== 0 ? ` (écart ${c.dernierArrete.ecart > 0 ? "+" : "−"}${fmt(Math.abs(c.dernierArrete.ecart))})` : ""}`
                          : " · jamais arrêtée")}
                    </p>
                    {gerer && (
                      <div className="mt-3 border-t border-[var(--filet)] pt-3">
                        <FormulaireRepliable libelle="Modifier" titre={`Modifier « ${c.nom} »`} action={modifierCompte.bind(null, c.id)}>
                          <ChampsCompte
                            membres={membres}
                            initial={{
                              nom: c.nom,
                              etablissement: c.etablissement,
                              reference: c.reference,
                              responsableUserId: c.responsableUserId,
                              seuilAlerte: c.seuilAlerte,
                              actif: c.actif,
                            }}
                          />
                        </FormulaireRepliable>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <p className="mt-5 max-w-[70ch] text-xs text-[var(--encre-faible)]">
        Aucun solde n&apos;est tenu à part : chaque montant est la somme des écritures du compte. Une caisse qui
        affiche un solde différent de ce que contient le tiroir appelle un arrêté de caisse, pas une correction du
        chiffre.
      </p>
    </>
  );
}
