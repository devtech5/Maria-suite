import type { Metadata } from "next";
import Link from "next/link";

import { CoqueAcces } from "@/components/coque/coque-acces";

import { FormulaireDemande } from "./formulaire";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function PageMotDePasseOublie() {
  return (
    <CoqueAcces
      titre="Mot de passe oublié"
      sousTitre="Indiquez l'adresse de votre compte : vous recevrez un lien pour en choisir un nouveau."
    >
      <FormulaireDemande />

      <p className="mt-6 text-center text-sm lg:text-left">
        <Link href="/connexion" className="font-semibold text-marque-600 underline-offset-4 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </CoqueAcces>
  );
}
