import type { Metadata } from "next";
import Link from "next/link";

import { FormularioRestablecer } from "@/components/formularios-auth";
import { Aviso, Tarjeta } from "@/components/ui";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function PaginaRestablecer({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Tarjeta className="p-7">
        <Aviso tono="error" titulo="Enlace incompleto">
          Falta el código del enlace. Ábrelo tal cual llegó en el correo.
        </Aviso>
        <p className="mt-6 text-center text-sm">
          <Link href="/recuperar" className="font-semibold text-marca-700 hover:underline dark:text-marca-400">
            Pedir un enlace nuevo
          </Link>
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="p-7">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Elige una contraseña</h1>
      <p className="mt-1.5 mb-6 text-sm text-slate-600 dark:text-slate-400">
        Al guardarla cerraremos todas las sesiones abiertas de tu cuenta.
      </p>

      <FormularioRestablecer token={token} />
    </Tarjeta>
  );
}
