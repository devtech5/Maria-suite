import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { auditLogs, memberships, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { baremeDe, modifierElementsDans } from "@/modules/paie/creation";
import { bulletinsPaie, periodesPaie } from "@/modules/paie/schema";
import { employees } from "@/modules/personnes/schema";
import { exigerProvision } from "@/modules/tresorerie/creation";
import { comptesTresorerie } from "@/modules/tresorerie/schema";

import { bornesMois, calculerCommission, ecriturePaiementCommission, refusRegle, type Realisation, type RegleCommission } from "./calcul";
import { commerciaux, commissions, type PalierCommission } from "./schema";

type Lecteur = Pick<Transaction, "execute" | "select">;

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: action.split(".")[0], entityId: entiteId, after: apres });
}

export interface FicheCommercial {
  /** Nom saisi : ne sert que pour un commercial sans fiche (apporteur externe). */
  nom?: string | null;
  telephone?: string | null;
  userId?: string | null;
  employeeId?: string | null;
  base: "ca_ht" | "marge";
  tauxBp: number;
  paliers?: PalierCommission[] | null;
  fixeMensuel: number;
  objectifMensuel: number;
  actif?: boolean;
}

/**
 * Nom et téléphone du commercial, pris à sa fiche : le salarié du Personnel
 * d'abord, sinon le compte qui encaisse. Rien ne se recopie à la main ; le
 * nom saisi ne vaut que pour un apporteur sans fiche.
 */
async function identiteDe(tx: Transaction, organizationId: string, f: FicheCommercial): Promise<{ nom: string; telephone: string | null }> {
  if (f.userId) {
    const [membre] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, f.userId)));
    if (!membre) throw new Error("Ce compte n'appartient pas à l'entreprise.");
  }
  if (f.employeeId) {
    const [e] = await tx
      .select({ nom: employees.nom, telephone: employees.telephone })
      .from(employees)
      .where(and(eq(employees.id, f.employeeId), eq(employees.organizationId, organizationId), isNull(employees.deletedAt)));
    if (!e) throw new Error("Ce salarié ne figure pas au Personnel.");
    return { nom: e.nom, telephone: e.telephone };
  }
  if (f.userId) {
    const [u] = await tx.select({ nom: users.fullName, telephone: users.phone }).from(users).where(eq(users.id, f.userId));
    if (u) return { nom: u.nom, telephone: u.telephone };
  }
  const nom = f.nom?.trim() ?? "";
  if (!nom) throw new Error("Le nom du commercial est requis.");
  return { nom, telephone: f.telephone?.trim() || null };
}

export async function enregistrerCommercialDans(
  tx: Transaction,
  organizationId: string,
  id: string | null,
  f: FicheCommercial,
  userId: string,
): Promise<{ id: string; nom: string }> {
  const regle: RegleCommission = { base: f.base, tauxBp: f.tauxBp, paliers: f.paliers?.length ? f.paliers : null, fixeMensuel: f.fixeMensuel };
  const refus = refusRegle(regle);
  if (refus) throw new Error(refus);
  const identite = await identiteDe(tx, organizationId, f);
  const valeurs = {
    nom: identite.nom,
    telephone: identite.telephone,
    userId: f.userId || null,
    employeeId: f.employeeId || null,
    base: f.base,
    tauxBp: f.tauxBp,
    paliers: regle.paliers ? [...regle.paliers].sort((a, b) => a.seuil - b.seuil) : null,
    fixeMensuel: f.fixeMensuel,
    objectifMensuel: f.objectifMensuel,
    actif: f.actif ?? true,
  };
  if (id) {
    const [m] = await tx
      .update(commerciaux)
      .set({ ...valeurs, updatedAt: new Date(), version: sql`${commerciaux.version} + 1` })
      .where(and(eq(commerciaux.id, id), eq(commerciaux.organizationId, organizationId)))
      .returning({ id: commerciaux.id });
    if (!m) throw new Error("Commercial introuvable.");
  } else {
    id = newId();
    await tx.insert(commerciaux).values({ id, organizationId, ...valeurs });
  }
  await journaliser(tx, organizationId, userId, "commercial.enregistrer", id, { nom: valeurs.nom, base: f.base, tauxBp: f.tauxBp, paliers: valeurs.paliers, fixe: f.fixeMensuel });
  return { id, nom: valeurs.nom };
}

