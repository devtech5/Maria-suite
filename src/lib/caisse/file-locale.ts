/**
 * File d'attente locale de la caisse.
 *
 * Le principe tient en une phrase : **une vente est écrite en local AVANT
 * d'être envoyée**, jamais l'inverse. Le ticket sort de l'imprimante parce que
 * la vente existe sur l'appareil, pas parce que le serveur a répondu. Un
 * encaissement qui attend le réseau est un encaissement qui échoue au premier
 * trou de couverture — et à Yopougon, la 4G tombe plusieurs fois par jour.
 *
 * IndexedDB et non `localStorage` : une file de ventes est structurée, se lit
 * par index et doit survivre à un onglet fermé brutalement. `localStorage` est
 * synchrone et bloque le fil principal, ce qui se voit sur un terminal d'entrée
 * de gamme au moment précis où le caissier valide.
 *
 * Rien ici n'est spécifique à React : ce module est appelable depuis l'écran,
 * depuis un service worker ou depuis un test.
 */

const BASE = "maria-caisse";
const VERSION = 1;

const STORE_TICKETS = "tickets";
const STORE_COMPTEURS = "compteurs";

export type EtatTicket = "en_attente" | "envoye" | "refuse";

export interface TicketLocal {
  /** Identifiant définitif, produit ici, au moment du ticket. */
  id: string;
  organizationId: string;
  caisseId: string;
  numeroSeq: number;
  /** Numéro imprimé, tel que le client l'a sur son reçu. */
  numero: string;
  encaisseeLe: string;
  totalTtc: number;
  /** Charge utile envoyée au serveur, telle quelle. */
  payload: unknown;
  etat: EtatTicket;
  /** Nombre d'envois tentés. Sert à ne pas boucler sur un ticket refusé. */
  tentatives: number;
  /** Motif du dernier refus, pour que quelqu'un puisse le corriger. */
  erreur?: string;
}

/** IndexedDB n'existe pas au rendu serveur : tout appel y devient inopérant. */
function disponible(): boolean {
  return typeof indexedDB !== "undefined";
}

let connexion: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (connexion) return connexion;

  connexion = new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE, VERSION);

    requete.onupgradeneeded = () => {
      const base = requete.result;

      if (!base.objectStoreNames.contains(STORE_TICKETS)) {
        const store = base.createObjectStore(STORE_TICKETS, { keyPath: "id" });
        // L'index sur l'état sert au rattrapage : on ne relit pas toute
        // l'histoire de la caisse pour retrouver les trois tickets en attente.
        store.createIndex("etat", "etat");
      }

      if (!base.objectStoreNames.contains(STORE_COMPTEURS)) {
        base.createObjectStore(STORE_COMPTEURS, { keyPath: "caisseId" });
      }
    };

    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });

  return connexion;
}

function transaction<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  travail: (tx: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  return ouvrir().then(
    (base) =>
      new Promise<T>((resoudre, rejeter) => {
        const tx = base.transaction(stores, mode);
        const requete = travail(tx);
        requete.onsuccess = () => resoudre(requete.result);
        requete.onerror = () => rejeter(requete.error);
      }),
  );
}

/**
 * Réserve le rang du prochain ticket de ce poste.
 *
 * Le compteur vit ICI, pas au serveur. C'est ce qui permet à un ticket
 * d'obtenir son numéro définitif sans réseau — condition posée dès la
 * conception : « une vente encaissée sans réseau porte déjà son identifiant
 * définitif au moment où le ticket s'imprime ».
 *
 * `plancher` est le dernier rang que le serveur a vu passer. Il ne sert qu'à
 * recaler un appareil réinstallé, dont la base locale est vide alors que ses
 * ventes précédentes sont bien parties. Sans lui, le poste repartirait à un et
 * chaque ticket serait refusé pour doublon — après impression.
 */
export async function reserverRang(
  caisseId: string,
  plancher: number,
): Promise<number> {
  if (!disponible()) return plancher + 1;

  const base = await ouvrir();

  return new Promise<number>((resoudre, rejeter) => {
    const tx = base.transaction(STORE_COMPTEURS, "readwrite");
    const store = tx.objectStore(STORE_COMPTEURS);
    const lecture = store.get(caisseId);

    lecture.onsuccess = () => {
      const connu = (lecture.result as { dernier?: number } | undefined)?.dernier ?? 0;
      // Le compteur ne recule jamais : entre le local et le serveur, on garde
      // le plus avancé des deux.
      const suivant = Math.max(connu, plancher) + 1;
      const ecriture = store.put({ caisseId, dernier: suivant });
      ecriture.onsuccess = () => resoudre(suivant);
      ecriture.onerror = () => rejeter(ecriture.error);
    };

    lecture.onerror = () => rejeter(lecture.error);
  });
}

