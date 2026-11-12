import type { Metadata } from "next";
import Link from "next/link";

import { Etoiles, FormulaireInscription } from "@/components/prestataires/formulaires";
import { CLASSE_CHAMP_COMPACT, EnTetePage, EtatVide, Pastille } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmt, fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { UNITES_TARIF, type UniteTarif } from "@/modules/prestataires/calcul";
import { listerPrestataires } from "@/modules/prestataires/creation";
import { LIBELLE_NATURE_TIERS } from "@/modules/tiers/natures";
import { nomPays, origineDe } from "@/modules/tiers/origine";
import { paysEntreprise } from "@/modules/tiers/requetes";

export const metadata: Metadata = { title: "Prestataires" };

/**
 * Annuaire des prestataires : qui appeler pour une fuite, un reportage, un
 * montage vidéo — trié par la note qu'ont laissée les prestations passées.
 */
export default async function PagePrestataires({ searchParams }: PageProps<"/prestataires">) {
  const session = await exigerEntreprise();
  const parametres = await searchParams;
  // L'annuaire n'a pas de date utile : la recherche seule, et le métier.
  const { q } = lireFiltresListe(parametres);
  const metier = typeof parametres.metier === "string" ? parametres.metier : "";
  // Suivi : tous, locaux, ou internationaux.
  const origine = parametres.origine === "local" || parametres.origine === "international" ? parametres.origine : null;
  const [tous, gerer, pays] = await Promise.all([listerPrestataires(session.organizationId), peut("prestataires.gerer"), paysEntreprise(session.organizationId)]);
  const internationaux = tous.filter((p) => origineDe(p.paysCode, pays) === "international").length;

  const metiers = [...new Set(tous.flatMap((p) => p.metiers))].sort((a, b) => a.localeCompare(b, "fr"));
  const visibles = tous
    .filter((p) => !metier || p.metiers.includes(metier))
    .filter((p) => origine === null || origineDe(p.paysCode, pays) === origine)
    .filter((p) => correspond(q, [p.nom, p.zone, p.specialites, p.ville, p.telephone, LIBELLE_NATURE_TIERS[p.nature], nomPays(p.paysCode ?? pays), ...p.metiers]))
    .sort((a, b) => Number(b.disponible) - Number(a.disponible) || (b.note ?? 0) - (a.note ?? 0) || a.nom.localeCompare(b.nom, "fr"));

  return (
    <>
      <EnTetePage
        titre="Prestataires"
        sousTitre={`${tous.length} prestataire${tous.length > 1 ? "s" : ""} — plombiers, électriciens, photographes, monteurs vidéo…`}
        actions={gerer ? <FormulaireInscription paysEntreprise={pays} /> : undefined}
      />

      {tous.length === 0 ? (
        <EtatVide
          titre="Aucun prestataire"
          message="Inscrivez les indépendants à qui vous confiez des travaux ou des services : leur métier, leur zone, leur tarif. Chaque prestation notée enrichit l'annuaire. À ne pas confondre avec l'intervenant, pointé et payé à la journée."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([[null, "Tous", tous.length], ["local", "Locaux", tous.length - internationaux], ["international", "Internationaux", internationaux]] as const).map(([valeur, libelle, n]) => (
              <Link
                key={libelle}
                href={`/prestataires${valeur ? `?origine=${valeur}` : ""}`}
                aria-current={origine === valeur ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${origine === valeur ? "border-marque-600 bg-marque-600 text-white" : "border-[var(--filet)] bg-[var(--surface)] hover:bg-[var(--surface-creuse)]"}`}
              >
                {libelle} <span className="chiffres opacity-80">{n}</span>
              </Link>
            ))}
          </div>
          <Recherche
            chemin={`/prestataires${origine ? `?origine=${origine}` : ""}`}
            valeur={q}
            placeholder="Nom, métier, type, pays, zone, téléphone…"
            resultats={q || metier ? `${fmtEntier(visibles.length)} sur ${fmtEntier(tous.length)}` : undefined}
            filtres={
              <select name="metier" defaultValue={metier} aria-label="Métier" className={CLASSE_CHAMP_COMPACT}>
                <option value="">Tous les métiers</option>
                {metiers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            }
          />

          {visibles.length === 0 ? (
            <EtatVide titre="Aucun prestataire ne répond" message="Changez de métier ou retirez un mot de la recherche." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((p) => (
                <li key={p.id}>
                  <Link href={`/prestataires/${p.id}`} className="block h-full rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 hover:border-marque-400">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{p.nom}</p>
                      {!p.disponible && <Pastille ton="neutre">Indisponible</Pastille>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Pastille ton="marque">{LIBELLE_NATURE_TIERS[p.nature]}</Pastille>
                      <Pastille ton={origineDe(p.paysCode, pays) === "local" ? "valide" : "alerte"}>{origineDe(p.paysCode, pays) === "local" ? "Local" : `International · ${nomPays(p.paysCode)}`}</Pastille>
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--encre-douce)]">{p.metiers.join(" · ")}</p>
                    <div className="mt-2">
                      <Etoiles dixiemes={p.note} />
                      {p.avis > 0 && <span className="ml-1 text-xs text-[var(--encre-faible)]">({p.avis} avis)</span>}
                    </div>
                    <p className="mt-2 text-xs text-[var(--encre-faible)]">
                      {[p.zone ?? p.ville, p.telephone, p.tarif !== null && p.uniteTarif ? `${fmt(p.tarif)} F ${UNITES_TARIF[p.uniteTarif as UniteTarif]}` : null, p.formel ? "déclaré" : "informel"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {p.realisees > 0 && (
                      <p className="mt-1 text-xs text-[var(--encre-faible)]">
                        {p.realisees} prestation{p.realisees > 1 ? "s" : ""} réalisée{p.realisees > 1 ? "s" : ""} · {fmt(p.totalPaye)} F payés
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
