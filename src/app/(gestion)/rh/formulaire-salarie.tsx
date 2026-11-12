"use client";

import { useActionState, useState, type ReactNode } from "react";

import { ChoixPostes } from "@/components/personnes/choix-postes";
import { ChoixPhoto } from "@/components/personnes/photo";
import { SITUATIONS } from "@/components/personnes/dossier";
import { Fenetre } from "@/components/ui/fenetre";
import { Champ, CLASSE_CHAMP, CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { embaucherSalarie, type EtatSalarie } from "@/modules/personnes/actions";
import {
  CIVILITES,
  DUREE_CONTRAT_MAX_MOIS,
  DUREES_CDD_MOIS,
  LIENS_URGENCE,
  MOIS_ESSAI,
  PAIEMENTS_SALAIRE,
  finEssai,
  libelleDuree,
  sexeDeCivilite,
  termeApresDuree,
} from "@/modules/personnes/calcul";

const CONTRATS = [
  {
    valeur: "cdi",
    libelle: "CDI — durée indéterminée",
    precision: "Sans terme. Aucune échéance à surveiller.",
  },
  {
    valeur: "cdd",
    libelle: "CDD — durée déterminée",
    precision: "La durée fixe le terme, qui déclenche l'alerte d'échéance.",
  },
  {
    valeur: "essai",
    libelle: `Période d'essai (${String(MOIS_ESSAI).padStart(2, "0")} mois)`,
    precision: `${MOIS_ESSAI} mois : la fin se calcule depuis la date d'embauche. Une décision à prendre avant elle.`,
  },
  {
    valeur: "stage",
    libelle: "Stage",
    precision: "Convention à durée fixe.",
  },
] as const;

type Contrat = (typeof CONTRATS)[number]["valeur"];

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const CLASSE_FICHIER =
  "block w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-[var(--filet)] file:bg-[var(--surface)] file:px-3";
const CLASSE_PLUS =
  "grid size-cible shrink-0 place-items-center rounded-lg border border-[var(--filet)] text-lg leading-none text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] hover:text-[var(--encre)]";

/**
 * Une partie du formulaire, titrée et filetée, en grille de trois colonnes
 * sur grand écran. `aside` se pose à gauche de la grille : la photo portrait
 * de l'identité, comme sur une fiche papier.
 */
function Section({ titre, aside, children }: { titre: string; aside?: ReactNode; children: ReactNode }) {
  const grille = <div className="grid flex-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
  return (
    <section className="border-t border-[var(--filet)] pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-semibold">{titre}</h3>
      {aside ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="shrink-0">{aside}</div>
          {grille}
        </div>
      ) : (
        grille
      )}
    </section>
  );
}

/** Saisie en ligne d'une valeur à ajouter à une liste, sous le champ qu'elle complète. */
function AjoutEnLigne({
  libelle,
  enCours,
  erreur,
  onAjouter,
  onAnnuler,
}: {
  libelle: string;
  enCours?: boolean;
  erreur?: string | null;
  onAjouter: (valeur: string) => void;
  onAnnuler: () => void;
}) {
  const [valeur, setValeur] = useState("");
  const valider = () => {
    if (valeur.trim().length >= 2) onAjouter(valeur.trim());
  };
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <input
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          onKeyDown={(e) => {
            // Entrée ajoute la valeur sans soumettre l'embauche.
            if (e.key === "Enter") {
              e.preventDefault();
              valider();
            }
          }}
          autoFocus
          maxLength={80}
          aria-label={libelle}
          placeholder={libelle}
          className={CLASSE_CHAMP}
        />
        <button
          type="button"
          onClick={valider}
          disabled={enCours || valeur.trim().length < 2}
          className="h-cible shrink-0 rounded-lg bg-marque-600 px-3 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
        >
          Ajouter
        </button>
        <button type="button" onClick={onAnnuler} className="shrink-0 px-1 text-sm text-[var(--encre-faible)] hover:underline">
          Annuler
        </button>
      </div>
      {erreur && <p className="mt-1 text-xs text-danger-600">{erreur}</p>}
    </div>
  );
}

