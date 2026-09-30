import type { Metadata } from "next";
import Link from "next/link";

import { FormularioNuevaDespensa } from "@/components/formularios-despensa";
import { IconoDespensa, IconoFlecha, IconoMas } from "@/components/iconos";
import { Aviso, EstadoVacio, Insignia, Tarjeta } from "@/components/ui";
import { despensasDeUsuario, ETIQUETA_ROL } from "@/lib/authz";
import { formatearFecha } from "@/lib/format";
import { requireUsuario } from "@/lib/authz";

export const metadata: Metadata = { title: "Mis despensas" };

export default async function PaginaDespensas({
  searchParams,
}: {
  searchParams: Promise<{ eliminada?: string }>;
}) {
  const sesion = await requireUsuario();
  const [sp, despensas] = await Promise.all([searchParams, despensasDeUsuario(sesion.user.id)]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Mis despensas</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Cada despensa es un inventario independiente con sus propios miembros.
        </p>
      </div>

      {sp.eliminada && <Aviso tono="exito">La despensa se eliminó junto con todo su contenido.</Aviso>}

      {despensas.length === 0 ? (
        <Tarjeta className="p-6">
          <EstadoVacio
            icono={<IconoDespensa className="size-10" />}
            titulo="Todavía no tienes ninguna despensa"
            descripcion="Crea la primera para empezar a registrar lo que hay en casa. Si alguien te invitó, abre el enlace que te mandó."
          />
          <div className="mx-auto mt-6 max-w-sm">
            <FormularioNuevaDespensa />
          </div>
        </Tarjeta>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {despensas.map((d) => (
              <Link
                key={d.id}
                href={`/despensas/${d.id}`}
                className="tarjeta group flex items-center gap-4 p-5 transition hover:border-marca-400 hover:shadow-sm dark:hover:border-marca-700"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-700 dark:bg-marca-950 dark:text-marca-300">
                  <IconoDespensa className="size-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900 dark:text-white">
                    {d.name}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <Insignia>{ETIQUETA_ROL[d.role]}</Insignia>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Desde {formatearFecha(d.joinedAt)}
                    </span>
                  </span>
                </span>

                <IconoFlecha className="size-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-marca-600 dark:text-slate-600" />
              </Link>
            ))}
          </div>

          <Tarjeta className="p-6">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <IconoMas className="size-4 text-marca-700 dark:text-marca-400" />
              Crear otra despensa
            </h2>
            <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-400">
              Útil si gestionas más de una casa: la familiar, el departamento, la oficina.
            </p>
            <div className="max-w-sm">
              <FormularioNuevaDespensa />
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  );
}
