import type { Metadata } from "next";

import { FormularioAcceso } from "@/components/formularios-auth";
import { Aviso, Tarjeta } from "@/components/ui";
import { destinoSeguro } from "@/lib/acciones";

export const metadata: Metadata = { title: "Ingresar" };

export default async function PaginaIngresar({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string; expirada?: string }>;
}) {
  const sp = await searchParams;
  // Nunca se propaga un destino externo: sería un salto de phishing gratis.
  const siguiente = sp.siguiente ? destinoSeguro(sp.siguiente) : undefined;

  return (
    <Tarjeta className="p-7">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Bienvenido de vuelta</h1>
      <p className="mt-1.5 mb-6 text-sm text-slate-600 dark:text-slate-400">
        Entra para ver qué hay en tu despensa.
      </p>

      {sp.expirada && (
        <Aviso tono="aviso" className="mb-5">
          Tu sesión caducó por inactividad. Vuelve a entrar.
        </Aviso>
      )}

      <FormularioAcceso siguiente={siguiente} />
    </Tarjeta>
  );
}
