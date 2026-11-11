import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChampsTransmission } from "@/components/transmissions/champs-transmission";
import { ListeTransmissions } from "@/components/transmissions/liste-transmissions";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CarteIndicateur, CLASSE_CHAMP_COMPACT, EnTetePage } from "@/components/ui/primitives";
import { accesTransmissions } from "@/modules/transmissions/acces";
import { creerTransmission } from "@/modules/transmissions/actions";
import { LIBELLE_SENS, enRetard, type Sens } from "@/modules/transmissions/regles";
import { aujourdhuiPour, choixPossibles, transmissionsDe } from "@/modules/transmissions/requetes";

export const metadata: Metadata = { title: "Transmissions" };

const TITRES: Record<Sens, string> = { interne: "Nouveau bordereau interne", sortante: "Transmettre à une entreprise", entrante: "Attendre d'une entreprise" };

/**
 * Les bordereaux, un onglet par sens : entre services, vers une entreprise,
 * ou ce qu'une entreprise doit nous remettre. En tête, ce qui est en retard.
 */
export default async function PageTransmissions({ searchParams }: PageProps<"/transmissions">) {
  const a = await accesTransmissions();
  if (!a.emettre) redirect("/transmissions/recues");
  const p = await searchParams;
  const sens: Sens = p.sens === "sortante" || p.sens === "entrante" ? p.sens : "interne";
  const q = typeof p.q === "string" ? p.q : "";
  const org = a.session.organizationId;
  const concerne = a.superviser ? undefined : a.moi;
  const [liste, tout, aujourdhui, choix] = await Promise.all([
    transmissionsDe(org, { sens, recherche: q, concerne, limite: 500 }),
    transmissionsDe(org, { statuts: ["a_transmettre", "attendue"], concerne, limite: 1000 }),
    aujourdhuiPour(org),
    choixPossibles(org),
  ]);
  const retards = tout.filter((t) => enRetard(t, aujourdhui));
  const aTransmettre = tout.filter((t) => t.statut === "a_transmettre").length;
  const attendues = tout.filter((t) => t.statut === "attendue").length;

  return (
    <>
      <EnTetePage
        titre="Transmissions"
        sousTitre={a.superviser ? "Tous les bordereaux de l'entreprise" : "Les bordereaux que vous avez établis ou que vous suivez"}
        actions={
          <FormulaireRepliable libelle={TITRES[sens]} titre={TITRES[sens]} action={creerTransmission.bind(null, sens)} presentation="tiroir">
            <ChampsTransmission sens={sens} choix={choix} moi={a.moi} aujourdhui={aujourdhui} />
          </FormulaireRepliable>
        }
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <CarteIndicateur libelle="À transmettre" valeur={String(aTransmettre)} ton={aTransmettre ? "alerte" : "neutre"} href="/transmissions?sens=sortante" />
        <CarteIndicateur libelle="Attendues des entreprises" valeur={String(attendues)} ton={attendues ? "alerte" : "neutre"} href="/transmissions?sens=entrante" />
        <CarteIndicateur libelle="En retard" valeur={String(retards.length)} ton={retards.length ? "danger" : "valide"} />
      </div>
      {retards.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-danger-600">En retard</h2>
          <ListeTransmissions liste={retards} aujourdhui={aujourdhui} vide="" />
        </section>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[var(--filet)] bg-[var(--surface)] p-0.5 text-sm">
          {(["interne", "sortante", "entrante"] as const).map((s) => (
            <Link key={s} href={`/transmissions?sens=${s}`} className={`rounded-md px-3 py-1.5 font-semibold ${s === sens ? "bg-marque-600 text-white" : "text-[var(--encre-douce)] hover:text-[var(--encre)]"}`}>
              {LIBELLE_SENS[s]}
            </Link>
          ))}
        </div>
        <form className="flex flex-1 gap-2">
          <input type="hidden" name="sens" value={sens} />
          <input name="q" defaultValue={q} placeholder="Numéro, objet, entreprise, pièce…" className={`${CLASSE_CHAMP_COMPACT} min-w-56 flex-1`} />
          <button type="submit" className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
            Rechercher
          </button>
        </form>
      </div>
      <ListeTransmissions liste={liste} aujourdhui={aujourdhui} vide="Aucun bordereau ici." />
    </>
  );
}
