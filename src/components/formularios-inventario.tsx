"use client";

import { useActionState, useRef } from "react";

import {
  agotarLote,
  agregarLote,
  ajustarLote,
  consumirLote,
  crearArticulo,
  editarArticulo,
  eliminarArticulo,
  eliminarLote,
} from "@/app/actions/inventario";
import { BotonEnvio, BotonEnvioIcono } from "@/components/boton-envio";
import { Area, Campo, Casilla, Selector } from "@/components/campos";
import { IconoBasura, IconoCheque } from "@/components/iconos";
import { Aviso } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/acciones";
import { sugerenciaCaducidad } from "@/lib/expiry";
import { ETIQUETA_UNIDAD, UNIDADES } from "@/lib/catalogos";

type Categoria = { id: string; name: string; kind: string };
type Ubicacion = { id: string; name: string };


function SelectorUnidad({ defaultValue = "unidad" }: { defaultValue?: string }) {
  return (
    <Selector etiqueta="Unidad de medida" name="unit" defaultValue={defaultValue}>
      {UNIDADES.map((u) => (
        <option key={u} value={u}>
          {ETIQUETA_UNIDAD[u] ?? u}
        </option>
      ))}
    </Selector>
  );
}

/* ----------------------------- Nuevo artículo ----------------------------- */

export function FormularioNuevoArticulo({
  householdId,
  categorias,
  ubicaciones,
}: {
  householdId: string;
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
}) {
  const [estado, accion] = useActionState(crearArticulo, ESTADO_INICIAL);
  const fecha = useRef<HTMLInputElement>(null);

  /**
   * Al elegir categoría sugerimos una caducidad razonable si el campo sigue
   * vacío: las sobras de la comida caducan en tres días y teclearlo cada vez
   * es justo la fricción que hace que la gente abandone un inventario.
   */
  function alCambiarCategoria(e: React.ChangeEvent<HTMLSelectElement>) {
    const kind = categorias.find((c) => c.id === e.target.value)?.kind;
    const sugerida = sugerenciaCaducidad(kind);
    if (sugerida && fecha.current && !fecha.current.value) fecha.current.value = sugerida;
  }

  return (
    <form action={accion} className="space-y-6">
      {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}
      <input type="hidden" name="householdId" value={householdId} />

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Qué es</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Nombre"
            name="name"
            requerido
            autoFocus
            maxLength={120}
            placeholder="Leche entera"
            defaultValue={estado.valores?.name}
            error={estado.errores?.name}
            className="sm:col-span-2"
          />
          <Campo
            etiqueta="Marca"
            name="brand"
            maxLength={80}
            placeholder="Opcional"
            defaultValue={estado.valores?.brand}
          />
          <Campo
            etiqueta="Código de barras"
            name="barcode"
            maxLength={32}
            inputMode="numeric"
            placeholder="Opcional"
            defaultValue={estado.valores?.barcode}
            error={estado.errores?.barcode}
          />
          <Selector
            etiqueta="Categoría"
            name="categoryId"
            defaultValue={estado.valores?.categoryId ?? ""}
            onChange={alCambiarCategoria}
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Selector>
          <Selector etiqueta="Ubicación" name="locationId" defaultValue={estado.valores?.locationId ?? ""}>
            <option value="">Sin ubicación</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Selector>
          <SelectorUnidad defaultValue={estado.valores?.unit} />
          <Campo
            etiqueta="Cantidad mínima"
            name="minQuantity"
            type="number"
            step="any"
            min={0}
            defaultValue={estado.valores?.minQuantity ?? "0"}
            error={estado.errores?.minQuantity}
            ayuda="Por debajo de este número aparecerá en «hay que reponer». 0 lo desactiva."
          />
        </div>

        <Casilla
          etiqueta="Es perecedero"
          name="perishable"
          value="true"
          defaultChecked
          ayuda="Desmárcalo para cosas sin fecha, como un cepillo o un estropajo."
        />

        <Area
          etiqueta="Notas"
          name="notes"
          rows={2}
          maxLength={500}
          placeholder="Opcional: dónde se compra, alergias, para quién es…"
          defaultValue={estado.valores?.notes}
        />
      </fieldset>

      <fieldset className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
        <legend className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
          Primer lote <span className="font-normal text-slate-500">(opcional)</span>
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Cantidad"
            name="quantity"
            type="number"
            step="any"
            min={0}
            defaultValue={estado.valores?.quantity ?? "1"}
            error={estado.errores?.quantity}
          />
          <Campo
            etiqueta="Fecha de caducidad"
            name="expiresAt"
            type="date"
            ref={fecha}
            defaultValue={estado.valores?.expiresAt}
            error={estado.errores?.expiresAt}
          />
          <Selector etiqueta="Tipo de fecha" name="expiryType" defaultValue="caducidad">
            <option value="caducidad">Fecha de caducidad (no consumir después)</option>
            <option value="consumo_preferente">Consumo preferente (pierde calidad)</option>
          </Selector>
          <Campo etiqueta="Fecha de compra" name="purchasedAt" type="date" defaultValue={estado.valores?.purchasedAt} />
          <Campo
            etiqueta="Precio"
            name="price"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={estado.valores?.price}
            error={estado.errores?.price}
          />
        </div>
      </fieldset>

      <div className="flex gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
        <BotonEnvio tamano="lg" cargando="Guardando…">
          Guardar artículo
        </BotonEnvio>
      </div>
    </form>
  );
}

