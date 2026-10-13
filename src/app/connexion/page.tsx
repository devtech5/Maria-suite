import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireConnexion } from "./formulaire";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({ searchParams }: PageProps<"/connexion">) {
  const { reinitialise, suite, expiree } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--fond)] p-4">
      <div className="w-full max-w-sm">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Maria Suite</h1>
          {/* Écrit pour un commerçant, pas pour un développeur. */}
          <p className="mt-1 text-sm text-[var(--encre-douce)]">
            Connectez-vous pour reprendre votre activité.
          </p>
        </header>

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

        <div className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5">
          <FormulaireConnexion suite={typeof suite === "string" ? suite : undefined} />
        </div>

        <p className="mt-4 text-center text-sm text-[var(--encre-douce)]">
          Pas encore de compte ? Demandez une invitation à l&apos;administrateur.
        </p>
        <p className="mt-2 text-center text-sm">
          <Link href="/mot-de-passe-oublie" className="text-[var(--encre-douce)] hover:underline">
            Mot de passe oublié ?
          </Link>
        </p>
      </div>
    </main>
  );
}
