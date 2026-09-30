import "server-only";

import { and, asc, count, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { getDb, householdMembers, households } from "@/db";
import { ETIQUETA_ROL, tienePermiso, type Rol } from "@/lib/catalogos";
import { sesionActual, type SesionActiva } from "@/lib/session";

/**
 * Control de acceso.
 *
 * Principio: ninguna consulta de datos se ejecuta sin haber resuelto antes la
 * pertenencia del usuario a la despensa. El identificador de la despensa
 * siempre viene de la URL, es decir, del usuario: tratarlo como dato de
 * confianza sería una referencia directa insegura a objetos (IDOR), el fallo
 * más común en aplicaciones multi-inquilino.
 */

/**
 * Las etiquetas y la jerarquía viven en `@/lib/catalogos` (sin dependencias de
 * servidor) y se reexportan aquí por comodidad del código de servidor.
 */
export { DESCRIPCION_ROL, ETIQUETA_ROL, JERARQUIA, tienePermiso } from "@/lib/catalogos";

/** Error de autorización que las server actions convierten en mensaje. */
export class ErrorAutorizacion extends Error {
  constructor(message = "No tienes permiso para hacer esto.") {
    super(message);
    this.name = "ErrorAutorizacion";
  }
}

/** Exige sesión. Redirige al acceso conservando el destino. */
export async function requireUsuario(destino?: string): Promise<SesionActiva> {
  const sesion = await sesionActual();
  if (!sesion) {
    const siguiente = destino ? `?siguiente=${encodeURIComponent(destino)}` : "";
    redirect(`/ingresar${siguiente}`);
  }
  return sesion;
}

export type Contexto = {
  sesion: SesionActiva;
  rol: Rol;
  despensa: { id: string; name: string; expiryWarningDays: number };
  puede: (minimo: Rol) => boolean;
};

/**
 * Exige sesión + pertenencia a la despensa con al menos el rol indicado.
 *
 * Si el usuario no es miembro devolvemos 404, no 403: un 403 confirmaría que
 * esa despensa existe, y eso ya es información que no le corresponde.
 */
export async function requireMiembro(householdId: string, minimo: Rol = "viewer"): Promise<Contexto> {
  const sesion = await requireUsuario(`/despensas/${householdId}`);
  const db = await getDb();

  const [fila] = await db
    .select({
      role: householdMembers.role,
      id: households.id,
      name: households.name,
      expiryWarningDays: households.expiryWarningDays,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, sesion.user.id)))
    .limit(1);

  if (!fila) notFound();

  if (!tienePermiso(fila.role, minimo)) {
    throw new ErrorAutorizacion(
      `Esta acción requiere el rol "${ETIQUETA_ROL[minimo]}" y el tuyo es "${ETIQUETA_ROL[fila.role]}".`,
    );
  }

  return {
    sesion,
    rol: fila.role,
    despensa: { id: fila.id, name: fila.name, expiryWarningDays: fila.expiryWarningDays },
    puede: (m: Rol) => tienePermiso(fila.role, m),
  };
}

/**
 * Igual que `requireMiembro` pero sin redirigir ni lanzar: devuelve null.
 * Útil en server actions que quieren responder con un mensaje de error.
 */
export async function miembroOpcional(
  householdId: string,
  userId: string,
): Promise<{ rol: Rol; despensa: { id: string; name: string; expiryWarningDays: number } } | null> {
  const db = await getDb();
  const [fila] = await db
    .select({
      role: householdMembers.role,
      id: households.id,
      name: households.name,
      expiryWarningDays: households.expiryWarningDays,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .limit(1);

  if (!fila) return null;
  return {
    rol: fila.role,
    despensa: { id: fila.id, name: fila.name, expiryWarningDays: fila.expiryWarningDays },
  };
}

export async function despensasDeUsuario(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: households.id,
      name: households.name,
      role: householdMembers.role,
      expiryWarningDays: households.expiryWarningDays,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .orderBy(asc(households.name));
}

/** Nº de propietarios: impide dejar una despensa sin dueño. */
export async function contarPropietarios(householdId: string): Promise<number> {
  const db = await getDb();
  const [fila] = await db
    .select({ n: count() })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.role, "owner")));
  return Number(fila?.n ?? 0);
}
