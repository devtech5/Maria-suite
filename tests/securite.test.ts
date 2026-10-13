import { describe, expect, it } from "vitest";

import {
  cheminFlux,
  configurationRelais,
  debitMontant,
  dispositionPour,
  lireChemin,
  relaisEnLigne,
  urlEnregistreur,
} from "@/modules/securite/calcul";

const SITE = "01a12ab8-7c29-721f-9bf5-41383e416059";
const CAMERA = "01a12aa0-f282-7269-ab9a-960e6808f9b7";

describe("chemins des flux", () => {
  it("se relisent, et refusent ce qui n'est pas un flux de site", () => {
    const chemin = cheminFlux(SITE, CAMERA, "sd");
    expect(chemin).toBe(`s/${SITE}/${CAMERA}/sd`);
    expect(lireChemin(chemin)).toEqual({ siteId: SITE, cameraId: CAMERA, qualite: "sd" });
    expect(lireChemin(`/${chemin}`)).not.toBeNull();
    expect(lireChemin(`s/${SITE}/${CAMERA}/4k`)).toBeNull();
    expect(lireChemin(`s/${SITE}/../${CAMERA}/sd`)).toBeNull();
    expect(lireChemin("")).toBeNull();
  });
});

describe("adresses des enregistreurs", () => {
  it("Hikvision : canal et flux dans le numéro de piste", () => {
    expect(urlEnregistreur("hikvision", "192.168.1.64", 554, 3, "hd")).toBe(
      "rtsp://${NVR_UTILISATEUR}:${NVR_MOT_DE_PASSE}@192.168.1.64:554/Streaming/Channels/301",
    );
    expect(urlEnregistreur("hikvision", "192.168.1.64", 554, 12, "sd")).toBe(
      "rtsp://${NVR_UTILISATEUR}:${NVR_MOT_DE_PASSE}@192.168.1.64:554/Streaming/Channels/1202",
    );
  });

  it("Dahua : canal et sous-type en paramètres", () => {
    expect(urlEnregistreur("dahua", "10.0.0.20", 554, 2, "sd")).toBe(
      "rtsp://${NVR_UTILISATEUR}:${NVR_MOT_DE_PASSE}@10.0.0.20:554/cam/realmonitor?channel=2&subtype=1",
    );
  });
});

describe("configuration du relais", () => {
  const contenu = configurationRelais({
    id: SITE,
    nom: "Magasin Yopougon",
    marque: "hikvision",
    adresse: "192.168.1.64",
    port: 554,
    publication: "video.exemple.ci:8322",
    cameras: [
      { id: CAMERA, nom: "Caisse # 1", canal: 1, hd: true },
      { id: SITE, nom: "Réserve", canal: 2, hd: false },
    ],
  });

  it("publie la mosaïque de chaque caméra, et la HD seulement quand elle est prévue", () => {
    expect(contenu).toContain(`c1_sd: rtsps://${SITE}:\${RELAIS_CLE}@video.exemple.ci:8322/s/${SITE}/${CAMERA}/sd`);
    expect(contenu).toContain(`c1_hd: rtsps://${SITE}:\${RELAIS_CLE}@video.exemple.ci:8322/s/${SITE}/${CAMERA}/hd`);
    expect(contenu).toContain("c2_sd:");
    expect(contenu).not.toContain("c2_hd:");
  });

  it("ne contient aucun secret, et neutralise un nom qui casserait le fichier", () => {
    expect(contenu).toContain("${NVR_MOT_DE_PASSE}");
    expect(contenu).toContain("${RELAIS_CLE}");
    expect(contenu).toContain("# Caisse   1");
    expect(contenu).toContain('listen: "127.0.0.1:1984"');
  });
});

describe("exploitation", () => {
  it("chiffre le débit montant à tenir", () => {
    expect(debitMontant([{ hd: false }, { hd: true }])).toBe(512 + 512 + 2048);
    expect(debitMontant([])).toBe(0);
  });

  it("voit un relais en ligne s'il a publié depuis moins de cinq minutes", () => {
    const maintenant = new Date("2026-10-11T12:00:00Z");
    expect(relaisEnLigne(new Date("2026-10-11T11:56:00Z"), maintenant)).toBe(true);
    expect(relaisEnLigne(new Date("2026-10-11T11:54:00Z"), maintenant)).toBe(false);
    expect(relaisEnLigne(null, maintenant)).toBe(false);
  });

  it("choisit la plus petite mosaïque qui tient toutes les caméras", () => {
    expect([1, 2, 4, 5, 9, 10, 30].map(dispositionPour)).toEqual([1, 4, 4, 9, 9, 16, 16]);
  });
});
