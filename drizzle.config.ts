import { defineConfig } from "drizzle-kit";

/**
 * Las migraciones usan la conexión DIRECTA (sin `-pooler`).
 * PgBouncer en modo transacción rompe sentencias preparadas y `SET` de sesión,
 * que es justo lo que necesita una migración.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
