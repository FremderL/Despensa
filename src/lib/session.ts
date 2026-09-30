import "server-only";

import { and, desc, eq, gt, isNull, lt, ne, type SQL } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { getDb, sessions, users } from "@/db";
import { generateToken, hashToken, newId } from "@/lib/crypto";
import { requestContext } from "@/lib/request-context";
import { env } from "@/env";

/**
 * Sesiones opacas en base de datos.
 *
 * Se eligen frente a un JWT autocontenido porque aquí sí importa poder
 * revocar: expulsar a alguien de la casa, cambiar la contraseña o cerrar la
 * sesión de un móvil perdido deben tener efecto inmediato. Un JWT firmado
 * seguiría siendo válido hasta su expiración.
 */

/** Caducidad absoluta: ni con uso continuo una sesión dura más que esto. */
const VIDA_ABSOLUTA_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
/** Inactividad máxima antes de pedir credenciales otra vez. */
const INACTIVIDAD_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
/** Evita escribir en la BD en cada request sólo para refrescar `last_used_at`. */
const REFRESCO_MS = 10 * 60 * 1000; // 10 minutos

/**
 * El prefijo `__Host-` es una garantía que impone el navegador: sólo acepta
 * la cookie si viene con Secure, Path=/ y sin atributo Domain. Impide que un
 * subdominio comprometido plante una cookie de sesión. Requiere HTTPS, así
 * que en desarrollo usamos el nombre sin prefijo.
 */
export const NOMBRE_COOKIE = env.isProd ? "__Host-despensa_sesion" : "despensa_sesion";

/**
 * ¿La petición llegó por HTTPS?
 *
 * Importa porque `Secure` y `SameSite=None` sólo son válidos sobre TLS. En
 * producción siempre lo es (Render termina TLS y marca `x-forwarded-proto`).
 * En desarrollo puede ser http://localhost o la vista previa por HTTPS, y la
 * cookie tiene que adaptarse a cada caso o el navegador la descarta.
 */
async function esHttps(): Promise<boolean> {
  if (env.isProd) return true;
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return env.APP_URL.startsWith("https://");
}

async function opcionesCookie(expira: Date) {
  const https = await esHttps();

  return {
    // Invisible para JavaScript: un XSS no puede leer la sesión.
    httpOnly: true,
    // Sólo viaja cifrada. Sobre http de desarrollo hay que desactivarlo o el
    // navegador rechazaría la cookie entera.
    secure: https,
    /**
     * En producción `lax`: la cookie no acompaña a peticiones nacidas en otro
     * sitio, lo que corta la mayoría de CSRF. Sobre la vista previa en HTTPS
     * la app vive en un iframe de otro dominio, donde `lax` bloquearía la
     * cookie; ahí hace falta `none`, que exige Secure.
     *
     * La defensa que siempre actúa es la verificación de Origin del
     * middleware; SameSite es la segunda capa.
     */
    sameSite: env.isProd ? ("lax" as const) : https ? ("none" as const) : ("lax" as const),
    path: "/",
    expires: expira,
  };
}

export type SesionActiva = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarColor: string;
    emailVerifiedAt: Date | null;
    createdAt: Date;
  };
};

/** Crea la sesión y deja la cookie puesta. */
export async function crearSesion(userId: string): Promise<void> {
  const db = await getDb();
  const { ip, userAgent } = await requestContext();

  const token = generateToken(32);
  const expira = new Date(Date.now() + VIDA_ABSOLUTA_MS);

  await db.insert(sessions).values({
    id: newId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt: expira,
    ip,
    userAgent,
  });

  const store = await cookies();
  store.set(NOMBRE_COOKIE, token, await opcionesCookie(expira));
}

/**
 * Lee la cookie y devuelve la sesión válida, o null.
 *
 * Comprueba en una sola consulta: token correcto, no revocada, no caducada,
 * usuario no deshabilitado y actividad reciente.
 */
export async function sesionActual(): Promise<SesionActiva | null> {
  const store = await cookies();
  const token = store.get(NOMBRE_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const ahora = new Date();
  const limiteInactividad = new Date(ahora.getTime() - INACTIVIDAD_MS);

  const [fila] = await db
    .select({
      sessionId: sessions.id,
      lastUsedAt: sessions.lastUsedAt,
      id: users.id,
      email: users.email,
      name: users.name,
      avatarColor: users.avatarColor,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      disabledAt: users.disabledAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, ahora),
        gt(sessions.lastUsedAt, limiteInactividad),
        isNull(users.disabledAt),
      ),
    )
    .limit(1);

  if (!fila) return null;

  // Prolongamos la ventana de inactividad, pero sin escribir en cada petición.
  if (ahora.getTime() - fila.lastUsedAt.getTime() > REFRESCO_MS) {
    await db.update(sessions).set({ lastUsedAt: ahora }).where(eq(sessions.id, fila.sessionId));
  }

  return {
    sessionId: fila.sessionId,
    user: {
      id: fila.id,
      email: fila.email,
      name: fila.name,
      avatarColor: fila.avatarColor,
      emailVerifiedAt: fila.emailVerifiedAt,
      createdAt: fila.createdAt,
    },
  };
}

/** Cierra la sesión actual y borra la cookie. */
export async function cerrarSesion(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(NOMBRE_COOKIE)?.value;
  store.delete(NOMBRE_COOKIE);
  if (!token) return null;

  const db = await getDb();
  const [revocada] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
    .returning({ userId: sessions.userId });

  return revocada?.userId ?? null;
}

/**
 * Invalida las sesiones del usuario (opcionalmente todas menos una).
 *
 * Se llama al cambiar o restablecer la contraseña: si alguien había entrado
 * con la clave antigua, deja de tener acceso en ese instante. También lo usa
 * "cerrar el resto de sesiones" desde la pantalla de cuenta.
 */
export async function revocarSesionesDeUsuario(userId: string, exceptoSessionId?: string): Promise<number> {
  const db = await getDb();
  const condiciones: SQL[] = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptoSessionId) condiciones.push(ne(sessions.id, exceptoSessionId));

  const filas = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...condiciones))
    .returning({ id: sessions.id });

  return filas.length;
}

/** Revoca una sesión concreta, comprobando que pertenece al usuario. */
export async function revocarSesion(userId: string, sessionId: string): Promise<boolean> {
  const db = await getDb();
  const filas = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return filas.length > 0;
}

export async function sesionesDeUsuario(userId: string) {
  const db = await getDb();
  const ahora = new Date();
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, ahora)))
    .orderBy(desc(sessions.lastUsedAt));
}

/** Mantenimiento: borra sesiones caducadas o revocadas hace tiempo. */
export async function purgarSesiones(): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
