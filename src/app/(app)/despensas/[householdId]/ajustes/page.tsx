import {
  BotonEliminarCategoria,
  BotonEliminarUbicacion,
  FormularioAjustes,
  FormularioEliminarDespensa,
  FormularioNuevaCategoria,
  FormularioNuevaUbicacion,
  FormularioSalir,
} from "@/components/formularios-despensa";
import { Aviso, Insignia, Seccion } from "@/components/ui";
import { contarPropietarios, requireMiembro } from "@/lib/authz";
import { ETIQUETA_TIPO_CATEGORIA, ETIQUETA_TIPO_UBICACION } from "@/lib/defaults";
import { categoriasDe, contarPorCategoria, ubicacionesDe } from "@/lib/queries";

export const metadata = { title: "Ajustes" };

export default async function PaginaAjustes({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  const ctx = await requireMiembro(householdId, "viewer");

  const [categorias, ubicaciones, usos, propietarios] = await Promise.all([
    categoriasDe(householdId),
    ubicacionesDe(householdId),
    contarPorCategoria(householdId),
    contarPropietarios(householdId),
  ]);

  const esAdmin = ctx.puede("admin");
  const esPropietario = ctx.rol === "owner";

  return (
    <div className="space-y-6">
      {!esAdmin && (
        <Aviso tono="info">
          Puedes consultar la configuración, pero hacen falta permisos de administrador para cambiarla.
        </Aviso>
      )}

      {esAdmin && (
        <Seccion titulo="Datos de la despensa" descripcion="Nombre y política de avisos">
          <div className="max-w-md">
            <FormularioAjustes
              householdId={householdId}
              nombre={ctx.despensa.name}
              diasAviso={ctx.despensa.expiryWarningDays}
            />
          </div>
        </Seccion>
      )}

      <Seccion
        titulo={`Categorías (${categorias.length})`}
        descripcion="Agrupan los artículos: comida, higiene, limpieza, medicamentos…"
      >
        <ul className="mb-5 divide-y divide-slate-100 dark:divide-slate-800">
          {categorias.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: c.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                {c.name}
              </span>
              <Insignia>{ETIQUETA_TIPO_CATEGORIA[c.kind]}</Insignia>
              <span className="w-20 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                {usos.get(c.id) ?? 0} artículos
              </span>
              {esAdmin && (
                <BotonEliminarCategoria
                  householdId={householdId}
                  id={c.id}
                  nombre={c.name}
                  enUso={usos.get(c.id) ?? 0}
                />
              )}
            </li>
          ))}
        </ul>

        {esAdmin && (
          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <FormularioNuevaCategoria householdId={householdId} />
          </div>
        )}
      </Seccion>

      <Seccion
        titulo={`Ubicaciones (${ubicaciones.length})`}
        descripcion="Dónde está físicamente cada cosa: alacena, refrigerador, baño…"
      >
        <ul className="mb-5 divide-y divide-slate-100 dark:divide-slate-800">
          {ubicaciones.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5 first:pt-0">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                {u.name}
              </span>
              <Insignia>{ETIQUETA_TIPO_UBICACION[u.kind]}</Insignia>
              {esAdmin && <BotonEliminarUbicacion householdId={householdId} id={u.id} nombre={u.name} />}
            </li>
          ))}
        </ul>

        {esAdmin && (
          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <FormularioNuevaUbicacion householdId={householdId} />
          </div>
        )}
      </Seccion>

      <Seccion titulo="Zona peligrosa" descripcion="Acciones que no se pueden deshacer">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
              Salir de la despensa: dejas de ver el inventario, pero la despensa sigue existiendo para
              el resto.
            </p>
            <FormularioSalir
              householdId={householdId}
              esUnicoPropietario={esPropietario && propietarios === 1}
            />
            {esPropietario && propietarios === 1 && (
              <p className="ayuda">
                Eres el único propietario. Nombra a otra persona propietaria en la pestaña de miembros
                antes de salir.
              </p>
            )}
          </div>

          {esPropietario && (
            <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                Eliminar la despensa borra los artículos, los lotes, el historial y las membresías.
              </p>
              <FormularioEliminarDespensa householdId={householdId} nombre={ctx.despensa.name} />
            </div>
          )}
        </div>
      </Seccion>
    </div>
  );
}
