import type { Metadata } from "next";
import Link from "next/link";

import { CoqueAcces } from "@/components/coque/coque-acces";

import { FormulaireConnexion } from "./formulaire";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({ searchParams }: PageProps<"/connexion">) {
  const { reinitialise, suite, expiree } = await searchParams;
  return (
    // Écrit pour un commerçant, pas pour un développeur.
    <CoqueAcces titre="Connexion" sousTitre="Connectez-vous pour reprendre votre activité.">
      {expiree === "1" && reinitialise !== "1" && (
        <p role="status" className="mb-4 rounded-lg bg-[var(--surface-creuse)] px-3 py-2.5 text-sm font-medium">
          Votre session a pris fin. Reconnectez-vous.
        </p>
      )}

      {reinitialise === "1" && (
        <p role="status" className="mb-4 rounded-lg bg-valide-50 px-3 py-2.5 text-sm font-medium text-valide-600">
          Mot de passe changé. Connectez-vous avec le nouveau.
        </p>
      )}

      <FormulaireConnexion suite={typeof suite === "string" ? suite : undefined} />

      <p className="mt-6 text-center text-sm lg:text-left">
        <Link
          href="/mot-de-passe-oublie"
          className="font-medium text-[var(--encre-douce)] underline-offset-4 hover:text-[var(--encre)] hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </p>
      <p className="mt-8 border-t border-[var(--filet)] pt-5 text-center text-sm text-[var(--encre-douce)] lg:text-left">
        Pas encore de compte ? Demandez une invitation à l&apos;administrateur.
      </p>
    </CoqueAcces>
  );
}
