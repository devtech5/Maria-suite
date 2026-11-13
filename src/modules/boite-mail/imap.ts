import "server-only";

import { ImapFlow, type FetchMessageObject, type MessageStructureObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

import { libelleDossier, rangDossier } from "./fournisseurs";

/**
 * Adaptateur de messagerie : le seul fichier qui connaisse IMAP, MIME et
 * SMTP. Chaque appel ouvre sa connexion, fait son travail et la ferme — rien
 * ne reste ouvert entre deux requêtes, ce qui tient sur n'importe quel
 * hébergement.
 */

export interface Connexion {
  adresse: string;
  nomAffiche: string | null;
  imapHote: string;
  imapPort: number;
  imapSecurise: boolean;
  smtpHote: string;
  smtpPort: number;
  smtpSecurise: boolean;
  identifiant: string;
  motDePasse: string;
}

const DELAI_MS = 20_000;

/** Erreur lisible pour l'utilisateur, sans détail technique ni secret. */
export function messageErreur(erreur: unknown): string {
  const e = erreur as { authenticationFailed?: boolean; code?: string; responseCode?: number; message?: string };
  const texte = `${e?.message ?? ""} ${e?.code ?? ""}`.toLowerCase();
  if (e?.authenticationFailed || e?.responseCode === 535 || /auth|login|credentials|invalid/.test(texte)) {
    return "Identifiant ou mot de passe refusé par le fournisseur. Gmail, Yahoo et Outlook exigent un « mot de passe d'application ».";
  }
  if (/enotfound|eai_again/.test(texte)) return "Serveur introuvable : vérifiez le nom du serveur.";
  if (/timeout|timedout|etimedout|econnrefused|ehostunreach/.test(texte)) return "Serveur injoignable : vérifiez le serveur, le port et la connexion internet.";
  if (/certificate|self signed|tls|ssl/.test(texte)) return "Connexion sécurisée refusée : vérifiez le port et le mode de sécurité.";
  return "La boîte mail n'a pas répondu comme prévu. Réessayez dans un instant.";
}

function avecDelai<T>(promesse: Promise<T>, ms = DELAI_MS): Promise<T> {
  return Promise.race([promesse, new Promise<T>((_, rejeter) => setTimeout(() => rejeter(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), ms))]);
}

async function avecImap<T>(c: Connexion, travail: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: c.imapHote,
    port: c.imapPort,
    secure: c.imapSecurise,
    auth: { user: c.identifiant, pass: c.motDePasse },
    logger: false,
    disableAutoIdle: true,
  });
  // Une erreur de socket après coup ne doit pas faire tomber le serveur.
  client.on("error", () => undefined);
  await avecDelai(client.connect());
  try {
    return await avecDelai(travail(client), 60_000);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

function transport(c: Connexion) {
  return nodemailer.createTransport({
    host: c.smtpHote,
    port: c.smtpPort,
    secure: c.smtpSecurise,
    requireTLS: !c.smtpSecurise,
    auth: { user: c.identifiant, pass: c.motDePasse },
    connectionTimeout: DELAI_MS,
    greetingTimeout: DELAI_MS,
  });
}

/** Vérifie les deux sens avant d'enregistrer quoi que ce soit : lire (IMAP) et envoyer (SMTP). */
export async function verifier(c: Connexion): Promise<void> {
  await avecImap(c, async () => undefined);
  await avecDelai(transport(c).verify());
}

export interface Dossier {
  chemin: string;
  libelle: string;
  usage: string | null;
  nonLus: number;
  total: number;
}

export async function dossiers(c: Connexion): Promise<Dossier[]> {
  return avecImap(c, async (client) => {
    const liste = await client.list({ statusQuery: { messages: true, unseen: true } });
    return liste
      .filter((d) => !d.flags.has("\\Noselect"))
      .map((d) => ({
        chemin: d.path,
        libelle: libelleDossier(d.path, d.specialUse),
        usage: d.specialUse ?? (d.path.toUpperCase() === "INBOX" ? "\\Inbox" : null),
        nonLus: d.status?.unseen ?? 0,
        total: d.status?.messages ?? 0,
      }))
      .sort((a, b) => rangDossier(a.chemin, a.usage) - rangDossier(b.chemin, b.usage) || a.libelle.localeCompare(b.libelle, "fr"));
  });
}

export interface ApercuMessage {
  uid: number;
  de: string;
  adresse: string | null;
  objet: string;
  date: string | null;
  lu: boolean;
  suivi: boolean;
  taille: number;
  /** Porte au moins une pièce jointe : le trombone de la liste. */
  pieces: boolean;
}

/**
 * Une pièce jointe se reconnaît à sa disposition, ou à un nom de fichier sur
 * une partie qui n'est pas du texte. Une image incorporée au HTML (Content-ID,
 * logo de signature) n'en est pas une.
 */
function aDesPieces(n: MessageStructureObject | undefined): boolean {
  if (!n) return false;
  if (n.childNodes?.length) return n.childNodes.some(aDesPieces);
  if (n.disposition === "attachment") return true;
  const nomme = Boolean(n.dispositionParameters?.filename ?? n.parameters?.name);
  return nomme && !n.type.startsWith("text/") && !(n.id && n.type.startsWith("image/"));
}

const CHAMPS_APERCU = { uid: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true } as const;

function apercu(m: FetchMessageObject): ApercuMessage {
  const de = m.envelope?.from?.[0];
  const date = m.envelope?.date ?? m.internalDate;
  return {
    uid: m.uid,
    de: de?.name || de?.address || "(expéditeur inconnu)",
    adresse: de?.address ?? null,
    objet: m.envelope?.subject || "(sans objet)",
    date: date ? new Date(date).toISOString() : null,
    lu: m.flags?.has("\\Seen") ?? false,
    suivi: m.flags?.has("\\Flagged") ?? false,
    taille: m.size ?? 0,
    pieces: aDesPieces(m.bodyStructure),
  };
}

/**
 * Recherche dans TOUT le dossier, chez le fournisseur : expéditeur, objet ou
 * texte. Les plus récents d'abord, `limite` au plus.
 */
export async function rechercher(c: Connexion, dossier: string, texte: string, limite = 60): Promise<{ messages: ApercuMessage[]; tronque: boolean }> {
  return avecImap(c, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      const trouves = await client.search({ or: [{ from: texte }, { subject: texte }, { body: texte }] }, { uid: true });
      if (!trouves || trouves.length === 0) return { messages: [], tronque: false };
      const gardes = trouves.slice(-limite);
      const liste: ApercuMessage[] = [];
      for await (const m of client.fetch(gardes.join(","), CHAMPS_APERCU, { uid: true })) liste.push(apercu(m));
      return { messages: liste.sort((a, b) => b.uid - a.uid), tronque: trouves.length > gardes.length };
    } finally {
      verrou.release();
    }
  });
}

