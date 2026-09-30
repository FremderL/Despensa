import type { Metadata } from "next";

import { FormularioRegistro } from "@/components/formularios-auth";
import { Tarjeta } from "@/components/ui";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function PaginaRegistro() {
  return (
    <Tarjeta className="p-7">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Crea tu cuenta</h1>
      <p className="mt-1.5 mb-6 text-sm text-slate-600 dark:text-slate-400">
        Después podrás crear tu despensa o aceptar la invitación de alguien.
      </p>

      <FormularioRegistro />
    </Tarjeta>
  );
}