/**
 * Ce que chaque commercial a réalisé sur un mois : factures moins avoirs émis,
 * plus les tickets de caisse encaissés. Une vente sans commercial désigné
 * revient à celui qui est lié à l'utilisateur qui l'a faite. La marge
 * retranche le coût des marchandises réellement sorties du stock pour la
 * pièce (coût moyen pondéré au moment de la sortie).
 *
 * Les factures de reprise de soldes antérieurs n'y entrent pas : ce ne sont
 * pas des ventes du mois. Un ticket annulé non plus : son annulation ne pose
 * pas d'avoir, elle retire le ticket.
 */
export async function realisationsDuMois(lecteur: Lecteur, organizationId: string, mois: string): Promise<Map<string, Realisation>> {
  const { du, au } = bornesMois(mois);
  const lignes = await lecteur.execute<{ commercial_id: string; ca: string; cout: string }>(sql`
    with attribution as (
      select coalesce(p.commercial_id, (select c.id from commerciaux c where c.organization_id = p.organization_id and c.user_id = p.user_id)) as commercial_id,
             case when p.nature = 'avoir' then -p.total_ht else p.total_ht end as ca,
             p.id as origine_id
      from pieces_commerciales p
      where p.organization_id = ${organizationId}
        and p.nature in ('facture', 'avoir')
        -- Une facture annulée l'est par un avoir, compté en négatif : la garder
        -- évite de la retirer deux fois, et reprend la commission au mois de l'avoir.
        and p.statut <> 'brouillon'
        and p.date_piece >= ${du} and p.date_piece < ${au}
        and not exists (select 1 from lignes_piece l where l.piece_id = p.id and l.compte_vente = '4711')
      union all
      select coalesce(v.commercial_id, (select c.id from commerciaux c where c.organization_id = v.organization_id and c.user_id = v.user_id)),
             v.total_ht,
             v.id
      from ventes v
      where v.organization_id = ${organizationId}
        and v.statut = 'encaissee'
        and v.encaissee_le >= ${du}::date and v.encaissee_le < ${au}::date
    )
    select a.commercial_id, sum(a.ca) as ca, coalesce(sum(c.cout), 0) as cout
    from attribution a
    left join lateral (
      select -coalesce(sum(m.quantite * m.cout_unitaire), 0)::numeric / 1000 as cout
      from mouvements_stock m
      where m.organization_id = ${organizationId} and m.origine_id = a.origine_id and m.deleted_at is null
    ) c on true
    where a.commercial_id is not null
    group by a.commercial_id
  `);
  return new Map(lignes.map((l) => [l.commercial_id, { caHt: Number(l.ca), marge: Number(l.ca) - Math.round(Number(l.cout)) }]));
}

async function commercialDe(tx: Lecteur, organizationId: string, id: string) {
  const [c] = await tx.select().from(commerciaux).where(and(eq(commerciaux.id, id), eq(commerciaux.organizationId, organizationId)));
  if (!c) throw new Error("Commercial introuvable.");
  return c;
}

/** Valide la commission d'un mois terminé : les montants sont figés. */
export async function validerCommissionDans(tx: Transaction, organizationId: string, commercialId: string, mois: string, aujourdhui: string, userId: string): Promise<{ total: number }> {
  if (mois >= aujourdhui.slice(0, 7)) throw new Error(`Le mois ${mois} n'est pas terminé : sa commission se valide à partir du 1er du mois suivant.`);
  const c = await commercialDe(tx, organizationId, commercialId);
  const realisation = (await realisationsDuMois(tx, organizationId, mois)).get(commercialId) ?? { caHt: 0, marge: 0 };
  const calcul = calculerCommission(realisation, { base: c.base, tauxBp: c.tauxBp, paliers: c.paliers, fixeMensuel: c.fixeMensuel });
  const [deja] = await tx.select({ id: commissions.id }).from(commissions).where(and(eq(commissions.commercialId, commercialId), eq(commissions.mois, mois)));
  if (deja) throw new Error(`La commission de ${c.nom} pour ${mois} est déjà validée.`);
  const id = newId();
  await tx.insert(commissions).values({
    id,
    organizationId,
    commercialId,
    mois,
    caHt: realisation.caHt,
    marge: realisation.marge,
    base: c.base,
    variable: calcul.variable,
    fixe: calcul.fixe,
    total: calcul.total,
    valideeParUserId: userId,
  });
  await journaliser(tx, organizationId, userId, "commission.valider", id, { commercial: c.nom, mois, ...realisation, ...calcul });
  return { total: calcul.total };
}

async function commissionVerrouillee(tx: Transaction, organizationId: string, id: string) {
  const [k] = await tx.select().from(commissions).where(and(eq(commissions.id, id), eq(commissions.organizationId, organizationId))).for("update");
  if (!k) throw new Error("Commission introuvable.");
  if (k.statut === "payee") throw new Error("Cette commission est déjà payée.");
  return k;
}

