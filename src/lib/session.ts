import "server-only";

import { and, desc, eq, gt, isNull, lt, ne, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";

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
 * Nombres de la cookie de sesión.
 *
 * En producción hay UNA sola, con prefijo `__Host-`: una garantía que impone
 * el navegador, porque sólo la acepta con Secure, Path=/ y sin atributo
 * Domain. Eso impide que un subdominio comprometido plante una sesión.
 *
 * Fuera de producción se emiten DOS, con el mismo token y atributos
 * distintos. No es elegancia, es pragmatismo: la aplicación puede servirse
 * por `http://localhost` o a través de un proxy HTTPS que la muestra
 * empotrada en otro dominio, y cada caso exige atributos incompatibles entre
 * sí (`Secure` rompe el primero, su ausencia rompe el segundo). Averiguar en
 * cuál estamos depende de cabeceras que el propio servidor de desarrollo de
 * Next reescribe, así que en lugar de adivinar se ponen las dos y se usa la
 * que el navegador haya aceptado.
 */
const COOKIE_DIRECTA = "despensa_sesion";
const COOKIE_EMPOTRADA = "despensa_sesion_emb";

export const NOMBRE_COOKIE = env.isProd ? `__Host-${COOKIE_DIRECTA}` : COOKIE_DIRECTA;

/** Todos los nombres posibles, del más específico al más general. */
export const NOMBRES_COOKIE = env.isProd
  ? [NOMBRE_COOKIE]
  : [COOKIE_DIRECTA, COOKIE_EMPOTRADA];

type Atributos = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax" | "none";
  partitioned?: true;
  path: "/";
};

/**
 * Atributos de cada variante.
 *
 * - directa: `Lax` sin `Secure`. Válida sobre http en local y en cualquier
 *   navegación de primer nivel.
 * - empotrada: `None` + `Secure` + `Partitioned`. Es la única combinación que
 *   un navegador acepta dentro de un iframe de otro dominio; `Partitioned`
 *   (CHIPS) es lo que la salva del bloqueo de cookies de terceros, a cambio
 *   de quedar aislada por sitio contenedor.
 */
function atributos(variante: "directa" | "empotrada"): Atributos {
  if (variante === "empotrada") {
    return { httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/" };
  }
  return { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/" };
}

/** Qué cookies hay que emitir en este despliegue. */
function variantes(): Array<{ nombre: string; attrs: Atributos }> {
  if (env.isProd) {
    // `__Host-` exige Secure; si además se permite empotrar, hace falta None.
    const attrs: Atributos = env.ALLOW_IFRAME_EMBEDDING
      ? { httpOnly: true, secure: true, sameSite: "none", partitioned: true, path: "/" }
      : { httpOnly: true, secure: true, sameSite: "lax", path: "/" };
    return [{ nombre: NOMBRE_COOKIE, attrs }];
  }

  return [
    { nombre: COOKIE_DIRECTA, attrs: atributos("directa") },
    { nombre: COOKIE_EMPOTRADA, attrs: atributos("empotrada") },
  ];
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
  for (const { nombre, attrs } of variantes()) {
    store.set(nombre, token, { ...attrs, expires: expira });
  }
}

/**
 * Lee la cookie y devuelve la sesión válida, o null.
 *
 * Comprueba en una sola consulta: token correcto, no revocada, no caducada,
 * usuario no deshabilitado y actividad reciente.
 */
export async function sesionActual(): Promise<SesionActiva | null> {
  const store = await cookies();
  // Se acepta cualquiera de las variantes: todas llevan el mismo token.
  let token: string | undefined;
  for (const nombre of NOMBRES_COOKIE) {
    token = store.get(nombre)?.value;
    if (token) break;
  }
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

  let token: string | undefined;
  for (const nombre of NOMBRES_COOKIE) {
    token ??= store.get(nombre)?.value;
  }

  /**
   * El borrado repite los mismos atributos con que se emitió cada cookie:
   * una emitida como `Partitioned` no se elimina con un borrado que no lo
   * lleve, y quedaría viva en el navegador.
   */
  for (const { nombre, attrs } of variantes()) {
    store.set(nombre, "", { ...attrs, maxAge: 0 });
  }

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
