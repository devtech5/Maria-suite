import { describe, expect, it } from "vitest";

import { etatDuJour } from "@/modules/presences/calcul";
import {
  centiemesDeMinutes,
  formatDuree,
  formatNumeroPermission,
  minutesEntre,
  permissionsSeChevauchent,
  refusPermission,
} from "@/modules/presences/permissions";

describe("permissions : durées", () => {
  it("compte les minutes et les écrit lisiblement", () => {
    expect(minutesEntre("10:00", "12:30")).toBe(150);
    expect(formatDuree(150)).toBe("2 h 30");
    expect(formatDuree(45)).toBe("45 min");
    expect(formatDuree(180)).toBe("3 h");
  });

  it("convertit les minutes en centièmes de jour, en entiers, arrondi au plus proche", () => {
    // Journée de 9 h (540 min).
    expect(centiemesDeMinutes(540, 540)).toBe(100);
    expect(centiemesDeMinutes(270, 540)).toBe(50);
    expect(centiemesDeMinutes(120, 540)).toBe(22); // 22,2
    expect(centiemesDeMinutes(1, 540)).toBe(0); // 0,18
    expect(centiemesDeMinutes(3, 540)).toBe(1); // 0,56
    expect(centiemesDeMinutes(60, 0)).toBe(0);
  });
});

describe("permissions : contrôle d'une demande", () => {
  const heures = { genre: "heures" as const, debut: "2026-10-06", fin: "2026-10-06", heureDebut: "10:00", heureFin: "12:00" };

  it("accepte une permission d'heures bien formée", () => {
    expect(refusPermission(heures, "2026-10-05", false)).toBeNull();
  });

  it("refuse des heures absentes, inversées ou sur plusieurs jours", () => {
    expect(refusPermission({ ...heures, heureFin: null }, "2026-10-05", false)).toMatch(/heure/);
    expect(refusPermission({ ...heures, heureFin: "09:00" }, "2026-10-05", false)).toMatch(/suivre/);
    expect(refusPermission({ ...heures, fin: "2026-10-07" }, "2026-10-05", false)).toMatch(/seule journée/);
  });

  it("borne une absence à 31 jours, fin après début", () => {
    const absence = { genre: "journees" as const, debut: "2026-10-01", fin: "2026-10-31", heureDebut: null, heureFin: null };
    expect(refusPermission(absence, "2026-10-01", false)).toBeNull();
    expect(refusPermission({ ...absence, fin: "2026-11-01" }, "2026-10-01", false)).toMatch(/31 jours/);
    expect(refusPermission({ ...absence, fin: "2026-09-30" }, "2026-10-01", false)).toMatch(/précède/);
  });

  it("laisse régulariser 30 jours en arrière, sans limite pour un responsable", () => {
    expect(refusPermission({ ...heures, debut: "2026-09-05", fin: "2026-09-05" }, "2026-10-05", false)).toBeNull();
    expect(refusPermission({ ...heures, debut: "2026-09-04", fin: "2026-09-04" }, "2026-10-05", false)).toMatch(/30 jours/);
    expect(refusPermission({ ...heures, debut: "2026-01-04", fin: "2026-01-04" }, "2026-10-05", true)).toBeNull();
  });
});

describe("permissions : chevauchements", () => {
  const p = (debut: string, fin: string, heureDebut: string | null = null, heureFin: string | null = null) => ({ debut, fin, heureDebut, heureFin });

  it("croise les heures d'un même jour, pas des heures voisines", () => {
    expect(permissionsSeChevauchent(p("2026-10-06", "2026-10-06", "10:00", "12:00"), p("2026-10-06", "2026-10-06", "11:00", "13:00"))).toBe(true);
    expect(permissionsSeChevauchent(p("2026-10-06", "2026-10-06", "10:00", "12:00"), p("2026-10-06", "2026-10-06", "12:00", "13:00"))).toBe(false);
    expect(permissionsSeChevauchent(p("2026-10-06", "2026-10-06", "10:00", "12:00"), p("2026-10-07", "2026-10-07", "10:00", "12:00"))).toBe(false);
  });

  it("une absence couvre toutes les heures de ses jours", () => {
    expect(permissionsSeChevauchent(p("2026-10-05", "2026-10-07"), p("2026-10-06", "2026-10-06", "10:00", "11:00"))).toBe(true);
    expect(permissionsSeChevauchent(p("2026-10-05", "2026-10-07"), p("2026-10-08", "2026-10-09"))).toBe(false);
  });

  it("numérote PERM-AAAA-NNNNN, par année", () => {
    expect(formatNumeroPermission("2026")).toEqual({ cle: "permission", prefix: "PERM-2026-", padding: 5, periode: "2026" });
  });
});

describe("registre : absence autorisée", () => {
  it("un jour d'absence accordée n'est pas une absence, mais un congé l'emporte", () => {
    const base = {
      jour: "2026-10-06",
      aujourdhui: "2026-10-10",
      maintenant: "12:00",
      heureArrivee: "08:00",
      tolerance: 15,
      joursTravailles: [1, 2, 3, 4, 5],
      feries: new Map<string, string>(),
      contrat: { debut: "2025-01-01", fin: null },
    };
    expect(etatDuJour({ ...base, permission: true })).toEqual({ etat: "permission" });
    expect(etatDuJour({ ...base, permission: true, conge: "paye" })).toEqual({ etat: "conge", nature: "paye" });
    expect(etatDuJour({ ...base, permission: true, presence: { arrivee: "08:00", derniere: "17:00" } }).etat).toBe("present");
  });
});
