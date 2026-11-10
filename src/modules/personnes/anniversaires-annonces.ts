import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { utilisateursAyantDroit } from "@/lib/droits/destinataires";
import { moduleOuvert } from "@/lib/modules/garde";
import { newId } from "@/lib/ids";
import { notifier } from "@/modules/communication/notifications";
import { jourLocal } from "@/modules/presences/calcul";

import { annonceDuJour, anniversairesAVenir, dateLisible, prenom, prochainAnniversaire, quandAnniversaire, type NatureAnnonce } from "./anniversaires";
import { anniversairesAnnonces, employees } from "./schema";

/**
 * Anniversaires des collaborateurs, côté base : qui est né quand, et les
 * annonces dans la cloche.
 *
 *   · La DIRECTION — le propriétaire et qui gère les salariés (droit
 *     `personnes.salarie.gerer`) — est prévenue dans la semaine qui précède,
 *     puis le jour même, avec l'âge.
 *   · L'ÉQUIPE — tout compte actif — est prévenue le jour même, sans l'âge,
 *     si la personne a choisi d'annoncer son anniversaire.
 *   · La personne elle-même reçoit les vœux de l'entreprise.
 *
 * Aucune tâche planifiée : l'annonce part après la réponse de la première
 * page ouverte dans la journée (`annoncerApresReponse`), et le journal
 * `anniversaires_annonces` garantit qu'elle ne part qu'une fois.
 */

export interface PersonneAnniversaire {
  id: string;
  nom: string;
  dateNaissance: string | null;
  poste: string;
  service: string | null;
  userId: string | null;
  /** L'équipe en est prévenue. */
  annonce: boolean;
}

async function fuseauDe(organizationId: string): Promise<string> {
  const [ligne] = await db.select({ fuseau: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  return ligne?.fuseau || "Africa/Abidjan";
}

/**
 * Les salariés en poste dont on connaît la date de naissance. `direction` :
 * tous ; sinon seulement ceux qui ont choisi d'annoncer leur anniversaire.
 */
export async function personnesAnniversaire(organizationId: string, options: { direction: boolean }): Promise<PersonneAnniversaire[]> {
  const lignes = await db
    .select({
      id: employees.id,
      nom: employees.nom,
      dateNaissance: employees.dateNaissance,
      poste: employees.poste,
      service: employees.service,
      userId: employees.userId,
      annonce: employees.anniversaireAnnonce,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.actif, true), isNull(employees.deletedAt), isNotNull(employees.dateNaissance)));
  return options.direction ? lignes : lignes.filter((l) => l.annonce);
}

/** Le jour d'aujourd'hui dans le fuseau de l'entreprise. */
export async function aujourdhuiPour(organizationId: string, maintenant = new Date()): Promise<string> {
  return jourLocal(maintenant, await fuseauDe(organizationId));
}

async function destinataires(organizationId: string): Promise<{ direction: Set<string>; equipe: Set<string> }> {
  const [gestion, membres] = await Promise.all([
    utilisateursAyantDroit(organizationId, "personnes.salarie.gerer"),
    db
      .select({ userId: memberships.userId, proprietaire: memberships.isOwner })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "actif"))),
  ]);
  const direction = new Set([...gestion, ...membres.filter((m) => m.proprietaire).map((m) => m.userId)]);
  return { direction, equipe: new Set(membres.map((m) => m.userId)) };
}

/** Pose une annonce au journal ; vrai si c'est la première fois. */
async function premiereFois(organizationId: string, employeeId: string, jour: string, nature: NatureAnnonce): Promise<boolean> {
  const posees = await db
    .insert(anniversairesAnnonces)
    .values({ id: newId(), organizationId, employeeId, jour, nature })
    .onConflictDoNothing({ target: [anniversairesAnnonces.employeeId, anniversairesAnnonces.jour, anniversairesAnnonces.nature] })
    .returning({ id: anniversairesAnnonces.id });
  return posees.length > 0;
}

/**
 * Annonce ce qu'il y a à annoncer aujourd'hui. Rend le nombre d'annonces
 * posées, pour les tests ; ne lève jamais : un anniversaire manqué ne doit
 * pas casser la page qui l'a déclenché.
 */
