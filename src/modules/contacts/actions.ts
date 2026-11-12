"use server";

import { revalidatePath } from "next/cache";

import { accesContacts } from "./acces";
import {
  affecterAdressePour,
  ajouterNumeroPour,
  basculerAdressePour,
  enregistrerAdressePour,
  reprendreFichesPour,
  retirerAdressePour,
  retirerNumeroPour,
} from "./requetes";

export type Resultat = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUS: Resultat = { ok: false, message: "Votre rôle ne permet pas de tenir l'annuaire : demandez le droit « Tenir l'annuaire » au responsable de l'entreprise." };

function lisible(erreur: unknown): string {
  const message = erreur instanceof Error ? erreur.message : "";
  if (message && !message.startsWith("Failed query") && message.length < 240) return message;
  console.error("Contacts", erreur);
  return "L'opération n'a pas abouti. Réessayez.";
}

const texte = (d: FormData, c: string) => {
  const v = d.get(c);
  return typeof v === "string" ? v : "";
};
const uuid = (d: FormData, c: string) => (UUID.test(texte(d, c)) ? texte(d, c) : null);

function rafraichir() {
  revalidatePath("/contacts", "layout");
}

/** Ajoute une adresse professionnelle, ou modifie celle dont l'identifiant est joint (`id`). */
export async function enregistrerAdresse(d: FormData): Promise<Resultat> {
  const c = await accesContacts();
  if (!c.gerer) return REFUS;
  try {
    const { id, adresse } = await enregistrerAdressePour(c.session.organizationId, c.session.userId, {
      id: uuid(d, "id") ?? undefined,
      adresse: texte(d, "adresse"),
      libelle: texte(d, "libelle"),
      serviceId: uuid(d, "serviceId"),
      employeeId: uuid(d, "employeeId"),
    });
    rafraichir();
    return { ok: true, message: `Adresse ${adresse} enregistrée.`, id };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Affecte une adresse à un service, puis à une personne de ce service. */
export async function affecterAdresse(adresseId: string, d: FormData): Promise<Resultat> {
  const c = await accesContacts();
  if (!c.gerer) return REFUS;
  if (!UUID.test(adresseId)) return { ok: false, message: "Adresse introuvable." };
  try {
    await affecterAdressePour(c.session.organizationId, c.session.userId, adresseId, uuid(d, "serviceId"), uuid(d, "employeeId"));
    rafraichir();
    return { ok: true, message: "Affectation enregistrée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function basculerAdresse(adresseId: string, actif: boolean): Promise<Resultat> {
  const c = await accesContacts();
  if (!c.gerer) return REFUS;
  if (!UUID.test(adresseId)) return { ok: false, message: "Adresse introuvable." };
  try {
    await basculerAdressePour(c.session.organizationId, c.session.userId, adresseId, actif);
    rafraichir();
    return { ok: true, message: actif ? "Adresse rouverte." : "Adresse fermée." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function retirerAdresse(adresseId: string): Promise<Resultat> {
  const c = await accesContacts();
  if (!c.gerer) return REFUS;
  if (!UUID.test(adresseId)) return { ok: false, message: "Adresse introuvable." };
  try {
    await retirerAdressePour(c.session.organizationId, c.session.userId, adresseId);
    rafraichir();
    return { ok: true, message: "Adresse retirée de l'annuaire." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

/** Inscrit à l'annuaire les adresses professionnelles portées par les fiches des collaborateurs. */
export async function reprendreFiches(): Promise<Resultat> {
  const c = await accesContacts();
  if (!c.gerer) return REFUS;
  try {
    const n = await reprendreFichesPour(c.session.organizationId, c.session.userId);
    rafraichir();
    return { ok: true, message: n === 0 ? "Toutes les adresses des fiches sont déjà dans l'annuaire." : `${n} adresse${n > 1 ? "s" : ""} reprise${n > 1 ? "s" : ""} depuis les fiches.` };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function ajouterNumero(employeeId: string, d: FormData): Promise<Resultat> {
  const c = await accesContacts();
  if (!c.gerer) return REFUS;
  if (!UUID.test(employeeId)) return { ok: false, message: "Collaborateur introuvable." };
  try {
    await ajouterNumeroPour(c.session.organizationId, c.session.userId, employeeId, { numero: texte(d, "numero"), nature: texte(d, "nature"), usage: texte(d, "usage") });
    rafraichir();
    return { ok: true, message: "Numéro ajouté." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}

export async function retirerNumero(numeroId: string): Promise<Resultat> {
  const c = await accesContacts();
  if (!c.gerer) return REFUS;
  if (!UUID.test(numeroId)) return { ok: false, message: "Numéro introuvable." };
  try {
    await retirerNumeroPour(c.session.organizationId, c.session.userId, numeroId);
    rafraichir();
    return { ok: true, message: "Numéro retiré." };
  } catch (erreur) {
    return { ok: false, message: lisible(erreur) };
  }
}
