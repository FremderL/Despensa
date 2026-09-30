/**
 * Punto de entrada de la base de datos para el código de la aplicación.
 *
 * `server-only` hace que el build falle si alguna vez se importa este módulo
 * desde un componente de cliente: la cadena de conexión y las consultas no
 * pueden acabar en el bundle del navegador ni por accidente.
 *
 * Los scripts que corren fuera de Next (migraciones) importan `./client`.
 */
import "server-only";

export { getDb, type Db } from "./client";
export * from "./schema";
export * as schema from "./schema";
