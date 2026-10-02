import Link from "next/link";

import { BotonDescartar, FormularioReponer } from "@/components/formularios-reponer";
import { IconoCheque } from "@/components/iconos";
import { Aviso, EstadoVacio, Insignia, Seccion, cx } from "@/components/ui";
import { requireMiembro } from "@/lib/authz";
import { cantidadConUnidad, tiempoRelativo } from "@/lib/format";
import { listaDeReposicion, type FilaReposicion } from "@/lib/queries";

export const metadata = { title: "Reponer" };

export default async function PaginaReponer({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const ctx = await requireMiembro(householdId, "viewer");
  const puedeEditar = ctx.puede("member");

  const filas = await listaDeReposicion(householdId);
  const agotados = filas.filter((f) => f.agotado);
  const bajos = filas.filter((f) => !f.agotado);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Qué hay que reponer</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Lo que se acabó y lo que está por debajo de su mínimo. Puedes reponerlo aquí mismo sin
          entrar en cada ficha, o quitarlo del inventario si ya no lo compras.
        </p>
      </div>

      {filas.length === 0 ? (
        <Seccion titulo="Nada que reponer" descripcion="La despensa está al día">
          <EstadoVacio
            icono={<IconoCheque className="size-9" />}
            titulo="No falta nada"
            descripcion="Aparecerán aquí los artículos que se agoten y los que bajen del mínimo que les hayas puesto."
          />
        </Seccion>
      ) : (
        <>
          <Seccion
            titulo={`Agotados (${agotados.length})`}
            descripcion="Sin existencia: no queda ninguna unidad"
          >
            {agotados.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ninguno. Todo lo registrado tiene al menos algo.
              </p>
            ) : (
              <Lista
                filas={agotados}
                householdId={householdId}
                puedeEditar={puedeEditar}
                acento="border-l-rose-500"
              />
            )}
          </Seccion>

          <Seccion
            titulo={`Por debajo del mínimo (${bajos.length})`}
            descripcion="Queda algo, pero menos de lo que quieres tener en casa"
          >
            {bajos.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ninguno. Define un mínimo en la ficha de un artículo para vigilarlo aquí.
              </p>
            ) : (
              <Lista
                filas={bajos}
                householdId={householdId}
                puedeEditar={puedeEditar}
                acento="border-l-amber-400"
              />
            )}
          </Seccion>
        </>
      )}

      {!puedeEditar && (
        <Aviso tono="info">
          Puedes consultar la lista, pero hace falta el rol de miembro para reponer o eliminar.
        </Aviso>
      )}
    </div>
  );
}

function Lista({
  filas,
  householdId,
  puedeEditar,
  acento,
}: {
  filas: FilaReposicion[];
  householdId: string;
  puedeEditar: boolean;
  acento: string;
}) {
  return (
    <ul className="space-y-3">
      {filas.map((f) => {
        // Se propone lo que falta para llegar al mínimo; si no hay mínimo, una.
        const sugerida = f.minQuantity > 0 ? Math.max(1, f.minQuantity - f.total) : 1;

        return (
          <li
            key={f.id}
            className={cx("rounded-xl border border-l-4 border-slate-200 p-4 dark:border-slate-800", acento)}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/despensas/${householdId}/inventario/${f.id}`}
                  className="font-semibold text-slate-900 hover:text-marca-700 dark:text-white dark:hover:text-marca-400"
                >
                  {f.nombre}
                </Link>
                {f.marca && (
                  <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{f.marca}</span>
                )}

                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {f.categoria && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: f.color ?? "#94a3b8" }}
                        aria-hidden
                      />
                      {f.categoria}
                    </span>
                  )}
                  {f.ubicacion && <span>· {f.ubicacion}</span>}
                  {f.ultimoMovimiento && <span>· último movimiento {tiempoRelativo(f.ultimoMovimiento)}</span>}
                </p>
              </div>

              <div className="text-right">
                {f.agotado ? (
                  <Insignia className="bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/60 dark:text-rose-300">
                    Agotado
                  </Insignia>
                ) : (
                  <p className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {cantidadConUnidad(f.total, f.unit)}
                  </p>
                )}
                {f.minQuantity > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    mínimo {f.minQuantity}
                  </p>
                )}
              </div>
            </div>

            {puedeEditar && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <FormularioReponer
                  householdId={householdId}
                  itemId={f.id}
                  unidad={f.unit}
                  sugerida={sugerida}
                  ubicacionId={f.ubicacionId}
                />
                <BotonDescartar householdId={householdId} itemId={f.id} nombre={f.nombre} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
