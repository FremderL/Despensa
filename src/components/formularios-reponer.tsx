"use client";

import { useActionState } from "react";

import { agregarLote, eliminarArticulo } from "@/app/actions/inventario";
import { BotonEnvio, BotonEnvioIcono } from "@/components/boton-envio";
import { IconoBasura } from "@/components/iconos";
import { Aviso } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/acciones";

/**
 * Reposición en una línea: cantidad, caducidad opcional y listo.
 *
 * Es deliberadamente más corto que el alta de un lote completo. Esta pantalla
 * se usa al volver de la compra, con las bolsas a medio vaciar: pedir aquí
 * ubicación, precio y tipo de fecha garantizaría que nadie la rellene. Lo
 * demás se puede completar después desde la ficha.
 */
export function FormularioReponer({
  householdId,
  itemId,
  unidad,
  sugerida,
  ubicacionId,
}: {
  householdId: string;
  itemId: string;
  unidad: string;
  /** Cantidad propuesta: lo que falta para llegar al mínimo. */
  sugerida: number;
  ubicacionId: string | null;
}) {
  const [estado, accion] = useActionState(agregarLote, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="locationId" value={ubicacionId ?? ""} />
      <input type="hidden" name="expiryType" value="caducidad" />

      <label htmlFor={`rep-q-${itemId}`} className="sr-only">
        Cantidad que repones
      </label>
      <input
        id={`rep-q-${itemId}`}
        name="quantity"
        type="number"
        step="any"
        min="0"
        defaultValue={sugerida}
        required
        className="campo h-9 w-20 py-0 text-sm"
        aria-label={`Cantidad en ${unidad}`}
      />

      <label htmlFor={`rep-f-${itemId}`} className="sr-only">
        Fecha de caducidad (opcional)
      </label>
      <input
        id={`rep-f-${itemId}`}
        name="expiresAt"
        type="date"
        className="campo h-9 w-auto py-0 text-sm"
        aria-label="Caduca el (opcional)"
      />

      <BotonEnvio tamano="sm" cargando="…">
        Reponer
      </BotonEnvio>

      {estado.mensaje && (
        <p
          className={
            estado.ok
              ? "w-full text-xs font-medium text-emerald-600 dark:text-emerald-400"
              : "w-full text-xs font-medium text-rose-600 dark:text-rose-400"
          }
        >
          {estado.ok ? "Repuesto." : estado.mensaje}
        </p>
      )}
    </form>
  );
}

/** Elimina el artículo sin salir de la lista. */
export function BotonDescartar({
  householdId,
  itemId,
  nombre,
}: {
  householdId: string;
  itemId: string;
  nombre: string;
}) {
  const [estado, accion] = useActionState(eliminarArticulo, ESTADO_INICIAL);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar «${nombre}» del inventario? Se borrarán también sus lotes.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="destino" value="lista" />

      <BotonEnvioIcono titulo={`Eliminar ${nombre}`} className="hover:text-rose-600">
        <IconoBasura className="size-4" />
      </BotonEnvioIcono>

      {estado.mensaje && !estado.ok && (
        <Aviso tono="error" className="mt-2">
          {estado.mensaje}
        </Aviso>
      )}
    </form>
  );
}