/** Écrit le ticket en local. C'est ce geste qui rend la vente réelle. */
export async function poserTicket(ticket: TicketLocal): Promise<void> {
  if (!disponible()) return;
  await transaction(STORE_TICKETS, "readwrite", (tx) =>
    tx.objectStore(STORE_TICKETS).put(ticket),
  );
}

export async function fileEnAttente(): Promise<TicketLocal[]> {
  if (!disponible()) return [];

  const tickets = await transaction<TicketLocal[]>(
    STORE_TICKETS,
    "readonly",
    (tx) => tx.objectStore(STORE_TICKETS).index("etat").getAll("en_attente"),
  );

  // Dans l'ordre d'encaissement : le serveur reçoit la journée telle qu'elle
  // s'est déroulée, ce qui rend le journal de caisse lisible.
  return tickets.sort((a, b) => a.numeroSeq - b.numeroSeq);
}

/** Tickets refusés par le serveur. Ils demandent une décision humaine. */
export async function fileRefusee(): Promise<TicketLocal[]> {
  if (!disponible()) return [];
  return transaction<TicketLocal[]>(STORE_TICKETS, "readonly", (tx) =>
    tx.objectStore(STORE_TICKETS).index("etat").getAll("refuse"),
  );
}

async function marquer(
  id: string,
  etat: EtatTicket,
  erreur?: string,
): Promise<void> {
  if (!disponible()) return;

  const base = await ouvrir();
  const tx = base.transaction(STORE_TICKETS, "readwrite");
  const store = tx.objectStore(STORE_TICKETS);
  const lecture = store.get(id);

  await new Promise<void>((resoudre) => {
    lecture.onsuccess = () => {
      const ticket = lecture.result as TicketLocal | undefined;
      if (!ticket) return resoudre();

      store.put({
        ...ticket,
        etat,
        tentatives: ticket.tentatives + 1,
        erreur,
      });
      resoudre();
    };
    lecture.onerror = () => resoudre();
  });
}

export interface ResultatEnvoi {
  envoyes: number;
  refuses: number;
  restants: number;
}

/**
 * Vide la file vers le serveur.
 *
 * `envoyer` rend `{ ok }` — l'appelant fournit le transport, ce module ne
 * connaît ni `fetch` ni les actions serveur. Un ticket accepté quitte la file ;
 * un ticket refusé pour une raison métier y reste marqué, parce qu'un refus
 * n'est pas une perte : la vente a eu lieu, le client est parti avec son reçu,
 * et quelqu'un doit pouvoir le retrouver.
 *
 * Une erreur de transport laisse le ticket EN ATTENTE et arrête la boucle : le
 * réseau est retombé, insister ferait fondre la batterie du terminal sans rien
 * changer. L'ordre est préservé pour la même raison.
 */
export async function encaisserFile(
  envoyer: (payload: unknown) => Promise<{ ok: boolean; message?: string }>,
): Promise<ResultatEnvoi> {
  const file = await fileEnAttente();
  let envoyes = 0;
  let refuses = 0;

  for (const ticket of file) {
    let reponse: { ok: boolean; message?: string };

    try {
      reponse = await envoyer(ticket.payload);
    } catch {
      // Transport tombé : on garde la file intacte et on réessaiera.
      break;
    }

    if (reponse.ok) {
      await marquer(ticket.id, "envoye");
      envoyes++;
    } else {
      await marquer(ticket.id, "refuse", reponse.message);
      refuses++;
    }
  }

  return {
    envoyes,
    refuses,
    restants: (await fileEnAttente()).length,
  };
}

/**
 * Purge les tickets déjà partis, plus vieux que `jours`.
 *
 * La file n'est pas un journal : l'historique vit en base, où il est
 * interrogeable et sauvegardé. Garder six mois de tickets sur un terminal
 * d'entrée de gamme finit par le remplir.
 */
export async function purgerEnvoyes(jours = 7): Promise<number> {
  if (!disponible()) return 0;

  const limite = Date.now() - jours * 24 * 60 * 60 * 1000;
  const envoyes = await transaction<TicketLocal[]>(
    STORE_TICKETS,
    "readonly",
    (tx) => tx.objectStore(STORE_TICKETS).index("etat").getAll("envoye"),
  );

  const perimes = envoyes.filter(
    (ticket) => new Date(ticket.encaisseeLe).getTime() < limite,
  );

  for (const ticket of perimes) {
    await transaction(STORE_TICKETS, "readwrite", (tx) =>
      tx.objectStore(STORE_TICKETS).delete(ticket.id),
    );
  }

  return perimes.length;
}
