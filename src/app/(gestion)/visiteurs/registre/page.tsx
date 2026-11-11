import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TON_STATUT } from "@/components/visiteurs/liste-visites";
import { CLASSE_CHAMP_COMPACT, EnTetePage, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { ajouterJours, instantLocal } from "@/modules/presences/calcul";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { LIBELLE_STATUT, STATUTS_VISITE, type StatutVisite } from "@/modules/visiteurs/regles";
import { accueilsDe, journeeDe, visitesDe } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Registre des visiteurs" };

const QUAND = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Le registre : chaque accueil le sien, la supervision tous. Le registre
 * reste quand les photos s'effacent.
 */
export default async function PageRegistre({ searchParams }: PageProps<"/visiteurs/registre">) {
  const acces = await accesVisiteurs();
  if (!acces.accueillir) redirect("/visiteurs/rendez-vous");
  const org = acces.session.organizationId;
  const p = await searchParams;
  const valeur = (c: string) => (typeof p[c] === "string" ? (p[c] as string) : "");
  const [{ jour, fuseau }, accueils] = await Promise.all([journeeDe(org), accueilsDe(org)]);
  const lisibles = accueils.filter((a) => acces.accueilPermis(a.id));
  const du = JOUR.test(valeur("du")) ? valeur("du") : ajouterJours(jour, -6);
  const au = JOUR.test(valeur("au")) ? valeur("au") : jour;
  const accueil = lisibles.find((a) => a.id === valeur("accueil"));
  const statut = (STATUTS_VISITE as readonly string[]).includes(valeur("statut")) ? (valeur("statut") as StatutVisite) : null;

  const lignes = await visitesDe(org, {
    accueilIds: accueil ? [accueil.id] : acces.permis,
    statuts: statut ? [statut] : undefined,
    du: instantLocal(du, "00:00", fuseau),
    au: instantLocal(ajouterJours(au, 1), "00:00", fuseau),
    recherche: valeur("q"),
    limite: 1000,
  });

  return (
    <>
      <EnTetePage titre="Registre des visiteurs" sousTitre={`${lignes.length} visite${lignes.length > 1 ? "s" : ""}${lignes.length === 1000 ? " (les 1 000 plus récentes)" : ""}`} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={valeur("q")} placeholder="Nom, numéro, société, pièce…" className={`${CLASSE_CHAMP_COMPACT} min-w-56 flex-1`} />
        {lisibles.length > 1 && (
          <select name="accueil" defaultValue={accueil?.id ?? ""} className={CLASSE_CHAMP_COMPACT}>
            <option value="">Tous mes accueils</option>
            {lisibles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom}
              </option>
            ))}
          </select>
        )}
        <select name="statut" defaultValue={statut ?? ""} className={CLASSE_CHAMP_COMPACT}>
          <option value="">Tous les statuts</option>
          {STATUTS_VISITE.map((s) => (
            <option key={s} value={s}>
              {LIBELLE_STATUT[s]}
            </option>
          ))}
        </select>
        <input type="date" name="du" defaultValue={du} aria-label="Du" className={CLASSE_CHAMP_COMPACT} />
        <input type="date" name="au" defaultValue={au} aria-label="Au" className={CLASSE_CHAMP_COMPACT} />
        <button type="submit" className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-semibold hover:bg-[var(--surface-creuse)]">
          Rechercher
        </button>
      </form>
      <Tableau>
        <thead>
          <tr>
            <Th>N°</Th>
            <Th>Visiteur</Th>
            <Th>Motif · pour</Th>
            <Th>Accueil</Th>
            <Th>Arrivée</Th>
            <Th>Sortie</Th>
            <Th>Statut</Th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((v) => (
            <tr key={v.id}>
              <Td chiffres>
                <Link href={`/visiteurs/${v.id}`} className="text-marque-600 hover:underline">
                  {v.numero}
                </Link>
              </Td>
              <Td fort>
                {v.nom}
                {v.societe && <span className="block text-xs font-normal text-[var(--encre-faible)]">{v.societe}</span>}
              </Td>
              <Td>
                {v.motif}
                {(v.visiteNom || v.visiteLibelle) && <span className="block text-xs text-[var(--encre-faible)]">pour {v.visiteNom ?? v.visiteLibelle}</span>}
              </Td>
              <Td>{v.accueil}</Td>
              <Td chiffres>{v.arriveeLe ? QUAND.format(v.arriveeLe) : v.attenduLe ? `attendu ${QUAND.format(v.attenduLe)}` : "—"}</Td>
              <Td chiffres>{v.sortieLe ? QUAND.format(v.sortieLe) : "—"}</Td>
              <Td>
                <Pastille ton={TON_STATUT[v.statut]}>{LIBELLE_STATUT[v.statut]}</Pastille>
              </Td>
            </tr>
          ))}
        </tbody>
      </Tableau>
    </>
  );
}
