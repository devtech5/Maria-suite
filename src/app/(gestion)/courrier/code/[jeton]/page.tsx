import { notFound, redirect } from "next/navigation";

import { accesCourrier } from "@/modules/courrier/acces";
import { pliDe, pliParJeton } from "@/modules/courrier/requetes";

/** Où mène le QR d'une étiquette de pli : à sa fiche, pour qui peut la voir. */
export default async function PageCodePli({ params }: PageProps<"/courrier/code/[jeton]">) {
  const a = await accesCourrier();
  const { jeton } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(jeton)) notFound();
  const id = await pliParJeton(a.session.organizationId, jeton);
  const p = id ? await pliDe(a.session.organizationId, id) : null;
  if (!p || !a.voit(p)) notFound();
  redirect(`/courrier/${p.id}`);
}
