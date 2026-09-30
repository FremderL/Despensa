"use client";

import { useRef } from "react";

import { IconoBuscar } from "@/components/iconos";
import { Boton } from "@/components/ui";

type Opcion = { id: string; name: string };

/**
 * Filtros del inventario.
 *
 * Es un formulario GET de verdad: el estado vive en la URL, así que los
 * filtros se pueden compartir, guardar en marcadores y funcionan aunque el
 * JavaScript no haya cargado todavía. El envío automático al cambiar un
 * desplegable es sólo una mejora encima.
 */
export function FiltrosInventario({
  categorias,
  ubicaciones,
  valores,
}: {
  categorias: Opcion[];
  ubicaciones: Opcion[];
  valores: { buscar?: string; categoria?: string; ubicacion?: string; estado?: string; orden?: string };
}) {
  const form = useRef<HTMLFormElement>(null);
  const enviar = () => form.current?.requestSubmit();

  const claseSelect =
    "campo h-10 py-0 text-sm appearance-none pr-8 bg-no-repeat cursor-pointer";
  const estiloFlecha = {
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")",
    backgroundPosition: "right 0.6rem center",
  };

  return (
    <form ref={form} method="get" className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[13rem] flex-1">
        <IconoBuscar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          name="buscar"
          defaultValue={valores.buscar ?? ""}
          placeholder="Buscar por nombre, marca o código…"
          maxLength={80}
          className="campo h-10 py-0 pl-9 text-sm"
          aria-label="Buscar en el inventario"
        />
      </div>

      <select
        name="estado"
        defaultValue={valores.estado ?? "todos"}
        onChange={enviar}
        className={claseSelect}
        style={estiloFlecha}
        aria-label="Filtrar por estado"
      >
        <option value="todos">Todos los estados</option>
        <option value="caducado">Caducados</option>
        <option value="pronto">Caducan pronto</option>
        <option value="bajo_minimo">Bajo mínimo</option>
        <option value="sin_stock">Agotados</option>
      </select>

      <select
        name="categoria"
        defaultValue={valores.categoria ?? "todas"}
        onChange={enviar}
        className={claseSelect}
        style={estiloFlecha}
        aria-label="Filtrar por categoría"
      >
        <option value="todas">Todas las categorías</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="sin_categoria">Sin categoría</option>
      </select>

      <select
        name="ubicacion"
        defaultValue={valores.ubicacion ?? "todas"}
        onChange={enviar}
        className={claseSelect}
        style={estiloFlecha}
        aria-label="Filtrar por ubicación"
      >
        <option value="todas">Todas las ubicaciones</option>
        {ubicaciones.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>

      <select
        name="orden"
        defaultValue={valores.orden ?? "caducidad"}
        onChange={enviar}
        className={claseSelect}
        style={estiloFlecha}
        aria-label="Ordenar"
      >
        <option value="caducidad">Por urgencia</option>
        <option value="nombre">Por nombre</option>
        <option value="reciente">Más recientes</option>
      </select>

      <Boton type="submit" variante="secundario" tamano="sm" className="h-10">
        Filtrar
      </Boton>
    </form>
  );
}
