import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CoqueAcces } from "@/components/coque/coque-acces";
import { session } from "@/lib/auth/dal";
import { CONNEXION_EXPIREE } from "@/lib/auth/session";

import { FormulaireMotDePasse } from "./formulaire";

export const metadata: Metadata = { title: "Mot de passe" };

/**
 * Changement de mot de passe.
 *
 * Hors de la coque de gestion, à dessein : c'est le seul écran qu'ouvre un
 * compte au mot de passe provisoire, et `exigerSession` y renverrait sans fin.
 * La session se lit donc directement ici.
 */
export default async function PageMotDePasse() {
  const active = await session();
  if (!active) redirect(CONNEXION_EXPIREE);

  const provisoire = active.doitChangerMotDePasse;

  return (
    <CoqueAcces
      titre={provisoire ? "Choisissez votre mot de passe" : "Changer de mot de passe"}
      sousTitre={
        provisoire
          ? "Le mot de passe qu'on vous a remis est provisoire : celui qui vous l'a donné le connaît. Remplacez-le pour continuer."
          : "Les autres appareils connectés à votre compte seront déconnectés."
      }
    >
      <FormulaireMotDePasse provisoire={provisoire} />

      {!provisoire && (
        <p className="mt-6 text-center text-sm lg:text-left">
          <Link href="/" className="font-semibold text-marque-600 underline-offset-4 hover:underline">
            Retour à l&apos;accueil
          </Link>
        </p>
      )}
    </CoqueAcces>
  );
}
