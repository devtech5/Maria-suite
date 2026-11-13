"use client";

import { useActionState, useState } from "react";

import { CourrierDocument, type ContenuCourrier } from "@/components/impression/courrier-document";
import { ApercuA4 } from "@/components/impression/feuille-a4";
import { Champ, CLASSE_CHAMP, CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import type { IdentiteEntreprise } from "@/lib/identite";
import { enregistrerCourrier, type EtatCourrier } from "@/modules/documents/actions-courriers";
import {
  estPoliceCourrier,
  LONGUEUR_MAX_CORPS,
  LONGUEUR_MAX_OBJET,
  POLICE_PAR_DEFAUT,
  POLICES_COURRIER,
  TAILLE_MAX,
  TAILLE_MIN,
  TAILLE_PAR_DEFAUT,
  tailleLisible,
  tailleVoisine,
  type PoliceCourrier,
} from "@/modules/documents/courriers-calcul";

const CLASSE_ZONE =
  "w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-marque-500";

/**
 * Rédaction d'un courrier, avec la feuille telle qu'elle s'imprimera à côté.
 *
 * Le corps se tape comme dans un e-mail : une ligne, un paragraphe. Pas de
 * gras, pas de balises — la mise en page vient du papier à en-tête, et un
 * texte brut ne peut rien injecter dans la page qui l'imprime.
 *
 * Police et taille se règlent pour toute la lettre, au-dessus du corps :
 * l'aperçu suit à chaque clic. Changer de police propose sa taille conseillée,
 * sauf si la taille avait déjà été réglée à la main.
 */
export function FormulaireCourrier({
  id,
  initial,
  identite,
}: {
  /** Absent pour un nouveau courrier. */
  id?: string;
  initial: ContenuCourrier;
  identite: IdentiteEntreprise;
}) {
  const [contenu, setContenu] = useState<ContenuCourrier>(initial);
  const [etat, action, enCours] = useActionState<EtatCourrier, FormData>(enregistrerCourrier, {});
  const police: PoliceCourrier = estPoliceCourrier(contenu.police) ? contenu.police : POLICE_PAR_DEFAUT;
  const taille = contenu.taillePolice ?? TAILLE_PAR_DEFAUT;

  function changerPolice(suivante: PoliceCourrier) {
    setContenu((c) => {
      const avant = estPoliceCourrier(c.police) ? c.police : POLICE_PAR_DEFAUT;
      const tailleAvant = c.taillePolice ?? TAILLE_PAR_DEFAUT;
      const reglageParDefaut = tailleAvant === POLICES_COURRIER[avant].tailleConseillee;
      return {
        ...c,
        police: suivante,
        taillePolice: reglageParDefaut ? POLICES_COURRIER[suivante].tailleConseillee : tailleAvant,
      };
    });
  }

  const changerTaille = (centiemes: number) => setContenu((c) => ({ ...c, taillePolice: centiemes }));
  // Les tailles du menu : le demi-point de 7 à 14 pt, plus la taille actuelle si elle est hors grille (8,65 pt).
  const tailles = Array.from({ length: (TAILLE_MAX - TAILLE_MIN) / 50 + 1 }, (_, i) => TAILLE_MIN + i * 50);
  if (!tailles.includes(taille)) tailles.push(taille);
  tailles.sort((a, b) => a - b);

  function champ<K extends keyof ContenuCourrier>(cle: K) {
    return {
      name: cle,
      value: (contenu[cle] ?? "") as string,
      onChange: (e: { target: { value: string } }) => setContenu((c) => ({ ...c, [cle]: e.target.value })),
    };
  }

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <form action={action} className="space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4 print:hidden">
        {id && <input type="hidden" name="id" value={id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Lieu">
            <input {...champ("lieu")} required maxLength={80} className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Date">
            <input {...champ("dateCourrier")} type="date" required className={CLASSE_CHAMP} />
          </Champ>
        </div>

        <Champ libelle="Destinataire" precision="Facultatif. Une ligne par ligne d'adresse ; la première s'imprime en gras.">
          <textarea
            {...champ("destinataire")}
            rows={3}
            maxLength={600}
            placeholder={"Monsieur le Directeur Général\nSociété …\nAbidjan, Plateau"}
            className={CLASSE_ZONE}
          />
        </Champ>

        <Champ libelle="Objet">
          <input {...champ("objet")} required maxLength={LONGUEUR_MAX_OBJET} placeholder="Demande de partenariat" className={CLASSE_CHAMP} />
        </Champ>

        <fieldset className="rounded-lg border border-[var(--filet)] bg-[var(--surface-creuse)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--encre-faible)]">Mise en forme du texte</legend>
          <input type="hidden" name="police" value={police} />
          <input type="hidden" name="taillePolice" value={taille} />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={police}
              onChange={(e) => estPoliceCourrier(e.target.value) && changerPolice(e.target.value)}
              aria-label="Police"
              className={`${CLASSE_CHAMP} min-w-0 flex-1`}
              style={{ fontFamily: POLICES_COURRIER[police].pile ?? undefined }}
            >
              {(Object.keys(POLICES_COURRIER) as PoliceCourrier[]).map((p) => (
                <option key={p} value={p} style={{ fontFamily: POLICES_COURRIER[p].pile ?? undefined }}>
                  {POLICES_COURRIER[p].libelle}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1" role="group" aria-label="Réglage de la taille">
              <button
                type="button"
                onClick={() => changerTaille(tailleVoisine(taille, -1))}
                disabled={taille <= TAILLE_MIN}
                title="Réduire le texte d'un demi-point"
                aria-label="Réduire la taille du texte"
                className="h-cible w-10 rounded-lg border border-[var(--filet)] bg-[var(--surface)] text-xs font-bold hover:bg-[var(--surface-creuse)] disabled:opacity-40"
              >
                A−
              </button>
              <select
                value={taille}
                onChange={(e) => changerTaille(Number(e.target.value))}
                aria-label="Taille du texte"
                className={`${CLASSE_CHAMP_COMPACT} chiffres w-[6.5rem]`}
              >
                {tailles.map((t) => (
                  <option key={t} value={t}>
                    {tailleLisible(t)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => changerTaille(tailleVoisine(taille, 1))}
                disabled={taille >= TAILLE_MAX}
                title="Agrandir le texte d'un demi-point"
                aria-label="Agrandir la taille du texte"
                className="h-cible w-10 rounded-lg border border-[var(--filet)] bg-[var(--surface)] text-base font-bold hover:bg-[var(--surface-creuse)] disabled:opacity-40"
              >
                A+
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--encre-faible)]">
            S&apos;applique à toute la lettre. L&apos;en-tête et le pied de page gardent la police de la charte.
            {taille !== POLICES_COURRIER[police].tailleConseillee && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => changerTaille(POLICES_COURRIER[police].tailleConseillee)}
                  className="font-semibold text-marque-600 hover:underline"
                >
                  Taille conseillée : {tailleLisible(POLICES_COURRIER[police].tailleConseillee)}
                </button>
              </>
            )}
          </p>
        </fieldset>

        <Champ libelle="Corps du courrier" precision="Une ligne, un paragraphe. Texte simple : ni gras, ni lien, ni balise.">
          <textarea
            {...champ("corps")}
            required
            rows={14}
            maxLength={LONGUEUR_MAX_CORPS}
            placeholder={
              "Madame, Monsieur,\nNous avons l'honneur de …\nVeuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées."
            }
            className={CLASSE_ZONE}
          />
        </Champ>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Signataire">
            <input {...champ("signataire")} required maxLength={120} placeholder="Prénom Nom" className={CLASSE_CHAMP} />
          </Champ>
          <Champ libelle="Fonction">
            <input {...champ("fonction")} maxLength={120} placeholder="Directeur Général" className={CLASSE_CHAMP} />
          </Champ>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={enCours}
            className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-60"
          >
            {enCours ? "Enregistrement…" : id ? "Enregistrer les corrections" : "Enregistrer et numéroter"}
          </button>
          {etat.erreur && <p className="text-sm text-danger-600">{etat.erreur}</p>}
          {etat.message && !etat.erreur && <p className="text-sm text-valide-600">{etat.message}</p>}
        </div>
      </form>

      <section aria-label="Aperçu de la feuille">
        <ApercuA4>
          <CourrierDocument courrier={contenu} identite={identite} />
        </ApercuA4>
      </section>
    </div>
  );
}