/** Une page de messages, du plus récent au plus ancien. */
export async function messages(c: Connexion, dossier: string, page: number, parPage = 30): Promise<{ total: number; messages: ApercuMessage[] }> {
  return avecImap(c, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      const boite = client.mailbox;
      const total = boite ? boite.exists : 0;
      if (total === 0) return { total, messages: [] };
      const fin = Math.max(0, total - page * parPage);
      if (fin === 0) return { total, messages: [] };
      const debut = Math.max(1, fin - parPage + 1);
      const liste: ApercuMessage[] = [];
      for await (const m of client.fetch(`${debut}:${fin}`, CHAMPS_APERCU)) liste.push(apercu(m));
      return { total, messages: liste.reverse() };
    } finally {
      verrou.release();
    }
  });
}

function adresses(a: AddressObject | AddressObject[] | undefined): { nom: string | null; adresse: string }[] {
  const liste = Array.isArray(a) ? a : a ? [a] : [];
  return liste.flatMap((x) => x.value).filter((v) => v.address).map((v) => ({ nom: v.name || null, adresse: v.address! }));
}

export interface MessageLu {
  uid: number;
  objet: string;
  de: { nom: string | null; adresse: string }[];
  a: { nom: string | null; adresse: string }[];
  cc: { nom: string | null; adresse: string }[];
  date: string | null;
  texte: string;
  html: string | null;
  pieces: { index: number; nom: string; type: string; taille: number }[];
  messageId: string | null;
  references: string[];
}

/** Lit un message entier et le marque comme lu. Les images internes (cid:) sont incorporées. */
export async function lire(c: Connexion, dossier: string, uid: number): Promise<MessageLu | null> {
  return avecImap(c, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      const brut = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!brut || !brut.source) return null;
      const m = await simpleParser(brut.source);
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      let html = typeof m.html === "string" ? m.html : null;
      const pieces: MessageLu["pieces"] = [];
      m.attachments.forEach((p, index) => {
        if (html && p.contentId && p.related && p.size < 2_000_000) {
          const cid = p.contentId.replace(/^<|>$/g, "");
          html = html.split(`cid:${cid}`).join(`data:${p.contentType};base64,${p.content.toString("base64")}`);
        } else {
          pieces.push({ index, nom: p.filename || `pièce ${index + 1}`, type: p.contentType, taille: p.size });
        }
      });
      const refs = m.references;
      return {
        uid,
        objet: m.subject || "(sans objet)",
        de: adresses(m.from),
        a: adresses(m.to),
        cc: adresses(m.cc),
        date: m.date ? m.date.toISOString() : null,
        texte: m.text ?? "",
        html,
        pieces,
        messageId: m.messageId ?? null,
        references: Array.isArray(refs) ? refs : refs ? [refs] : [],
      };
    } finally {
      verrou.release();
    }
  });
}

