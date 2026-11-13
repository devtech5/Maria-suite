"use client";

import { useState } from "react";

import { CLASSE_CHAMP, Champ } from "@/components/ui/primitives";
import { appartientAuService, type CollaborateurRef, type ServiceRef } from "@/modules/contacts/regles";

export interface ServiceChoisi extends ServiceRef {
  actif: boolean;
}

export interface CollaborateurChoisi extends CollaborateurRef {
  nom: string;
}

/**
 * Affecter en deux temps : le service d'abord, puis une personne de CE
 * service. Changer de service remet la personne à zéro, et la liste des
 * personnes ne propose que le personnel du service choisi — la même règle
 * (`appartientAuService`) que le serveur applique à l'enregistrement.
 *
 * Champs postés : `serviceId`, `employeeId`.
 */
export function ChampsAffectation({
  services,
  collaborateurs,
  serviceId = null,
  employeeId = null,
}: {
  services: ServiceChoisi[];
  collaborateurs: CollaborateurChoisi[];
  serviceId?: string | null;
  employeeId?: string | null;
}) {
  const [service, setService] = useState(serviceId ?? "");
  const [titulaire, setTitulaire] = useState(employeeId ?? "");
  const courant = services.find((s) => s.id === service);
  const membres = courant ? collaborateurs.filter((c) => appartientAuService(c, courant)) : [];
  const propose = services.filter((s) => s.actif || s.id === service);

  return (
    <>
      <Champ libelle="Service" precision="Sans service, l'adresse reste libre.">
        <select
          name="serviceId"
          value={service}
          onChange={(e) => {
            setService(e.target.value);
            setTitulaire("");
          }}
          className={CLASSE_CHAMP}
        >
          <option value="">Aucun service</option>
          {propose.map((s) => (
            <option key={s.id} value={s.id}>
              {s.libelle}
              {s.actif ? "" : " (retiré)"}
            </option>
          ))}
        </select>
      </Champ>
      <Champ libelle="Personne du service" precision={courant ? `${membres.length} collaborateur${membres.length > 1 ? "s" : ""} dans ce service. Laissez vide pour une adresse commune au service.` : "Choisissez d'abord le service."}>
        <select
          name="employeeId"
          value={membres.some((m) => m.id === titulaire) ? titulaire : ""}
          onChange={(e) => setTitulaire(e.target.value)}
          disabled={!courant}
          className={CLASSE_CHAMP}
        >
          <option value="">Adresse commune au service</option>
          {membres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </select>
      </Champ>
    </>
  );
}