/** Service choisi parmi ceux déjà portés ; « + » en propose un nouveau, enregistré avec la fiche. */
function ChampService({ services }: { services: string[] }) {
  const [options, setOptions] = useState(services);
  const [choisi, setChoisi] = useState("");
  const [ajout, setAjout] = useState(false);

  return (
    <div>
      <label htmlFor="embauche-service" className="mb-1.5 block text-sm font-medium">
        Service
      </label>
      <div className="flex gap-2">
        <select id="embauche-service" name="service" value={choisi} onChange={(e) => setChoisi(e.target.value)} className={CLASSE_CHAMP}>
          <option value="">—</option>
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setAjout(true)} aria-label="Ajouter un service" title="Ajouter un service" className={CLASSE_PLUS}>
          +
        </button>
      </div>
      {ajout && (
        <AjoutEnLigne
          libelle="Nouveau service"
          onAnnuler={() => setAjout(false)}
          onAjouter={(service) => {
            const existant = options.find((o) => o.toLocaleLowerCase("fr") === service.toLocaleLowerCase("fr"));
            if (!existant) setOptions((avant) => [...avant, service]);
            setChoisi(existant ?? service);
            setAjout(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Contrat, date d'embauche, durée et terme.
 *
 * Pour un CDD, la durée se choisit en mois et le terme s'en déduit, modifiable
 * à la main. Le terme laissé visible sur un CDI ferait saisir une date « au
 * cas où », et l'écran des échéances annoncerait des fins de contrat qui
 * n'existent pas : il n'apparaît que pour les contrats qui en ont un.
 */
function ChampsContrat() {
  const [contrat, setContrat] = useState<Contrat>("cdi");
  const [debut, setDebut] = useState("");
  const [duree, setDuree] = useState<string>("12");
  const [autreDuree, setAutreDuree] = useState(false);
  const [fin, setFin] = useState("");
  // Vrai dès qu'on touche au terme à la main : le calcul ne l'écrase plus.
  const [finSaisie, setFinSaisie] = useState(false);

  /** Terme proposé : fin d'essai, ou entrée plus la durée du CDD, tant qu'on ne l'a pas changé. */
  function proposerFin(c: Contrat, d: string, mois: string) {
    if (finSaisie || !DATE_ISO.test(d)) return;
    if (c === "essai") setFin(finEssai(d));
    const n = Number(mois);
    if (c === "cdd" && Number.isInteger(n) && n >= 1 && n <= DUREE_CONTRAT_MAX_MOIS) setFin(termeApresDuree(d, n));
  }

  const definition = CONTRATS.find((c) => c.valeur === contrat) ?? CONTRATS[0];
  const dureeLue = contrat !== "cdi" && DATE_ISO.test(debut) && DATE_ISO.test(fin) && fin >= debut ? libelleDuree(debut, fin) : null;

  return (
    <>
      <Champ libelle="Type de contrat" precision={definition.precision}>
        <select
          name="contrat"
          value={contrat}
          onChange={(e) => {
            const choisi = e.target.value as Contrat;
            setContrat(choisi);
            proposerFin(choisi, debut, duree);
          }}
          className={CLASSE_CHAMP}
        >
          {CONTRATS.map((c) => (
            <option key={c.valeur} value={c.valeur}>
              {c.libelle}
            </option>
          ))}
        </select>
      </Champ>

      <Champ libelle="Date d'embauche *">
        <input
          name="debut"
          type="date"
          required
          value={debut}
          onChange={(e) => {
            setDebut(e.target.value);
            proposerFin(contrat, e.target.value, duree);
          }}
          className={`${CLASSE_CHAMP} chiffres`}
        />
      </Champ>

      {contrat === "cdd" && (
        <Champ libelle="Durée du contrat *" precision="Le terme s'en déduit ; l'alerte d'échéance part 60 jours avant.">
          {autreDuree ? (
            <span className="flex items-center gap-2">
              <input
                name="dureeMois"
                type="number"
                min={1}
                max={DUREE_CONTRAT_MAX_MOIS}
                required
                value={duree}
                onChange={(e) => {
                  setDuree(e.target.value);
                  proposerFin(contrat, debut, e.target.value);
                }}
                className={`${CLASSE_CHAMP} chiffres`}
              />
              <span className="shrink-0 text-sm text-[var(--encre-douce)]">mois</span>
            </span>
          ) : (
            <select
              name="dureeMois"
              value={duree}
              onChange={(e) => {
                if (e.target.value === "autre") {
                  setAutreDuree(true);
                  return;
                }
                setDuree(e.target.value);
                proposerFin(contrat, debut, e.target.value);
              }}
              className={CLASSE_CHAMP}
            >
              {DUREES_CDD_MOIS.map((m) => (
                <option key={m} value={String(m)}>
                  {m % 12 === 0 ? (m === 12 ? "1 an" : `${m / 12} ans`) : `${m} mois`}
                </option>
              ))}
              <option value="autre">Autre durée (en mois)…</option>
            </select>
          )}
        </Champ>
      )}

      {contrat !== "cdi" && (
        <Champ
          libelle={contrat === "essai" ? "Fin de la période d'essai *" : "Terme du contrat *"}
          precision={
            dureeLue
              ? `Soit ${dureeLue}. Calculé sur la date d'embauche, modifiable.`
              : "Calculé sur la date d'embauche, modifiable."
          }
        >
          <input
            name="fin"
            type="date"
            required
            min={debut || undefined}
            value={fin}
            onChange={(e) => {
              setFin(e.target.value);
              setFinSaisie(true);
            }}
            className={`${CLASSE_CHAMP} chiffres`}
          />
        </Champ>
      )}
    </>
  );
}

/** Civilité et sexe : la civilité préremplit le sexe tant qu'on n'y a pas touché. */
function ChampsCivilite() {
  const [sexe, setSexe] = useState("");
  const [sexeSaisi, setSexeSaisi] = useState(false);
  return (
    <>
      <Champ libelle="Civilité">
        <select
          name="civilite"
          defaultValue=""
          onChange={(e) => {
            if (!sexeSaisi) setSexe(sexeDeCivilite(e.target.value) ?? "");
          }}
          className={CLASSE_CHAMP}
        >
          <option value="">—</option>
          {Object.entries(CIVILITES).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Sexe">
        <select
          name="sexe"
          value={sexe}
          onChange={(e) => {
            setSexe(e.target.value);
            setSexeSaisi(true);
          }}
          className={CLASSE_CHAMP}
        >
          <option value="">—</option>
          <option value="F">Femme</option>
          <option value="M">Homme</option>
        </select>
      </Champ>
    </>
  );
}

/** Coordonnées de paiement, dont l'exemple suit le mode choisi. */
function ChampsPaiement() {
  const [mode, setMode] = useState("");
  return (
    <>
      <Champ libelle="Paiement du salaire">
        <select name="paiementSalaire" value={mode} onChange={(e) => setMode(e.target.value)} className={CLASSE_CHAMP}>
          <option value="">—</option>
          {Object.entries(PAIEMENTS_SALAIRE).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="RIB ou n° Mobile Money">
        <input
          name="coordonneesPaiement"
          maxLength={60}
          placeholder={mode === "mobile_money" ? "07 00 00 00 00" : mode === "virement" ? "CI93 CI000 01234 012345678901 23" : ""}
          className={`${CLASSE_CHAMP} chiffres`}
        />
      </Champ>
    </>
  );
}

/**
 * Embauche d'un collaborateur, dans une grande fenêtre.
 *
 * Cinq parties : identité, contact, contrat et poste, rémunération, notes —
 * plus les pièces jointes pour qui tient les dossiers. Seuls le nom, le
 * poste, le contrat et la date d'embauche sont exigés : le reste se complète
 * ensuite sur la fiche du collaborateur.
 */
export function FormulaireSalarie({
  premier = false,
  dossier = false,
  postes,
  services,
}: {
  premier?: boolean;
  /** Le rôle tient les dossiers : pièce d'identité, photo, CV et lettre se joignent dès l'embauche. */
  dossier?: boolean;
  /** Postes actifs du référentiel, dans leur ordre : le poste se choisit, il ne se tape pas. */
  postes: string[];
  /** Services déjà portés par les fiches. */
  services: string[];
}) {
  const [ouvert, setOuvert] = useState(false);
  // Changer la clé remonte le formulaire : une embauche faite, la fenêtre suivante repart à vide.
  const [generation, setGeneration] = useState(0);
  const [etat, action, enCours] = useActionState<EtatSalarie, FormData>(embaucherSalarie, {});

  const [dernier, setDernier] = useState(etat.matricule);
  if (etat.matricule !== dernier) {
    setDernier(etat.matricule);
    if (etat.matricule) {
      setOuvert(false);
      setGeneration((g) => g + 1);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {etat.matricule && (
          <span className={`text-sm ${etat.avertissement ? "text-alerte-600" : "text-valide-600"}`}>
            {etat.avertissement ?? (
              <>
                <span className="chiffres">{etat.matricule}</span> embauché.
              </>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white hover:bg-marque-700"
        >
          {premier ? "Embaucher le premier collaborateur" : "Nouveau collaborateur"}
        </button>
      </div>

      <Fenetre
        ouverte={ouvert}
        titre="Nouveau collaborateur"
        sousTitre="Le matricule (MG-AAMM-N) est attribué à l'enregistrement, d'après la date d'embauche. Les champs marqués * sont exigés ; le reste se complète ensuite sur la fiche."
        large
        retenir
        onFermer={() => setOuvert(false)}
      >
        <form key={generation} action={action} className="flex flex-1 flex-col">
          <div className="space-y-5 px-5 py-4">
            {/* La photo portrait part avec le dossier : réservée à qui le tient, comme le serveur l'exige. */}
            <Section titre="Identité" aside={dossier ? <ChoixPhoto /> : undefined}>
              <ChampsCivilite />
              <Champ libelle="Nationalité">
                <input name="nationalite" defaultValue="Ivoirienne" maxLength={80} className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Nom *">
                <input name="nom" required maxLength={80} placeholder="KOUASSI" className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Prénoms">
                <input name="prenoms" maxLength={120} placeholder="Yao Bernard" className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Date de naissance">
                <input name="dateNaissance" type="date" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <Champ libelle="Lieu de naissance">
                <input name="lieuNaissance" maxLength={120} className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Situation familiale">
                <select name="situationFamiliale" defaultValue="" className={CLASSE_CHAMP}>
                  <option value="">—</option>
                  {Object.entries(SITUATIONS).map(([cle, libelle]) => (
                    <option key={cle} value={cle}>
                      {libelle}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ libelle="Enfants à charge" precision="Compte dans les parts de l'impôt sur salaire.">
                <input name="enfantsACharge" type="number" min={0} max={30} defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              {dossier && (
                <Champ libelle="Pièce d'identité" precision="Le scan se joint ensuite depuis la fiche.">
                  <span className="flex gap-2">
                    <select name="pieceNature" defaultValue="cni" aria-label="Nature de la pièce" className={`${CLASSE_CHAMP_COMPACT} w-32 shrink-0`}>
                      <option value="cni">CNI</option>
                      <option value="passeport">Passeport</option>
                    </select>
                    <input name="pieceNumero" maxLength={40} placeholder="CI0012345678" aria-label="Numéro de la pièce" className={`${CLASSE_CHAMP} min-w-0 chiffres`} />
                  </span>
                </Champ>
              )}
            </Section>

            <Section titre="Contact">
              <Champ libelle="Téléphone">
                <input name="telephone" type="tel" maxLength={30} placeholder="+225 07 00 00 00 00" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <Champ libelle="E-mail">
                <input name="email" type="email" maxLength={120} className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Adresse">
                <input name="adresse" maxLength={200} placeholder="Commune, quartier, repère" className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Personne à prévenir">
                <input name="contactUrgence" maxLength={200} placeholder="Nom et prénoms" className={CLASSE_CHAMP} />
              </Champ>
              <Champ libelle="Lien avec le collaborateur">
                <select name="contactUrgenceLien" defaultValue="" className={CLASSE_CHAMP}>
                  <option value="">—</option>
                  {Object.entries(LIENS_URGENCE).map(([cle, libelle]) => (
                    <option key={cle} value={cle}>
                      {libelle}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ libelle="Téléphone à prévenir">
                <input name="contactUrgenceTelephone" type="tel" maxLength={30} placeholder="07 00 00 00 00" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
            </Section>

            <Section titre="Contrat et poste">
              <ChoixPostes postes={postes} ajout />
              <ChampService services={services} />
              <Champ libelle="N° CNPS" precision="Sans lui, aucune déclaration sociale n'est possible.">
                <input name="numeroCnps" maxLength={30} placeholder="0123456789" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <ChampsContrat />
            </Section>

            <Section titre="Rémunération">
              <Champ libelle="Salaire de base mensuel (FCFA) *" precision="Brut mensuel, en francs entiers.">
                <input name="salaireBase" inputMode="numeric" required defaultValue="0" className={`${CLASSE_CHAMP} chiffres`} />
              </Champ>
              <ChampsPaiement />
            </Section>

            <Section titre="Notes">
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="sr-only">Note</span>
                <textarea
                  name="notes"
                  rows={2}
                  maxLength={2000}
                  placeholder="Ce qu'il faut savoir de l'embauche : conditions, engagements, remarques."
                  className="w-full rounded-lg border border-[var(--filet)] bg-[var(--fond)] px-3.5 py-2.5 text-sm outline-none focus:border-marque-500"
                />
              </label>
            </Section>

            {/* Facultatif : le dossier se complète ensuite depuis la fiche du
                collaborateur — CMU, casier, diplômes… */}
            {dossier && (
              <Section titre="Pièces jointes — facultatives">
                <Champ libelle="Contrat signé" precision="Le contrat numérisé, versé au dossier avec son terme.">
                  <input name="contrat" type="file" accept="application/pdf,.doc,.docx,image/*" className={CLASSE_FICHIER} />
                </Champ>
                <Champ libelle="CV" precision="PDF, Word ou photo.">
                  <input name="cv" type="file" accept="application/pdf,.doc,.docx,image/*" className={CLASSE_FICHIER} />
                </Champ>
                <Champ libelle="Lettre de motivation">
                  <input name="lettre" type="file" accept="application/pdf,.doc,.docx,image/*" className={CLASSE_FICHIER} />
                </Champ>
              </Section>
            )}
          </div>

          <div className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-[var(--filet)] bg-[var(--surface)] px-5 py-3">
            {etat.erreur && (
              <p role="alert" className="mr-auto rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-600">
                {etat.erreur}
              </p>
            )}
            <button type="button" onClick={() => setOuvert(false)} className="h-cible px-3 text-sm text-[var(--encre-douce)] hover:underline">
              Fermer
            </button>
            <button
              type="submit"
              disabled={enCours}
              className="h-cible rounded-lg bg-marque-600 px-5 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Créer la fiche"}
            </button>
          </div>
        </form>
      </Fenetre>
    </>
  );
}
