import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/db";
import { creerSalariePour } from "@/modules/personnes/creation";
import {
  annulerPermissionPour,
  deciderPermissionPour,
  demanderCongePour,
  demanderPermissionPour,
  reglagesDe,
} from "@/modules/presences/creation";
import { listerPermissions, registre, soldesConges } from "@/modules/presences/requetes";

import { ouvrirBaseDeTest, semerEntreprise } from "./base";

let db: typeof Db;
let fermer: () => Promise<void>;
let org: string;
let user: string;

beforeAll(async () => {
  ({ db, fermer } = await ouvrirBaseDeTest());
  ({ organizationId: org, userId: user } = await semerEntreprise(db));
});
afterAll(async () => fermer());

const AUJOURDHUI = "2026-10-05";

describe("permissions et absences en base", () => {
  it("demande, chevauchement, décision avec traitement, solde, registre, annulation", async () => {
    const { id: salarie } = await creerSalariePour(org, { nom: "Awa Comptable", poste: "Comptable", debut: "2025-01-06", salaireBase: 300_000 }, user);
    const base = { employeeId: salarie, motif: "medical" as const, precision: null };

    // Permission de deux heures, mardi 6 octobre.
    const p = await demanderPermissionPour(org, user, { ...base, genre: "heures", debut: "2026-10-06", fin: "2026-10-06", heureDebut: "10:00", heureFin: "12:00" }, { aujourdhui: AUJOURDHUI, accorder: null });
    expect(p.numero).toBe("PERM-2026-00001");
    expect(p.minutes).toBe(120);

    // Une plage qui croise la première est refusée ; une plage voisine passe.
    await expect(
      demanderPermissionPour(org, user, { ...base, genre: "heures", debut: "2026-10-06", fin: "2026-10-06", heureDebut: "11:30", heureFin: "13:00" }, { aujourdhui: AUJOURDHUI, accorder: null }),
    ).rejects.toThrow(/PERM-2026-00001/);
    const voisine = await demanderPermissionPour(
      org,
      user,
      { ...base, genre: "heures", debut: "2026-10-06", fin: "2026-10-06", heureDebut: "15:00", heureFin: "16:00" },
      { aujourdhui: AUJOURDHUI, accorder: null },
    );

    // Un dimanche n'est pas travaillé.
    await expect(
      demanderPermissionPour(org, user, { ...base, genre: "heures", debut: "2026-10-11", fin: "2026-10-11", heureDebut: "10:00", heureFin: "11:00" }, { aujourdhui: AUJOURDHUI, accorder: null }),
    ).rejects.toThrow(/pas travaillé/);

    // Accorder exige un traitement ; refuser, un motif.
    await expect(deciderPermissionPour(org, user, p.id, "approuve", null, null)).rejects.toThrow(/traité/);
    await expect(deciderPermissionPour(org, user, voisine.id, "refuse", null, " ")).rejects.toThrow(/pourquoi/);
    await deciderPermissionPour(org, user, voisine.id, "refuse", null, "Réunion de clôture à 15 h");

    // Déduite des congés : 2 h sur une journée de 9 h (8 h – 17 h) = 0,22 jour.
    const r = await reglagesDe(org);
    const [avant] = await soldesConges(org, r, AUJOURDHUI, [salarie]);
    await deciderPermissionPour(org, user, p.id, "approuve", "deduite_conges", null);
    await expect(deciderPermissionPour(org, user, p.id, "approuve", "payee", null)).rejects.toThrow(/déjà été traitée/);
    const [apres] = await soldesConges(org, r, AUJOURDHUI, [salarie]);
    expect(avant.pris + 22).toBe(apres.pris);
    expect(apres.solde).toBe(avant.solde - 22);

    // Absence de trois jours (mercredi à vendredi), saisie par un responsable : accordée d'office, payée.
    const absence = await demanderPermissionPour(
      org,
      user,
      { ...base, motif: "familial", genre: "journees", debut: "2026-10-07", fin: "2026-10-09", heureDebut: "08:00", heureFin: "09:00" },
      { aujourdhui: AUJOURDHUI, accorder: "payee" },
    );
    expect(absence.jours).toBe(300);
    const liste = await listerPermissions(org, { employeeId: salarie });
    const lue = liste.find((l) => l.id === absence.id)!;
    // Les heures saisies pour une absence ne sont pas gardées.
    expect(lue).toMatchObject({ statut: "approuve", traitement: "payee", heureDebut: null, centiemesDeduits: 0, libelleMotif: "Événement familial" });

    // Un congé ne peut pas recouvrir une absence, et l'inverse non plus.
    await expect(
      demanderPermissionPour(org, user, { ...base, genre: "journees", debut: "2026-10-09", fin: "2026-10-12", heureDebut: null, heureFin: null }, { aujourdhui: AUJOURDHUI, accorder: null }),
    ).rejects.toThrow(/croise/);
    await demanderCongePour(org, user, { employeeId: salarie, nature: "paye", debut: "2026-10-19", fin: "2026-10-20", debutDemi: false, finDemi: false, motif: null }, { accorder: true });
    await expect(
      demanderPermissionPour(org, user, { ...base, genre: "heures", debut: "2026-10-19", fin: "2026-10-19", heureDebut: "10:00", heureFin: "11:00" }, { aujourdhui: AUJOURDHUI, accorder: null }),
    ).rejects.toThrow(/congé/);

    // Registre : les jours d'absence accordée sont « autorisés », pas « absents ».
    const { lignes } = await registre(org, "2026-10-05", "2026-10-09", r, "2026-10-12", "12:00");
    const awa = lignes.find((l) => l.salarie.id === salarie)!;
    expect(awa.jours.map((j) => j.etat)).toEqual(["absent", "absent", "permission", "permission", "permission"]);
    expect(awa.permissions).toBe(3);

    // Le collaborateur ne retire pas une permission entamée ; le responsable, si, et le solde revient.
    const autre = "00000000-0000-7000-8000-000000000001";
    await expect(annulerPermissionPour(org, autre, p.id, false, "2026-10-07")).rejects.toThrow(/vos propres/);
    await annulerPermissionPour(org, user, p.id, true, "2026-10-07");
    const [final] = await soldesConges(org, r, AUJOURDHUI, [salarie]);
    // Reste le congé payé des 19 et 20 octobre.
    expect(final.pris).toBe(avant.pris + 200);
  });

  it("refuse une régularisation trop ancienne, sauf saisie d'un responsable", async () => {
    const { id } = await creerSalariePour(org, { nom: "Koné Chauffeur", poste: "Chauffeur", debut: "2025-01-06", salaireBase: 150_000 }, user);
    const saisie = { employeeId: id, genre: "heures" as const, debut: "2026-08-03", fin: "2026-08-03", heureDebut: "09:00", heureFin: "10:00", motif: "administratif" as const, precision: null };
    await expect(demanderPermissionPour(org, user, saisie, { aujourdhui: AUJOURDHUI, accorder: null })).rejects.toThrow(/30 jours/);
    const cree = await demanderPermissionPour(org, user, saisie, { aujourdhui: AUJOURDHUI, accorder: "a_recuperer" });
    expect(cree.numero).toMatch(/^PERM-2026-\d{5}$/);
  });
});
