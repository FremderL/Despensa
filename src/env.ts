/**
 * Validación y tipado de variables de entorno.
 *
 * Se valida al arrancar el proceso: si falta algo crítico en producción la app
 * no levanta (fail fast) en lugar de fallar a mitad de una petición con la
 * seguridad degradada.
 */
import { z } from "zod";

/**
 * Next marca la fase de compilación con esta variable de entorno. Se consulta
 * para relajar los requisitos de producción mientras se construye.
 */
const ES_BUILD = process.env.NEXT_PHASE === "phase-production-build";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "si", "sí"].includes(v.toLowerCase())));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** Conexión agrupada (PgBouncer, host con sufijo `-pooler` en Neon). La usa la app. */
    DATABASE_URL: z.string().min(1).optional(),
    /** Conexión directa (sin `-pooler`). Sólo para migraciones y dumps. */
    DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
    /** Fuerza SSL contra Postgres. Neon siempre lo requiere. */
    DATABASE_SSL: bool(true),

    /**
     * Clave secreta del servidor. Se usa como llave HMAC para derivar los
     * hashes de los tokens opacos (sesión, invitación, verificación). Si la BD
     * se filtra, los tokens siguen sin poder reconstruirse sin esta clave.
     */
    AUTH_SECRET: z.string().min(32).optional(),

    /** URL pública canónica. Necesaria para los enlaces de los correos. */
    APP_URL: z.string().min(1).optional(),

    /** Correo saliente. Sin SMTP configurado, los correos se escriben en el log. */
    SMTP_URL: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(1).default("Despensa <no-reply@despensa.app>"),

    /** Cabeceras de seguridad: permite empotrar la app en un iframe (previews). */
    ALLOW_IFRAME_EMBEDDING: bool(false),

    /** Días por defecto de antelación para avisar de caducidades. */
    DEFAULT_EXPIRY_WARNING_DAYS: z.coerce.number().int().min(1).max(365).default(7),

    /** Puerto (Render lo inyecta). */
    PORT: z.coerce.number().int().default(3000),
  })
  .superRefine((val, ctx) => {
    /**
     * Durante `next build` no se exigen los secretos de producción.
     *
     * Compilar es una operación estática: no necesita una base de datos viva,
     * y pedirla ahí impediría construir la imagen en cualquier CI o probar el
     * build en local. Las mismas reglas sí se aplican en cuanto el servidor
     * atiende la primera petición, que es cuando de verdad importan.
     */
    if (val.NODE_ENV === "production" && !ES_BUILD) {
      if (!val.DATABASE_URL) {
        ctx.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: "DATABASE_URL es obligatoria en producción (cadena agrupada de Neon, con `-pooler`).",
        });
      }
      if (!val.AUTH_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_SECRET"],
          message: "AUTH_SECRET es obligatoria en producción. Genérala con: openssl rand -base64 48",
        });
      }
      if (!val.APP_URL) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "APP_URL es obligatoria en producción (p. ej. https://despensa.onrender.com).",
        });
      }
    }
  });

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n");
    throw new Error(`Configuración de entorno inválida:\n${detalle}`);
  }
  return parsed.data;
}

const parsed = load();

/**
 * En desarrollo aceptamos una clave fija y evidente: es un valor de juguete,
 * nunca debe existir en producción (el esquema de arriba lo impide).
 */
const DEV_SECRET = "clave-de-desarrollo-no-usar-en-produccion-0000000000";

export const env = {
  ...parsed,
  AUTH_SECRET: parsed.AUTH_SECRET ?? DEV_SECRET,
  APP_URL: (parsed.APP_URL ?? `http://localhost:${parsed.PORT}`).replace(/\/+$/, ""),
  isProd: parsed.NODE_ENV === "production",
  isDev: parsed.NODE_ENV === "development",
  /** Sin DATABASE_URL usamos PGlite (Postgres embebido) para desarrollo local. */
  usesEmbeddedDb: !parsed.DATABASE_URL,
} as const;

export type Env = typeof env;
