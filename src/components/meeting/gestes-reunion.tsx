"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Retour, useOperation } from "@/components/ui/operations";
import { CLASSE_CHAMP } from "@/components/ui/primitives";
import { agirSurLien, agirSurReunion, enregistrerCompteRendu, inviter } from "@/modules/meeting/actions";
import { lienDeSalle, type Geste, type GesteLien } from "@/modules/meeting/calcul";

/** Terminer pour tous, ou annuler avec un motif. */
export function GestesReunion({ reunionId, gestes }: { reunionId: string; gestes: Geste[] }) {
  const op = useOperation();
  const [motif, setMotif] = useState<string | null>(null);

  if (gestes.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {gestes.includes("terminer") && (
          <button
            type="button"
            disabled={op.enCours}
            onClick={() => {
              if (confirm("Terminer la réunion pour tous les participants ?")) op.lancer(() => agirSurReunion(reunionId, "terminer"));
            }}
            className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50"
          >
            Terminer pour tous
          </button>
        )}
        {gestes.includes("annuler") && motif === null && (
          <button
            type="button"
            onClick={() => setMotif("")}
            className="h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium text-danger-600 hover:bg-[var(--surface-creuse)]"
          >
            Annuler la réunion
          </button>
        )}
      </div>
      {motif !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            op.lancer(() => agirSurReunion(reunionId, "annuler", motif), () => setMotif(null));
          }}
          className="flex w-full max-w-md gap-2"
        >
          <input value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={3} maxLength={1000} placeholder="Motif de l'annulation" className={CLASSE_CHAMP} autoFocus />
          <button type="submit" disabled={op.enCours} className="h-cible shrink-0 rounded-lg bg-danger-600 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
            Annuler
          </button>
        </form>
      )}
      <Retour resultat={op.resultat} />
    </div>
  );
}

/** Inviter d'autres membres à une réunion qui n'est pas close. */
export function InviterMembres({ reunionId, candidats }: { reunionId: string; candidats: { userId: string; nom: string }[] }) {
  const op = useOperation();
  const [choisis, setChoisis] = useState<string[]>([]);
  if (candidats.length === 0) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        op.lancer(() => inviter(reunionId, choisis), () => setChoisis([]));
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <label className="block min-w-48 flex-1">
        <span className="mb-1 block text-xs font-semibold text-[var(--encre-faible)]">Inviter d&apos;autres membres</span>
        <select
          multiple
          value={choisis}
          onChange={(e) => setChoisis(Array.from(e.target.selectedOptions, (o) => o.value))}
          className={`${CLASSE_CHAMP} h-24 py-1`}
        >
          {candidats.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.nom}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={op.enCours || choisis.length === 0} className="h-cible rounded-lg bg-marque-600 px-3.5 text-sm font-semibold text-white disabled:opacity-50">
        Inviter
      </button>
      <div className="w-full">
        <Retour resultat={op.resultat} />
      </div>
    </form>
  );
}

/** Compte rendu, rédigé par qui pilote la réunion. */
export function CompteRendu({ reunionId, initial }: { reunionId: string; initial: string | null }) {
  const op = useOperation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const donnees = new FormData(e.currentTarget);
        op.lancer(() => enregistrerCompteRendu(reunionId, donnees));
      }}
    >
      <textarea
        name="compteRendu"
        rows={8}
        maxLength={20_000}
        defaultValue={initial ?? ""}
        placeholder={"Décisions prises, qui fait quoi et pour quand…"}
        className={`${CLASSE_CHAMP} h-auto py-2`}
      />
      <div className="mt-2 flex items-center justify-end gap-3">
        <Retour resultat={op.resultat} />
        <button type="submit" disabled={op.enCours} className="h-cible rounded-lg bg-marque-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {op.enCours ? "Enregistrement…" : "Enregistrer le compte rendu"}
        </button>
      </div>
    </form>
  );
}

/** Copie le lien de la salle dans le presse-papiers ; dit qu'il est copié. */
export function CopierLien({ reunionId, className, libelle = "Copier le lien" }: { reunionId: string; className?: string; libelle?: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(lienDeSalle(window.location.origin, reunionId))
          .then(() => {
            setCopie(true);
            setTimeout(() => setCopie(false), 2_000);
          })
          .catch(() => undefined);
      }}
      className={className ?? "h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)]"}
    >
      {copie ? "Lien copié ✓" : libelle}
    </button>
  );
}

/**
 * Le lien de la salle, pour qui pilote : le désactiver (plus personne
 * n'entre), le réactiver, ou supprimer la réunion de toutes les listes.
 */
