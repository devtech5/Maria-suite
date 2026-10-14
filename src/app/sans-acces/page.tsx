import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CoqueAcces } from "@/components/coque/coque-acces";
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
    <CoqueAcces titre="Accès non ouvert" sousTitre="Votre compte n'a pas d'accès ouvert.">
      <p className="text-center text-sm text-[var(--encre-douce)] lg:text-left">
        Demandez à l&apos;administrateur de MARIA GROUP SARL de vous rattacher
        à l&apos;entreprise et de vous attribuer un rôle.
      </p>
      <form action={seDeconnecter} className="mt-6 text-center lg:text-left">
        <button type="submit" className="text-sm font-semibold text-marque-600 underline-offset-4 hover:underline">
          Se déconnecter
        </button>
      </form>
    </CoqueAcces>
  );
}
