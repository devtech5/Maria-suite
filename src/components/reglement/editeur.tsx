"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Retour, type Resultat } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { enregistrerBrouillon, publierVersion, supprimerBrouillon } from "@/modules/reglement/actions";
import {
  LONGUEUR_MAX_PREAMBULE,
  LONGUEUR_MAX_RESUME,
  LONGUEUR_MAX_TEXTE_ARTICLE,
  LONGUEUR_MAX_TITRE,
  LONGUEUR_MAX_TITRE_ARTICLE,
  dateLongue,
  type Article,
} from "@/modules/reglement/regles";

import { TexteReglement } from "./texte-reglement";

/**
 * Zone de texte : l'habillage des champs sans leur hauteur fixe (`h-cible`
 * l'emporte sur `h-auto` dans la feuille générée) ; elle grandit avec son texte.
 */
const CLASSE_ZONE = `${CLASSE_CHAMP.replace("h-cible ", "")} field-sizing-content py-2 leading-relaxed`;

interface ArticleEdite extends Article {
  cle: number;
}

export interface Brouillon {
  id: string;
  titre: string;
  preambule: string;
  resume: string;
  dateEffet: string;
  articles: Article[];
}

/**
 * Rédaction d'une version : titre, préambule, articles (ajouter, déplacer,
 * retirer), ce qui change, date d'effet. Rien ne part avant « Enregistrer »
 * ou « Publier » ; quitter la page avec une saisie en cours le demande.
 */
