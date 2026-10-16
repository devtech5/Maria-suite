/**
 * Verrouillage d'une session laissée sans activité.
 *
 * Un poste de gestion reste ouvert toute la journée dans une boutique, un
 * bureau partagé, un maquis : quiconque passe devant lit les marges, change un
 * prix ou valide une dépense au nom de celui qui s'est absenté. Au bout du
 * délai, l'écran se voile et ne s'ouvre qu'avec le mot de passe. La session,
 * elle, reste ouverte : le travail en cours n'est pas perdu.
 *
 * Deux gardes complémentaires :
 *
 *   · le navigateur compte l'inactivité (souris, clavier, toucher) et voile
 *     l'écran à l'heure dite ;
 *   · le serveur tient la dernière activité signalée et refuse toute page à
 *     une session dont l'activité est trop ancienne — sans quoi recharger la
 *     page, ou rouvrir l'ordinateur deux heures plus tard, effacerait le voile.
 *
 * Ce fichier ne dépend de rien : il est lu par le serveur et par le navigateur.
 */

/**
 * Où renvoyer quand le cookie est là mais ne désigne plus aucune session
 * (révoquée, expirée). Le paramètre demande au proxy d'effacer le cookie :
 * sans quoi le proxy, qui ne voit que sa présence, renverrait vers
 * l'application, et l'application vers la connexion, sans fin.
 */
export const CONNEXION_EXPIREE = "/connexion?expiree=1";

/** Délai proposé à la création de l'entreprise, en minutes. */
export const DELAI_VERROUILLAGE_DEFAUT = 15;

/**
 * Délais que l'entreprise peut choisir, en minutes. Tous inférieurs à
 * `DECONNEXION_INACTIVITE_MINUTES` : un verrou qui tomberait après la
 * déconnexion ne voilerait jamais rien.
 */
export const DELAIS_VERROUILLAGE = [5, 10, 15] as const;

/**
 * Minutes sans activité au-delà desquelles la session prend fin.
 *
 * Le verrou protège un poste dont on s'éloigne un moment ; passé ce délai,
 * personne ne reviendra : la session est révoquée et il faut se reconnecter.
 * La caisse et la salle Meeting en sont exemptées tant que leur écran est
 * affiché (voir `sessionEchue`).
 */
export const DECONNEXION_INACTIVITE_MINUTES = 30;

/**
 * Intervalle minimal entre deux signaux de présence envoyés au serveur.
 *
 * Signaler chaque mouvement de souris ferait une requête par pixel ; une par
 * minute suffit à tenir la dernière activité à la minute près.
 */
export const PAS_PRESENCE_MS = 60_000;

/**
 * Tolérance du serveur au-delà du délai, en minutes.
 *
 * Le serveur ne connaît l'activité qu'à la minute près (voir `PAS_PRESENCE_MS`).
 * Sans marge, il pourrait juger la session éteinte une minute avant que le
 * navigateur ne voile l'écran, et renvoyer vers le déverrouillage quelqu'un
 * qui travaillait. Le voile du navigateur, lui, tombe à l'heure exacte et se
 * double d'un verrou explicite côté serveur.
 */
export const MARGE_SERVEUR_MINUTES = 2;

export function delaiValide(minutes: number): boolean {
  return (DELAIS_VERROUILLAGE as readonly number[]).includes(minutes);
}

/**
 * Vrai si la session doit être déverrouillée avant de servir une page.
 *
 * Verrouillée explicitement (l'écran s'est voilé), ou restée sans signe de vie
 * au-delà du délai et de sa marge.
 */
export function sessionVerrouillee(etat: {
  verrouilleeLe: Date | null;
  derniereActivite: Date;
  delaiMinutes: number;
  maintenant: Date;
}): boolean {
  if (etat.verrouilleeLe) return true;
  const limite = (etat.delaiMinutes + MARGE_SERVEUR_MINUTES) * 60_000;
  return etat.maintenant.getTime() - etat.derniereActivite.getTime() > limite;
}

/**
 * Vrai si la session a pris fin faute d'activité.
 *
 * Compte la dernière activité réelle (`derniereActivite`, gestes de la
 * personne) ou, à défaut, le dernier signe d'un écran exempté resté affiché
 * (`maintenueLe`, caisse ou salle Meeting) — le plus récent des deux. Le serveur
 * ne connaît l'activité qu'à la minute près : il ajoute sa marge, comme pour le
 * verrou.
 */
export function sessionEchue(etat: {
  derniereActivite: Date;
  maintenueLe: Date | null;
  maintenant: Date;
}): boolean {
  const derniere = Math.max(etat.derniereActivite.getTime(), etat.maintenueLe?.getTime() ?? 0);
  const limite = (DECONNEXION_INACTIVITE_MINUTES + MARGE_SERVEUR_MINUTES) * 60_000;
  return etat.maintenant.getTime() - derniere > limite;
}

/**
 * Vrai si l'inactivité constatée par le navigateur atteint le délai.
 *
 * Testé AVANT d'enregistrer un geste : un ordinateur sorti de veille reçoit un
 * mouvement de souris avant que la minuterie n'ait repris. Si ce mouvement
 * comptait d'abord comme activité, le voile ne tomberait jamais.
 */
export function inactiviteEcoulee(derniereActiviteMs: number, maintenantMs: number, delaiMinutes: number): boolean {
  return maintenantMs - derniereActiviteMs >= delaiMinutes * 60_000;
}
