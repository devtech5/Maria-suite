"use client";

import { useState } from "react";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP_COMPACT } from "@/components/ui/primitives";
import { modifierIdentite } from "@/lib/identite-actions";

interface Identite {
  nom: string;
  formeJuridique: string;
  identifiantFiscal: string;
  rccm: string;
  regimeFiscal: string;
  adresse: string;
  ville: string;
  telephone: string;
  email: string;
  couleur: string;
  couleurSecondaire: string;
  piedDePage: string;
  logo: string | null;
}

const POIDS_MAX = 96 * 1024;

/**
 * Réduit le logo dans le navigateur : 480 × 240 au plus, PNG s'il reste
 * léger (la transparence est gardée), sinon JPEG sur fond blanc. Le serveur
 * ne reçoit jamais la photo de 4 Mo prise au téléphone.
 */
async function reduireLogo(fichier: File): Promise<string> {
  const url = URL.createObjectURL(fichier);
  try {
    const image = await new Promise<HTMLImageElement>((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ko(new Error("Image illisible."));
      img.src = url;
    });
    const echelle = Math.min(1, 480 / image.width, 240 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * echelle));
    canvas.height = Math.max(1, Math.round(image.height * echelle));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    if (png.length <= POIDS_MAX) return png;
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const qualite of [0.9, 0.8, 0.7, 0.6]) {
      const jpeg = canvas.toDataURL("image/jpeg", qualite);
      if (jpeg.length <= POIDS_MAX) return jpeg;
    }
    throw new Error("Logo trop détaillé, même réduit : choisissez une image plus simple.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Champ({ libelle, aide, children }: { libelle: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{libelle}</span>
      {children}
      {aide && <span className="mt-1 block text-xs text-[var(--encre-faible)]">{aide}</span>}
    </label>
  );
}

