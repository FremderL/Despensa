import "server-only";

import { lt, sql } from "drizzle-orm";

import { getDb, rateLimits } from "@/db";

/**
 * Limitador de intentos con ventana fija, persistido en PostgreSQL.
 *
 * Va en la base de datos y no en memoria a propósito: Render puede correr
 * varias instancias y reinicia los procesos al desplegar. Un contador en
 * memoria se reiniciaría con cada deploy y no se compartiría entre instancias,
 * que es exactamente cuando un atacante quiere que el límite no exista.
 */

export type Cuota = {
  /** Intentos permitidos dentro de la ventana. */
  limite: number;
  /** Duración de la ventana en segundos. */
  ventanaSeg: number;
};

export type ResultadoCuota = {
  permitido: boolean;
  restantes: number;
  /** Segundos que faltan para que la ventana se reinicie. */
  reintentarEn: number;
};

/** Cuotas por operación sensible. Deliberadamente estrictas. */
export const CUOTAS = {
  /**
   * Acceso por IP: frena el barrido de credenciales filtradas.
   * Holgada a propósito: una casa entera comparte la IP del router y no
   * queremos dejar fuera a la familia. El cerrojo fino es el de por cuenta.
   */
  loginPorIp: { limite: 30, ventanaSeg: 15 * 60 },
  /** Acceso por cuenta: frena el ataque dirigido a una persona. */
  loginPorCuenta: { limite: 8, ventanaSeg: 15 * 60 },
  registroPorIp: { limite: 5, ventanaSeg: 60 * 60 },
  recuperarPorIp: { limite: 5, ventanaSeg: 60 * 60 },
  recuperarPorCuenta: { limite: 3, ventanaSeg: 60 * 60 },
  invitacionPorUsuario: { limite: 30, ventanaSeg: 60 * 60 },
  canjearInvitacionPorIp: { limite: 10, ventanaSeg: 60 * 60 },
  escrituraPorUsuario: { limite: 240, ventanaSeg: 60 },
} as const satisfies Record<string, Cuota>;

/**
 * Registra un intento y dice si se permite.
 *
 * La operación es un único `INSERT ... ON CONFLICT DO UPDATE`, así que dos
 * peticiones simultáneas no pueden colarse por una condición de carrera.
 */
export async function consumirCuota(clave: string, cuota: Cuota): Promise<ResultadoCuota> {
  const db = await getDb();
  const ahora = new Date();
  const fin = new Date(ahora.getTime() + cuota.ventanaSeg * 1000);

  const [fila] = await db
    .insert(rateLimits)
    .values({ key: clave, count: 1, windowStart: ahora, expiresAt: fin })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Si la ventana anterior ya venció, empezamos una nueva desde 1.
        count: sql`case when ${rateLimits.expiresAt} < now() then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.expiresAt} < now() then now() else ${rateLimits.windowStart} end`,
        expiresAt: sql`case when ${rateLimits.expiresAt} < now() then ${fin.toISOString()}::timestamptz else ${rateLimits.expiresAt} end`,
      },
    })
    .returning({ count: rateLimits.count, expiresAt: rateLimits.expiresAt });

  const usados = fila?.count ?? 1;
  const expira = fila?.expiresAt ?? fin;
  const reintentarEn = Math.max(0, Math.ceil((expira.getTime() - Date.now()) / 1000));

  return {
    permitido: usados <= cuota.limite,
    restantes: Math.max(0, cuota.limite - usados),
    reintentarEn,
  };
}

/** Borra el contador tras una operación exitosa (p. ej. acceso correcto). */
export async function liberarCuota(clave: string): Promise<void> {
  const db = await getDb();
  await db.delete(rateLimits).where(sql`${rateLimits.key} = ${clave}`);
}

/** Mantenimiento: elimina ventanas vencidas. */
export async function limpiarCuotas(): Promise<void> {
  const db = await getDb();
  await db.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date()));
}

export function minutos(segundos: number): string {
  if (segundos < 60) return `${segundos} segundos`;
  const m = Math.ceil(segundos / 60);
  return m === 1 ? "1 minuto" : `${m} minutos`;
}
