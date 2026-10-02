import Link from "next/link";

import {
  IconoAlerta,
  IconoCaja,
  IconoCarrito,
  IconoCheque,
  IconoMas,
  IconoReloj,
} from "@/components/iconos";
import { Avatar, Aviso, BotonEnlace, ChipEstado, EstadoVacio, Metrica, Seccion } from "@/components/ui";
import { requireMiembro } from "@/lib/authz";
import { VERBO_MOVIMIENTO } from "@/lib/catalogos";
import { cantidadConUnidad, formatearFecha, tiempoRelativo } from "@/lib/format";
import {
  alertasCaducidad,
  articulosBajoMinimo,
  movimientosRecientes,
  resumenDespensa,
} from "@/lib/queries";


export default async function PanelDespensa({
  params,
  searchParams,
}: {
  params: Promise<{ householdId: string }>;
  searchParams: Promise<{ bienvenida?: string }>;
}) {
  const { householdId } = await params;
  const ctx = await requireMiembro(householdId, "viewer");
  const dias = ctx.despensa.expiryWarningDays;

  const [sp, resumen, alertas, bajoMinimo, actividad] = await Promise.all([
    searchParams,
    resumenDespensa(householdId, dias),
    alertasCaducidad(householdId, dias),
    articulosBajoMinimo(householdId),
    movimientosRecientes(householdId, 12),
  ]);

  const base = `/despensas/${householdId}`;
  const puedeEditar = ctx.puede("member");

  return (
    <div className="space-y-6">
      {sp.bienvenida && (
        <Aviso tono="exito" titulo={`¡Bienvenido a ${ctx.despensa.name}!`}>
          Ya formas parte de esta despensa. Lo que registres aquí lo verá el resto de miembros.
        </Aviso>
      )}

      {/* ------------------------------ Métricas ----------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica
          etiqueta="Artículos"
          valor={resumen.articulos}
          detalle={`${resumen.lotesActivos} lotes con existencia`}
          icono={<IconoCaja className="size-4" />}
          href={`${base}/inventario`}
        />
        <Metrica
          etiqueta="Caducados"
          valor={resumen.caducados}
          detalle={resumen.caducados === 0 ? "Nada que tirar" : "Revísalos cuanto antes"}
          tono={resumen.caducados > 0 ? "peligro" : "exito"}
          icono={<IconoAlerta className="size-4" />}
          href={`${base}/inventario?estado=caducado`}
        />
        <Metrica
          etiqueta="Caducan pronto"
          valor={resumen.porCaducar}
          detalle={`En los próximos ${dias} días`}
          tono={resumen.porCaducar > 0 ? "aviso" : "exito"}
          icono={<IconoReloj className="size-4" />}
          href={`${base}/inventario?estado=pronto`}
        />
        <Metrica
          etiqueta="Hay que reponer"
          valor={resumen.bajoMinimo + resumen.sinStock}
          detalle={`${resumen.sinStock} agotados · ${resumen.bajoMinimo} bajo mínimo`}
          tono={resumen.bajoMinimo + resumen.sinStock > 0 ? "aviso" : "exito"}
          icono={<IconoCarrito className="size-4" />}
          href={`${base}/reponer`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ---------------------------- Caducidades -------------------------- */}
        <Seccion
          className="lg:col-span-3"
          titulo="Atención a estas fechas"
          descripcion={`Lotes caducados o que vencen en los próximos ${dias} días`}
          acciones={
            puedeEditar && (
              <BotonEnlace href={`${base}/inventario/nuevo`} tamano="sm">
                <IconoMas className="size-4" />
                Añadir
              </BotonEnlace>
            )
          }
        >
          {alertas.length === 0 ? (
            <EstadoVacio
              icono={<IconoCheque className="size-9" />}
              titulo="Todo en orden"
              descripcion={`No hay nada caducado ni a punto de caducar en los próximos ${dias} días.`}
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {alertas.map((a) => (
                <li key={a.batchId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className="h-9 w-1 shrink-0 rounded-full"
                    style={{ background: a.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`${base}/inventario/${a.itemId}`}
                      className="block truncate font-medium text-slate-900 hover:text-marca-700 dark:text-white dark:hover:text-marca-400"
                    >
                      {a.nombre}
                      {a.marca && <span className="font-normal text-slate-500"> · {a.marca}</span>}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {cantidadConUnidad(a.cantidad, a.unit)}
                      {a.ubicacion && ` · ${a.ubicacion}`} · {formatearFecha(a.expiresAt)}
                      {a.expiryType === "consumo_preferente" && " (consumo preferente)"}
                    </p>
                  </div>
                  <ChipEstado estado={a.estado} texto={a.etiqueta} />
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <div className="space-y-6 lg:col-span-2">
          {/* -------------------------- Lista de compra ------------------------ */}
          <Seccion
            titulo="Hay que reponer"
            descripcion="Artículos por debajo de su mínimo"
            acciones={
              <Link
                href={`${base}/reponer`}
                className="text-sm font-medium text-marca-700 hover:underline dark:text-marca-400"
              >
                Ver lista
              </Link>
            }
          >
            {bajoMinimo.length === 0 ? (
              <p className="py-2 text-sm text-slate-500 dark:text-slate-400">
                Nada por debajo del mínimo. Define un mínimo en cada artículo para que aparezca aquí
                automáticamente.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {bajoMinimo.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: a.color ?? "#94a3b8" }}
                      aria-hidden
                    />
                    <Link
                      href={`${base}/inventario/${a.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 hover:text-marca-700 dark:text-slate-100 dark:hover:text-marca-400"
                    >
                      {a.nombre}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {a.total} / {a.minQuantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {/* ---------------------------- Actividad ---------------------------- */}
          <Seccion titulo="Movimientos recientes" descripcion="Quién tocó qué">
            {actividad.length === 0 ? (
              <p className="py-2 text-sm text-slate-500 dark:text-slate-400">
                Todavía no hay movimientos registrados.
              </p>
            ) : (
              <ul className="space-y-3">
                {actividad.map((m) => (
                  <li key={m.id} className="flex items-start gap-2.5">
                    <Avatar nombre={m.usuario ?? "?"} color={m.color} tamano={26} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="font-medium">{m.usuario ?? "Alguien"}</span>{" "}
                        {VERBO_MOVIMIENTO[m.type] ?? m.type}{" "}
                        <span className="font-medium">{m.itemName}</span>
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity} · {tiempoRelativo(m.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </div>
      </div>
    </div>
  );
}
