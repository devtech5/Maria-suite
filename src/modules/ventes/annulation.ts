import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { contrepasser, type Ecriture } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import type { Transaction } from "@/lib/sequences";
import { ecritures, lignesEcriture } from "@/modules/comptabilite/schema";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { enregistrerMouvementDans } from "@/modules/stock/creation";
import { mouvementsStock } from "@/modules/stock/schema";
import { ventes } from "./schema";

export interface ResultatAnnulation {
  id: string;
  numero: string;
  /** Numéro de l'avoir, qui porte aussi la contrepassation et le retour en stock. */
  avoir: string;
  total: number;
  /** Numéro de l'écriture de contrepassation, s'il y en avait une à contrepasser. */
  ecriture?: string;
}

/**
 * Annule un ticket encaissé et pose son avoir.
 *
 * Le passage de `encaissee` à `annulee` est un `UPDATE ... RETURNING` : deux
 * annulations simultanées ne passent pas toutes les deux, la seconde ne trouve
 * plus de ligne encaissée. Sans cela, le stock reviendrait deux fois.
 *
 * Rend `null` quand le ticket n'existe pas, n'appartient pas à l'entreprise ou
 * est déjà annulé : rien n'a été écrit.
 *
 * Tout tient dans la transaction de l'appelant. Un stock repris sans écriture
 * contrepassée, ou l'inverse, se découvrirait à l'inventaire ou à la
 * déclaration de TVA, quand plus personne ne sait d'où vient l'écart.
 */
export async function annulerVenteDans(
  tx: Transaction,
  organizationId: string,
  venteId: string,
  motif: string,
  userId: string,
): Promise<ResultatAnnulation | null> {
  const [annulee] = await tx
    .update(ventes)
    .set({
      statut: "annulee",
      motifAnnulation: motif,
      updatedAt: new Date(),
      version: sql`${ventes.version} + 1`,
    })
    .where(
      and(
        isNull(ventes.deletedAt),
        eq(ventes.id, venteId),
        eq(ventes.organizationId, organizationId),
        eq(ventes.statut, "encaissee"),
      ),
    )
    .returning({
      id: ventes.id,
      numero: ventes.numero,
      total: ventes.totalTtc,
      depotId: ventes.depotId,
    });

  if (!annulee) return null;

  const avoir = `AVO-${annulee.numero}`;
  const maintenant = new Date();

  // ------------------------------------------------------------------ stock
  // Chaque sortie du ticket revient à son coût d'origine : reprendre au coût
  // moyen du jour fausserait la valeur du stock de la différence.
  const sorties = await tx
    .select()
    .from(mouvementsStock)
    .where(
      and(
        eq(mouvementsStock.organizationId, organizationId),
        eq(mouvementsStock.origineType, "vente"),
        eq(mouvementsStock.origineId, venteId),
        isNull(mouvementsStock.deletedAt),
      ),
    );

  for (const sortie of sorties) {
    await enregistrerMouvementDans(
      tx,
      organizationId,
      {
        depotId: sortie.depotId,
        articleId: sortie.articleId,
        type: "retour",
        quantite: -sortie.quantite,
        coutUnitaire: sortie.coutUnitaire,
        piece: avoir,
        origineType: "avoir",
        origineId: venteId,
        motif: `Annulation du ticket ${annulee.numero} : ${motif}`,
        effectueLe: maintenant,
      },
      userId,
    );
  }

  // ----------------------------------------------------------- comptabilité
  const [origine] = await tx
    .select()
    .from(ecritures)
    .where(
      and(
        eq(ecritures.organizationId, organizationId),
        eq(ecritures.origine, "vente_pos"),
        eq(ecritures.pieceId, venteId),
      ),
    );

  let numeroEcriture: string | undefined;

  if (origine) {
    const lignes = await tx
      .select()
      .from(lignesEcriture)
      .where(eq(lignesEcriture.ecritureId, origine.id))
      .orderBy(asc(lignesEcriture.ordre));

    const initiale: Ecriture = {
      journal: origine.journal,
      date: origine.dateEcriture,
      piece: origine.pieceNumero,
      libelle: origine.libelle,
      lignes: lignes.map((ligne) => ({
        compte: ligne.compte,
        libelleCompte: ligne.libelleCompte,
        auxiliaire: ligne.auxiliaire ?? undefined,
        debit: ligne.debit,
        credit: ligne.credit,
      })),
    };

    const dateIso = maintenant.toISOString().slice(0, 10);

    numeroEcriture = await enregistrerEcritureDans(
      tx,
      contrepasser(initiale, avoir, `Annulation ticket ${annulee.numero}`, dateIso),
      {
        organizationId,
        userId,
        origine: "avoir",
        pieceId: venteId,
        exercice: dateIso.slice(0, 4),
        dateIso,
      },
    );
  }

  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "vente.annuler",
    entityType: "vente",
    entityId: annulee.id,
    after: {
      numero: annulee.numero,
      avoir,
      montant: annulee.total,
      motif,
      mouvements: sorties.length,
      ecriture: numeroEcriture ?? null,
    },
  });

  return {
    id: annulee.id,
    numero: annulee.numero,
    avoir,
    total: annulee.total,
    ecriture: numeroEcriture,
  };
}
