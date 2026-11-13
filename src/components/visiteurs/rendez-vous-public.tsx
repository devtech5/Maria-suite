import "server-only";

import { EmblemeMaria, SignatureMaria } from "@/components/coque/signature";
import { urlAbsolue } from "@/lib/liens-publics";
import { visiteDe } from "@/modules/visiteurs/requetes";

import { Qr } from "./qr";

const QUAND = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Ce que le visiteur ouvre depuis le lien reçu par WhatsApp : son QR
 * d'entrée, l'heure et le lieu du rendez-vous. Rien d'autre — ni pièce, ni
 * téléphone, ni motif. Un rendez-vous passé, annulé ou honoré ne montre
 * plus de QR.
 */
export async function RendezVousPublic({ organizationId, visiteId }: { organizationId: string; visiteId: string }) {
  const v = await visiteDe(organizationId, visiteId).catch(() => null);
  if (!v) return null;
  const valable = v.statut === "attendue";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--fond)] px-4 py-8">
      <article className="w-full max-w-sm rounded-3xl border border-[var(--filet)] bg-[var(--surface)] p-6 text-center shadow-sm">
        <EmblemeMaria className="mx-auto size-14" />
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--encre-faible)]">MARIA GROUP SARL</p>
        <h1 className="mt-1 text-xl font-bold">Votre rendez-vous</h1>
        <p className="mt-1 text-sm text-[var(--encre-douce)]">{v.nom}</p>
        {valable ? (
          <>
            <Qr texte={urlAbsolue(`/visiteurs/badge/${v.jetonBadge}`)} titre="QR d'entrée" className="mx-auto mt-5 w-56 rounded-xl border border-[var(--filet)] p-2 [&_svg]:h-auto [&_svg]:w-full" />
            <p className="mt-4 font-semibold">{v.attenduLe ? QUAND.format(v.attenduLe) : ""}</p>
            <p className="text-sm text-[var(--encre-douce)]">{v.accueil}</p>
            {(v.visiteNom || v.visiteLibelle) && <p className="mt-1 text-sm text-[var(--encre-douce)]">Vous êtes attendu par {v.visiteNom ?? v.visiteLibelle}.</p>}
            <p className="mt-4 text-xs text-[var(--encre-faible)]">Présentez ce QR et votre pièce d&apos;identité à l&apos;accueil. Référence {v.numero}.</p>
          </>
        ) : (
          <p className="mt-5 rounded-xl bg-[var(--surface-creuse)] px-4 py-3 text-sm text-[var(--encre-douce)]">
            {v.statut === "annulee" ? "Ce rendez-vous a été annulé." : "Ce QR a déjà servi : il n'est plus valable."}
          </p>
        )}
      </article>
      <SignatureMaria />
    </main>
  );
}