/* ---------------------------- Editar artículo ----------------------------- */

export function FormularioEditarArticulo({
  householdId,
  articulo,
  categorias,
  ubicaciones,
}: {
  householdId: string;
  articulo: {
    id: string;
    name: string;
    brand: string | null;
    barcode: string | null;
    categoryId: string | null;
    defaultLocationId: string | null;
    unit: string;
    minQuantity: number;
    perishable: boolean;
    notes: string | null;
  };
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
}) {
  const [estado, accion] = useActionState(editarArticulo, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.mensaje && <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>}
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={articulo.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          name="name"
          requerido
          maxLength={120}
          defaultValue={articulo.name}
          error={estado.errores?.name}
          className="sm:col-span-2"
        />
        <Campo etiqueta="Marca" name="brand" maxLength={80} defaultValue={articulo.brand ?? ""} />
        <Campo
          etiqueta="Código de barras"
          name="barcode"
          maxLength={32}
          defaultValue={articulo.barcode ?? ""}
          error={estado.errores?.barcode}
        />
        <Selector etiqueta="Categoría" name="categoryId" defaultValue={articulo.categoryId ?? ""}>
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Ubicación" name="locationId" defaultValue={articulo.defaultLocationId ?? ""}>
          <option value="">Sin ubicación</option>
          {ubicaciones.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Selector>
        <SelectorUnidad defaultValue={articulo.unit} />
        <Campo
          etiqueta="Cantidad mínima"
          name="minQuantity"
          type="number"
          step="any"
          min={0}
          defaultValue={articulo.minQuantity}
        />
      </div>

      <Casilla etiqueta="Es perecedero" name="perishable" value="true" defaultChecked={articulo.perishable} />

      <Area etiqueta="Notas" name="notes" rows={2} maxLength={500} defaultValue={articulo.notes ?? ""} />

      <BotonEnvio cargando="Guardando…">Guardar cambios</BotonEnvio>
    </form>
  );
}

/* -------------------------------- Nuevo lote ------------------------------ */

export function FormularioNuevoLote({
  householdId,
  itemId,
  ubicaciones,
  ubicacionPorDefecto,
}: {
  householdId: string;
  itemId: string;
  ubicaciones: Ubicacion[];
  ubicacionPorDefecto: string | null;
}) {
  const [estado, accion] = useActionState(agregarLote, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.mensaje && <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>}
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Cantidad"
          name="quantity"
          type="number"
          step="any"
          min={0}
          defaultValue="1"
          requerido
          error={estado.errores?.quantity}
        />
        <Campo etiqueta="Caduca el" name="expiresAt" type="date" error={estado.errores?.expiresAt} />
        <Selector etiqueta="Tipo de fecha" name="expiryType" defaultValue="caducidad">
          <option value="caducidad">Fecha de caducidad</option>
          <option value="consumo_preferente">Consumo preferente</option>
        </Selector>
        <Selector etiqueta="Ubicación" name="locationId" defaultValue={ubicacionPorDefecto ?? ""}>
          <option value="">Sin ubicación</option>
          {ubicaciones.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Selector>
        <Campo etiqueta="Comprado el" name="purchasedAt" type="date" />
        <Campo etiqueta="Precio" name="price" inputMode="decimal" placeholder="0.00" error={estado.errores?.price} />
      </div>

      <Campo etiqueta="Nota" name="note" maxLength={300} placeholder="Opcional: oferta, se abrió el lunes…" />

      <BotonEnvio cargando="Añadiendo…">Añadir lote</BotonEnvio>
    </form>
  );
}

/* ---------------------------- Acciones sobre lote ------------------------- */

/**
 * Acciones sobre un lote: consumir una cantidad, agotarlo de golpe o
 * eliminarlo.
 *
 * El campo de cantidad está siempre a la vista en lugar de escondido tras un
 * botón «Consumir». Son menos clics para el gesto más repetido de la app y,
 * sobre todo, funciona aunque el JavaScript no haya cargado: sin él, un
 * desplegable que se abre con estado de React deja la acción inalcanzable.
 */
export function AccionesLote({
  householdId,
  batchId,
  cantidad,
  unidad,
}: {
  householdId: string;
  batchId: string;
  cantidad: number;
  unidad: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FormConsumir householdId={householdId} batchId={batchId} cantidad={cantidad} unidad={unidad} />
      <FormAgotar householdId={householdId} batchId={batchId} />
      <FormEliminarLote householdId={householdId} batchId={batchId} />
    </div>
  );
}

function FormConsumir({
  householdId,
  batchId,
  cantidad,
  unidad,
}: {
  householdId: string;
  batchId: string;
  cantidad: number;
  unidad: string;
}) {
  const [estado, accion] = useActionState(consumirLote, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="batchId" value={batchId} />

      <label htmlFor={`q-${batchId}`} className="sr-only">
        Cantidad a descontar
      </label>
      <input
        id={`q-${batchId}`}
        name="quantity"
        type="number"
        step="any"
        min="0"
        max={cantidad}
        defaultValue={Math.min(1, cantidad)}
        className="campo h-9 w-20 py-0 text-sm"
        aria-label={`Cantidad en ${unidad}`}
      />

      <label htmlFor={`m-${batchId}`} className="sr-only">
        Motivo
      </label>
      <select
        id={`m-${batchId}`}
        name="motivo"
        defaultValue="consumo"
        className="campo h-9 w-auto py-0 text-sm"
      >
        <option value="consumo">Consumido</option>
        <option value="merma">Se tiró</option>
      </select>

      <BotonEnvio variante="sutil" tamano="sm" cargando="…">
        Descontar
      </BotonEnvio>

      {estado.mensaje && (
        <p
          className={
            estado.ok
              ? "w-full text-xs font-medium text-emerald-600 dark:text-emerald-400"
              : "w-full text-xs font-medium text-rose-600 dark:text-rose-400"
          }
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

function FormAgotar({ householdId, batchId }: { householdId: string; batchId: string }) {
  const [, accion] = useActionState(agotarLote, ESTADO_INICIAL);
  return (
    <form action={accion}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="batchId" value={batchId} />
      <BotonEnvioIcono titulo="Marcar como agotado" className="hover:text-emerald-600">
        <IconoCheque className="size-4" />
      </BotonEnvioIcono>
    </form>
  );
}

function FormEliminarLote({ householdId, batchId }: { householdId: string; batchId: string }) {
  const [, accion] = useActionState(eliminarLote, ESTADO_INICIAL);
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar este lote del inventario?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="batchId" value={batchId} />
      <BotonEnvioIcono titulo="Eliminar lote" className="hover:text-rose-600">
        <IconoBasura className="size-4" />
      </BotonEnvioIcono>
    </form>
  );
}

export function FormularioAjustarLote({
  householdId,
  batchId,
  cantidad,
}: {
  householdId: string;
  batchId: string;
  cantidad: number;
}) {
  const [estado, accion] = useActionState(ajustarLote, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-end gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="batchId" value={batchId} />
      <input
        name="quantity"
        type="number"
        step="any"
        min="0"
        defaultValue={cantidad}
        className="campo h-9 w-24 py-0 text-sm"
        aria-label="Cantidad real"
      />
      <BotonEnvio variante="secundario" tamano="sm" cargando="…">
        Corregir
      </BotonEnvio>
      {estado.mensaje && !estado.ok && <p className="error-campo">{estado.mensaje}</p>}
    </form>
  );
}

export function BotonEliminarArticulo({
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
        if (!confirm(`¿Eliminar «${nombre}» y todos sus lotes? No se puede deshacer.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="itemId" value={itemId} />
      {estado.mensaje && !estado.ok && (
        <Aviso tono="error" className="mb-3">
          {estado.mensaje}
        </Aviso>
      )}
      <BotonEnvio variante="peligro" tamano="sm" cargando="Eliminando…">
        <IconoBasura className="size-4" />
        Eliminar artículo
      </BotonEnvio>
    </form>
  );
}
