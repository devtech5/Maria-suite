import type { Metadata } from "next";
import Link from "next/link";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { EnTetePage, EtatVide } from "@/components/ui/primitives";
import { Recherche } from "@/components/ui/recherche";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtEntier } from "@/lib/format";
import { correspond, lireFiltresListe } from "@/lib/recherche";
import { NATURES_CONGE, ajouterJours, heureLocale, jourLocal, jourSemaine, type EtatJour } from "@/modules/presences/calcul";
import { reglagesDe } from "@/modules/presences/creation";
import { registre } from "@/modules/presences/requetes";

export const metadata: Metadata = { title: "Registre des présences" };

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

function bornes(mois: string): { debut: string; fin: string } {
  const debut = `${mois}-01`;
  const [a, m] = mois.split("-").map(Number);
  const suivant = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { debut, fin: ajouterJours(suivant, -1) };
}

function decaler(mois: string, n: number): string {
  const [a, m] = mois.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Une case : une lettre et une couleur, la précision en infobulle. */
function Case({ e }: { e: EtatJour }) {
  const base = "flex size-6 items-center justify-center rounded text-[10px] font-bold";
  switch (e.etat) {
    case "present":
      return (
        <span title={`Arrivée ${e.arrivee}, dernière activité ${e.derniere}${e.retard ? ` — retard ${e.retard} min` : ""}`} className={`${base} ${e.retard ? "bg-alerte-50 text-alerte-600" : "bg-valide-50 text-valide-600"}`}>
          {e.retard ? "R" : "P"}
        </span>
      );
    case "conge":
      return (
        <span title={NATURES_CONGE[e.nature].libelle} className={`${base} bg-marque-100 text-marque-700`}>
          C
        </span>
      );
    case "ferie":
      return (
        <span title={e.libelle} className={`${base} bg-[var(--surface-creuse)] text-[var(--encre-faible)]`}>
          F
        </span>
      );
    case "absent":
      return (
        <span title="Ni pointé, ni en congé" className={`${base} bg-danger-50 text-danger-600`}>
          A
        </span>
      );
    case "repos":
      return <span className={`${base} text-[var(--encre-faible)]`}>·</span>;
    default:
      return <span className={base} />;
  }
}

export default async function PageRegistre({ searchParams }: PageProps<"/presences/registre">) {
  if (!(await peut("presences.consulter"))) return <AccesRefuse droit="presences.consulter" />;
  const session = await exigerEntreprise();
  const r = await reglagesDe(session.organizationId);
  const maintenant = new Date();
  const aujourdhui = jourLocal(maintenant, r.fuseau);
  const parametres = await searchParams;
  const { mois: brut } = parametres;
  // Recherche seule : le mois affiché tient lieu de période.
  const filtres = lireFiltresListe(parametres);
  const mois = typeof brut === "string" && MOIS.test(brut) ? brut : aujourdhui.slice(0, 7);
  const { debut, fin } = bornes(mois);
  const { jours, feries, lignes } = await registre(session.organizationId, debut, fin, r, aujourdhui, heureLocale(maintenant, r.fuseau));
  const affichees = lignes.filter((l) => correspond(filtres.q, [l.salarie.nom, l.salarie.matricule, l.salarie.poste]));
  const libelle = new Date(`${debut}T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <EnTetePage
        titre={`Registre — ${libelle}`}
        sousTitre="P présent · R en retard · C congé · F férié · A absent, ni pointé ni en congé"
        actions={
          <div className="flex gap-1">
            <Link href={`/presences/registre?mois=${decaler(mois, -1)}${filtres.q ? `&q=${encodeURIComponent(filtres.q)}` : ""}`} className="h-cible flex items-center rounded-lg border border-[var(--filet)] px-3 text-sm hover:bg-[var(--surface-creuse)]">
              ← Mois précédent
            </Link>
            {mois < aujourdhui.slice(0, 7) && (
              <Link href={`/presences/registre?mois=${decaler(mois, 1)}${filtres.q ? `&q=${encodeURIComponent(filtres.q)}` : ""}`} className="h-cible flex items-center rounded-lg border border-[var(--filet)] px-3 text-sm hover:bg-[var(--surface-creuse)]">
                Mois suivant →
              </Link>
            )}
          </div>
        }
      />
      {lignes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--filet)] bg-[var(--surface)] p-6 text-sm text-[var(--encre-douce)]">Aucun salarié en poste sur ce mois.</p>
      ) : (
        <>
          <Recherche
            chemin={`/presences/registre?mois=${mois}`}
            valeur={filtres.q}
            placeholder="Salarié, matricule, poste…"
            filtres={<input type="hidden" name="mois" value={mois} />}
            resultats={filtres.q ? `${fmtEntier(affichees.length)} sur ${fmtEntier(lignes.length)}` : undefined}
          />
          {affichees.length === 0 ? (
            <EtatVide titre="Aucun résultat" message="Aucun salarié en poste sur ce mois ne répond à cette recherche." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--filet)] bg-[var(--surface)]">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-[var(--surface-creuse)] px-3 py-2 text-left font-semibold">Salarié</th>
                    {jours.map((j) => (
                      <th key={j} title={feries.get(j)} className={`px-0.5 py-2 text-center font-medium ${jourSemaine(j) >= 6 ? "text-[var(--encre-faible)]" : ""} ${j === aujourdhui ? "text-marque-600" : ""}`}>
                        {Number(j.slice(8))}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-semibold">Présent</th>
                    <th className="px-2 py-2 text-right font-semibold">Retards</th>
                    <th className="px-2 py-2 text-right font-semibold">Absent</th>
                    <th className="px-2 py-2 text-right font-semibold">Congé</th>
                  </tr>
                </thead>
                <tbody>
                  {affichees.map((l) => (
                    <tr key={l.salarie.id} className="border-t border-[var(--filet)]">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--surface)] px-3 py-1.5 font-medium">
                        {l.salarie.nom}
                        <span className="block text-[10px] font-normal text-[var(--encre-faible)]">{l.salarie.matricule}</span>
                      </td>
                      {l.jours.map((e, i) => (
                        <td key={jours[i]} className="px-0.5 py-1.5">
                          <Case e={e} />
                        </td>
                      ))}
                      <td className="chiffres px-2 text-right">{l.presents}</td>
                      <td className="chiffres px-2 text-right">{l.retards}</td>
                      <td className="chiffres px-2 text-right">{l.absences}</td>
                      <td className="chiffres px-2 text-right">{l.conges}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