export function GestesLien({ reunionId, gestes, enLigne = false }: { reunionId: string; gestes: GesteLien[]; enLigne?: boolean }) {
  const op = useOperation();
  const routeur = useRouter();
  if (gestes.length === 0) return null;
  const bouton = "h-cible rounded-lg border border-[var(--filet)] bg-[var(--surface)] px-3.5 text-sm font-medium hover:bg-[var(--surface-creuse)] disabled:opacity-50";
  return (
    <div className={`flex flex-col gap-2 ${enLigne ? "" : "items-end"}`}>
      <div className="flex flex-wrap gap-2">
        {gestes.includes("desactiver") && (
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => agirSurLien(reunionId, "desactiver"))} className={bouton}>
            Désactiver le lien
          </button>
        )}
        {gestes.includes("reactiver") && (
          <button type="button" disabled={op.enCours} onClick={() => op.lancer(() => agirSurLien(reunionId, "reactiver"))} className={bouton}>
            Réactiver le lien
          </button>
        )}
        {gestes.includes("supprimer") && (
          <button
            type="button"
            disabled={op.enCours}
            onClick={() => {
              if (confirm("Supprimer cette réunion de toutes les listes ? Une réunion en cours est d'abord terminée pour tous.")) {
                op.lancer(() => agirSurLien(reunionId, "supprimer"), () => routeur.push("/meeting"));
              }
            }}
            className={`${bouton} text-danger-600`}
          >
            Supprimer
          </button>
        )}
      </div>
      <Retour resultat={op.resultat} />
    </div>
  );
}

/**
 * Menu « ⋯ » d'une réunion dans la liste : copier le lien pour tous ;
 * terminer, désactiver ou réactiver le lien, supprimer pour qui pilote.
 */
export function MenuReunion({
  reunionId,
  numero,
  enCours,
  gestesLien,
  peutTerminer,
}: {
  reunionId: string;
  numero: string;
  enCours: boolean;
  gestesLien: GesteLien[];
  peutTerminer: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const op = useOperation();
  const cadre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!cadre.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const entree = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-creuse)] disabled:opacity-50";
  const agir = (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setOuvert(false);
    op.lancer(fn as () => Promise<{ ok: true; message: string } | { ok: false; message: string }>);
  };

  return (
    <div ref={cadre} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Actions sur ${numero}`}
        title="Actions"
        className="flex size-10 items-center justify-center rounded-lg text-lg leading-none text-[var(--encre-douce)] hover:bg-[var(--surface-creuse)]"
      >
        ⋯
      </button>
      {ouvert && (
        <div role="menu" className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-xl border border-[var(--filet)] bg-[var(--surface)] py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            className={entree}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(lienDeSalle(window.location.origin, reunionId))
                .then(() => {
                  setCopie(true);
                  setTimeout(() => setCopie(false), 2_000);
                })
                .catch(() => undefined);
              setOuvert(false);
            }}
          >
            🔗 Copier le lien de la salle
          </button>
          {enCours && peutTerminer && (
            <button type="button" role="menuitem" className={entree} disabled={op.enCours} onClick={() => confirm("Terminer la réunion pour tous les participants ?") && agir(() => agirSurReunion(reunionId, "terminer"))}>
              ⏹ Terminer pour tous
            </button>
          )}
          {gestesLien.includes("desactiver") && (
            <button type="button" role="menuitem" className={entree} disabled={op.enCours} onClick={() => agir(() => agirSurLien(reunionId, "desactiver"))}>
              🚫 Désactiver le lien
            </button>
          )}
          {gestesLien.includes("reactiver") && (
            <button type="button" role="menuitem" className={entree} disabled={op.enCours} onClick={() => agir(() => agirSurLien(reunionId, "reactiver"))}>
              ✅ Réactiver le lien
            </button>
          )}
          {gestesLien.includes("supprimer") && (
            <button
              type="button"
              role="menuitem"
              className={`${entree} text-danger-600`}
              disabled={op.enCours}
              onClick={() => confirm("Supprimer cette réunion de toutes les listes ? Une réunion en cours est d'abord terminée pour tous.") && agir(() => agirSurLien(reunionId, "supprimer"))}
            >
              🗑 Supprimer la réunion
            </button>
          )}
        </div>
      )}
      {/* Un succès se voit dans la liste rafraîchie ; seuls la copie et un refus se disent ici. */}
      {!ouvert && (copie || (op.resultat && !op.resultat.ok)) && (
        <p className={`absolute right-0 top-11 z-20 w-max max-w-64 rounded-lg px-2.5 py-1.5 text-xs shadow ${copie ? "bg-valide-50 text-valide-600" : "bg-danger-50 text-danger-600"}`}>
          {copie ? "Lien copié" : op.resultat?.message}
        </p>
      )}
    </div>
  );
}
