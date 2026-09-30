import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Carga `.env.local` y `.env` para los scripts que corren fuera de Next
 * (migraciones, semilla). Next ya lo hace solo en la aplicación.
 *
 * Se escribe a mano en lugar de añadir una dependencia: son veinte líneas y
 * el formato que necesitamos es `CLAVE=valor`. Las variables que ya existan
 * en el entorno real mandan sobre el fichero, que es lo correcto en Render.
 */
export function cargarEnv(raiz = process.cwd()): void {
  for (const nombre of [".env.local", ".env"]) {
    const ruta = path.join(raiz, nombre);
    if (!existsSync(ruta)) continue;

    for (const linea of readFileSync(ruta, "utf8").split("\n")) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;

      const igual = limpia.indexOf("=");
      if (igual === -1) continue;

      const clave = limpia.slice(0, igual).trim();
      let valor = limpia.slice(igual + 1).trim();

      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }

      if (clave && process.env[clave] === undefined) process.env[clave] = valor;
    }
  }
}
