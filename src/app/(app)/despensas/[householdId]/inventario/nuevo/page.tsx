import Link from "next/link";

import { FormularioNuevoArticulo } from "@/components/formularios-inventario";
import { Tarjeta } from "@/components/ui";
import { requireMiembro } from "@/lib/authz";
import { categoriasDe, ubicacionesDe } from "@/lib/queries";

export const metadata = { title: "Nuevo artículo" };

export default async function PaginaNuevoArticulo({
  params,
}: {
  params: Promise<{ householdId: string }>;
}) {
  const { householdId } = await params;
  // Sólo quien puede escribir llega a este formulario.
  await requireMiembro(householdId, "member");

  const [categorias, ubicaciones] = await Promise.all([
    categoriasDe(householdId),
    ubicacionesDe(householdId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href={`/despensas/${householdId}/inventario`}
          className="text-sm font-medium text-slate-500 hover:text-marca-700 dark:text-slate-400 dark:hover:text-marca-400"
        >
          ← Volver al inventario
        </Link>
        <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Añadir artículo</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Primero describes qué es; después, cuánto tienes y cuándo caduca. Si compras más adelante otro
          paquete, lo añades como un lote nuevo con su propia fecha.
        </p>
      </div>

      <Tarjeta className="p-6">
        <FormularioNuevoArticulo
          householdId={householdId}
          categorias={categorias}
          ubicaciones={ubicaciones}
        />
      </Tarjeta>
    </div>
  );
}
