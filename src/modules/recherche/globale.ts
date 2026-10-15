import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { fmtDateIso } from "@/lib/format";
import { motsDans } from "@/lib/recherche-sql";
import { facturesFournisseur } from "@/modules/achats/schema";
import { actifs } from "@/modules/actifs/schema";
import { piecesCommerciales } from "@/modules/facturation/schema";
import { consultations, conventions, soumissions } from "@/modules/marches/schema";
import { missions } from "@/modules/missions/schema";
import { fournitures } from "@/modules/moyens-generaux/schema";
import { equipementsInformatiques } from "@/modules/parc-informatique/schema";
import { vehicules } from "@/modules/parc-auto/schema";
import { employees, workers } from "@/modules/personnes/schema";
import { prestataires } from "@/modules/prestataires/schema";
import { projets } from "@/modules/projets/schema";
import { tiers } from "@/modules/tiers/schema";

/**
 * Recherche de la barre du haut : un mot, toutes les fiches qu'il désigne.
 *
 * Chaque source déclare l'écran qui la montre (`racine`). Elle n'est
 * interrogée que si cet écran est visible pour la session — droit accordé
 * ET module ouvert — : la recherche n'en dit jamais plus que la navigation.
 *
 * Ne figurent pas ici les fiches dont la visibilité se décide ligne à ligne
 * (pièces confidentielles, dossiers d'archives partagés, tâches assignées,
 * messages) : leur propre écran applique ses règles, et la page de résultats
 * y renvoie avec la recherche déjà posée.
 */

export interface Trouvaille {
  titre: string;
  detail: string | null;
  href: string;
}

export interface GroupeTrouvailles {
  cle: string;
  libelle: string;
  trouvailles: Trouvaille[];
  /** Il y en a d'autres : la page de la liste les montre toutes. */
  plus: boolean;
  /** La liste complète, avec la recherche posée. */
  hrefTout: string;
}

interface Source {
  cle: string;
  libelle: string;
  /** Écran qui montre ces fiches : la source suit sa visibilité. */
  racine: string;
  /** Liste complète, recherche posée. */
  tout: (q: string) => string;
  chercher: (org: string, mots: string[], limite: number) => Promise<Trouvaille[]>;
}

const avecQ = (chemin: string) => (q: string) => `${chemin}?q=${encodeURIComponent(q)}`;
const joindre = (...parties: (string | null | undefined)[]) => parties.filter(Boolean).join(" · ") || null;

