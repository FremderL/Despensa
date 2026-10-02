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
 * Averigua cómo debe emitirse la cookie para que el navegador la acepte.
 *
 * No es un detalle menor: si los atributos no encajan con el contexto, el
 * navegador descarta la cookie en silencio, sin ningún error en el servidor,
 * y la sesión parece "perderse" en cada navegación.
 *
 * Tres escenarios y lo que exige cada uno:
 *
 *   1. `http://localhost` en desarrollo → `Secure` haría que se descartase y
 *      `SameSite=None` sin `Secure` es inválido. Toca `Lax` sin `Secure`.
 *   2. Vista previa por HTTPS dentro de un iframe de otro dominio → con `Lax`
 *      la cookie no viaja, porque el sitio de nivel superior no es el nuestro.
 *      Hacen falta `None` + `Secure`, y además `Partitioned`, que es lo que
 *      permite a Chrome aceptarla pese al bloqueo de cookies de terceros: la
 *      guarda aislada por sitio contenedor.
 *   3. Producción en su propio dominio → `Lax`, lo más estricto que sigue
 *      funcionando, y sin depender de cookies de terceros.
 */
async function contextoCookie(): Promise<{ https: boolean; empotrada: boolean }> {
  if (env.isProd) {
    // Render termina TLS por nosotros; el tráfico hasta el usuario es HTTPS.
    return { https: true, empotrada: env.ALLOW_IFRAME_EMBEDDING };
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim();
  const esLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host);

  /**
   * `x-forwarded-proto` sólo sirve como señal POSITIVA.
   *
   * El servidor de desarrollo de Next escribe esa cabecera con el protocolo
   * del transporte local, que es `http` incluso cuando un proxy delante
   * terminó TLS. Fiarse de ella para descartar HTTPS dejaba la cookie mal
   * configurada justo en la vista previa, que es donde se usa la aplicación.
   *
   * El anfitrión sí distingue: cualquier nombre que no sea local ha llegado
   * a través del proxy, y ese proxy sirve por HTTPS.
   */
  const https = proto === "https" || (!esLocal && host !== "");

  // Fuera de producción, HTTPS implica que venimos del proxy de vista previa,
  // que muestra la aplicación empotrada en otro sitio.
  return { https, empotrada: https };
}

async function opcionesCookie(expira: Date) {
  const { https, empotrada } = await contextoCookie();

  return {
    // Invisible para JavaScript: un XSS no puede leer la sesión.
    httpOnly: true,
    secure: https,
    sameSite: empotrada ? ("none" as const) : ("lax" as const),
    // `Partitioned` sólo es válido junto a SameSite=None y Secure.
    partitioned: empotrada ? true : undefined,
    path: "/",
    expires: expira,
  };
}

/**
 * Al borrar hay que repetir exactamente los mismos atributos: una cookie
 * emitida como `Partitioned` no se elimina con un borrado sin ese atributo.
 */
async function opcionesBorrado() {
  const { https, empotrada } = await contextoCookie();
  return {
    httpOnly: true,
    secure: https,
    sameSite: empotrada ? ("none" as const) : ("lax" as const),
    partitioned: empotrada ? true : undefined,
    path: "/",
    maxAge: 0,
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
  store.set(NOMBRE_COOKIE, "", await opcionesBorrado());
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