export async function annoncerAnniversaires(organizationId: string, maintenant = new Date()): Promise<number> {
  try {
    const [aujourdhui, personnes] = await Promise.all([aujourdhuiPour(organizationId, maintenant), personnesAnniversaire(organizationId, { direction: true })]);
    const aAnnoncer = personnes.flatMap((p) => {
      const prochain = prochainAnniversaire(p.dateNaissance, aujourdhui);
      const nature = annonceDuJour(prochain);
      return prochain && nature ? [{ p, prochain, nature }] : [];
    });
    if (aAnnoncer.length === 0) return 0;

    const { direction, equipe } = await destinataires(organizationId);
    let posees = 0;
    for (const { p, prochain, nature } of aAnnoncer) {
      if (!(await premiereFois(organizationId, p.id, prochain.jour, nature))) continue;
      posees++;
      const detail = [p.poste, p.service].filter(Boolean).join(" · ");

      if (nature === "rappel") {
        await notifier(organizationId, [...direction].filter((u) => u !== p.userId), {
          categorie: "anniversaire",
          titre: `🎂 Anniversaire de ${p.nom} ${quandAnniversaire(prochain)}`,
          corps: `${dateLisible(prochain.jour)} : ${prochain.age} ans. ${detail}`.trim(),
          lien: "/rh/anniversaires",
        });
        continue;
      }

      // Le jour même : les vœux à la personne, l'âge à la direction, la nouvelle à l'équipe.
      if (p.userId) {
        await notifier(organizationId, [p.userId], {
          categorie: "anniversaire",
          titre: `🎂 Joyeux anniversaire, ${prenom(p.nom)} !`,
          corps: "Toute l'équipe de MARIA GROUP vous souhaite une excellente journée.",
          lien: null,
        });
      }
      const dirigeants = [...direction].filter((u) => u !== p.userId);
      await notifier(organizationId, dirigeants, {
        categorie: "anniversaire",
        titre: `🎂 ${p.nom} fête ses ${prochain.age} ans aujourd'hui`,
        corps: `${detail}${detail ? ". " : ""}Pensez à lui souhaiter un bon anniversaire.`,
        lien: "/messagerie",
      });
      if (p.annonce) {
        await notifier(
          organizationId,
          [...equipe].filter((u) => u !== p.userId && !direction.has(u)),
          {
            categorie: "anniversaire",
            titre: `🎂 C'est l'anniversaire de ${p.nom} aujourd'hui`,
            corps: `${detail}${detail ? ". " : ""}Souhaitez-lui un bon anniversaire !`,
            lien: "/messagerie",
          },
        );
      }
    }
    return posees;
  } catch (erreur) {
    console.error("Annonces d'anniversaire non posées", erreur);
    return 0;
  }
}

/** Au plus une vérification par entreprise toutes les trente minutes et par processus. */
const PAS_MS = 30 * 60_000;
const verifiees = new Map<string, number>();

/**
 * Annonce APRÈS la réponse : l'écran s'affiche sans attendre. Sans effet si
 * le module Personnel n'est pas ouvert, ou si l'entreprise a été vérifiée il
 * y a peu ; le journal fait le reste.
 */
export function annoncerApresReponse(organizationId: string | null): void {
  if (!organizationId || !moduleOuvert("personnes")) return;
  const derniere = verifiees.get(organizationId) ?? 0;
  const maintenant = Date.now();
  if (maintenant - derniere < PAS_MS) return;
  verifiees.set(organizationId, maintenant);
  after(() => annoncerAnniversaires(organizationId));
}

/**
 * Les anniversaires à venir, tels qu'un écran les montre : la direction voit
 * tout le monde et l'âge ; l'équipe ne voit que ceux qui l'ont choisi, sans
 * l'âge (`age` à null).
 */
export async function anniversairesPour(
  organizationId: string,
  options: { direction: boolean; horizon?: number },
  maintenant = new Date(),
): Promise<{ aujourdhui: string; prochains: (PersonneAnniversaire & { jour: string; dans: number; age: number | null })[] }> {
  const [aujourdhui, personnes] = await Promise.all([aujourdhuiPour(organizationId, maintenant), personnesAnniversaire(organizationId, { direction: options.direction })]);
  const prochains = anniversairesAVenir(personnes, aujourdhui, options.horizon).map((a) => ({ ...a, age: options.direction ? a.age : null }));
  return { aujourdhui, prochains };
}
