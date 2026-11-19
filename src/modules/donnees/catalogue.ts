import { is } from "drizzle-orm";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";

import * as schemaComplet from "@/db/schema";
import * as socleAbonnement from "@/db/schema/abonnement";
import * as socleAudit from "@/db/schema/audit";
import * as socleAuth from "@/db/schema/auth";
import * as socleCodes from "@/db/schema/codes";
import * as socleRbac from "@/db/schema/rbac";
import * as socleSequences from "@/db/schema/sequences";
import * as socleSync from "@/db/schema/sync";
import * as socleTenancy from "@/db/schema/tenancy";
import * as achats from "@/modules/achats/schema";
import * as actifs from "@/modules/actifs/schema";
import * as archives from "@/modules/archives/schema";
import * as boiteMail from "@/modules/boite-mail/schema";
import * as calculs from "@/modules/calculs/schema";
import * as catalogueArticles from "@/modules/catalogue/schema";
import * as commerciaux from "@/modules/commerciaux/schema";
import * as communication from "@/modules/communication/schema";
import * as comptabilite from "@/modules/comptabilite/schema";
import * as contacts from "@/modules/contacts/schema";
import * as courrier from "@/modules/courrier/schema";
import * as documents from "@/modules/documents/schema";
import * as enquetes from "@/modules/enquetes/schema";
import * as facturation from "@/modules/facturation/schema";
import * as fiscalite from "@/modules/fiscalite/schema";
import * as guide from "@/modules/guide/schema";
import * as marches from "@/modules/marches/schema";
import * as meeting from "@/modules/meeting/schema";
import * as messagerie from "@/modules/messagerie/schema";
import * as missions from "@/modules/missions/schema";
import * as moyensGeneraux from "@/modules/moyens-generaux/schema";
import * as paie from "@/modules/paie/schema";
import * as parcAuto from "@/modules/parc-auto/schema";
import * as parcInformatique from "@/modules/parc-informatique/schema";
import * as perdiem from "@/modules/perdiem/schema";
import * as personnes from "@/modules/personnes/schema";
import * as planning from "@/modules/planning/schema";
import * as presences from "@/modules/presences/schema";
import * as prestataires from "@/modules/prestataires/schema";
import * as projets from "@/modules/projets/schema";
import * as projetsTerrain from "@/modules/projets/terrain-schema";
import * as prospection from "@/modules/prospection/schema";
import * as pv from "@/modules/pv/schema";
import * as reglement from "@/modules/reglement/schema";
import * as securite from "@/modules/securite/schema";
import * as stock from "@/modules/stock/schema";
import * as taches from "@/modules/taches/schema";
import * as tiers from "@/modules/tiers/schema";
import * as transmissions from "@/modules/transmissions/schema";
import * as tresorerie from "@/modules/tresorerie/schema";
import * as ventes from "@/modules/ventes/schema";
import * as ventesSession from "@/modules/ventes/schema-session";
import * as visiteurs from "@/modules/visiteurs/schema";

import { libelle, TABLES_EXCLUES, type ColonneDecrite, type GenreColonne, type TableDecrite } from "./regles";

/**
 * Le catalogue des tables de l'entreprise, lu dans le schéma Drizzle : une
 * table ajoutée à un module y entre d'elle-même, sans rien déclarer. Seules
 * comptent les tables qui portent `organization_id` — les données de
 * l'entreprise ; les comptes et les droits se gèrent dans « Utilisateurs ».
 *
 * Une table d'un schéma absent de la liste ci-dessous tombe dans « Autres » :
 * elle reste visible, et le test du catalogue signale l'oubli.
 */

const GROUPES: { libelle: string; schemas: Record<string, unknown>[] }[] = [
  { libelle: "Socle", schemas: [socleTenancy, socleAuth, socleRbac, socleSequences, socleCodes, socleAudit, socleSync, socleAbonnement] },
  { libelle: "Clients et fournisseurs", schemas: [tiers] },
  { libelle: "Catalogue", schemas: [catalogueArticles] },
  { libelle: "Stock", schemas: [stock] },
  { libelle: "Ventes", schemas: [ventes, ventesSession] },
  { libelle: "Devis et factures", schemas: [facturation] },
  { libelle: "Commerciaux", schemas: [commerciaux] },
  { libelle: "Prospection", schemas: [prospection] },
  { libelle: "Achats", schemas: [achats] },
  { libelle: "Prestataires", schemas: [prestataires] },
  { libelle: "Marchés et conventions", schemas: [marches] },
  { libelle: "Comptabilité", schemas: [comptabilite] },
  { libelle: "Trésorerie", schemas: [tresorerie] },
  { libelle: "Fiscalité", schemas: [fiscalite] },
  { libelle: "Personnel", schemas: [personnes] },
  { libelle: "Paie", schemas: [paie] },
  { libelle: "Présences et congés", schemas: [presences] },
  { libelle: "Planning", schemas: [planning] },
  { libelle: "Per diem", schemas: [perdiem] },
  { libelle: "Missions", schemas: [missions] },
  { libelle: "Projets", schemas: [projets, projetsTerrain] },
  { libelle: "Calculs chantier", schemas: [calculs] },
  { libelle: "Actifs", schemas: [actifs] },
  { libelle: "Parc auto", schemas: [parcAuto] },
  { libelle: "Parc informatique", schemas: [parcInformatique] },
  { libelle: "Moyens généraux", schemas: [moyensGeneraux] },
  { libelle: "Tâches", schemas: [taches] },
  { libelle: "Procès-verbaux", schemas: [pv] },
  { libelle: "Meeting", schemas: [meeting] },
  { libelle: "Documents", schemas: [documents] },
  { libelle: "Archives", schemas: [archives] },
  { libelle: "Courrier et colis", schemas: [courrier] },
  { libelle: "Transmissions", schemas: [transmissions] },
  { libelle: "Visiteurs", schemas: [visiteurs] },
  { libelle: "Contacts", schemas: [contacts] },
  { libelle: "Communication", schemas: [communication] },
  { libelle: "Messagerie", schemas: [messagerie] },
  { libelle: "Boîte mail", schemas: [boiteMail] },
  { libelle: "Règlement intérieur", schemas: [reglement] },
  { libelle: "Guide", schemas: [guide] },
  { libelle: "Enquêtes", schemas: [enquetes] },
  { libelle: "Sécurité", schemas: [securite] },
];

