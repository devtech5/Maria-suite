import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import {
  ecritureEcartCaisse,
  type EcartComptage,
} from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { postesCaisse, ventes } from "./schema";
import {
  comptagesCaisse,
  sessionsCaisse,
  type SessionCaisse,
} from "./schema-session";

/** Moyens qui se comptent. Le crédit n'entre dans aucun tiroir. */
const MOYENS_COMPTABLES = [
  "especes",
  "mobile_money",
  "carte",
  "banque",
] as const;

export type MoyenComptable = (typeof MOYENS_COMPTABLES)[number];

export interface SessionOuverte extends SessionCaisse {
  caisseCode: string;
  caisseNom: string;
}

/**
 * Session en cours sur un poste.
 *
 * Une seule peut l'être — l'index unique partiel l'impose. Deux tiroirs ouverts
 * sur la même caisse rendraient tout comptage impossible : personne ne saurait
 * à laquelle rattacher la vente de quatorze heures.
 */
export async function sessionOuverte(
  organizationId: string,
  caisseId: string,
): Promise<SessionOuverte | null> {
  const [ligne] = await db
    .select({ session: sessionsCaisse, code: postesCaisse.code, nom: postesCaisse.nom })
    .from(sessionsCaisse)
    .innerJoin(postesCaisse, eq(sessionsCaisse.caisseId, postesCaisse.id))
    .where(
      and(
        eq(sessionsCaisse.organizationId, organizationId),
        eq(sessionsCaisse.caisseId, caisseId),
        eq(sessionsCaisse.statut, "ouverte"),
        isNull(sessionsCaisse.deletedAt),
      ),
    )
    .limit(1);

  if (!ligne) return null;
  return { ...ligne.session, caisseCode: ligne.code, caisseNom: ligne.nom };
}

export interface NouvelleSession {
  caisseId: string;
  caissier: string;
  fondInitial?: number;
}

/**
 * Ouvre le tiroir.
 *
 * Le fond initial n'est ni un produit ni un encaissement : c'est de la monnaie
 * déposée pour rendre la monnaie. Le compter comme une recette gonflerait la
 * journée de son montant, chaque jour, et le chiffre d'affaires du mois d'un
 * fond multiplié par trente.
 *
 * Aucune écriture n'est passée à l'ouverture : l'argent était déjà dans
 * l'entreprise hier soir, il a seulement changé de tiroir.
 */
export async function ouvrirSessionDans(
  tx: Transaction,
  organizationId: string,
  donnees: NouvelleSession,
  userId: string,
): Promise<{ id: string }> {
  const id = newId();

  await tx.insert(sessionsCaisse).values({
    id,
    organizationId,
    caisseId: donnees.caisseId,
    userId,
    caissier: donnees.caissier,
    fondInitial: donnees.fondInitial ?? 0,
  });

  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId,
    action: "caisse.ouvrir_session",
    entityType: "session_caisse",
    entityId: id,
    after: { caisseId: donnees.caisseId, fondInitial: donnees.fondInitial ?? 0 },
  });

  return { id };
}

export interface AttenduParMoyen {
  moyen: MoyenComptable;
  /** Encaissé par ce moyen depuis l'ouverture. */
  attendu: number;
}

export interface AttenduSession {
  tickets: number;
  chiffreAffaires: number;
  /** Fond initial compris : c'est ce que le tiroir devrait contenir. */
  especesEnTiroir: number;
  /** Vendu à crédit : réel, mais pas encaissé. Ne se compte dans aucun tiroir. */
  aCredit: number;
  parMoyen: AttenduParMoyen[];
}

/**
 * Ce que la session devrait avoir encaissé.
 *
 * Les tickets sont rattachés par leur session ET, à défaut, par leur date : un
 * encaissement remonté du hors-ligne après coup n'a pas de session, et l'ignorer
 * ferait constater un excédent qui n'en est pas un.
 */
