import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChampsPli } from "@/components/courrier/champs-pli";
import { ListePlis } from "@/components/courrier/liste-plis";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT, EnTetePage } from "@/components/ui/primitives";
import { accesCourrier, masquer } from "@/modules/courrier/acces";
import { enregistrerPli } from "@/modules/courrier/actions";
import { LIBELLE_STATUT, STATUTS_ARRIVEE, STATUTS_DEPART, type Sens, type StatutPli } from "@/modules/courrier/regles";
import { aujourdhuiPour, entitesDeLivraison, plisDe } from "@/modules/courrier/requetes";

export const metadata: Metadata = { title: "Courrier et colis" };

/** Le registre unique : arrivées (CA) et départs (CD), un onglet chacun. */
export default async function PageRegistreCourrier({ searchParams }: PageProps<"/courrier">) {
  const a = await accesCourrier();
  if (!a.consulter) redirect("/courrier/mon-courrier");
  const p = await searchParams;
  const sens: Sens = p.sens === "depart" ? "depart" : "arrivee";
  const statuts = (sens === "arrivee" ? STATUTS_ARRIVEE : STATUTS_DEPART) as readonly StatutPli[];
  const statut = typeof p.statut === "string" && statuts.includes(p.statut as StatutPli) ? (p.statut as StatutPli) : null;
  const q = typeof p.q === "string" ? p.q : "";
  const org = a.session.organizationId;
  const [lignes, aujourdhui, entites] = await Promise.all([plisDe(org, { sens, statuts: statut ? [statut] : undefined, recherche: q, limite: 500 }), aujourdhuiPour(org), entitesDeLivraison(org)]);
  const visibles = lignes.map((l) => masquer(l, a.voitContenu(l)));

  return (
    <>
      <EnTetePage
        titre="Courrier et colis"
        sousTitre={`Registre des ${sens === "arrivee" ? "arrivées (CA)" : "départs (CD)"} · ${lignes.length} pli${lignes.length > 1 ? "s" : ""}`}
        actions={
          a.enregistrer && (
            <FormulaireRepliable
              libelle={sens === "arrivee" ? "Enregistrer une arrivée" : "Enregistrer un départ"}
              titre={sens === "arrivee" ? "Courrier arrivé" : "Courrier au départ"}
              action={enregistrerPli.bind(null, sens)}
              presentation="ample"
            >
              <ChampsPli sens={sens} entites={entites} />
            </FormulaireRepliable>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[var(--filet)] bg-[var(--surface)] p-0.5 text-sm">
          {(["arrivee", "depart"] as const).map((s) => (
            <Link key={s} href={`/courrier?sens=${s}`} className={`rounded-md px-3 py-1.5 font-semibold ${s === sens ? "bg-marque-600 text-white" : "text-[var(--encre-douce)] hover:text-[var(--encre)]"}`}>
              {s === "arrivee" ? "Arrivées" : "Départs"}
            </Link>
          ))}
        </div>
        <form className="flex flex-1 flex-wrap gap-2">
          <input type="hidden" name="sens" value={sens} />
          <input name="q" defaultValue={q} placeholder="Numéro, objet, correspondant, référence, suivi…" className={`${CLASSE_CHAMP_COMPACT} min-w-56 flex-1`} />
          <select name="statut" defaultValue={statut ?? ""} className={CLASSE_CHAMP_COMPACT}>
            <option value="">Tous les statuts</option>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {LIBELLE_STATUT[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
            Rechercher
          </button>
        </form>
      </div>
      <ListePlis plis={visibles} aujourdhui={aujourdhui} vide="Aucun pli dans ce registre." />
    </>
  );
}
