import type { Metadata } from "next";
import Link from "next/link";

import { FormularioConfirmarCorreo } from "@/components/formularios-cuenta";
import { Aviso, BotonEnlace, Tarjeta } from "@/components/ui";

export const metadata: Metadata = { title: "Confirmar correo" };

export default async function PaginaVerificar({
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
          <Link href="/ingresar" className="font-semibold text-marca-700 hover:underline dark:text-marca-400">
            Ir al acceso
          </Link>
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="p-7">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Confirma tu correo</h1>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        Pulsa el botón para terminar de activar tu cuenta. Pedimos esta confirmación en vez de hacerlo
        al abrir el enlace porque algunos filtros de correo visitan las direcciones automáticamente y
        gastarían el código antes de que llegaras tú.
      </p>

      <FormularioConfirmarCorreo token={token} />

      <p className="mt-6 text-center text-sm">
        <BotonEnlace href="/ingresar" variante="fantasma" tamano="sm">
          Ir al acceso
        </BotonEnlace>
      </p>
    </Tarjeta>
  );
}
