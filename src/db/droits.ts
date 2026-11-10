import { DROITS, PRESETS_ROLES, type DefinitionDroit, type PresetRole } from "@/lib/droits/catalogue";

/**
 * Recopie le catalogue des droits dans `permissions` et pose les rôles
 * préréglés manquants — l'équivalent de `pnpm db:droits`, appelable depuis le
 * serveur.
 *
 * Sert à la base locale PGlite, qu'aucun script extérieur ne peut ouvrir
 * pendant que le serveur la tient : la synchronisation se fait donc au
 * démarrage. Idempotente, comme le script.
 */
export type Executeur = (
  texte: string,
  valeurs?: unknown[],
) => Promise<{ rows: unknown[] }>;

export async function synchroniserDroits(executer: Executeur): Promise<void> {
  const catalogue: readonly DefinitionDroit[] = DROITS;

  for (const droit of catalogue) {
    await executer(
      `insert into permissions (key, module_key, label, description)
       values ($1, $2, $3, $4)
       on conflict (key) do update
         set module_key = excluded.module_key,
             label = excluded.label,
             description = excluded.description`,
      [droit.cle, droit.moduleKey, droit.libelle, droit.description ?? null],
    );
  }

  // Un rôle de métier ne se crée que là où l'un de ses modules est ouvert :
  // pas de magasinier dans une entreprise sans stock (`presetEnService`).
  for (const preset of PRESETS_ROLES) {
    const modules: readonly string[] = (preset as PresetRole).modules ?? [];
    await executer(
      `insert into roles (organization_id, key, name, description, is_system)
       select o.id, $1, $2, $3, true from organizations o
       where cardinality($4::text[]) = 0
          or exists (
            select 1 from unnest($4::text[]) as m(cle)
            where not exists (
              select 1 from organization_modules om
              where om.organization_id = o.id and om.module_key = m.cle and not om.enabled
            )
          )
       on conflict (organization_id, key) do nothing`,
      [preset.cle, preset.nom, preset.description, [...modules]],
    );
  }
}
