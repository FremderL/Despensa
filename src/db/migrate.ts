/**
 * Aplica las migraciones pendientes.
 *
 *   npm run db:migrate
 *
 * En Neon usa la conexión DIRECTA (`DATABASE_URL_UNPOOLED`): PgBouncer en modo
 * transacción rompe sentencias preparadas y estado de sesión, y las migraciones
 * fallarían de forma intermitente y difícil de diagnosticar.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { cargarEnv } from "./load-env";

cargarEnv();

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function main() {
  if (!existsSync(MIGRATIONS)) {
    throw new Error(`No existe la carpeta de migraciones: ${MIGRATIONS}`);
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!url) {
    // Desarrollo local sobre PGlite.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");

    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    mkdirSync(dir, { recursive: true });
    console.log(`→ Migrando PGlite en ${dir}`);
    const client = new PGlite(dir);
    await client.waitReady;
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    await client.close();
    console.log("✓ Migraciones aplicadas (PGlite)");
    return;
  }

  if (url.includes("-pooler.")) {
    console.warn(
      "⚠ DATABASE_URL_UNPOOLED apunta a un host con `-pooler`.\n" +
        "  Usa la cadena DIRECTA de Neon para migrar o fallarán de forma intermitente.",
    );
  }

  const { Client } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  const local = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: true },
  });

  console.log(`→ Migrando PostgreSQL (${new URL(url).host})`);
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
    console.log("✓ Migraciones aplicadas");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("✗ Falló la migración:", err);
  process.exit(1);
});
