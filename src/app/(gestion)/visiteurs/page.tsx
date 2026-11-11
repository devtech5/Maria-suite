import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChampsVisite } from "@/components/visiteurs/champs-visite";
import { ListeVisites } from "@/components/visiteurs/liste-visites";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { enregistrerArrivee } from "@/modules/visiteurs/actions";
import { accueilsDe, journeeDe, personnesVisitables, visitesDe } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Accueil des visiteurs" };

/**
 * L'écran de l'accueil : qui est sur place, qui est attendu aujourd'hui, et
 * l'enregistrement d'une arrivée — pièce d'identité photographiée, badge.
 */
export default async function PageAccueilVisiteurs({ searchParams }: PageProps<"/visiteurs">) {
  const acces = await accesVisiteurs();
  if (!acces.accueillir) redirect("/visiteurs/rendez-vous");
  const org = acces.session.organizationId;
  const { accueil: demande } = await searchParams;
  const tous = await accueilsDe(org, { actifs: true });
  const miens = tous.filter((a) => acces.accueilPermis(a.id));

  if (miens.length === 0) {
    return (
      <>
        <EnTetePage titre="Accueil des visiteurs" />
        <EtatVide
          titre={tous.length === 0 ? "Aucun point d'accueil" : "Vous ne tenez aucun point d'accueil"}
          message={
            acces.superviser
              ? "Créez les points d'accueil — siège, chantiers, sites miniers — et désignez leurs agents."
              : "Demandez à la direction de vous rattacher au point d'accueil que vous tenez."
          }
          actions={
            acces.superviser && (
              <Link href="/visiteurs/accueils" className="h-cible inline-flex items-center rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700">
                Créer un point d&apos;accueil
              </Link>
            )
          }
        />
      </>
    );
  }

  const accueil = miens.find((a) => a.id === demande) ?? miens[0];
  const maintenant = new Date();
  const [{ debut, fin }, personnes] = await Promise.all([journeeDe(org, maintenant), personnesVisitables(org)]);
  const [presents, attendus, sortis] = await Promise.all([
    visitesDe(org, { accueilIds: [accueil.id], statuts: ["presente"], limite: 500 }),
    visitesDe(org, { accueilIds: [accueil.id], statuts: ["attendue"], du: debut, au: fin }),
    visitesDe(org, { accueilIds: [accueil.id], statuts: ["sortie"], du: debut, au: fin }),
  ]);

  return (
    <>
      <EnTetePage
        titre={`Accueil · ${accueil.nom}`}
        sousTitre={accueil.lieu ?? "Entrées et sorties du jour"}
        actions={
          <FormulaireRepliable libelle="Enregistrer une arrivée" titre={`Arrivée · ${accueil.nom}`} action={enregistrerArrivee} presentation="tiroir">
            <input type="hidden" name="accueilId" value={accueil.id} />
            <ChampsVisite personnes={personnes} arrivee pieceExigee={accueil.pieceExigee} />
          </FormulaireRepliable>
        }
      />

      {miens.length > 1 && (
        <nav aria-label="Points d'accueil" className="mb-4 flex flex-wrap gap-2">
          {miens.map((a) => (
            <Link
              key={a.id}
              href={`/visiteurs?accueil=${a.id}`}
              className={`rounded-full border px-3 py-1 text-sm ${a.id === accueil.id ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--filet)] bg-[var(--surface)] hover:bg-[var(--surface-creuse)]"}`}
            >
              {a.nom}
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-6 grid grid-cols-3 gap-3">
        <CarteIndicateur libelle="Sur place" valeur={String(presents.length)} ton={presents.length > 0 ? "valide" : "neutre"} href="/visiteurs/presents" />
        <CarteIndicateur libelle="Attendus aujourd'hui" valeur={String(attendus.length)} ton={attendus.length > 0 ? "alerte" : "neutre"} />
        <CarteIndicateur libelle="Sortis aujourd'hui" valeur={String(sortis.length)} ton="marque" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Sur place</h2>
          <ListeVisites visites={presents} maintenant={maintenant} accueillir vide="Personne sur place." />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Attendus aujourd&apos;hui</h2>
          <ListeVisites visites={attendus} maintenant={maintenant} accueillir vide="Aucun rendez-vous annoncé pour aujourd'hui." />
          <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wider text-[var(--encre-faible)]">Sortis aujourd&apos;hui</h2>
          <ListeVisites visites={sortis} maintenant={maintenant} accueillir vide="Aucune sortie aujourd'hui." />
        </section>
      </div>
    </>
  );
}