export async function pieceJointe(c: Connexion, dossier: string, uid: number, index: number): Promise<{ nom: string; type: string; contenu: Buffer } | null> {
  return avecImap(c, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      const brut = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!brut || !brut.source) return null;
      const p = (await simpleParser(brut.source)).attachments[index];
      return p ? { nom: p.filename || "piece-jointe", type: p.contentType, contenu: p.content } : null;
    } finally {
      verrou.release();
    }
  });
}

async function dossierParUsage(client: ImapFlow, usage: string): Promise<string | null> {
  const liste = await client.list();
  return liste.find((d) => d.specialUse === usage)?.path ?? null;
}

/** Met à la corbeille ; depuis la corbeille, supprime pour de bon. */
export async function corbeille(c: Connexion, dossier: string, uid: number): Promise<void> {
  await avecImap(c, async (client) => {
    const poubelle = await dossierParUsage(client, "\\Trash");
    const verrou = await client.getMailboxLock(dossier);
    try {
      if (!poubelle || poubelle === dossier) await client.messageDelete(String(uid), { uid: true });
      else await client.messageMove(String(uid), poubelle, { uid: true });
    } finally {
      verrou.release();
    }
  });
}

/** Range dans le dossier Archives du fournisseur. Sans dossier Archives déclaré, refuse plutôt que deviner. */
export async function archiver(c: Connexion, dossier: string, uid: number): Promise<boolean> {
  return avecImap(c, async (client) => {
    const archives = await dossierParUsage(client, "\\Archive");
    if (!archives || archives === dossier) return false;
    const verrou = await client.getMailboxLock(dossier);
    try {
      await client.messageMove(String(uid), archives, { uid: true });
      return true;
    } finally {
      verrou.release();
    }
  });
}

/** Pose ou retire le drapeau de suivi (\Flagged), le même que chez le fournisseur. */
export async function marquerSuivi(c: Connexion, dossier: string, uid: number, suivi: boolean): Promise<void> {
  await avecImap(c, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      if (suivi) await client.messageFlagsAdd(String(uid), ["\\Flagged"], { uid: true });
      else await client.messageFlagsRemove(String(uid), ["\\Flagged"], { uid: true });
    } finally {
      verrou.release();
    }
  });
}

export async function marquerNonLu(c: Connexion, dossier: string, uid: number): Promise<void> {
  await avecImap(c, async (client) => {
    const verrou = await client.getMailboxLock(dossier);
    try {
      await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
    } finally {
      verrou.release();
    }
  });
}

export interface Envoi {
  a: string[];
  cc: string[];
  objet: string;
  texte: string;
  pieces: { nom: string; type: string; contenu: Buffer }[];
  enReponseA?: string | null;
  references?: string[];
}

/**
 * Envoie par SMTP, puis range une copie dans « Envoyés ». Gmail range seul
 * ses envois : on ne la double pas.
 */
export async function envoyer(c: Connexion, e: Envoi): Promise<void> {
  const brut = await new MailComposer({
    from: c.nomAffiche ? { name: c.nomAffiche, address: c.adresse } : c.adresse,
    to: e.a,
    cc: e.cc.length ? e.cc : undefined,
    subject: e.objet,
    text: e.texte,
    inReplyTo: e.enReponseA ?? undefined,
    references: e.references?.length ? e.references : undefined,
    attachments: e.pieces.map((p) => ({ filename: p.nom, contentType: p.type, content: p.contenu })),
  })
    .compile()
    .build();
  await avecDelai(transport(c).sendMail({ envelope: { from: c.adresse, to: [...e.a, ...e.cc] }, raw: brut }), 60_000);
  if (c.smtpHote.endsWith("gmail.com")) return;
  await avecImap(c, async (client) => {
    const envoyes = await dossierParUsage(client, "\\Sent");
    if (envoyes) await client.append(envoyes, brut, ["\\Seen"]);
  }).catch(() => undefined);
}
