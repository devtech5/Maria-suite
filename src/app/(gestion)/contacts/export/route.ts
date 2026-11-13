import * as XLSX from "xlsx";

import { tracer } from "@/lib/audit";
import { moduleOuvert } from "@/lib/modules/garde";
import { accesContacts } from "@/modules/contacts/acces";
import { filtrerAnnuaire, tableauAdresses, tableauAnnuaire } from "@/modules/contacts/regles";
import { adressesDe, annuaireDe } from "@/modules/contacts/requetes";

/**
 * Export de l'annuaire en classeur Excel (.xlsx), avec la recherche et le
 * filtre de l'écran. Mêmes droits que l'écran : les colonnes personnelles et
 * l'onglet des adresses ne sortent que pour qui tient l'annuaire. L'export
 * se trace : sortir des coordonnées du personnel est un geste.
 */
export async function GET(requete: Request) {
  if (!moduleOuvert("contacts")) return new Response("Module fermé.", { status: 404 });
  const a = await accesContacts();
  if (!a.consulter) return new Response("Accès refusé.", { status: 403 });

  const params = new URL(requete.url).searchParams;
  const q = params.get("q") ?? "";
  const service = params.get("service") ?? "";
  const org = a.session.organizationId;
  const lignes = filtrerAnnuaire(await annuaireDe(org, a.gerer), { q, service });

  const classeur = XLSX.utils.book_new();
  const personnel = XLSX.utils.aoa_to_sheet(tableauAnnuaire(lignes, a.gerer));
  personnel["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 28 }, { wch: 36 }, { wch: 40 }, { wch: 30 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(classeur, personnel, "Personnel");
  if (a.gerer) {
    const adresses = XLSX.utils.aoa_to_sheet(tableauAdresses(await adressesDe(org)));
    adresses["!cols"] = [{ wch: 36 }, { wch: 30 }, { wch: 30 }, { wch: 28 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(classeur, adresses, "Adresses e-mail");
  }
  const octets = XLSX.write(classeur, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await tracer({ action: "contacts.exporter", entite: "annuaire", apres: { lignes: lignes.length, q: q || undefined, service: service || undefined, personnels: a.gerer } });

  const jour = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(octets), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="annuaire-${jour}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
