import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { exigerSession } from "@/lib/auth/dal";
import { seDeconnecter } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Accès non ouvert" };

/**
 * Où retombe un compte qui n'est rattaché à aucune entreprise : accès révoqué,
 * ou invitation pas encore acceptée.
 *
 * Maria Suite ne sert qu'une entreprise. Il n'y en a pas d'autre à choisir ni
 * à créer : seul l'administrateur peut rouvrir l'accès.
 */
export default async function PageSansAcces() {
  const active = await exigerSession();
  if (active.organizationId) redirect("/accueil");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--fond)] p-4">
      <div className="w-full max-w-sm">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Maria Suite</h1>
        </header>

        <div className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-5 text-sm">
          <p className="font-medium">Votre compte n&apos;a pas d&apos;accès ouvert.</p>
          <p className="mt-2 text-[var(--encre-douce)]">
            Demandez à l&apos;administrateur de MARIA GROUP SARL de vous rattacher
            à l&apos;entreprise et de vous attribuer un rôle.
          </p>
          <form action={seDeconnecter} className="mt-4">
            <button type="submit" className="font-semibold text-marque-600 hover:underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
