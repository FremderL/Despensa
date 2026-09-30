import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AccionesLote,
  BotonEliminarArticulo,
  FormularioEditarArticulo,
  FormularioNuevoLote,
} from "@/components/formularios-inventario";
import { IconoCaja } from "@/components/iconos";
import {
  Aviso,
  ChipEstado,
  EstadoVacio,
  Insignia,
  Seccion,
  Tarjeta,
  cx,
} from "@/components/ui";
import { requireMiembro } from "@/lib/authz";
import { ETIQUETA_MOVIMIENTO } from "@/lib/catalogos";
import { CLASES_ESTADO } from "@/lib/expiry";
import { cantidadConUnidad, formatearDinero, formatearFecha, tiempoRelativo } from "@/lib/format";
import { categoriasDe, detalleArticulo, ubicacionesDe } from "@/lib/queries";


export default async function PaginaArticulo({
  params,
  searchParams,
}: {
  params: Promise<{ householdId: string; itemId: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { householdId, itemId } = await params;
  const ctx = await requireMiembro(householdId, "viewer");

  const [sp, detalle, categorias, ubicaciones] = await Promise.all([
    searchParams,
    detalleArticulo(householdId, itemId, ctx.despensa.expiryWarningDays),
    categoriasDe(householdId),
    ubicacionesDe(householdId),
  ]);

  if (!detalle) notFound();

  const { articulo, lotes, total, bajoMinimo, movimientos } = detalle;
  const base = `/despensas/${householdId}`;
  const puedeEditar = ctx.puede("member");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`${base}/inventario`}
          className="text-sm font-medium text-slate-500 hover:text-marca-700 dark:text-slate-400 dark:hover:text-marca-400"
        >
          ← Volver al inventario
        </Link>
      </div>

      {sp.creado && <Aviso tono="exito">Artículo creado. Ya aparece en el inventario.</Aviso>}

      {/* ------------------------------ Cabecera ----------------------------- */}
      <Tarjeta className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{articulo.name}</h2>
              {articulo.categoryName && (
                <Insignia punto="" className="bg-slate-100 dark:bg-slate-800">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: articulo.categoryColor ?? "#94a3b8" }}
                    aria-hidden
                  />
                  {articulo.categoryName}
                </Insignia>
              )}
              {bajoMinimo && (
                <Insignia className="bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300">
                  Hay que reponer
                </Insignia>
              )}
            </div>

            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {articulo.brand && <>{articulo.brand} · </>}
              {articulo.barcode && <>Código {articulo.barcode} · </>}
              Creado {tiempoRelativo(articulo.createdAt)}
            </p>

            {articulo.notes && (
              <p className="mt-3 max-w-prose rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {articulo.notes}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Existencia total
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
              {cantidadConUnidad(total, articulo.unit)}
            </p>
            {articulo.minQuantity > 0 && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Mínimo: {articulo.minQuantity}
              </p>
            )}
          </div>
        </div>
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* -------------------------------- Lotes ---------------------------- */}
        <div className="space-y-6 lg:col-span-3">
          <Seccion titulo="Lotes" descripcion="Cada compra o preparación, con su propia fecha">
            {lotes.length === 0 ? (
              <EstadoVacio
                icono={<IconoCaja className="size-9" />}
                titulo="Sin lotes registrados"
                descripcion="Añade uno para empezar a llevar la cuenta de la existencia y las fechas."
              />
            ) : (
              <ul className="space-y-3">
                {lotes.map((l) => (
                  <li
                    key={l.id}
                    className={cx(
                      "rounded-xl border border-l-4 border-slate-200 p-4 dark:border-slate-800",
                      CLASES_ESTADO[l.estado].borde,
                      l.quantity <= 0 && "opacity-55",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold tabular-nums text-slate-900 dark:text-white">
                          {cantidadConUnidad(l.quantity, articulo.unit)}
                          {l.quantity <= 0 && (
                            <span className="ml-2 text-xs font-normal text-slate-500">agotado</span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {l.expiresAt ? (
                            <>
                              {l.expiryType === "consumo_preferente" ? "Consumo preferente" : "Caduca"}:{" "}
                              {formatearFecha(l.expiresAt)}
                            </>
                          ) : (
                            "Sin fecha de caducidad"
                          )}
                          {l.locationName && ` · ${l.locationName}`}
                          {l.price !== null && ` · ${formatearDinero(l.price)}`}
                        </p>
                        {l.note && (
                          <p className="mt-1 text-xs text-slate-500 italic dark:text-slate-400">{l.note}</p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                          Añadido {tiempoRelativo(l.createdAt)}
                          {l.creadoPor && ` por ${l.creadoPor}`}
                        </p>
                      </div>

                      <ChipEstado estado={l.estado} texto={l.etiquetaEstado} />
                    </div>

                    {puedeEditar && l.quantity > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <AccionesLote
                          householdId={householdId}
                          batchId={l.id}
                          cantidad={l.quantity}
                          unidad={articulo.unit}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {puedeEditar && (
            <Seccion titulo="Añadir un lote" descripcion="Compraste más, o cocinaste algo nuevo">
              <FormularioNuevoLote
                householdId={householdId}
                itemId={itemId}
                ubicaciones={ubicaciones}
                ubicacionPorDefecto={articulo.defaultLocationId}
              />
            </Seccion>
          )}
        </div>

        {/* ------------------------------ Lateral ---------------------------- */}
        <div className="space-y-6 lg:col-span-2">
          {puedeEditar && (
            <Seccion titulo="Editar artículo" descripcion="Datos generales, no de un lote concreto">
              <FormularioEditarArticulo
                householdId={householdId}
                articulo={articulo}
                categorias={categorias}
                ubicaciones={ubicaciones}
              />
            </Seccion>
          )}

          <Seccion titulo="Historial" descripcion="Últimos movimientos de este artículo">
            {movimientos.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Sin movimientos todavía.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-700 dark:text-slate-200">
                      {ETIQUETA_MOVIMIENTO[m.type] ?? m.type}
                      <span className="ml-1.5 tabular-nums text-slate-500 dark:text-slate-400">
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {m.usuario ?? "—"} · {tiempoRelativo(m.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {puedeEditar && (
            <Seccion titulo="Zona peligrosa" descripcion="Esto no se puede deshacer">
              <BotonEliminarArticulo householdId={householdId} itemId={itemId} nombre={articulo.name} />
            </Seccion>
          )}
        </div>
      </div>
    </div>
  );
}