export async function attenduDeSession(
  organizationId: string,
  session: Pick<SessionCaisse, "id" | "caisseId" | "ouverteLe" | "fondInitial">,
): Promise<AttenduSession> {
  const depuis = session.ouverteLe.toISOString();

  const lignes = await db.execute<{ moyen: string; montant: string }>(sql`
    select r.moyen, coalesce(sum(r.montant), 0) as montant
    from reglements_vente r
      join ventes v on v.id = r.vente_id
    where v.organization_id = ${organizationId}
      and v.statut = 'encaissee'
      and v.deleted_at is null
      and (
        v.session_caisse_id = ${session.id}
        or (
          v.session_caisse_id is null
          and v.caisse_id = ${session.caisseId}
          and v.encaissee_le >= ${depuis}
        )
      )
    group by r.moyen
  `);

  const [entete] = await db.execute<{ tickets: string; chiffre: string }>(sql`
    select count(*) as tickets, coalesce(sum(v.total_ttc), 0) as chiffre
    from ventes v
    where v.organization_id = ${organizationId}
      and v.statut = 'encaissee'
      and v.deleted_at is null
      and (
        v.session_caisse_id = ${session.id}
        or (
          v.session_caisse_id is null
          and v.caisse_id = ${session.caisseId}
          and v.encaissee_le >= ${depuis}
        )
      )
  `);

  const parMoyenBrut = new Map(
    lignes.map((ligne) => [ligne.moyen, Number(ligne.montant)]),
  );

  const parMoyen = MOYENS_COMPTABLES.map((moyen) => ({
    moyen,
    attendu: parMoyenBrut.get(moyen) ?? 0,
  }));

  return {
    tickets: Number(entete?.tickets ?? 0),
    chiffreAffaires: Number(entete?.chiffre ?? 0),
    // Le fond initial fait partie de ce que le caissier doit trouver : il l'a
    // reçu à l'ouverture et ne l'a pas encaissé.
    especesEnTiroir:
      session.fondInitial + (parMoyenBrut.get("especes") ?? 0),
    aCredit: parMoyenBrut.get("credit") ?? 0,
    parMoyen,
  };
}

export interface ComptageSaisi {
  moyen: MoyenComptable;
  /** Ce que le caissier a compté. Espèces : fond initial compris. */
  compte: number;
}

export interface ResultatCloture {
  ecart: number;
  ecarts: { moyen: MoyenComptable; attendu: number; compte: number; ecart: number }[];
  /** Numéro de l'écriture de régularisation. Absent quand tout tombe juste. */
  ecriture?: string;
}

/**
 * Ferme le tiroir et constate l'écart.
 *
 * L'attendu est FIGÉ ici, dans la table de comptage. Le recalculer plus tard
 * donnerait un autre chiffre dès qu'un ticket en retard remonte du hors-ligne,
 * et l'écart constaté ce soir-là deviendrait irretrouvable — c'est exactement
 * la situation où un manque cesse d'être explicable.
 *
 * L'écart passe en comptabilité tout de suite, jamais en compte d'attente : une
 * différence laissée en suspens se traîne d'exercice en exercice et finit par
 * cacher un vol régulier sous un solde que personne ne justifie.
 */
