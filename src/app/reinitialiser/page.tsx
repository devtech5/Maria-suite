import type { Metadata } from "next";
import Link from "next/link";

import { CoqueAcces } from "@/components/coque/coque-acces";
import { jetonValable } from "@/lib/auth/reinitialisation";

import { FormulaireReinitialisation } from "./formulaire";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function PageReinitialiser({ searchParams }: PageProps<"/reinitialiser">) {
  const { jeton } = await searchParams;
  const valable = typeof jeton === "string" && (await jetonValable(jeton));

  return (
    <CoqueAcces
      titre="Nouveau mot de passe"
      sousTitre={valable ? "Choisissez-le : toutes vos sessions ouvertes seront fermées." : "Ce lien a expiré ou a déjà servi."}
    >
      {valable ? (
        <FormulaireReinitialisation jeton={jeton as string} />
      ) : (
        <p className="text-center text-sm lg:text-left">
          <Link href="/mot-de-passe-oublie" className="font-semibold text-marque-600 underline-offset-4 hover:underline">
            Demander un nouveau lien
          </Link>
        </p>
      )}
    </CoqueAcces>
  );
}
