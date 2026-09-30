"use client";

import { useActionState } from "react";

import {
  actualizarAjustes,
  crearCategoria,
  crearDespensa,
  crearUbicacion,
  eliminarCategoria,
  eliminarDespensa,
  eliminarUbicacion,
  salirDeDespensa,
} from "@/app/actions/despensas";
import { BotonEnvio, BotonEnvioIcono } from "@/components/boton-envio";
import { Campo, Selector } from "@/components/campos";
import { IconoBasura } from "@/components/iconos";
import { Aviso, clasesBoton, cx } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/acciones";
import {
  ETIQUETA_TIPO_CATEGORIA,
  ETIQUETA_TIPO_UBICACION,
  TIPOS_CATEGORIA,
  TIPOS_UBICACION,
} from "@/lib/catalogos";

export function FormularioNuevaDespensa() {
  const [estado, accion] = useActionState(crearDespensa, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}
      <Campo
        etiqueta="Nombre de la despensa"
        name="name"
        requerido
        maxLength={60}
        autoFocus
        placeholder="Casa de los Pérez"
        error={estado.errores?.name}
        ayuda="Le crearemos categorías y ubicaciones de partida que después puedes cambiar."
      />
      <BotonEnvio ancho cargando="Creando…">
        Crear despensa
      </BotonEnvio>
    </form>
  );
}

export function FormularioAjustes({
  householdId,
  nombre,
  diasAviso,
}: {
  householdId: string;
  nombre: string;
  diasAviso: number;
}) {
  const [estado, accion] = useActionState(actualizarAjustes, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.mensaje && <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>}
      <input type="hidden" name="householdId" value={householdId} />

      <Campo
        etiqueta="Nombre"
        name="name"
        defaultValue={nombre}
        requerido
        maxLength={60}
        error={estado.errores?.name}
      />

      <Campo
        etiqueta="Avisar de caducidades con esta antelación"
        name="expiryWarningDays"
        type="number"
        min={1}
        max={120}
        defaultValue={diasAviso}
        requerido
        error={estado.errores?.expiryWarningDays}
        ayuda="Días antes de la fecha en que un producto empieza a aparecer como «caduca pronto»."
      />

      <BotonEnvio cargando="Guardando…">Guardar ajustes</BotonEnvio>
    </form>
  );
}

/* ------------------------------- Categorías ------------------------------- */

export function FormularioNuevaCategoria({ householdId }: { householdId: string }) {
  const [estado, accion] = useActionState(crearCategoria, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      {estado.mensaje && <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>}
      <input type="hidden" name="householdId" value={householdId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Campo etiqueta="Nombre" name="name" requerido maxLength={40} placeholder="Snacks" />
        <Selector etiqueta="Tipo" name="kind" defaultValue="otro">
          {TIPOS_CATEGORIA.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_CATEGORIA[t]}
            </option>
          ))}
        </Selector>
        <div>
          <label htmlFor="color" className="etiqueta">
            Color
          </label>
          <input
            id="color"
            name="color"
            type="color"
            defaultValue="#64748b"
            className="h-[46px] w-16 cursor-pointer rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      <BotonEnvio variante="secundario" tamano="sm" cargando="Creando…">
        Añadir categoría
      </BotonEnvio>
    </form>
  );
}

export function BotonEliminarCategoria({
  householdId,
  id,
  nombre,
  enUso,
}: {
  householdId: string;
  id: string;
  nombre: string;
  enUso: number;
}) {
  const [estado, accion] = useActionState(eliminarCategoria, ESTADO_INICIAL);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        const texto =
          enUso > 0
            ? `«${nombre}» se usa en ${enUso} ${enUso === 1 ? "artículo" : "artículos"}, que quedarán sin categoría. ¿Continuar?`
            : `¿Eliminar la categoría «${nombre}»?`;
        if (!confirm(texto)) e.preventDefault();
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="id" value={id} />
      <BotonEnvioIcono titulo={`Eliminar ${nombre}`} className="hover:text-rose-600">
        <IconoBasura className="size-4" />
      </BotonEnvioIcono>
      {estado.mensaje && !estado.ok && <p className="error-campo">{estado.mensaje}</p>}
    </form>
  );
}

/* ------------------------------- Ubicaciones ------------------------------ */

export function FormularioNuevaUbicacion({ householdId }: { householdId: string }) {
  const [estado, accion] = useActionState(crearUbicacion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      {estado.mensaje && <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>}
      <input type="hidden" name="householdId" value={householdId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre" name="name" requerido maxLength={40} placeholder="Despensa del pasillo" />
        <Selector etiqueta="Tipo" name="kind" defaultValue="otro">
          {TIPOS_UBICACION.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_UBICACION[t]}
            </option>
          ))}
        </Selector>
      </div>

      <BotonEnvio variante="secundario" tamano="sm" cargando="Creando…">
        Añadir ubicación
      </BotonEnvio>
    </form>
  );
}

export function BotonEliminarUbicacion({
  householdId,
  id,
  nombre,
}: {
  householdId: string;
  id: string;
  nombre: string;
}) {
  const [estado, accion] = useActionState(eliminarUbicacion, ESTADO_INICIAL);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar la ubicación «${nombre}»?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="id" value={id} />
      <BotonEnvioIcono titulo={`Eliminar ${nombre}`} className="hover:text-rose-600">
        <IconoBasura className="size-4" />
      </BotonEnvioIcono>
      {estado.mensaje && !estado.ok && <p className="error-campo">{estado.mensaje}</p>}
    </form>
  );
}

/* ----------------------------- Zona peligrosa ----------------------------- */

export function FormularioSalir({ householdId, esUnicoPropietario }: { householdId: string; esUnicoPropietario: boolean }) {
  const [estado, accion] = useActionState(salirDeDespensa, ESTADO_INICIAL);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Seguro que quieres salir de esta despensa? Perderás el acceso al inventario.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      {estado.mensaje && !estado.ok && (
        <Aviso tono="error" className="mb-3">
          {estado.mensaje}
        </Aviso>
      )}
      <BotonEnvio variante="secundario" tamano="sm" disabled={esUnicoPropietario} cargando="Saliendo…">
        Salir de la despensa
      </BotonEnvio>
    </form>
  );
}

/**
 * Borrado de la despensa, con confirmación escribiendo el nombre.
 *
 * El desplegable es un `<details>` nativo y no estado de React: mantiene la
 * fricción deliberada («esto borra todo») pero sigue siendo alcanzable si el
 * JavaScript no cargó, y no cuesta ni un kilobyte de cliente.
 */
export function FormularioEliminarDespensa({
  householdId,
  nombre,
}: {
  householdId: string;
  nombre: string;
}) {
  const [estado, accion] = useActionState(eliminarDespensa, ESTADO_INICIAL);

  return (
    <details className="group" open={Boolean(estado.mensaje)}>
      <summary
        className={cx(
          clasesBoton({ variante: "peligro", tamano: "sm" }),
          "cursor-pointer list-none marker:content-none",
        )}
      >
        Eliminar la despensa
      </summary>

      <form action={accion} className="mt-4 space-y-3">
        {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}
        <input type="hidden" name="householdId" value={householdId} />

        <Campo
          etiqueta={`Escribe «${nombre}» para confirmar`}
          name="confirmacion"
          requerido
          autoComplete="off"
          error={estado.errores?.confirmacion}
          ayuda="Se borrarán todos los artículos, lotes, categorías y miembros. No hay vuelta atrás."
        />

        <BotonEnvio variante="peligro" tamano="sm" cargando="Eliminando…">
          Eliminar definitivamente
        </BotonEnvio>
      </form>
    </details>
  );
}
