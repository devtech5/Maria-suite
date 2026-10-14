/**
 * Schéma de fondation de Maria Suite.
 *
 * Ce dossier ne contient que le socle transverse : entreprises, comptes,
 * droits, numérotation, journal d'audit et synchronisation. Les tables métier
 * (articles, ventes, écritures, employés…) vivent dans leur module respectif,
 * sous src/modules, et sont réexportées ici.
 */
export * from "./_shared";
export * from "./auth";
export * from "./rbac";
export * from "./tenancy";
export * from "./sequences";
export * from "./codes";
export * from "./audit";
export * from "./sync";
export * from "./abonnement";

// ------------------------------------------------------------- modules métier
// L'ordre suit les dépendances : un article pointe vers son fournisseur.
export * from "@/modules/tiers/schema";
export * from "@/modules/catalogue/schema";
export * from "@/modules/stock/schema";
export * from "@/modules/ventes/schema";
export * from "@/modules/ventes/schema-session";
export * from "@/modules/comptabilite/schema";
export * from "@/modules/personnes/schema";
export * from "@/modules/commerciaux/schema";
export * from "@/modules/actifs/schema";
export * from "@/modules/documents/schema";
export * from "@/modules/archives/schema";
export * from "@/modules/taches/schema";
export * from "@/modules/planning/schema";
export * from "@/modules/meeting/schema";
export * from "@/modules/tresorerie/schema";
export * from "@/modules/achats/schema";
export * from "@/modules/paie/schema";
export * from "@/modules/fiscalite/schema";
export * from "@/modules/missions/schema";
export * from "@/modules/facturation/schema";
export * from "@/modules/reservations/schema";
export * from "@/modules/billetterie/schema";
export * from "@/modules/monnaie/schema";
export * from "@/modules/projets/schema";
export * from "@/modules/parc-auto/schema";
export * from "@/modules/parc-informatique/schema";
export * from "@/modules/communication/schema";
export * from "@/modules/messagerie/schema";
export * from "@/modules/prestataires/schema";
export * from "@/modules/marches/schema";
export * from "@/modules/boite-mail/schema";
export * from "@/modules/presences/schema";
export * from "@/modules/restauration/schema";
export * from "@/modules/enquetes/schema";
export * from "@/modules/securite/schema";
export * from "@/modules/hotellerie/schema";
