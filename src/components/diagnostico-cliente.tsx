"use client";

import { useActionState } from "react";

import { probarAccion } from "@/app/actions/diagnostico";
import { BotonEnvio } from "@/components/boton-envio";
import { Aviso } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/acciones";

export function PruebaDeAccion() {
  const [estado, accion] = useActionState(probarAccion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <BotonEnvio cargando="Probando…">Probar una escritura</BotonEnvio>

      {estado.mensaje && (
        <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>
      )}
    </form>
  );
}
