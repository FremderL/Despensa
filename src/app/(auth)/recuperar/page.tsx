import type { Metadata } from "next";

import { FormularioRecuperar } from "@/components/formularios-auth";
import { Tarjeta } from "@/components/ui";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function PaginaRecuperar() {
  return (
    <Tarjeta className="p-7">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        ¿Olvidaste tu contraseña?
      </h1>
      <p className="mt-1.5 mb-6 text-sm text-slate-600 dark:text-slate-400">
        Escribe tu correo y te mandamos un enlace para elegir una nueva. Caduca en una hora y sólo sirve
        una vez.
      </p>

      <FormularioRecuperar />
    </Tarjeta>
  );
}
