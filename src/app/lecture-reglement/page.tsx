import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmblemeMaria } from "@/components/coque/signature";
import { VerrouInactivite } from "@/components/coque/verrou-inactivite";
import { Acceptation } from "@/components/reglement/acceptation";
import { TexteReglement } from "@/components/reglement/texte-reglement";
import { seDeconnecter } from "@/lib/auth/actions";
import { exigerEntreprise } from "@/lib/auth/dal";
import { pointerApresReponse } from "@/modules/presences/pointage";
import { versionAAccepter } from "@/modules/reglement/garde";
import { dateLongue } from "@/modules/reglement/regles";
import { versionDe } from "@/modules/reglement/requetes";

export const metadata: Metadata = { title: "Règlement intérieur" };

/**
 * Lecture bloquante du règlement intérieur.
 *
 * `exigerEntreprise` renvoie ici tout compte qui n'a pas accepté la version
 * en vigueur : à la première connexion, puis à chaque nouvelle version.
 * Hors de la coque de gestion — ni menu ni recherche : rien d'autre ne
 * s'ouvre avant « J'ai lu et j'accepte ».
 */
export default async function PageLectureReglement() {
  const session = await exigerEntreprise({ malgreReglement: true });
  // Lire le règlement en arrivant, c'est être arrivé : le pointage part d'ici.
  pointerApresReponse(session.organizationId, session.userId);
  const versionId = await versionAAccepter(session.organizationId, session.userId);
  if (!versionId) redirect("/accueil");
  const version = await versionDe(session.organizationId, versionId);
  if (!version || version.numero === null) redirect("/accueil");

  return (
    <>
      <main id="coque-reglement" className="min-h-dvh bg-[var(--fond)] px-4 pt-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-6 flex flex-wrap items-center gap-4">
            <EmblemeMaria className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--encre-faible)]">{session.organizationNom}</p>
              <h1 className="text-2xl font-bold tracking-tight">Règlement intérieur</h1>
            </div>
            <form action={seDeconnecter}>
              <button type="submit" className="text-sm font-semibold text-[var(--encre-faible)] underline-offset-4 hover:underline">
                Se déconnecter
              </button>
            </form>
          </header>

          <div className="mb-6 rounded-xl border border-or/40 bg-[var(--surface)] p-4 text-sm shadow-sm">
            <p className="font-semibold">Bonjour {session.nom}, avant d&apos;utiliser Maria Suite, prenez connaissance du règlement intérieur.</p>
            <p className="mt-1 text-[var(--encre-douce)]">
              {`Version ${version.numero}, en vigueur depuis le ${dateLongue(version.dateEffet as string)}. Votre acceptation est enregistrée avec la date et l'heure ; vous pourrez le relire à tout moment dans le menu Équipe.`}
            </p>
            {version.resume && (
              <p className="mt-3 rounded-lg bg-[var(--surface-creuse)] px-3 py-2">
                <span className="font-semibold">Ce qui change : </span>
                {version.resume}
              </p>
            )}
          </div>

          <TexteReglement version={version} />
          <Acceptation versionId={version.id} numero={version.numero} suite="/accueil" />
        </div>
      </main>
      {/* Un règlement se lit en plus de quinze minutes : sans signe de vie, l'acceptation tomberait sur un verrou. */}
      <VerrouInactivite cible="coque-reglement" delaiMinutes={session.delaiVerrouillage} nom={session.nom} email={session.email} entreprise={session.organizationNom} />
    </>
  );
}
