import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";

import {
  CarteIndicateur,
  Champ,
  CLASSE_CHAMP,
  EnTetePage,
  EtatVide,
  Pastille,
  Tableau,
  Td,
  Th,
  type TonPastille,
} from "@/components/ui/primitives";
import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtCompact, fmtEntier, fmtPeriode } from "@/lib/format";
import { reserver } from "@/modules/reservations/actions";
import { joursEntre } from "@/modules/reservations/calcul";
import { listerContrats, listerRessources, type ContratVue } from "@/modules/reservations/requetes";

import { ActionsContrat, FormulaireRepliable } from "./outils";

export const metadata: Metadata = { title: "Contrats de location" };

function etat(contrat: ContratVue): { libelle: string; ton: TonPastille } {
  if (contrat.enRetard) return { libelle: "En retard", ton: "danger" };
  return {
    reserve: { libelle: "Réservé", ton: "neutre" as TonPastille },
    en_cours: { libelle: "En cours", ton: "marque" as TonPastille },
    restitue: { libelle: "Restitué", ton: "valide" as TonPastille },
    annule: { libelle: "Annulé", ton: "neutre" as TonPastille },
  }[contrat.statut];
}

const RESTITUTION: Record<string, string> = { bon: "Bon état", endommage: "Endommagé", perdu: "Perdu" };