export function EditeurReglement({ brouillon, aujourdhui, precedente }: { brouillon: Brouillon; aujourdhui: string; precedente: number | null }) {
  const [titre, setTitre] = useState(brouillon.titre);
  const [preambule, setPreambule] = useState(brouillon.preambule);
  const [resume, setResume] = useState(brouillon.resume);
  const [dateEffet, setDateEffet] = useState(brouillon.dateEffet);
  const [articles, setArticles] = useState<ArticleEdite[]>(() => brouillon.articles.map((a, i) => ({ ...a, cle: i })));
  const prochaineCle = useRef(brouillon.articles.length);
  const [modifie, setModifie] = useState(false);
  const [apercu, setApercu] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();

  useEffect(() => {
    if (!modifie) return;
    const retenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [modifie]);

  const changer = <T,>(poser: (v: T) => void) => (v: T) => {
    poser(v);
    setModifie(true);
  };

  const modifierArticle = (cle: number, champ: keyof Article, valeur: string) => {
    setArticles((liste) => liste.map((a) => (a.cle === cle ? { ...a, [champ]: valeur } : a)));
    setModifie(true);
  };

  const ajouterArticle = (apres?: number) => {
    const nouveau = { cle: prochaineCle.current++, titre: "", texte: "" };
    setArticles((liste) => {
      const rang = apres === undefined ? liste.length : liste.findIndex((a) => a.cle === apres) + 1;
      return [...liste.slice(0, rang), nouveau, ...liste.slice(rang)];
    });
    setModifie(true);
  };

  const deplacer = (cle: number, sens: -1 | 1) => {
    setArticles((liste) => {
      const i = liste.findIndex((a) => a.cle === cle);
      const j = i + sens;
      if (i < 0 || j < 0 || j >= liste.length) return liste;
      const copie = [...liste];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie;
    });
    setModifie(true);
  };

  const retirer = (cle: number) => {
    const article = articles.find((a) => a.cle === cle);
    if (article && (article.titre || article.texte) && !window.confirm("Retirer cet article ?")) return;
    setArticles((liste) => liste.filter((a) => a.cle !== cle));
    setModifie(true);
  };

  const donnees = () => {
    const d = new FormData();
    d.set("titre", titre);
    d.set("preambule", preambule);
    d.set("resume", resume);
    d.set("dateEffet", dateEffet);
    d.set("articles", JSON.stringify(articles.map(({ titre: t, texte }) => ({ titre: t, texte }))));
    return d;
  };

  const enregistrer = () =>
    demarrer(async () => {
      const r = await enregistrerBrouillon(brouillon.id, donnees());
      setResultat(r);
      if (r.ok) {
        setModifie(false);
        routeur.refresh();
      }
    });

  const publier = () => {
    const quand = dateEffet ? dateLongue(dateEffet) : null;
    const confirmation = quand
      ? `Publier la version ${(precedente ?? 0) + 1}, en vigueur le ${quand} ?\n\nSon texte ne se modifiera plus. Tout le monde en sera prévenu et devra l'accepter avant d'ouvrir le logiciel à partir de cette date.`
      : "Indiquez d'abord la date d'effet.";
    if (!quand) {
      setResultat({ ok: false, message: confirmation });
      return;
    }
    if (!window.confirm(confirmation)) return;
    demarrer(async () => {
      const r = await publierVersion(brouillon.id, donnees());
      setResultat(r);
      if (r.ok) {
        setModifie(false);
        routeur.refresh();
      }
    });
  };

  const supprimer = () => {
    if (!window.confirm("Supprimer ce brouillon ? La saisie sera perdue ; les versions publiées ne changent pas.")) return;
    demarrer(async () => {
      const r = await supprimerBrouillon(brouillon.id);
      if (r.ok) {
        setModifie(false);
        routeur.push("/reglement/versions");
      } else setResultat(r);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-[var(--filet)] bg-[var(--surface)] p-0.5 text-sm">
          {[
            { v: false, l: "Rédaction" },
            { v: true, l: "Aperçu" },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              onClick={() => setApercu(o.v)}
              aria-pressed={apercu === o.v}
              className={`rounded-md px-3 py-1.5 font-semibold ${apercu === o.v ? "bg-marque-600 text-white" : "text-[var(--encre-douce)] hover:text-[var(--encre)]"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--encre-faible)]">{modifie ? "Modifications non enregistrées" : "Tout est enregistré"}</p>
      </div>

      {apercu ? (
        <TexteReglement version={{ titre: titre || "Règlement intérieur", numero: null, dateEffet: dateEffet || null, preambule: preambule || null, articles: articles.filter((a) => a.titre || a.texte) }} />
      ) : (
        <>
          <div className="grid gap-4 rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm sm:grid-cols-[1fr_12rem] sm:p-5">
            <Champ libelle="Titre">
              <input value={titre} onChange={(e) => changer(setTitre)(e.target.value)} maxLength={LONGUEUR_MAX_TITRE} className={CLASSE_CHAMP} />
            </Champ>
            <Champ libelle="Date d'effet" precision="Pas avant aujourd'hui.">
              <input type="date" value={dateEffet} min={aujourdhui} onChange={(e) => changer(setDateEffet)(e.target.value)} className={CLASSE_CHAMP} />
            </Champ>
            <div className="sm:col-span-2">
              <Champ libelle="Préambule" precision="Facultatif : objet du règlement, à qui il s'applique, textes de référence.">
                <textarea value={preambule} onChange={(e) => changer(setPreambule)(e.target.value)} rows={3} maxLength={LONGUEUR_MAX_PREAMBULE} className={`${CLASSE_ZONE} min-h-16`} />
              </Champ>
            </div>
          </div>

          <ol className="space-y-3">
            {articles.map((a, i) => (
              <li key={a.cle} className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-marque-600/10 px-2 py-1 text-xs font-bold text-marque-600">Article {i + 1}</span>
                  <input
                    value={a.titre}
                    onChange={(e) => modifierArticle(a.cle, "titre", e.target.value)}
                    placeholder="Titre de l'article (ex. Horaires de travail)"
                    maxLength={LONGUEUR_MAX_TITRE_ARTICLE}
                    aria-label={`Titre de l'article ${i + 1}`}
                    className={`${CLASSE_CHAMP} min-w-0 flex-1`}
                  />
                  <div className="flex gap-1">
                    <BoutonIcone libelle="Monter" onClick={() => deplacer(a.cle, -1)} desactive={i === 0}>
                      ↑
                    </BoutonIcone>
                    <BoutonIcone libelle="Descendre" onClick={() => deplacer(a.cle, 1)} desactive={i === articles.length - 1}>
                      ↓
                    </BoutonIcone>
                    <BoutonIcone libelle="Retirer" onClick={() => retirer(a.cle)}>
                      ×
                    </BoutonIcone>
                  </div>
                </div>
                <textarea
                  value={a.texte}
                  onChange={(e) => modifierArticle(a.cle, "texte", e.target.value)}
                  rows={4}
                  maxLength={LONGUEUR_MAX_TEXTE_ARTICLE}
                  placeholder="Texte de l'article. Une ligne vide sépare deux paragraphes."
                  aria-label={`Texte de l'article ${i + 1}`}
                  className={`${CLASSE_ZONE} min-h-28`}
                />
                <button type="button" onClick={() => ajouterArticle(a.cle)} className="mt-2 text-xs font-semibold text-marque-600 hover:underline">
                  + Insérer un article après
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => ajouterArticle()}
            className="w-full rounded-2xl border border-dashed border-[var(--filet)] px-4 py-4 text-sm font-semibold text-marque-600 hover:bg-[var(--surface-creuse)]"
          >
            + Ajouter un article
          </button>

          <div className="rounded-2xl border border-[var(--filet)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
            <Champ libelle="Ce qui change" precision="Une ou deux phrases, montrées à chacun avant de lire : « Article 5 : horaires du samedi ».">
              <textarea value={resume} onChange={(e) => changer(setResume)(e.target.value)} rows={2} maxLength={LONGUEUR_MAX_RESUME} className={`${CLASSE_ZONE} min-h-16`} />
            </Champ>
          </div>
        </>
      )}

      <Retour resultat={resultat} />
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--filet)] bg-[var(--fond)]/95 py-3 backdrop-blur">
        <button type="button" onClick={supprimer} disabled={enCours} className="mr-auto text-sm font-semibold text-danger-600 hover:underline disabled:opacity-50">
          Supprimer le brouillon
        </button>
        <button
          type="button"
          onClick={enregistrer}
          disabled={enCours}
          className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-creuse)] disabled:opacity-50"
        >
          Enregistrer le brouillon
        </button>
        <button type="button" onClick={publier} disabled={enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white hover:bg-marque-700 disabled:opacity-50">
          {enCours ? "Un instant…" : "Publier…"}
        </button>
      </div>
    </div>
  );
}

function BoutonIcone({ libelle, onClick, desactive, children }: { libelle: string; onClick: () => void; desactive?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={libelle}
      aria-label={libelle}
      onClick={onClick}
      disabled={desactive}
      className="flex size-9 items-center justify-center rounded-lg border border-[var(--filet)] text-base text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
