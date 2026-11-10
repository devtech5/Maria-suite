import type { Metadata } from "next";

import { AccesRefuse } from "@/components/coque/acces-refuse";
import { ModuleEnPreparation } from "@/components/coque/module-en-preparation";
import { Messagerie } from "@/components/messagerie/messagerie";
import { exigerEntreprise } from "@/lib/auth/dal";
import { peut } from "@/lib/droits/garde";
import { moduleOuvert } from "@/lib/modules/garde";
import { conversation, conversationsDe, marquerConversationLue, membresEchangeables } from "@/modules/messagerie/conversations";

export const metadata: Metadata = { title: "Messagerie" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Messagerie interne : discussions privées entre collègues et groupes. */
export default async function PageMessagerie({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  if (!moduleOuvert("messagerie")) return <ModuleEnPreparation cle="messagerie" />;
  if (!(await peut("messagerie.utiliser"))) return <AccesRefuse droit="messagerie.utiliser" />;
  const session = await exigerEntreprise();
  const { c } = await searchParams;

  const ouverte = c && UUID.test(c) ? await conversation(session.organizationId, session.userId, c) : null;
  if (ouverte && !ouverte.retire) await marquerConversationLue(session.organizationId, session.userId, ouverte.id);
  const [liste, membres, gereLesGroupes] = await Promise.all([
    conversationsDe(session.organizationId, session.userId),
    membresEchangeables(session.organizationId, session.userId),
    peut("messagerie.groupe.gerer"),
  ]);

  return (
    <>
      <h1 className="sr-only">Messagerie</h1>
      <Messagerie moi={session.userId} initiales={liste} ouverteInitiale={ouverte} membres={membres} gereLesGroupes={gereLesGroupes} />
    </>
  );
}
