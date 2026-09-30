import Link from "next/link";

import { FiltrosInventario } from "@/components/filtros-inventario";
import { IconoCaja, IconoMas } from "@/components/iconos";
import { Aviso, BotonEnlace, ChipEstado, EstadoVacio, Insignia, Tarjeta, cx } from "@/components/ui";
import { requireMiembro } from "@/lib/authz";
import { cantidadConUnidad, formatearFecha } from "@/lib/format";
import { CLASES_ESTADO } from "@/lib/expiry";
import { categoriasDe, listarInventario, ubicacionesDe, type FiltrosInventario as Filtros } from "@/lib/queries";

export const metadata = { title: "Inventario" };

export default async function PaginaInventario({
  params,
  searchParams,
}: {
  params: Promise<{ householdId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { householdId } = await params;
  const ctx = await requireMiembro(householdId, "viewer");

  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const filtros: Filtros = {
    buscar: uno(sp.buscar)?.slice(0, 80),
    categoria: uno(sp.categoria),
    ubicacion: uno(sp.ubicacion),
    estado: (uno(sp.estado) as Filtros["estado"]) ?? "todos",
    orden: (uno(sp.orden) as Filtros["orden"]) ?? "caducidad",
  };

  const [categorias, ubicaciones, filas] = await Promise.all([
    categoriasDe(householdId),
    ubicacionesDe(householdId),
    listarInventario(householdId, ctx.despensa.expiryWarningDays, filtros),
  ]);

  const base = `/despensas/${householdId}`;
  const puedeEditar = ctx.puede("member");
  const hayFiltros =
    Boolean(filtros.buscar) ||
    (filtros.categoria && filtros.categoria !== "todas") ||
    (filtros.ubicacion && filtros.ubicacion !== "todas") ||
    (filtros.estado && filtros.estado !== "todos");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Inventario
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              {filas.length} {filas.length === 1 ? "artículo" : "artículos"}
            </span>
          </h2>
        </div>
        {puedeEditar && (
          <BotonEnlace href={`${base}/inventario/nuevo`} tamano="sm">
            <IconoMas className="size-4" />
            Añadir artículo
          </BotonEnlace>
        )}
      </div>

      {uno(sp.eliminado) && <Aviso tono="exito">Artículo eliminado.</Aviso>}

      <Tarjeta className="p-4">
        <FiltrosInventario
          categorias={categorias}
          ubicaciones={ubicaciones}
          valores={{
            buscar: filtros.buscar,
            categoria: filtros.categoria,
            ubicacion: filtros.ubicacion,
            estado: filtros.estado,
            orden: filtros.orden,
          }}
        />
      </Tarjeta>

      {filas.length === 0 ? (
        <Tarjeta className="p-6">
          <EstadoVacio
            icono={<IconoCaja className="size-10" />}
            titulo={hayFiltros ? "Ningún artículo coincide" : "La despensa está vacía"}
            descripcion={
              hayFiltros
                ? "Prueba a quitar algún filtro o a buscar otra cosa."
                : "Registra lo que tengas en casa: comida, cosas del baño, limpieza, medicinas…"
            }
            accion={
              hayFiltros ? (
                <BotonEnlace href={`${base}/inventario`} variante="secundario" tamano="sm">
                  Quitar filtros
                </BotonEnlace>
              ) : (
                puedeEditar && (
                  <BotonEnlace href={`${base}/inventario/nuevo`}>
                    <IconoMas className="size-4" />
                    Añadir el primero
                  </BotonEnlace>
                )
              )
            }
          />
        </Tarjeta>
      ) : (
        <ul className="space-y-2.5">
          {filas.map((f) => (
            <li key={f.id}>
              <Link
                href={`${base}/inventario/${f.id}`}
                className={cx(
                  "tarjeta flex items-center gap-4 border-l-4 p-4 transition hover:shadow-sm",
                  CLASES_ESTADO[f.estado].borde,
                  "hover:border-l-current",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold text-slate-900 dark:text-white">{f.name}</span>
                    {f.brand && (
                      <span className="truncate text-sm text-slate-500 dark:text-slate-400">{f.brand}</span>
                    )}
                    {f.bajoMinimo && (
                      <Insignia className="bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300">
                        Reponer
                      </Insignia>
                    )}
                    {f.total <= 0 && (
                      <Insignia className="bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300">
                        Agotado
                      </Insignia>
                    )}
                  </div>

                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {f.categoryName && (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: f.categoryColor ?? "#94a3b8" }}
                          aria-hidden
                        />
                        {f.categoryName}
                      </span>
                    )}
                    {f.locationName && <span>· {f.locationName}</span>}
                    {f.lotes > 1 && <span>· {f.lotes} lotes</span>}
                    {f.proximaCaducidad && <span>· {formatearFecha(f.proximaCaducidad)}</span>}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {cantidadConUnidad(f.total, f.unit)}
                  </p>
                  <div className="mt-1.5 flex justify-end">
                    <ChipEstado estado={f.estado} texto={f.etiquetaEstado} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
