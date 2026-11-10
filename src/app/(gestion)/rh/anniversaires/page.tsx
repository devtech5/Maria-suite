import { redirect } from "next/navigation";

/** Ancienne adresse : les anniversaires sont ouverts à tous, sous « Équipe ». */
export default function AnciennePageAnniversaires(): never {
  redirect("/anniversaires");
}
