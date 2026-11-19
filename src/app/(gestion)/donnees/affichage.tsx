import Link from "next/link";

import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import { estMontant, libelle, type ColonneDecrite } from "@/modules/donnees/regles";
import type { Valeur } from "@/modules/donnees/requetes";

/**
 * Affichage des valeurs de la console : une date se lit en JJ/MM/AAAA, un
 * montant avec ses séparateurs, une clé étrangère mène à la ligne qu'elle
 * désigne.
 */

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const MOMENT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** Une valeur en texte, raccourcie au besoin pour une liste. */
export function texteValeur(c: ColonneDecrite, v: Valeur, longueurMax?: number): string {
  if (v === null) return "—";
  let texte: string;
  if (c.genre === "booleen") texte = v ? "Oui" : "Non";
  else if (c.genre === "entier" && typeof v === "number") texte = estMontant(c.nom) ? fmt(v) : String(v);
  else if (c.genre === "date" && typeof v === "string") texte = JOUR.format(new Date(`${v}T00:00:00Z`));
  else if (c.genre === "horodatage" && typeof v === "string") texte = MOMENT.format(new Date(v));
  else if (typeof v === "object") texte = JSON.stringify(v);
  else texte = String(v);
  return longueurMax && texte.length > longueurMax ? `${texte.slice(0, longueurMax - 1)}…` : texte;
}

/** La valeur d'un champ, et le lien vers la ligne visée quand c'est une clé étrangère connue. */
export function ValeurAffichee({ colonne, valeur, tablesConnues }: { colonne: ColonneDecrite; valeur: Valeur; tablesConnues: ReadonlySet<string> }) {
  if (valeur !== null && colonne.reference && tablesConnues.has(colonne.reference)) {
    return (
      <Link href={`/donnees/${colonne.reference}/${encodeURIComponent(String(valeur))}`} className="chiffres text-marque-600 hover:underline">
        {String(valeur)}
      </Link>
    );
  }
  if (colonne.genre === "json" || colonne.genre === "liste") {
    return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--surface-creuse)] p-2 text-xs">{valeur === null ? "—" : JSON.stringify(valeur, null, 2)}</pre>;
  }
  return <span className={`${colonne.genre === "entier" || colonne.genre === "uuid" ? "chiffres" : ""} whitespace-pre-wrap break-words`}>{texteValeur(colonne, valeur)}</span>;
}

const LONG = /(motif|notes?|description|texte|contenu|observations?|commentaire|adresse|instructions|resume|message|corps)$/;

/** Le champ de saisie d'une colonne modifiable, prérempli de sa valeur. */
export function ChampColonne({ colonne: c, valeur }: { colonne: ColonneDecrite; valeur: Valeur }) {
  const titre = (
    <span className="mb-1 block text-sm font-medium">
      {libelle(c.nom)}
      {c.obligatoire && c.genre !== "booleen" && <span className="text-[var(--encre-faible)]"> · obligatoire</span>}
    </span>
  );
  if (c.genre === "booleen") {
    return (
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="hidden" name={`present:${c.nom}`} value="1" />
        <input type="checkbox" name={c.nom} defaultChecked={valeur === true} className="h-4 w-4" />
        {libelle(c.nom)}
      </label>
    );
  }
  if (c.genre === "choix") {
    return (
      <label className="block">
        {titre}
        <select name={c.nom} defaultValue={valeur === null ? "" : String(valeur)} className={CLASSE_CHAMP}>
          {(!c.obligatoire || valeur === null) && <option value="">—</option>}
          {(c.choix ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (c.genre === "json") {
    return (
      <label className="block sm:col-span-2">
        {titre}
        <textarea name={c.nom} rows={6} defaultValue={valeur === null ? "" : JSON.stringify(valeur, null, 2)} className={`${CLASSE_CHAMP} h-auto py-2 font-mono text-xs`} />
      </label>
    );
  }
  const texte = valeur === null ? "" : String(valeur);
  if (c.genre === "texte" && (LONG.test(c.nom) || texte.length > 80)) {
    return (
      <label className="block sm:col-span-2">
        {titre}
        <textarea name={c.nom} rows={4} defaultValue={texte} className={`${CLASSE_CHAMP} h-auto py-2`} />
      </label>
    );
  }
  return (
    <label className="block">
      {titre}
      <input
        name={c.nom}
        type={c.genre === "date" ? "date" : "text"}
        inputMode={c.genre === "entier" ? "numeric" : undefined}
        defaultValue={texte}
        className={`${CLASSE_CHAMP} ${c.genre === "entier" ? "chiffres" : ""}`}
      />
    </label>
  );
}
