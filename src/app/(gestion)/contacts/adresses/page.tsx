import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { BarreRecherche } from "@/components/contacts/barre-recherche";
import { ActionsAdresse, NouvelleAdresse } from "@/components/contacts/formulaire-adresse";
import { BoutonReprise } from "@/components/contacts/bouton-reprise";
import { CarteIndicateur, EtatVide, EnTetePage, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { accesContacts } from "@/modules/contacts/acces";
import { etatValide, filtrerAdresses, LIBELLE_ETAT, LISTE_ETATS, type StatutAffectation } from "@/modules/contacts/regles";
import { adressesDe, collaborateursDe, servicesDe } from "@/modules/contacts/requetes";

export const metadata: Metadata = { title: "Adresses e-mail" };

const STATUT: Record<StatutAffectation, { libelle: string; ton: "neutre" | "marque" | "valide" | "alerte" | "danger" }> = {
  libre: { libelle: "Sans service", ton: "alerte" },
  service: { libelle: "Au service", ton: "neutre" },
  titulaire: { libelle: "Affectée", ton: "valide" },
  a_revoir: { libelle: "À revoir", ton: "danger" },
};

/**
 * Les adresses e-mail professionnelles de l'entreprise : on les liste, on les
 * affecte à un service, puis à une personne de ce service.
 */
export default async function PageAdresses({ searchParams }: PageProps<"/contacts/adresses">) {
  const a = await accesContacts();
  if (!a.gerer) return <AccesRefuse droit="contacts.gerer" />;
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q : "";
  const serviceId = typeof p.service === "string" ? p.service : "";
  const etat = etatValide(p.etat) ? p.etat : "toutes";
  const org = a.session.organizationId;
  const [adresses, services, collaborateurs] = await Promise.all([adressesDe(org), servicesDe(org), collaborateursDe(org)]);
  const liste = filtrerAdresses(adresses, { q, serviceId, etat });
  const ouvertes = adresses.filter((x) => x.actif);
  const libres = ouvertes.filter((x) => x.statut === "libre").length;
  const aRevoir = ouvertes.filter((x) => x.statut === "a_revoir").length;
  const choix = {
    services: services.map((s) => ({ id: s.id, libelle: s.libelle, actif: s.actif })),
    collaborateurs: collaborateurs.map((c) => ({ id: c.id, nom: c.nom, service: c.service })),
  };

  return (
    <>
      <EnTetePage
        titre="Adresses e-mail professionnelles"
        sousTitre="Celles de l'entreprise, affectées par service puis par personne"
        actions={
          <>
            <BoutonReprise />
            <NouvelleAdresse choix={choix} />
          </>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <CarteIndicateur libelle="Adresses ouvertes" valeur={String(ouvertes.length)} />
        <CarteIndicateur libelle="Sans service" valeur={String(libres)} ton={libres ? "alerte" : "valide"} href="/contacts/adresses?etat=libres" />
        <CarteIndicateur libelle="À revoir" valeur={String(aRevoir)} ton={aRevoir ? "danger" : "valide"} href="/contacts/adresses?etat=a_revoir" />
      </div>
      <BarreRecherche
        q={q}
        placeholder="Adresse, service, titulaire…"
        filtres={[
          { nom: "service", valeur: serviceId, toutes: "Tous les services", options: services.filter((s) => s.actif).map((s) => ({ valeur: s.id, libelle: s.libelle })) },
          { nom: "etat", valeur: etat === "toutes" ? "" : etat, toutes: LIBELLE_ETAT.toutes, options: LISTE_ETATS.filter((e) => e !== "toutes").map((e) => ({ valeur: e, libelle: LIBELLE_ETAT[e] })) },
        ]}
      />
      {liste.length === 0 ? (
        <EtatVide
          titre={adresses.length === 0 ? "Aucune adresse dans l'annuaire" : "Aucun résultat"}
          message={
            adresses.length === 0
              ? "Ajoutez les adresses @maria-groupe.com de l'entreprise, ou reprenez d'un coup celles déjà saisies sur les dossiers du personnel."
              : "Aucune adresse ne correspond à cette recherche."
          }
        />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Adresse</Th>
              <Th>Service</Th>
              <Th>Titulaire</Th>
              <Th>État</Th>
              <Th aligne="droite">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {liste.map((l) => (
              <tr key={l.id} className={`align-top ${l.actif ? "" : "opacity-60"}`}>
                <Td fort>
                  {l.adresse}
                  {l.libelle && <span className="block text-xs font-normal text-[var(--encre-faible)]">{l.libelle}</span>}
                </Td>
                <Td>{l.serviceLibelle ?? "—"}</Td>
                <Td>{l.titulaire ?? (l.serviceId ? <span className="text-[var(--encre-faible)]">Commune au service</span> : "—")}</Td>
                <Td>
                  {l.actif ? <Pastille ton={STATUT[l.statut].ton}>{STATUT[l.statut].libelle}</Pastille> : <Pastille>Fermée</Pastille>}
                </Td>
                <Td aligne="droite">
                  <ActionsAdresse adresse={l} choix={choix} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
