import "server-only";

import { desc, eq } from "drizzle-orm";

import { auditLog, getDb } from "@/db";
import { newId } from "@/lib/crypto";
import { requestContext } from "@/lib/request-context";

/**
 * Bitácora de seguridad.
 *
 * Sólo se insertan filas, nunca se actualizan ni se borran desde la
 * aplicación: una bitácora que el propio código puede reescribir no sirve
 * para investigar un incidente.
 *
 * `metadata` jamás debe contener contraseñas ni tokens. Guarda identificadores
 * y contexto, no secretos.
 */
export const ACCIONES = {
  registro: "usuario.registro",
  accesoOk: "usuario.acceso_correcto",
  accesoFallido: "usuario.acceso_fallido",
  cuentaBloqueada: "usuario.cuenta_bloqueada",
  cierreSesion: "usuario.cierre_sesion",
  correoVerificado: "usuario.correo_verificado",
  passwordCambiada: "usuario.password_cambiada",
  passwordRestablecida: "usuario.password_restablecida",
  recuperacionSolicitada: "usuario.recuperacion_solicitada",
  sesionRevocada: "usuario.sesion_revocada",
  despensaCreada: "despensa.creada",
  despensaActualizada: "despensa.actualizada",
  despensaEliminada: "despensa.eliminada",
  invitacionCreada: "invitacion.creada",
  invitacionAceptada: "invitacion.aceptada",
  invitacionRevocada: "invitacion.revocada",
  miembroRolCambiado: "miembro.rol_cambiado",
  miembroExpulsado: "miembro.expulsado",
  miembroSalio: "miembro.salio",
  accesoDenegado: "seguridad.acceso_denegado",
  cuotaExcedida: "seguridad.cuota_excedida",
} as const;

export type Accion = (typeof ACCIONES)[keyof typeof ACCIONES];

type EntradaAuditoria = {
  action: Accion | (string & {});
  userId?: string | null;
  householdId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Registra un evento. Nunca lanza: si la auditoría falla no debe tumbar la
 * operación del usuario, pero sí debe quedar rastro en los logs del servidor.
 */
export async function auditar(entrada: EntradaAuditoria): Promise<void> {
  try {
    const db = await getDb();
    const { ip, userAgent } = await requestContext();
    await db.insert(auditLog).values({
      id: newId(),
      action: entrada.action,
      userId: entrada.userId ?? null,
      householdId: entrada.householdId ?? null,
      metadata: entrada.metadata ?? null,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error("[auditoria] no se pudo registrar el evento", entrada.action, err);
  }
}

export async function eventosDeUsuario(userId: string, limite = 30) {
  const db = await getDb();
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      ip: auditLog.ip,
      userAgent: auditLog.userAgent,
      createdAt: auditLog.createdAt,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limite);
}

/** Traducción de códigos a texto legible para la pantalla de actividad. */
export const ETIQUETAS_ACCION: Record<string, string> = {
  "usuario.registro": "Cuenta creada",
  "usuario.acceso_correcto": "Inicio de sesión",
  "usuario.acceso_fallido": "Intento de acceso fallido",
  "usuario.cuenta_bloqueada": "Cuenta bloqueada temporalmente",
  "usuario.cierre_sesion": "Cierre de sesión",
  "usuario.correo_verificado": "Correo verificado",
  "usuario.password_cambiada": "Contraseña actualizada",
  "usuario.password_restablecida": "Contraseña restablecida",
  "usuario.recuperacion_solicitada": "Recuperación de contraseña solicitada",
  "usuario.sesion_revocada": "Sesión cerrada de forma remota",
  "despensa.creada": "Despensa creada",
  "despensa.actualizada": "Despensa actualizada",
  "despensa.eliminada": "Despensa eliminada",
  "invitacion.creada": "Invitación enviada",
  "invitacion.aceptada": "Invitación aceptada",
  "invitacion.revocada": "Invitación revocada",
  "miembro.rol_cambiado": "Rol de un miembro modificado",
  "miembro.expulsado": "Miembro retirado de la despensa",
  "miembro.salio": "Salida de una despensa",
  "seguridad.acceso_denegado": "Acceso denegado",
  "seguridad.cuota_excedida": "Demasiados intentos",
};