export async function cloturerSessionDans(
  tx: Transaction,
  organizationId: string,
  sessionId: string,
  comptages: ComptageSaisi[],
  contexte: { userId: string; motif?: string | null; notes?: string | null },
): Promise<ResultatCloture> {
  const [session] = await tx
    .select()
    .from(sessionsCaisse)
    .where(
      and(
        eq(sessionsCaisse.id, sessionId),
        eq(sessionsCaisse.organizationId, organizationId),
        eq(sessionsCaisse.statut, "ouverte"),
        isNull(sessionsCaisse.deletedAt),
      ),
    );

  if (!session) throw new Error("Aucune session ouverte à clôturer.");

  const attendu = await attenduDeSession(organizationId, session);
  const attenduParMoyen = new Map(
    attendu.parMoyen.map((part) => [part.moyen, part.attendu]),
  );

  const saisiParMoyen = new Map(
    comptages.map((comptage) => [comptage.moyen, comptage.compte]),
  );

  const detail = MOYENS_COMPTABLES.map((moyen) => {
    // Le fond initial fait partie des espèces que le caissier doit retrouver.
    const du =
      (attenduParMoyen.get(moyen) ?? 0) +
      (moyen === "especes" ? session.fondInitial : 0);
    const compte = saisiParMoyen.get(moyen) ?? 0;

    return { moyen, attendu: du, compte, ecart: compte - du };
  });

  const ecartTotal = detail.reduce((somme, part) => somme + part.ecart, 0);

  if (ecartTotal !== 0 && !contexte.motif) {
    throw new Error(
      "Un écart de caisse ne se clôture pas sans motif : un manque sans " +
        "explication se répète le mois suivant.",
    );
  }

  const clotureeLe = new Date();

  await tx.insert(comptagesCaisse).values(
    detail.map((part) => ({
      id: newId(),
      organizationId,
      sessionId,
      moyen: part.moyen,
      attendu: part.attendu,
      compte: part.compte,
      ecart: part.ecart,
    })),
  );

  // ------------------------------------------------------ la régularisation
  let numeroEcriture: string | undefined;

  const ecriture = ecritureEcartCaisse({
    numero: await prochainNumero(tx, organizationId, {
      cle: "cloture_caisse",
      prefix: `CLO-${clotureeLe.getFullYear()}-`,
      padding: 5,
      periode: String(clotureeLe.getFullYear()),
    }),
    date: clotureeLe.toISOString().slice(0, 10),
    caissier: session.caissier,
    ecarts: detail.map<EcartComptage>((part) => ({
      moyen: part.moyen,
      ecart: part.ecart,
    })),
  });

  if (ecriture) {
    numeroEcriture = await enregistrerEcritureDans(tx, ecriture, {
      organizationId,
      userId: contexte.userId,
      origine: "saisie",
      pieceId: sessionId,
      exercice: String(clotureeLe.getFullYear()),
      dateIso: clotureeLe.toISOString().slice(0, 10),
    });
  }

  await tx
    .update(sessionsCaisse)
    .set({
      statut: "cloturee",
      clotureeLe,
      ecart: ecartTotal,
      motifEcart: contexte.motif ?? null,
      notes: contexte.notes ?? null,
      updatedAt: clotureeLe,
      version: sql`${sessionsCaisse.version} + 1`,
    })
    .where(eq(sessionsCaisse.id, sessionId));

  // Les tickets orphelins de la période rejoignent leur session : le
  // rattachement se fait à la clôture, une fois qu'on sait ce qu'elle couvre.
  await tx
    .update(ventes)
    .set({ sessionCaisseId: sessionId })
    .where(
      and(
        eq(ventes.organizationId, organizationId),
        eq(ventes.caisseId, session.caisseId),
        isNull(ventes.sessionCaisseId),
        sql`${ventes.encaisseeLe} >= ${session.ouverteLe.toISOString()}`,
        sql`${ventes.encaisseeLe} <= ${clotureeLe.toISOString()}`,
      ),
    );

  await tx.insert(auditLogs).values({
    id: newId(),
    organizationId,
    userId: contexte.userId,
    action: "caisse.cloturer_session",
    entityType: "session_caisse",
    entityId: sessionId,
    after: {
      ecart: ecartTotal,
      motif: contexte.motif ?? null,
      ecriture: numeroEcriture ?? null,
      tickets: attendu.tickets,
    },
  });

  return { ecart: ecartTotal, ecarts: detail, ecriture: numeroEcriture };
}

/** Dernières sessions closes, pour l'historique de clôture. */
export async function historiqueSessions(
  organizationId: string,
  limite = 10,
): Promise<(SessionCaisse & { caisseCode: string })[]> {
  const lignes = await db
    .select({ session: sessionsCaisse, code: postesCaisse.code })
    .from(sessionsCaisse)
    .innerJoin(postesCaisse, eq(sessionsCaisse.caisseId, postesCaisse.id))
    .where(
      and(
        eq(sessionsCaisse.organizationId, organizationId),
        eq(sessionsCaisse.statut, "cloturee"),
        isNull(sessionsCaisse.deletedAt),
      ),
    )
    .orderBy(desc(sessionsCaisse.clotureeLe))
    .limit(limite);

  return lignes.map((ligne) => ({ ...ligne.session, caisseCode: ligne.code }));
}

export { MOYENS_COMPTABLES };
