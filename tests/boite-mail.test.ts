import { describe, expect, it } from "vitest";

import { deviner, documentCourriel, libelleDossier, rangDossier } from "@/modules/boite-mail/fournisseurs";

describe("réglages de boîte mail", () => {
  it("reconnaît les grands fournisseurs", () => {
    expect(deviner("awa@gmail.com")).toMatchObject({ imapHote: "imap.gmail.com", smtpPort: 465, smtpSecurise: true });
    expect(deviner("Awa@Yahoo.FR").imapHote).toBe("imap.mail.yahoo.com");
    expect(deviner("x@hotmail.com")).toMatchObject({ smtpPort: 587, smtpSecurise: false });
  });
  it("envoie les adresses de MARIA GROUP chez Hostinger, avec le mot de passe de la boîte", () => {
    expect(deviner("Awa.Kone@Maria-Groupe.com")).toMatchObject({
      fournisseur: "Hostinger",
      imapHote: "imap.hostinger.com",
      imapPort: 993,
      imapSecurise: true,
      smtpHote: "smtp.hostinger.com",
      smtpPort: 465,
      smtpSecurise: true,
      motDePasse: "boite",
    });
    expect(deviner("awa@gmail.com").motDePasse).toBe("application");
  });
  it("devine l'hébergeur d'un domaine d'entreprise", () => {
    expect(deviner("contact@quincaillerie.ci")).toMatchObject({ imapHote: "mail.quincaillerie.ci", smtpHote: "mail.quincaillerie.ci", fournisseur: "Hébergeur" });
  });
});

describe("dossiers", () => {
  it("nomme et range les dossiers selon leur usage", () => {
    expect(libelleDossier("INBOX")).toBe("Boîte de réception");
    expect(libelleDossier("[Gmail]/Sent Mail", "\\Sent")).toBe("Envoyés");
    expect(libelleDossier("INBOX.Factures")).toBe("Factures");
    expect(rangDossier("INBOX")).toBeLessThan(rangDossier("[Gmail]/Corbeille", "\\Trash"));
  });
});

describe("affichage d'un e-mail", () => {
  it("bloque scripts et images distantes par défaut", () => {
    const doc = documentCourriel("<p>Bonjour</p>", false);
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("img-src data: cid:;");
    expect(doc).not.toContain("script-src");
    expect(documentCourriel("<p>x</p>", true)).toContain("https:");
  });
});
