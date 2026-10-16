"use client";

import { useActionState, useState } from "react";

import { CourrierDocument, type ContenuCourrier } from "@/components/impression/courrier-document";
import { ApercuA4 } from "@/components/impression/feuille-a4";
import { Champ, CLASSE_CHAMP } from "@/components/ui/primitives";
import type { IdentiteEntreprise } from "@/lib/identite";
import { enregistrerCourrier, type EtatCourrier } from "@/modules/documents/actions-courriers";
import { LONGUEUR_MAX_CORPS, LONGUEUR_MAX_OBJET } from "@/modules/documents/courriers-calcul";

const CLASSE_ZONE =
  "w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-marque-500";

/**
 * Rédaction d'un courrier, avec la feuille telle qu'elle s'imprimera à côté.
 *
 * Le corps se tape comme dans un e-mail : une ligne, un paragraphe. Pas de
 * gras, pas de balises — la mise en page vient du papier à en-tête, et un
 * texte brut ne peut rien injecter dans la page qui l'imprime.
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
