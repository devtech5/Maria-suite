import type { Metadata } from "next";
import Link from "next/link";

import { EnTetePage, EtatVide, Tableau, Td, Th } from "@/components/ui/primitives";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { fmtDateIso } from "@/lib/format";
import { lignesDe } from "@/modules/documents/courriers-calcul";
import { listerCourriers } from "@/modules/documents/courriers";

export const metadata: Metadata = { title: "Courriers" };

const BOUTON = "h-cible inline-flex items-center rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700";

/**
 * Courriers officiels, rédigés sur le papier à en-tête de l'entreprise.
 *
 * Chaque courrier reçoit son numéro à l'enregistrement (COUR-2026-00012) :
 * c'est la référence qu'on rappelle au téléphone et qu'un correspondant cite
 * dans sa réponse.
 */
export default async function PageCourriers() {
  const session = await exigerEntreprise();
  const [liste, peutRediger] = await Promise.all([listerCourriers(session.organizationId), peut("documents.courrier.rediger")]);

  const nouveau = peutRediger ? (
    <Link href="/documents/courriers/nouveau" className={BOUTON}>
      Rédiger un courrier
    </Link>
  ) : null;

  return (
    <>
      <EnTetePage titre="Courriers" sousTitre="Lettres officielles sur le papier à en-tête" actions={nouveau} />

      {liste.length === 0 ? (
        <EtatVide
          titre="Aucun courrier"
          message="Un courrier se rédige ici et s'imprime sur le papier à en-tête : logo, coordonnées, devise et mentions légales viennent de la fiche entreprise."
          actions={nouveau}
        />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <Th>Numéro</Th>
              <Th>Date</Th>
              <Th>Objet</Th>
              <Th>Destinataire</Th>
              <Th>Signataire</Th>
            </tr>
          </thead>
          <tbody>
            {liste.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--surface-creuse)]">
                <Td chiffres>
                  <Link href={`/documents/courriers/${c.id}`} className="font-semibold text-marque-700 hover:underline">
                    {c.numero}
                  </Link>
                </Td>
                <Td chiffres>{fmtDateIso(c.dateCourrier)}</Td>
                <Td>{c.objet}</Td>
                <Td>{lignesDe(c.destinataire)[0] ?? "—"}</Td>
                <Td>{c.signataire}</Td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
    </>
  );
}
