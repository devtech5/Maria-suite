import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage, EtatVide, Pastille, Tableau, Td, Th } from "@/components/ui/primitives";
import { accesCalculs } from "@/modules/calculs/acces";
import { listerNotes } from "@/modules/calculs/donnees";
import { TYPES_NOTE } from "@/modules/calculs/notes";

export const metadata: Metadata = { title: "Notes de calcul" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PageNotes({ searchParams }: PageProps<"/calculs/notes">) {
  const { session } = await accesCalculs();
  const { projet } = await searchParams;
  const projetId = typeof projet === "string" && UUID.test(projet) ? projet : null;
  const notes = await listerNotes(session.organizationId, projetId);
  return (
    <>
      <EnTetePage
        titre="Notes de calcul"
        sousTitre={projetId && notes[0] ? `Projet ${notes[0].projetCode} — ${notes[0].projetNom}` : "Les calculs enregistrés sur les projets, numérotés et figés"}
      />
      {notes.length === 0 ? (
        <EtatVide titre="Aucune note" message="Faites un calcul, puis « Enregistrer sur un projet » sous le résultat." />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Numéro</Th>
              <Th>Date</Th>
              <Th>Projet</Th>
              <Th>Calcul</Th>
              <Th>Libellé</Th>
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <Td>
                  <Link href={`/calculs/notes/${n.id}`} className="font-medium text-marque-600 hover:underline">
                    {n.numero}
                  </Link>
                  {n.annulee && (
                    <span className="ml-2">
                      <Pastille ton="danger">Annulée</Pastille>
                    </span>
                  )}
                </Td>
                <Td>{n.creeLe.toLocaleDateString("fr-FR", { timeZone: "Africa/Abidjan" })}</Td>
                <Td>
                  <Link href={`/calculs/notes?projet=${n.projetId}`} className="hover:underline">
                    {n.projetCode}
                  </Link>
                </Td>
                <Td>{TYPES_NOTE[n.type]}</Td>
                <Td>{n.libelle}</Td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
