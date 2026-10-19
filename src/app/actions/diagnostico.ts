"use server";

import { exito, fallo, type EstadoFormulario } from "@/lib/acciones";
import { env } from "@/env";
import { sesionActual } from "@/lib/session";

/**
 * Acción de diagnóstico: no toca nada, sólo informa.
 *
 * Si este botón responde, significa que la petición superó la verificación
 * de origen del proxy, la comprobación de origen de Next y que la cookie de
 * sesión viajó. Es la forma más rápida de distinguir "la app falla" de "el
 * navegador no manda la cookie".
 */
export async function probarAccion(): Promise<EstadoFormulario> {
  // En producción esta ruta no existe; aquí se cierra también la acción.
  if (env.isProd) return fallo("No disponible.");

  const sesion = await sesionActual();

  if (!sesion) {
    return fallo(
      "La acción llegó al servidor (el origen se verificó bien), pero no venía cookie de sesión válida. " +
        "El problema está en que el navegador no guarda o no envía la cookie.",
    );
  }

  return exito(
    `Todo correcto: la escritura llegó, el origen se verificó y la sesión de ${sesion.user.name} está activa. ` +
      "Si guardar un artículo te falla, no es por la sesión.",
  );
}
