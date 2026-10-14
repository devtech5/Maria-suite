"use client";

import { useState } from "react";

import { ChampMotDePasse } from "@/components/ui/mot-de-passe";
import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { connecterBoite } from "@/modules/boite-mail/actions";
import { deviner, type Reglages } from "@/modules/boite-mail/fournisseurs";

/**
 * Connexion d'une boîte : l'adresse suffit le plus souvent — les réglages se
 * devinent, et restent modifiables pour un hébergeur atypique.
 */
export function ConnexionBoite({ adresseInitiale }: { adresseInitiale?: string }) {
  const [adresse, setAdresse] = useState(adresseInitiale ?? "");
  const [r, setR] = useState<Reglages>(() => deviner(adresseInitiale ?? ""));
  const [avances, setAvances] = useState(false);
  const op = useOperation();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        op.lancer(() => connecterBoite(d));
      }}
      className="max-w-2xl space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-5"
    >
      <div>
        <h2 className="text-base font-semibold">Connecter votre boîte mail</h2>
        <p className="mt-1 text-sm text-[var(--encre-douce)]">
          Vos e-mails restent chez votre fournisseur : Maria Suite les lit en direct, sans les copier. Votre mot de passe est chiffré, et vous seul accédez à
          cette boîte.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Adresse e-mail">
          <input
            name="adresse"
            type="email"
            required
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            onBlur={() => setR(deviner(adresse))}
            autoComplete="email"
            className={CLASSE_CHAMP}
          />
        </Champ>
        <Champ libelle="Nom affiché">
          <input name="nomAffiche" placeholder="Awa Koné — MARIA GROUP SARL" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle={r.motDePasse === "application" ? "Mot de passe d'application" : "Mot de passe de la boîte"}>
          <ChampMotDePasse name="motDePasse" required autoComplete="off" className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Identifiant (si différent de l'adresse)">
          <input name="identifiant" placeholder={adresse} className={CLASSE_CHAMP} />
        </Champ>
      </div>
      {adresse.includes("@") && (
        <p className="rounded-lg bg-[var(--surface-creuse)] px-3 py-2 text-sm">
          <span className="font-semibold">{r.fournisseur} : </span>
          {r.conseil}
        </p>
      )}
      <button type="button" onClick={() => setAvances((v) => !v)} className="text-sm text-marque-600 hover:underline">
        {avances ? "Masquer les réglages des serveurs" : "Réglages des serveurs"}
      </button>
      {/* Toujours présents dans le formulaire ; visibles à la demande. */}
      <div className={`grid gap-4 sm:grid-cols-3 ${avances ? "" : "hidden"}`}>
        <Champ libelle="Serveur IMAP (réception)">
          <input name="imapHote" value={r.imapHote} onChange={(e) => setR({ ...r, imapHote: e.target.value })} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Port IMAP">
          <input name="imapPort" inputMode="numeric" value={r.imapPort} onChange={(e) => setR({ ...r, imapPort: Number(e.target.value) || 0 })} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Sécurité IMAP">
          <select name="imapSecurise" value={r.imapSecurise ? "oui" : "non"} onChange={(e) => setR({ ...r, imapSecurise: e.target.value === "oui" })} className={CLASSE_CHAMP}>
            <option value="oui">SSL/TLS</option>
            <option value="non">STARTTLS / aucune</option>
          </select>
        </Champ>
        <Champ libelle="Serveur SMTP (envoi)">
          <input name="smtpHote" value={r.smtpHote} onChange={(e) => setR({ ...r, smtpHote: e.target.value })} className={CLASSE_CHAMP} />
        </Champ>
        <Champ libelle="Port SMTP">
          <input name="smtpPort" inputMode="numeric" value={r.smtpPort} onChange={(e) => setR({ ...r, smtpPort: Number(e.target.value) || 0 })} className={`${CLASSE_CHAMP} chiffres`} />
        </Champ>
        <Champ libelle="Sécurité SMTP">
          <select name="smtpSecurise" value={r.smtpSecurise ? "oui" : "non"} onChange={(e) => setR({ ...r, smtpSecurise: e.target.value === "oui" })} className={CLASSE_CHAMP}>
            <option value="oui">SSL/TLS (465)</option>
            <option value="non">STARTTLS (587)</option>
          </select>
        </Champ>
      </div>
      <Champ libelle="Signature (facultatif)">
        <textarea name="signature" rows={3} className={`${CLASSE_CHAMP} h-auto py-2`} />
      </Champ>
      <div className="flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-500 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Vérification de la connexion…" : "Connecter"}
        </button>
      </div>
    </form>
  );
}