export function FormulaireIdentite({ initial, libelles }: { initial: Identite; libelles: { identifiantFiscal: string; sigle: string; registre: string } }) {
  const op = useOperation();
  const [v, setV] = useState(initial);
  const [logoChange, setLogoChange] = useState(false);
  const [erreurLogo, setErreurLogo] = useState<string | null>(null);
  const champ = (cle: keyof Identite) => ({
    value: (v[cle] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const valeur = e.target.value;
      setV((p) => ({ ...p, [cle]: valeur }));
    },
    className: `${CLASSE_CHAMP_COMPACT} h-10 w-full`,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          op.lancer(() => modifierIdentite({ ...v, logo: logoChange ? v.logo : undefined }), () => setLogoChange(false));
        }}
        className="space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--surface)] p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="Raison sociale">
            <input required {...champ("nom")} />
          </Champ>
          <Champ libelle="Forme juridique" aide="SARL, SA, SAS, Entreprise individuelle…">
            <input {...champ("formeJuridique")} />
          </Champ>
          <Champ libelle={libelles.identifiantFiscal}>
            <input {...champ("identifiantFiscal")} />
          </Champ>
          <Champ libelle={`Registre du commerce (${libelles.registre})`}>
            <input {...champ("rccm")} placeholder="CI-ABJ-2024-B-12345" />
          </Champ>
          <Champ libelle="Régime d'imposition" aide="Réel normal, réel simplifié, TSU…">
            <input {...champ("regimeFiscal")} />
          </Champ>
          <Champ libelle="Téléphone">
            <input {...champ("telephone")} inputMode="tel" />
          </Champ>
          <Champ libelle="Adresse">
            <input {...champ("adresse")} />
          </Champ>
          <Champ libelle="Ville">
            <input {...champ("ville")} />
          </Champ>
          <Champ libelle="E-mail">
            <input {...champ("email")} type="email" />
          </Champ>
          <Champ libelle="Couleur primaire" aide="Raison sociale, titre et filet de l'en-tête.">
            <span className="flex items-center gap-2">
              <input type="color" value={v.couleur} onChange={(e) => setV({ ...v, couleur: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-[var(--filet)]" />
              <code className="text-xs">{v.couleur.toUpperCase()}</code>
            </span>
          </Champ>
          <Champ libelle="Couleur secondaire" aide="Filets d'accent de l'en-tête et du pied de page.">
            <span className="flex items-center gap-2">
              <input type="color" value={v.couleurSecondaire} onChange={(e) => setV({ ...v, couleurSecondaire: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-[var(--filet)]" />
              <code className="text-xs">{v.couleurSecondaire.toUpperCase()}</code>
            </span>
          </Champ>
        </div>

        <Champ libelle="Mentions de pied de page" aide="Coordonnées bancaires, numéro Orange Money ou Wave, conditions de vente, capital social. Imprimées sur les factures et les tickets.">
          <textarea {...champ("piedDePage")} rows={3} className={`${CLASSE_CHAMP_COMPACT} w-full py-2`} />
        </Champ>

        <div>
          <span className="mb-1 block text-sm font-medium">Logo</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-[var(--filet)] px-3 text-sm font-medium hover:bg-[var(--surface-creuse)]">
              {v.logo ? "Remplacer" : "Choisir une image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setErreurLogo(null);
                  try {
                    setV({ ...v, logo: await reduireLogo(f) });
                    setLogoChange(true);
                  } catch (erreur) {
                    setErreurLogo(erreur instanceof Error ? erreur.message : "Image illisible.");
                  }
                }}
              />
            </label>
            {v.logo && (
              <button
                type="button"
                onClick={() => {
                  setV({ ...v, logo: null });
                  setLogoChange(true);
                }}
                className="text-sm text-danger-600 hover:underline"
              >
                Retirer
              </button>
            )}
            <span className="text-xs text-[var(--encre-faible)]">PNG à fond transparent de préférence. Réduit automatiquement.</span>
          </div>
          {erreurLogo && <p className="mt-1 text-xs text-danger-600">{erreurLogo}</p>}
        </div>

        <div className="flex items-center justify-end gap-3">
          {op.resultat && <Retour resultat={op.resultat} />}
          <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-5 text-sm font-semibold text-white disabled:opacity-50">
            {op.enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <section aria-label="Aperçu" className="space-y-2">
        <p className="text-xs font-semibold uppercase text-[var(--encre-faible)]">Aperçu de l&apos;en-tête</p>
        <div className="rounded-xl bg-white p-5 text-[12px] leading-snug text-black shadow">
          <div className="border-b pb-0.5" style={{ borderColor: v.couleurSecondaire }}>
            <div className="flex items-start justify-between gap-4 border-b-2 pb-3" style={{ borderColor: v.couleur }}>
              <div className="flex items-start gap-3">
                {v.logo && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL, aperçu local
                  <img src={v.logo} alt="" className="max-h-16 max-w-32 object-contain" />
                )}
                <div>
                  <p className="text-base font-bold" style={{ color: v.couleur }}>
                    {v.nom || "Raison sociale"}
                  </p>
                  {v.formeJuridique && <p>{v.formeJuridique}</p>}
                  {v.adresse && <p>{v.adresse}</p>}
                  {v.ville && <p>{v.ville}</p>}
                  {v.telephone && <p>Tél. {v.telephone}</p>}
                  {v.identifiantFiscal && (
                    <p>
                      {libelles.sigle} : {v.identifiantFiscal}
                    </p>
                  )}
                  {v.rccm && (
                    <p>
                      {libelles.registre} : {v.rccm}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold uppercase" style={{ color: v.couleur }}>
                  Facture
                </p>
                <p className="font-mono">FAC-2026-00001</p>
              </div>
            </div>
          </div>
          {v.piedDePage && (
            <p className="mt-6 whitespace-pre-line border-t pt-2 text-center text-[10px] text-black/60" style={{ borderColor: v.couleurSecondaire }}>
              {v.piedDePage}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
