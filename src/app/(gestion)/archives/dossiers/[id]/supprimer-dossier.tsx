"use client";

import { useRouter } from "next/navigation";

import { confirmer } from "@/components/ui/dialogues";
import { Retour, useOperation } from "@/components/ui/operations";
import { supprimerDossier } from "@/modules/archives/actions";

/** Suppression d'un dossier vide. Un dossier qui contient des archives se masque, il ne se supprime pas. */
export function SupprimerDossier({ dossierId, nom }: { dossierId: string; nom: string }) {
  const op = useOperation();
  const routeur = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={op.enCours}
        onClick={async () => {
          if (!(await confirmer(`Supprimer le dossier « ${nom} » ?`))) return;
          op.lancer(() => supprimerDossier(dossierId), () => routeur.push("/archives/dossiers"));
        }}
        className="h-cible rounded-lg px-3.5 text-sm font-semibold text-danger-600 hover:bg-danger-50 disabled:opacity-50"
      >
        Supprimer le dossier
      </button>
      {op.resultat && !op.resultat.ok && <Retour resultat={op.resultat} />}
    </div>
  );
}
