"use client";

import { useState } from "react";

import { ChampMotDePasse } from "@/components/ui/mot-de-passe";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { connecterBoite } from "@/modules/boite-mail/actions";
import { deviner } from "@/modules/boite-mail/fournisseurs";

/**
 * Connexion d'une boîte : l'adresse et le mot de passe, rien d'autre. Les
 * serveurs (Hostinger pour @maria-groupe.com) se déduisent de l'adresse, côté
 * serveur.
 */
export function ConnexionBoite({ adresseInitiale }: { adresseInitiale?: string }) {
  const [adresse, setAdresse] = useState(adresseInitiale ?? "");
  const op = useOperation();
  const r = deviner(adresse);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => connecterBoite(d));
      }}
      className="max-w-xl space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5"
    >
      <div>
        <h2 className="text-base font-semibold">Connecter votre boîte mail</h2>
        <p className="mt-1 text-sm text-[var(--encre-douce)]">
          Vos e-mails restent chez votre fournisseur : Maria Suite les lit en direct, sans les copier. Votre mot de passe est chiffré, et vous seul accédez à
          cette boîte.
        </p>
      </div>
      <Champ libelle="Adresse e-mail">
        <input name="adresse" type="email" required value={adresse} onChange={(e) => setAdresse(e.target.value)} autoComplete="email" className={CLASSE_CHAMP} />
      </Champ>
      <Champ libelle={r.motDePasse === "application" ? "Mot de passe d'application" : "Mot de passe de la boîte"}>
        <ChampMotDePasse name="motDePasse" required autoComplete="off" className={CLASSE_CHAMP} />
      </Champ>
      {adresse.includes("@") && (
        <p className="rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm">
          <span className="font-semibold">{r.fournisseur} : </span>
          {r.conseil}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Vérification de la connexion…" : "Connecter"}
        </button>
      </div>
    </form>
  );
}
