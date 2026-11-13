import type { Metadata } from "next";
import Link from "next/link";

import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtCompact, fmtEntier, fmtTaux } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { nomPays, origineDe } from "@/modules/tiers/origine";
import { fichesTiers, paysEntreprise } from "@/modules/tiers/requetes";
import { FormulaireTiers } from "../formulaire-tiers";
import { TableauFournisseurs } from "./tableau-fournisseurs";

export const metadata: Metadata = { title: "Fournisseurs" };

export default async function PageFournisseurs({ searchParams }: PageProps<"/commercial/fournisseurs">) {
  const session = await exigerEntreprise();
  const parametres = await searchParams;
  const filtres = lireFiltresListe(parametres);
  // Suivi : tous, locaux, ou internationaux.
  const origine = parametres.origine === "local" || parametres.origine === "international" ? parametres.origine : null;
  const [gerer, supprimer] = await Promise.all([peut("tiers.fiche.gerer"), peut("tiers.fiche.supprimer")]);
  // Qui peut réactiver voit aussi les fiches en off.
  const [fournisseurs, pays] = await Promise.all([fichesTiers(session.organizationId, "fournisseur", gerer), paysEntreprise(session.organizationId)]);
  // Le fichier entier est déjà là, sans limite : la recherche filtre le tableau en mémoire, les indicateurs restent ceux de tout le fichier.
  const lignes = fournisseurs.filter(
    (f) =>
      (origine === null || origineDe(f.paysCode, pays) === origine) &&
      correspond(filtres.q, [f.code, f.nom, f.identifiantFiscal, f.secteur, f.telephone, f.email, f.ville, nomPays(f.paysCode ?? pays), ...f.contacts.map((c) => c.nom)]),
  );
  const internationaux = fournisseurs.filter((f) => origineDe(f.paysCode, pays) === "international").length;

  const volume = fournisseurs.reduce((somme, f) => somme + f.achatsFournisseur, 0);
  const du = fournisseurs.reduce((somme, f) => somme + f.duFournisseur, 0);

  // Moyenne sur les seuls fournisseurs dont le délai est renseigné : compter
  // les zéros comme des livraisons instantanées rendrait la moyenne flatteuse
  // et le réapprovisionnement trop tardif.
  const avecDelai = fournisseurs.filter((f) => f.delaiLivraisonJours > 0);
  const delaiMoyen =
    avecDelai.length === 0
      ? null
      : avecDelai.reduce((somme, f) => somme + f.delaiLivraisonJours, 0) /
        avecDelai.length;

  return (
    <>
      <EnTetePage
        titre="Fournisseurs"
        sousTitre={
          fournisseurs.length === 0
            ? "Aucun fournisseur référencé"
            : `${fournisseurs.length} fournisseurs référencés`
        }
        actions={<FormulaireTiers role="fournisseur" paysEntreprise={pays} />}
      />

      {fournisseurs.length === 0 ? (
        <EtatVide
          titre="Aucun fournisseur"
          message="Le délai de livraison saisi ici alimente le réapprovisionnement : sans lui, la quantité suggérée arrive après la rupture."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
            <CarteIndicateur
              libelle="Volume d'achats"
              valeur={fmtCompact(volume)}
              unite="FCFA"
              precision="Déduit des écritures d'achat"
            />
            <CarteIndicateur
              libelle="Solde dû"
              valeur={fmtCompact(du)}
              unite="FCFA"
              ton={du > 0 ? "alerte" : "valide"}
              precision="Lignes 401 non lettrées"
            />
            <CarteIndicateur
              libelle="Délai moyen"
              valeur={delaiMoyen === null ? "—" : fmtTaux(delaiMoyen)}
              unite={delaiMoyen === null ? undefined : "jours"}
              precision={
                delaiMoyen === null
                  ? "Aucun délai renseigné"
                  : "Sert au calcul du réapprovisionnement"
              }
            />
          </section>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {([[null, "Tous", fournisseurs.length], ["local", "Locaux", fournisseurs.length - internationaux], ["international", "Internationaux", internationaux]] as const).map(([valeur, libelle, n]) => (
              <Link
                key={libelle}
                href={`/commercial/fournisseurs${valeur ? `?origine=${valeur}` : ""}`}
                aria-current={origine === valeur ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${origine === valeur ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--filet)] bg-[var(--surface)] hover:bg-[var(--surface-creuse)]"}`}
              >
                {libelle} <span className="chiffres opacity-80">{n}</span>
              </Link>
            ))}
          </div>

          <Recherche
            chemin={`/commercial/fournisseurs${origine ? `?origine=${origine}` : ""}`}
            valeur={filtres.q}
            filtres={origine ? <input type="hidden" name="origine" value={origine} /> : undefined}
            placeholder="Nom, référence, secteur, pays, téléphone, contact, NCC…"
            resultats={filtres.actif ? `${fmtEntier(lignes.length)} sur ${fmtEntier(fournisseurs.length)}` : undefined}
          />

          {lignes.length === 0 ? (
            <EtatVide titre="Aucun fournisseur ne répond" message="Retirez un mot de la recherche, ou cherchez par référence ou téléphone." />
          ) : (
            <TableauFournisseurs fournisseurs={lignes} gerer={gerer} supprimer={supprimer} paysEntreprise={pays} />
          )}
        </>
      )}
    </>
  );
}