/** Commercial externe : paiement depuis la trésorerie, charge en 6322. */
export async function payerCommissionDans(tx: Transaction, organizationId: string, id: string, v: { compteTresorerieId: string; date: string }, userId: string): Promise<{ montant: number; ecriture: string }> {
  const k = await commissionVerrouillee(tx, organizationId, id);
  const c = await commercialDe(tx, organizationId, k.commercialId);
  if (c.employeeId) throw new Error(`${c.nom} est salarié : sa commission passe par la paie, où elle est cotisée et imposée.`);
  if (k.total <= 0) throw new Error("Rien à payer.");
  const [compte] = await tx
    .select()
    .from(comptesTresorerie)
    .where(and(eq(comptesTresorerie.id, v.compteTresorerieId), eq(comptesTresorerie.organizationId, organizationId)))
    .for("update");
  if (!compte || !compte.actif) throw new Error("Compte de trésorerie introuvable ou fermé.");
  await exigerProvision(tx, organizationId, { numero: compte.compte, libelle: compte.nom, nature: compte.nature, nom: compte.nom }, k.total);
  const piece = await prochainNumero(tx, organizationId, { cle: "commission", prefix: `COM-${k.mois}-`, padding: 4, periode: k.mois });
  const ecriture = await enregistrerEcritureDans(
    tx,
    ecriturePaiementCommission({ piece, date: v.date, commercial: c.nom, mois: k.mois, montant: k.total, tresorerie: { numero: compte.compte, libelle: compte.nom, journal: compte.nature === "banque" ? "BQ" : "CA" } }),
    { organizationId, userId, origine: "commission", pieceId: k.id, exercice: v.date.slice(0, 4), dateIso: v.date },
  );
  await tx
    .update(commissions)
    .set({ statut: "payee", payeeLe: v.date, modePaiement: "tresorerie", ecriture, compteTresorerieId: compte.id, updatedAt: new Date(), version: sql`${commissions.version} + 1` })
    .where(eq(commissions.id, k.id));
  await journaliser(tx, organizationId, userId, "commission.payer", k.id, { commercial: c.nom, mois: k.mois, montant: k.total, ecriture });
  return { montant: k.total, ecriture };
}

/**
 * Commercial salarié : la commission s'ajoute aux primes imposables de son
 * bulletin dans une paie en préparation. La paie la cotise, l'impose et la
 * comptabilise en 661 à sa validation.
 */
export async function reporterEnPaieDans(tx: Transaction, organizationId: string, id: string, moisPaie: string, userId: string): Promise<{ salarie: string; net: number }> {
  const k = await commissionVerrouillee(tx, organizationId, id);
  const c = await commercialDe(tx, organizationId, k.commercialId);
  if (!c.employeeId) throw new Error(`${c.nom} n'est pas rattaché à un salarié : payez sa commission depuis la trésorerie.`);
  const [periode] = await tx.select().from(periodesPaie).where(and(eq(periodesPaie.organizationId, organizationId), eq(periodesPaie.mois, moisPaie)));
  if (!periode) throw new Error(`La paie de ${moisPaie} n'est pas préparée : préparez-la d'abord.`);
  if (periode.statut === "validee") throw new Error(`La paie de ${moisPaie} est déjà validée.`);
  const [b] = await tx
    .select()
    .from(bulletinsPaie)
    .where(and(eq(bulletinsPaie.periodeId, periode.id), eq(bulletinsPaie.employeId, c.employeeId)))
    .orderBy(asc(bulletinsPaie.matricule));
  if (!b) throw new Error(`${c.nom} n'a pas de bulletin dans la paie de ${moisPaie}.`);
  const { bareme } = await baremeDe(organizationId);
  const r = await modifierElementsDans(
    tx,
    organizationId,
    b.id,
    { primesImposables: b.primesImposables + k.total, indemnitesNonImposables: b.indemnitesNonImposables, retenuesDiverses: b.retenuesDiverses },
    bareme,
    userId,
  );
  await tx
    .update(commissions)
    .set({ statut: "payee", payeeLe: `${moisPaie}-01`, modePaiement: "paie", ecriture: null, updatedAt: new Date(), version: sql`${commissions.version} + 1` })
    .where(eq(commissions.id, k.id));
  await journaliser(tx, organizationId, userId, "commission.paie", k.id, { commercial: c.nom, mois: k.mois, moisPaie, montant: k.total, bulletin: b.id });
  return { salarie: r.nom, net: r.net };
}
