/**
 * File d'attente locale du terrain.
 *
 * Même principe que la caisse : **la preuve est écrite sur l'appareil AVANT
 * d'être envoyée**. Un livreur à Bingerville ou un enquêteur en zone rurale ne
 * peut pas attendre une réponse du serveur pour continuer sa tournée.
 *
 * Les opérations sont rejouées DANS L'ORDRE où elles ont été prises (clé
 * auto-incrémentée) : une étape ne se valide qu'une fois ses preuves arrivées,
 * donc la validation ne doit jamais doubler la photo ou la signature qui la
 * précède. Au premier échec réseau, le rejeu s'arrête — passer à l'opération
 * suivante la ferait arriver avant sa précédente.
 *
 * Une opération REFUSÉE par le serveur (mission close, champ obligatoire
 * manquant) ne bloque pas la file : elle est marquée et reste visible, pour
 * qu'une personne la corrige plutôt qu'elle ne soit rejouée à l'infini.
 *
 * Aucune dépendance à React : appelable depuis l'écran ou un service worker.
 */

const BASE = "maria-terrain";
const VERSION = 1;
const STORE = "operations";

export type EtatOperation = "en_attente" | "refusee";

export interface OperationLocale<T = unknown> {
  /** Rang d'insertion, attribué par IndexedDB. */
  rang?: number;
  etat: EtatOperation;
  /** Charge utile envoyée telle quelle à `rapporterTerrain`. */
  operation: T;
  priseLe: string;
  erreur?: string;
}

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
      if (!base.objectStoreNames.contains(STORE)) {
        const store = base.createObjectStore(STORE, {
          keyPath: "rang",
          autoIncrement: true,
        });
        store.createIndex("etat", "etat");
      }
    };

    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => {
      connexion = null;
      rejeter(requete.error);
    };
  });

  return connexion;
}

function promesse<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

/** Met une opération en file. Rend son rang, ou `null` sans IndexedDB. */
export async function mettreEnFile(operation: unknown): Promise<number | null> {
  if (!disponible()) return null;

  const base = await ouvrir();
  const enregistrement: OperationLocale = {
    etat: "en_attente",
    operation,
    priseLe: new Date().toISOString(),
  };

  const rang = await promesse(
    base.transaction(STORE, "readwrite").objectStore(STORE).add(enregistrement),
  );
  return Number(rang);
}

/** Toutes les opérations, dans l'ordre de prise. */
export async function operationsLocales(): Promise<OperationLocale[]> {
  if (!disponible()) return [];

  const base = await ouvrir();
  return promesse(
    base.transaction(STORE, "readonly").objectStore(STORE).getAll(),
  ) as Promise<OperationLocale[]>;
}

export async function operationsEnAttente(): Promise<OperationLocale[]> {
  return (await operationsLocales()).filter((o) => o.etat === "en_attente");
}

async function retirer(rang: number): Promise<void> {
  const base = await ouvrir();
  await promesse(base.transaction(STORE, "readwrite").objectStore(STORE).delete(rang));
}

async function marquerRefusee(operation: OperationLocale, erreur: string): Promise<void> {
  const base = await ouvrir();
  await promesse(
    base
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put({ ...operation, etat: "refusee", erreur }),
  );
}

export type Envoi = (
  operation: never,
) => Promise<{ ok: true } | { ok: false; message: string }>;

export interface BilanRejeu {
  envoyees: number;
  refusees: number;
  restantes: number;
}

let enCours = false;

/**
 * Rejoue la file dans l'ordre.
 *
 * Une exception de `envoyer` signifie « pas de réseau » : on s'arrête sans rien
 * perdre. Un refus explicite marque l'opération et passe à la suivante.
 */
export async function rejouer(envoyer: Envoi): Promise<BilanRejeu> {
  const bilan: BilanRejeu = { envoyees: 0, refusees: 0, restantes: 0 };
  if (!disponible() || enCours) return bilan;

  enCours = true;
  try {
    const attente = await operationsEnAttente();
    for (const [index, operation] of attente.entries()) {
      let reponse;
      try {
        reponse = await envoyer(operation.operation as never);
      } catch {
        bilan.restantes = attente.length - index;
        return bilan;
      }

      if (reponse.ok) {
        await retirer(operation.rang as number);
        bilan.envoyees += 1;
      } else {
        await marquerRefusee(operation, reponse.message);
        bilan.refusees += 1;
      }
    }
    return bilan;
  } finally {
    enCours = false;
  }
}

/** Écarte une opération refusée une fois qu'une personne l'a lue. */
export async function ecarter(rang: number): Promise<void> {
  if (!disponible()) return;
  await retirer(rang);
}
