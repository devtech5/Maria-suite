import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { BoiteMail } from "@/components/boite-mail/boite";
import { ConnexionBoite } from "@/components/boite-mail/connexion";
import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { db } from "@/db";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";
import { comptesCourriel } from "@/modules/boite-mail/schema";

export const metadata: Metadata = { title: "Boîte mail" };

/** La boîte mail de la personne connectée, consultée sans quitter Maria Suite. */
export default async function PageBoiteMail() {
  if (!moduleOuvert("boite_mail")) return <ModuleEnPreparation cle="boite_mail" />;
  if (!(await peut("boite_mail.utiliser"))) return <AccesRefuse droit="boite_mail.utiliser" />;
  const session = await exigerEntreprise();
  // Les réglages seulement : le mot de passe chiffré ne quitte pas le serveur.
  const [compte] = await db
    .select({ adresse: comptesCourriel.adresse, signature: comptesCourriel.signature })
    .from(comptesCourriel)
    .where(and(eq(comptesCourriel.organizationId, session.organizationId), eq(comptesCourriel.userId, session.userId)));

  return (
    <>
      <h1 className="mb-3 text-xl font-bold tracking-tight">Boîte mail</h1>
      {compte ? <BoiteMail adresse={compte.adresse} signature={compte.signature} /> : <ConnexionBoite adresseInitiale={session.email ?? undefined} />}
    </>
  );
}