export default async function PageContrats() {
  const session = await exigerEntreprise();

  const [contrats, parc, clients, gerer] = await Promise.all([
    listerContrats(session.organizationId),
    listerRessources(session.organizationId),
    db.execute<{ id: string; nom: string }>(sql`
      select id, nom from tiers
      where organization_id = ${session.organizationId} and est_client and actif and deleted_at is null
      order by nom`),
    peut("reservation.contrat.gerer"),
  ]);

  const enCours = contrats.filter((c) => c.statut === "en_cours");
  const retard = contrats.filter((c) => c.enRetard);
  const produit = contrats
    .filter((c) => c.statut === "en_cours" || c.statut === "restitue")
    .reduce((s, c) => s + c.montant + c.retenue, 0);
  // Les cautions ne sont pas un produit : elles sont détenues et rendues.
  const cautions = enCours.reduce((s, c) => s + c.caution, 0);
  const louables = parc.filter((r) => r.statut === "active");
  const aujourdHui = new Date().toISOString().slice(0, 10);

  return (
    <>
      <EnTetePage
        titre="Contrats"
        sousTitre="Locations, séjours et mises à disposition"
        actions={
          gerer ? (
            <FormulaireRepliable
              libelle="Nouveau contrat"
              titre="Nouvelle réservation"
              action={reserver}
              desactive={louables.length === 0 || clients.length === 0}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Champ libelle="Ressource" precision="Le tarif et la caution viennent de sa grille.">
                  <select name="ressourceId" required className={CLASSE_CHAMP}>
                    {louables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} — {r.designation} ({r.quantite} ex.)
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Client">
                  <select name="clientId" required className={CLASSE_CHAMP}>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </Champ>
                <Champ libelle="Exemplaires">
                  <input name="quantite" type="number" min={1} defaultValue={1} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Du">
                  <input name="debut" type="date" required defaultValue={aujourdHui} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Au (inclus)">
                  <input name="fin" type="date" required defaultValue={aujourdHui} className={`${CLASSE_CHAMP} chiffres`} />
                </Champ>
                <Champ libelle="Note">
                  <input name="notes" placeholder="Lieu de livraison, chantier…" className={CLASSE_CHAMP} />
                </Champ>
              </div>
            </FormulaireRepliable>
          ) : undefined
        }
      />

      {contrats.length === 0 ? (
        <EtatVide
          titre="Aucun contrat"
          message={
            parc.length === 0
              ? "Ajoutez d'abord une ressource louable dans l'onglet Ressources : matériel, chambre, salle."
              : "Une réservation bloque des exemplaires sur une période. À la remise, le client paie et dépose la caution ; au retour, la caution se rend, moins une éventuelle retenue."
          }
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 max-xl:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur libelle="En cours" valeur={fmtEntier(enCours.length)} precision={`Sur ${contrats.length} contrats`} />
            <CarteIndicateur
              libelle="En retard"
              valeur={fmtEntier(retard.length)}
              ton={retard.length > 0 ? "danger" : "valide"}
              precision="Bien non restitué à la date prévue"
            />
            <CarteIndicateur libelle="Produit des locations" valeur={fmtCompact(produit)} unite="FCFA" ton="valide" precision="Encaissé, retenues comprises" />
            <CarteIndicateur libelle="Cautions détenues" valeur={fmtCompact(cautions)} unite="FCFA" precision="À rendre, pas un revenu" />
          </section>

          <Tableau>
            <thead>
              <tr>
                <Th>Numéro</Th>
                <Th>Ressource</Th>
                <Th>Client</Th>
                <Th>Période</Th>
                <Th aligne="droite">Qté</Th>
                <Th>Statut</Th>
                <Th aligne="droite">Montant</Th>
                <Th aligne="droite">Caution</Th>
                {gerer && <Th aligne="droite">Suite</Th>}
              </tr>
            </thead>
            <tbody>
              {contrats.map((contrat) => {
                const e = etat(contrat);
                const jours = joursEntre(contrat.debut, contrat.fin);
                return (
                  <tr key={contrat.id}>
                    <Td chiffres fort>{contrat.numero}</Td>
                    <Td>
                      <span className="block min-w-40">{contrat.ressource}</span>
                      <span className="chiffres block text-xs text-[var(--encre-faible)]">{contrat.codeRessource}</span>
                    </Td>
                    <Td>
                      <span className="block min-w-32">{contrat.client}</span>
                    </Td>
                    <Td chiffres>
                      {fmtPeriode(contrat.debut, contrat.fin)}
                      <span className="block text-xs text-[var(--encre-faible)]">
                        {jours} jour{jours > 1 ? "s" : ""} · tarif {contrat.baseTarif}
                      </span>
                    </Td>
                    <Td aligne="droite" chiffres>{contrat.quantite}</Td>
                    <Td>
                      <Pastille ton={e.ton}>{e.libelle}</Pastille>
                      {contrat.etatRestitution && (
                        <span className="mt-1 block">
                          <Pastille ton={contrat.etatRestitution === "bon" ? "valide" : "alerte"}>
                            {RESTITUTION[contrat.etatRestitution]}
                          </Pastille>
                        </span>
                      )}
                      {contrat.motif && <span className="mt-1 block text-xs text-[var(--encre-faible)]">{contrat.motif}</span>}
                    </Td>
                    <Td aligne="droite" chiffres fort>{fmt(contrat.montant)}</Td>
                    <Td aligne="droite" chiffres>
                      {fmt(contrat.caution)}
                      {contrat.retenue > 0 && (
                        <span className="block text-xs font-semibold text-danger-600">− {fmt(contrat.retenue)} retenus</span>
                      )}
                    </Td>
                    {gerer && (
                      <Td aligne="droite">
                        {contrat.pilote === "hotellerie" ? (
                          <Link href="/hotel/sejours" className="text-xs font-medium text-marque-600 hover:underline">
                            Séjour d&apos;hôtel
                          </Link>
                        ) : (
                          <ActionsContrat id={contrat.id} statut={contrat.statut} caution={contrat.caution} />
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Tableau>
        </>
      )}

      <p className="mt-4 max-w-[70ch] text-xs text-[var(--encre-faible)]">
        La caution est détenue, pas encaissée : elle passe en compte 165 et ne figure
        jamais au chiffre d&apos;affaires. Seule une retenue pour dégât, perte ou
        retard devient une recette.
      </p>
    </>
  );
}