export const GROUPE_AUTRES = "Autres";

const GENRES: Record<string, GenreColonne> = {
  PgUUID: "uuid",
  PgText: "texte",
  PgChar: "texte",
  PgVarchar: "texte",
  PgInteger: "entier",
  PgSmallInt: "entier",
  PgBigInt53: "entier",
  PgSerial: "entier",
  PgBigSerial53: "entier",
  PgBoolean: "booleen",
  PgDateString: "date",
  PgTimestamp: "horodatage",
  PgTimestampString: "horodatage",
  PgEnumColumn: "choix",
  PgJsonb: "json",
  PgJson: "json",
  PgArray: "liste",
};

function decrireColonne(c: PgColumn, references: Map<string, string>, cles: ReadonlySet<string>): ColonneDecrite {
  const genre = GENRES[c.columnType] ?? "liste";
  const enumeration = genre === "choix" ? (c as unknown as { enumValues?: string[]; enum?: { enumName: string } }) : null;
  return {
    nom: c.name,
    genre,
    choix: enumeration ? (enumeration.enumValues ?? []) : null,
    obligatoire: c.notNull,
    reference: references.get(c.name) ?? null,
    typeEnum: enumeration?.enum?.enumName ?? null,
    cle: cles.has(c.name),
  };
}

function construire(): { tables: Map<string, TableDecrite>; groupes: { libelle: string; tables: string[] }[] } {
  const groupeDe = new Map<PgTable, string>();
  for (const g of GROUPES) {
    for (const s of g.schemas) for (const v of Object.values(s)) if (is(v, PgTable)) groupeDe.set(v, g.libelle);
  }
  // Toutes les tables du schéma, rangées ou non : une table oubliée ci-dessus reste visible.
  const toutes = new Set<PgTable>();
  for (const v of Object.values(schemaComplet) as unknown[]) if (is(v, PgTable)) toutes.add(v);

  const brutes: { config: ReturnType<typeof getTableConfig>; groupe: string }[] = [];
  for (const t of toutes) {
    const config = getTableConfig(t);
    if (!config.columns.some((c) => c.name === "organization_id") || TABLES_EXCLUES.has(config.name)) continue;
    brutes.push({ config, groupe: groupeDe.get(t) ?? GROUPE_AUTRES });
  }

  const tables = new Map<string, TableDecrite>();
  const pointeurs = new Map<string, { table: string; colonne: string }[]>();
  for (const { config, groupe } of brutes) {
    const references = new Map<string, string>();
    for (const fk of config.foreignKeys) {
      const r = fk.reference();
      if (r.columns.length !== 1) continue;
      const cible = getTableConfig(r.foreignTable).name;
      references.set(r.columns[0].name, cible);
      if (cible !== "organizations") pointeurs.set(cible, [...(pointeurs.get(cible) ?? []), { table: config.name, colonne: r.columns[0].name }]);
    }
    const cles = new Set([...config.columns.filter((c) => c.primary).map((c) => c.name), ...config.primaryKeys.flatMap((k) => k.columns.map((c) => c.name))]);
    tables.set(config.name, {
      nom: config.name,
      cle: cles.size === 1 ? [...cles][0] : null,
      libelle: libelle(config.name),
      groupe,
      colonnes: config.columns.map((c) => decrireColonne(c, references, cles)),
      referencee: [],
    });
  }
  for (const [nom, t] of tables) tables.set(nom, { ...t, referencee: (pointeurs.get(nom) ?? []).filter((p) => tables.has(p.table)) });

  const libelles = [...GROUPES.map((g) => g.libelle), GROUPE_AUTRES];
  const groupes = libelles
    .map((l) => ({
      libelle: l,
      tables: [...tables.values()]
        .filter((t) => t.groupe === l)
        .map((t) => t.nom)
        .sort((a, b) => a.localeCompare(b, "fr")),
    }))
    .filter((g) => g.tables.length > 0);
  return { tables, groupes };
}

const { tables: TABLES, groupes: GROUPES_TABLES } = construire();

/** Les tables de l'entreprise, par nom SQL. Seul ce catalogue nomme une table dans une requête. */
export const CATALOGUE: ReadonlyMap<string, TableDecrite> = TABLES;

/** Les tables, rangées par module, dans l'ordre du menu. */
export const GROUPES_DONNEES: readonly { libelle: string; tables: readonly string[] }[] = GROUPES_TABLES;

export function tableDecrite(nom: string): TableDecrite | null {
  return CATALOGUE.get(nom) ?? null;
}
