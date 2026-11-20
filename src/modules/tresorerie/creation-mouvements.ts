import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { auditLogs } from "@/db/schema";
import { contrepasser } from "@/lib/comptabilite/ecritures";
import { newId } from "@/lib/ids";
import { prochainNumero, type Transaction } from "@/lib/sequences";
import { enregistrerEcritureDans } from "@/modules/comptabilite/enregistrement";
import { tiers } from "@/modules/tiers/schema";

import { compteDe, exigerProvision } from "./creation";
import { ecritureMouvement, natureConnue, NATURES_MOUVEMENT, tiersRequis, type NatureMouvement } from "./mouvements";
import { mouvementsTresorerie } from "./schema";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

async function journaliser(tx: Transaction, organizationId: string, userId: string, action: string, entiteId: string, apres: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ id: newId(), organizationId, userId, action, entityType: "mouvement", entityId: entiteId, after: apres });
}

export interface NouveauMouvement {
  compteId: string;
  nature: NatureMouvement;
  montant: number;
  date: string;
  libelle?: string | null;
  tiersId?: string | null;
  reference?: string | null;
  ribBeneficiaire?: string | null;
}

/** Le tiers et son compte auxiliaire, du bon côté : client 411 ou fournisseur 401. */
async function tiersDe(tx: Transaction, organizationId: string, id: string, role: "client" | "fournisseur") {
  const [t] = await tx
    .select({ id: tiers.id, nom: tiers.nom, client: tiers.compteClient, fournisseur: tiers.compteFournisseur, actif: tiers.actif })
    .from(tiers)
    .where(and(eq(tiers.id, id), eq(tiers.organizationId, organizationId), isNull(tiers.deletedAt)));
  if (!t) throw new Error("Tiers introuvable.");
  const auxiliaire = role === "client" ? t.client : t.fournisseur;
  if (!auxiliaire) {
    throw new Error(
      role === "client"
        ? `« ${t.nom} » n'est pas déclaré comme client : il n'a pas de compte 411.`
        : `« ${t.nom} » n'est pas déclaré comme fournisseur : il n'a pas de compte 401.`,
    );
  }
  return { id: t.id, nom: t.nom, auxiliaire };
}

/**
 * Enregistre un mouvement et passe son écriture, dans la même transaction.
 *
 * Une caisse ou un portefeuille mobile money ne sort pas ce qu'il n'a pas ;
 * une banque peut passer en découvert, c'est à elle de le refuser.
 */
export async function enregistrerMouvementDans(
  tx: Transaction,
  organizationId: string,
  m: NouveauMouvement,
  userId: string,
): Promise<{ id: string; numero: string; ecriture: string }> {
  if (!natureConnue(m.nature)) throw new Error("Nature de mouvement inconnue.");
  if (!Number.isInteger(m.montant) || m.montant <= 0) throw new Error("Montant invalide.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) throw new Error("Date invalide.");
  if (m.date > aujourdhui()) throw new Error("Un mouvement se saisit une fois passé : la date ne peut pas être future.");

  const compte = await compteDe(tx, organizationId, m.compteId);
  const definition = NATURES_MOUVEMENT[m.nature];
  if (definition.sens === "sortie") await exigerProvision(tx, organizationId, compte, m.montant);

  const role = tiersRequis(m.nature);
  if (role && !m.tiersId) throw new Error(role === "client" ? "Choisissez le client." : "Choisissez le fournisseur ou le prestataire.");
  const tiersMouvement = role && m.tiersId ? await tiersDe(tx, organizationId, m.tiersId, role) : null;
  const libelle = (m.libelle?.trim() || definition.libelle).slice(0, 200);

  const annee = m.date.slice(0, 4);
  const numero = await prochainNumero(tx, organizationId, { cle: "mouvement", prefix: `MVT-${annee}-`, padding: 5, periode: annee });
  const id = newId();
  const ecriture = await enregistrerEcritureDans(
    tx,
    ecritureMouvement({ numero, date: m.date, compte, nature: m.nature, montant: m.montant, libelle, tiers: tiersMouvement }),
    { organizationId, userId, origine: "mouvement", pieceId: id, exercice: annee, dateIso: m.date },
  );

  await tx.insert(mouvementsTresorerie).values({
    id,
    organizationId,
    numero,
    compteId: compte.id,
    nature: m.nature,
    tiersId: tiersMouvement?.id ?? null,
    tiersNom: tiersMouvement?.nom ?? null,
    montant: m.montant,
    dateOperation: m.date,
    libelle,
    reference: m.reference?.trim() || null,
    ribBeneficiaire: m.ribBeneficiaire?.trim() || null,
    ecriture,
    userId,
  });
  await journaliser(tx, organizationId, userId, "mouvement.enregistrer", id, { numero, nature: m.nature, montant: m.montant, compte: compte.nom });
  return { id, numero, ecriture };
}

/**
 * Annule un mouvement par contre-passation, datée du jour. L'écriture d'origine
 * reste : on voit l'erreur et sa correction, jamais un trou.
 */
export async function annulerMouvementDans(tx: Transaction, organizationId: string, id: string, motif: string, userId: string): Promise<{ numero: string }> {
  if (motif.trim().length < 3) throw new Error("Dites pourquoi le mouvement est annulé.");
  const [m] = await tx
    .select()
    .from(mouvementsTresorerie)
    .where(and(eq(mouvementsTresorerie.id, id), eq(mouvementsTresorerie.organizationId, organizationId), isNull(mouvementsTresorerie.deletedAt)))
    .for("update");
  if (!m) throw new Error("Mouvement introuvable.");
  if (m.statut === "annule") throw new Error(`${m.numero} est déjà annulé.`);

  const compte = await compteDe(tx, organizationId, m.compteId);
  const role = tiersRequis(m.nature);
  const tiersMouvement = role && m.tiersId ? await tiersDe(tx, organizationId, m.tiersId, role) : null;
  // Annuler une entrée, c'est faire sortir l'argent : la caisse doit l'avoir.
  if (NATURES_MOUVEMENT[m.nature].sens === "entree") await exigerProvision(tx, organizationId, compte, m.montant);

  // On rejoue l'écriture d'origine pour en avoir les lignes, puis on la retourne.
  const origine = ecritureMouvement({
    numero: m.numero,
    date: String(m.dateOperation).slice(0, 10),
    compte,
    nature: m.nature,
    montant: m.montant,
    libelle: m.libelle,
    tiers: tiersMouvement ? { nom: m.tiersNom ?? tiersMouvement.nom, auxiliaire: tiersMouvement.auxiliaire } : null,
  });
  const date = aujourdhui();
  await enregistrerEcritureDans(tx, contrepasser(origine, `${m.numero}-A`, `Annulation ${m.numero} — ${motif.trim()}`.slice(0, 200), date), {
    organizationId,
    userId,
    origine: "mouvement",
    pieceId: m.id,
    exercice: date.slice(0, 4),
    dateIso: date,
  });
  await tx
    .update(mouvementsTresorerie)
    .set({ statut: "annule", motifAnnulation: motif.trim(), updatedAt: new Date(), version: sql`${mouvementsTresorerie.version} + 1` })
    .where(eq(mouvementsTresorerie.id, m.id));
  await journaliser(tx, organizationId, userId, "mouvement.annuler", m.id, { numero: m.numero, motif: motif.trim() });
  return { numero: m.numero };
}
