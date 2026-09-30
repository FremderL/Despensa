/**
 * Capa de acceso a datos.
 *
 * Producción (Render + Neon): driver TCP `pg` con pool pequeño de cliente.
 * Neon recomienda el driver TCP para servidores de proceso largo como Render,
 * usando la cadena agrupada (host con `-pooler`).
 *
 * Desarrollo sin DATABASE_URL: PGlite, un PostgreSQL real compilado a WASM.
 * Es el mismo dialecto, así que lo que funciona aquí funciona en Neon.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { env } from "@/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

type Global = typeof globalThis & {
  __despensaDb?: Promise<Db>;
  __despensaPgPool?: unknown;
};
const g = globalThis as Global;

/** Neon exige TLS. Verificamos el certificado salvo que se desactive a propósito. */
function sslConfig(url: string) {
  if (!env.DATABASE_SSL) return false;
  // Postgres locales sin TLS (docker, CI) se detectan por host.
  if (/@(localhost|127\.0\.0\.1|::1|host\.docker\.internal)[:/]/.test(url)) return false;
  return { rejectUnauthorized: true };
}

async function createPostgresDb(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");

  const pool = new Pool({
    connectionString: url,
    ssl: sslConfig(url),
    // Neon ya agrupa con PgBouncer: el pool de cliente se mantiene pequeño
    // para no duplicar el pooling y no agotar el límite del compute.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Un query colgado no debe bloquear un worker indefinidamente.
    statement_timeout: 15_000,
    query_timeout: 15_000,
    application_name: "despensa",
  });

  pool.on("error", (err) => {
    console.error("[db] error inesperado en cliente inactivo del pool:", err.message);
  });

  g.__despensaPgPool = pool;
  return drizzle(pool, { schema, casing: "snake_case" });
}

async function createEmbeddedDb(): Promise<Db> {
  if (env.isProd) {
    throw new Error("PGlite no puede usarse en producción: define DATABASE_URL.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");

  const dataDir = process.env.PGLITE_DIR ?? ".data/pglite";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dataDir, { recursive: true });

  const client = new PGlite(dataDir);
  await client.waitReady;
  console.log(`[db] PGlite (Postgres embebido) listo en ${dataDir}`);
  return drizzle(client, { schema, casing: "snake_case" }) as unknown as Db;
}

/**
 * Devuelve la conexión, creándola una sola vez por proceso. Se cachea en
 * `globalThis` para que el hot-reload de Next no abra un pool nuevo en cada
 * recompilación.
 */
export function getDb(): Promise<Db> {
  if (!g.__despensaDb) {
    g.__despensaDb = env.DATABASE_URL ? createPostgresDb(env.DATABASE_URL) : createEmbeddedDb();
  }
  return g.__despensaDb;
}

export { schema };
export * from "./schema";