const SOURCES: Source[] = [
  {
    cle: "clients",
    libelle: "Clients",
    racine: "/commercial",
    tout: avecQ("/commercial"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ nom: tiers.nom, code: tiers.code, ville: tiers.ville, telephone: tiers.telephone })
        .from(tiers)
        .where(and(eq(tiers.organizationId, org), isNull(tiers.deletedAt), eq(tiers.estClient, true), motsDans([tiers.nom, tiers.code, tiers.telephone, tiers.email, tiers.ville, tiers.identifiantFiscal], mots)))
        .orderBy(asc(tiers.nom))
        .limit(limite);
      return lignes.map((t) => ({ titre: t.nom, detail: joindre(t.code, t.ville, t.telephone), href: `/commercial?q=${encodeURIComponent(t.nom)}` }));
    },
  },
  {
    cle: "fournisseurs",
    libelle: "Fournisseurs",
    racine: "/commercial/fournisseurs",
    tout: avecQ("/commercial/fournisseurs"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ nom: tiers.nom, code: tiers.code, ville: tiers.ville, telephone: tiers.telephone })
        .from(tiers)
        .where(and(eq(tiers.organizationId, org), isNull(tiers.deletedAt), eq(tiers.estFournisseur, true), motsDans([tiers.nom, tiers.code, tiers.telephone, tiers.email, tiers.ville, tiers.identifiantFiscal], mots)))
        .orderBy(asc(tiers.nom))
        .limit(limite);
      return lignes.map((t) => ({ titre: t.nom, detail: joindre(t.code, t.ville, t.telephone), href: `/commercial/fournisseurs?q=${encodeURIComponent(t.nom)}` }));
    },
  },
  {
    cle: "salaries",
    libelle: "Salariés",
    racine: "/rh",
    tout: avecQ("/rh"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: employees.id, nom: employees.nom, matricule: employees.matricule, poste: employees.poste, service: employees.service })
        .from(employees)
        .where(and(eq(employees.organizationId, org), isNull(employees.deletedAt), motsDans([employees.nom, employees.matricule, employees.poste, employees.service, employees.telephone, employees.emailProfessionnel, employees.numeroCnps], mots)))
        .orderBy(asc(employees.nom))
        .limit(limite);
      return lignes.map((e) => ({ titre: e.nom, detail: joindre(e.matricule, e.poste, e.service), href: `/rh/salaries/${e.id}` }));
    },
  },
  {
    cle: "intervenants",
    libelle: "Intervenants",
    racine: "/rh/intervenants",
    tout: avecQ("/rh/intervenants"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ nom: workers.nom, code: workers.code, qualification: workers.qualification, affectation: workers.affectation })
        .from(workers)
        .where(and(eq(workers.organizationId, org), isNull(workers.deletedAt), motsDans([workers.nom, workers.code, workers.qualification, workers.telephone, workers.affectation], mots)))
        .orderBy(asc(workers.nom))
        .limit(limite);
      return lignes.map((w) => ({ titre: w.nom, detail: joindre(w.code, w.qualification, w.affectation), href: `/rh/intervenants?q=${encodeURIComponent(w.nom)}` }));
    },
  },
  {
    cle: "projets",
    libelle: "Projets",
    racine: "/projets",
    tout: avecQ("/projets"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: projets.id, nom: projets.nom, code: projets.code, debut: projets.debut })
        .from(projets)
        .where(and(eq(projets.organizationId, org), isNull(projets.deletedAt), motsDans([projets.nom, projets.code, projets.description], mots)))
        .orderBy(desc(projets.debut))
        .limit(limite);
      return lignes.map((p) => ({ titre: p.nom, detail: joindre(p.code, p.debut ? `depuis le ${fmtDateIso(p.debut)}` : null), href: `/projets/${p.id}` }));
    },
  },
  {
    cle: "prestataires",
    libelle: "Prestataires",
    racine: "/prestataires",
    tout: avecQ("/prestataires"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: prestataires.id, nom: tiers.nom, metiers: prestataires.metiers, zone: prestataires.zone })
        .from(prestataires)
        .innerJoin(tiers, eq(tiers.id, prestataires.tiersId))
        .where(and(eq(prestataires.organizationId, org), isNull(prestataires.deletedAt), motsDans([tiers.nom, tiers.telephone, sql`array_to_string(${prestataires.metiers}, ' ')`, prestataires.specialites, prestataires.zone], mots)))
        .orderBy(asc(tiers.nom))
        .limit(limite);
      return lignes.map((p) => ({ titre: p.nom, detail: joindre(p.metiers.join(", "), p.zone), href: `/prestataires/${p.id}` }));
    },
  },
  {
    cle: "vehicules",
    libelle: "Véhicules",
    racine: "/parc-auto",
    tout: avecQ("/parc-auto"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: actifs.id, designation: actifs.designation, code: actifs.code, immatriculation: vehicules.immatriculation })
        .from(actifs)
        .innerJoin(vehicules, eq(vehicules.actifId, actifs.id))
        .where(and(eq(actifs.organizationId, org), isNull(actifs.deletedAt), motsDans([actifs.designation, actifs.code, vehicules.immatriculation, vehicules.marque, vehicules.modele, vehicules.numeroChassis], mots)))
        .orderBy(asc(actifs.designation))
        .limit(limite);
      return lignes.map((v) => ({ titre: v.designation, detail: joindre(v.immatriculation, v.code), href: `/parc-auto/${v.id}` }));
    },
  },
  {
    cle: "informatique",
    libelle: "Parc informatique",
    racine: "/parc-informatique",
    tout: avecQ("/parc-informatique"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: actifs.id, designation: actifs.designation, code: actifs.code, numeroSerie: equipementsInformatiques.numeroSerie })
        .from(actifs)
        .innerJoin(equipementsInformatiques, eq(equipementsInformatiques.actifId, actifs.id))
        .where(
          and(
            eq(actifs.organizationId, org),
            isNull(actifs.deletedAt),
            motsDans([actifs.designation, actifs.code, equipementsInformatiques.marque, equipementsInformatiques.modele, equipementsInformatiques.numeroSerie, equipementsInformatiques.nomReseau, equipementsInformatiques.adresseIp], mots),
          ),
        )
        .orderBy(asc(actifs.designation))
        .limit(limite);
      return lignes.map((e) => ({ titre: e.designation, detail: joindre(e.code, e.numeroSerie), href: `/parc-informatique/${e.id}` }));
    },
  },
  {
    cle: "materiels",
    libelle: "Matériels",
    racine: "/actifs",
    tout: avecQ("/actifs"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ designation: actifs.designation, code: actifs.code, site: actifs.site })
        .from(actifs)
        .where(and(eq(actifs.organizationId, org), isNull(actifs.deletedAt), inArray(actifs.type, ["engin", "mobilier"]), motsDans([actifs.designation, actifs.code, actifs.site], mots)))
        .orderBy(asc(actifs.designation))
        .limit(limite);
      return lignes.map((a) => ({ titre: a.designation, detail: joindre(a.code, a.site), href: `/actifs?q=${encodeURIComponent(a.code ?? a.designation)}` }));
    },
  },
  {
    cle: "locaux",
    libelle: "Locaux",
    racine: "/moyens-generaux/locaux",
    tout: avecQ("/moyens-generaux/locaux"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ designation: actifs.designation, code: actifs.code, site: actifs.site })
        .from(actifs)
        .where(and(eq(actifs.organizationId, org), isNull(actifs.deletedAt), eq(actifs.type, "local"), motsDans([actifs.designation, actifs.code, actifs.site], mots)))
        .orderBy(asc(actifs.designation))
        .limit(limite);
      return lignes.map((a) => ({ titre: a.designation, detail: joindre(a.code, a.site), href: `/moyens-generaux/locaux?q=${encodeURIComponent(a.designation)}` }));
    },
  },
  {
    cle: "fournitures",
    libelle: "Fournitures",
    racine: "/moyens-generaux",
    tout: avecQ("/moyens-generaux"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ designation: fournitures.designation, unite: fournitures.unite })
        .from(fournitures)
        .where(and(eq(fournitures.organizationId, org), isNull(fournitures.deletedAt), eq(fournitures.actif, true), motsDans([fournitures.designation, fournitures.unite], mots)))
        .orderBy(asc(fournitures.designation))
        .limit(limite);
      return lignes.map((f) => ({ titre: f.designation, detail: f.unite, href: `/moyens-generaux?q=${encodeURIComponent(f.designation)}` }));
    },
  },
  {
    cle: "pieces",
    libelle: "Devis et factures",
    racine: "/commercial/factures",
    tout: avecQ("/commercial/factures"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ numero: piecesCommerciales.numero, nature: piecesCommerciales.nature, client: piecesCommerciales.clientNom, date: piecesCommerciales.datePiece })
        .from(piecesCommerciales)
        .where(and(eq(piecesCommerciales.organizationId, org), isNull(piecesCommerciales.deletedAt), motsDans([piecesCommerciales.numero, piecesCommerciales.clientNom, piecesCommerciales.contactNom], mots)))
        .orderBy(desc(piecesCommerciales.datePiece))
        .limit(limite);
      return lignes.map((p) => ({
        titre: `${NATURE[p.nature]} ${p.numero ?? "(brouillon)"}`,
        detail: joindre(p.client, p.date ? fmtDateIso(p.date) : null),
        href: `/commercial/factures?q=${encodeURIComponent(p.numero ?? p.client ?? "")}`,
      }));
    },
  },
  {
    cle: "achats",
    libelle: "Factures fournisseurs",
    racine: "/achats",
    tout: avecQ("/achats/factures"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ numero: facturesFournisseur.numero, reference: facturesFournisseur.referenceFournisseur, fournisseur: facturesFournisseur.fournisseurNom, date: facturesFournisseur.dateFacture })
        .from(facturesFournisseur)
        .where(and(eq(facturesFournisseur.organizationId, org), isNull(facturesFournisseur.deletedAt), motsDans([facturesFournisseur.numero, facturesFournisseur.referenceFournisseur, facturesFournisseur.fournisseurNom], mots)))
        .orderBy(desc(facturesFournisseur.dateFacture))
        .limit(limite);
      return lignes.map((f) => ({
        titre: `${f.numero}${f.reference ? ` (réf. ${f.reference})` : ""}`,
        detail: joindre(f.fournisseur, f.date ? fmtDateIso(f.date) : null),
        href: `/achats/factures?q=${encodeURIComponent(f.numero)}`,
      }));
    },
  },
  {
    cle: "soumissions",
    libelle: "Appels d'offres",
    racine: "/marches",
    tout: avecQ("/marches"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: soumissions.id, numero: soumissions.numero, intitule: soumissions.intitule, autorite: soumissions.autorite })
        .from(soumissions)
        .where(and(eq(soumissions.organizationId, org), isNull(soumissions.deletedAt), motsDans([soumissions.numero, soumissions.reference, soumissions.intitule, soumissions.autorite], mots)))
        .orderBy(desc(soumissions.createdAt))
        .limit(limite);
      return lignes.map((s) => ({ titre: s.intitule, detail: joindre(s.numero, s.autorite), href: `/marches/soumissions/${s.id}` }));
    },
  },
  {
    cle: "conventions",
    libelle: "Conventions",
    racine: "/marches/conventions",
    tout: avecQ("/marches/conventions"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: conventions.id, numero: conventions.numero, intitule: conventions.intitule, partenaire: conventions.partenaire })
        .from(conventions)
        .where(and(eq(conventions.organizationId, org), isNull(conventions.deletedAt), motsDans([conventions.numero, conventions.intitule, conventions.partenaire, conventions.objet], mots)))
        .orderBy(desc(conventions.debut))
        .limit(limite);
      return lignes.map((c) => ({ titre: c.intitule, detail: joindre(c.numero, c.partenaire), href: `/marches/conventions/${c.id}` }));
    },
  },
  {
    cle: "consultations",
    libelle: "Consultations",
    racine: "/marches/consultations",
    tout: avecQ("/marches/consultations"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ id: consultations.id, numero: consultations.numero, objet: consultations.objet })
        .from(consultations)
        .where(and(eq(consultations.organizationId, org), isNull(consultations.deletedAt), motsDans([consultations.numero, consultations.objet, consultations.description], mots)))
        .orderBy(desc(consultations.createdAt))
        .limit(limite);
      return lignes.map((c) => ({ titre: c.objet, detail: c.numero, href: `/marches/consultations/${c.id}` }));
    },
  },
  {
    cle: "missions",
    libelle: "Missions",
    racine: "/missions",
    tout: avecQ("/missions"),
    chercher: async (org, mots, limite) => {
      const lignes = await db
        .select({ reference: missions.reference, titre: missions.titre, lieu: missions.lieu })
        .from(missions)
        .where(and(eq(missions.organizationId, org), isNull(missions.deletedAt), motsDans([missions.reference, missions.titre, missions.lieu], mots)))
        .orderBy(desc(missions.createdAt))
        .limit(limite);
      return lignes.map((m) => ({ titre: m.titre, detail: joindre(m.reference, m.lieu), href: `/missions?q=${encodeURIComponent(m.reference ?? m.titre)}` }));
    },
  },
];

const NATURE: Record<"devis" | "facture" | "avoir", string> = { devis: "Devis", facture: "Facture", avoir: "Avoir" };

/** Clés des sources, pour vérifier qu'aucune n'est oubliée par les tests. */
export const CLES_SOURCES = SOURCES.map((s) => s.cle);

/**
 * Cherche dans toutes les sources visibles, en parallèle.
 *
 * `visible` dit si un écran est ouvert à la session (droit et module) ;
 * une source dont l'écran ne l'est pas n'est même pas interrogée.
 */
export async function rechercherPartout(
  organizationId: string,
  q: string,
  mots: string[],
  visible: (racine: string) => boolean,
  parSource = 5,
): Promise<GroupeTrouvailles[]> {
  if (mots.length === 0) return [];
  const groupes = await Promise.all(
    SOURCES.filter((s) => visible(s.racine)).map(async (s) => {
      const trouvailles = await s.chercher(organizationId, mots, parSource + 1);
      return { cle: s.cle, libelle: s.libelle, trouvailles: trouvailles.slice(0, parSource), plus: trouvailles.length > parSource, hrefTout: s.tout(q) };
    }),
  );
  return groupes.filter((g) => g.trouvailles.length > 0);
}
