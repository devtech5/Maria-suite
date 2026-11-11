import type { Metadata } from "next";

import { ChampsVisite } from "@/components/visiteurs/champs-visite";
import { ListeVisites } from "@/components/visiteurs/liste-visites";
import { FormulaireRepliable } from "@/components/ui/operations";
import { CLASSE_CHAMP, Champ, EnTetePage, EtatVide } from "@/components/ui/primitives";
import { whatsappConfigure } from "@/lib/whatsapp";
import { accesVisiteurs } from "@/modules/visiteurs/acces";
import { annoncerVisite } from "@/modules/visiteurs/actions";
import { accueilsDe, journeeDe, personnesVisitables, rendezVousDe } from "@/modules/visiteurs/requetes";

export const metadata: Metadata = { title: "Rendez-vous" };

/**
 * Annoncer un visiteur : l'accueil l'attend, et lui reçoit son QR d'entrée
 * par WhatsApp. Chacun voit les rendez-vous qu'il a annoncés ou qui le
 * concernent ; la supervision les voit tous.
 */
export default async function PageRendezVous() {
  const acces = await accesVisiteurs();
  const org = acces.session.organizationId;
  const [accueils, personnes, { debut, jour }] = await Promise.all([accueilsDe(org, { actifs: true }), personnesVisitables(org), journeeDe(org)]);
  const rendezVous = await rendezVousDe(org, acces.superviser ? null : acces.session.userId, debut);
  const whatsapp = whatsappConfigure();

  return (
    <>
      <EnTetePage
        titre="Rendez-vous"
        sousTitre="Les visiteurs annoncés à l'accueil"
        actions={
          accueils.length > 0 && (
            <FormulaireRepliable libelle="Annoncer un visiteur" titre="Annoncer un visiteur" action={annoncerVisite} presentation="tiroir">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Champ libelle="Point d'accueil">
                    <select name="accueilId" required className={CLASSE_CHAMP}>
                      {accueils.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>
                  <Champ libelle="Jour">
                    <input name="jour" type="date" required min={jour} defaultValue={jour} className={CLASSE_CHAMP} />
                  </Champ>
                  <Champ libelle="Heure">
                    <input name="heure" type="time" required defaultValue="10:00" className={CLASSE_CHAMP} />
                  </Champ>
                </div>
                <ChampsVisite personnes={personnes} arrivee={false} valeurs={{ visiteUserId: acces.session.userId }} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="whatsapp" defaultChecked={whatsapp} disabled={!whatsapp} className="mt-0.5 accent-marque-600" />
                  <span>
                    Envoyer au visiteur son QR d&apos;entrée par WhatsApp
                    {!whatsapp && <span className="block text-xs text-[var(--encre-faible)]">WhatsApp n&apos;est pas configuré : copiez le lien du QR depuis la fiche du rendez-vous.</span>}
                  </span>
                </label>
              </div>
            </FormulaireRepliable>
          )
        }
      />
      {accueils.length === 0 ? (
        <EtatVide titre="Aucun point d'accueil" message="La direction doit d'abord créer les points d'accueil (siège, chantiers, sites)." />
      ) : (
        <ListeVisites visites={rendezVous} maintenant={new Date()} accueillir={acces.accueillir} vide="Aucun rendez-vous à venir." avecAccueil avecJour />
      )}
    </>
  );
}
