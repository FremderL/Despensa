"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb, householdMembers, households, invitations, users, type Rol } from "@/db";
import { env } from "@/env";
import { ACCIONES, auditar } from "@/lib/audit";
import { exito, fallo, valoresSeguros, type EstadoFormulario } from "@/lib/acciones";
import {
  contarPropietarios,
  contextoAccion,
  ETIQUETA_ROL,
  JERARQUIA,
  miembroOpcional,
  respuestaDeError,
  usuarioAccion,
} from "@/lib/authz";
import { generateToken, hashToken, newId } from "@/lib/crypto";
import { correoInvitacion, enviarCorreo } from "@/lib/mailer";
import { CUOTAS, consumirCuota, minutos } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-context";
import { sesionActual } from "@/lib/session";
import { erroresDeZod, formToObject, invitacionSchema, rolSchema } from "@/lib/validation";

const MAX_MIEMBROS = 25;
const MAX_INVITACIONES_ABIERTAS = 20;

/* -------------------------------------------------------------------------- */
/*                                Invitaciones                                 */
/* -------------------------------------------------------------------------- */

export async function crearInvitacion(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = invitacionSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos.", erroresDeZod(datos.error), valoresSeguros(fd));

  try {
    const ctx = await contextoAccion(datos.data.householdId, "admin");

    /**
     * Sólo se puede invitar con el correo confirmado. Sin esta regla, quien se
     * registrase con una dirección ajena podría usar la aplicación para mandar
     * correos en nombre de otra persona.
     */
    if (!ctx.sesion.user.emailVerifiedAt) {
      return fallo("Confirma tu correo antes de invitar a alguien. Encontrarás el enlace en tu cuenta.");
    }

    const cuota = await consumirCuota(`invitar:${ctx.sesion.user.id}`, CUOTAS.invitacionPorUsuario);
    if (!cuota.permitido) {
      return fallo(`Has enviado muchas invitaciones. Espera ${minutos(cuota.reintentarEn)}.`);
    }

    const db = await getDb();
    const ahora = new Date();

    const miembros = await db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, datos.data.householdId));

    if (miembros.length >= MAX_MIEMBROS) {
      return fallo(`Esta despensa ya tiene el máximo de ${MAX_MIEMBROS} miembros.`);
    }

    const abiertas = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.householdId, datos.data.householdId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, ahora),
        ),
      );

    if (abiertas.length >= MAX_INVITACIONES_ABIERTAS) {
      return fallo("Hay demasiadas invitaciones pendientes. Revoca alguna antes de crear otra.");
    }

    const email = datos.data.email && datos.data.email !== "" ? datos.data.email : null;

    // Si ya es miembro, no tiene sentido invitar otra vez.
    if (email) {
      const [ya] = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(householdMembers, eq(householdMembers.userId, users.id))
        .where(and(eq(users.email, email), eq(householdMembers.householdId, datos.data.householdId)))
        .limit(1);
      if (ya) return fallo("Esa persona ya forma parte de la despensa.");
    }

    const token = generateToken(32);
    const expiresAt = new Date(ahora.getTime() + datos.data.diasValidez * 24 * 60 * 60 * 1000);

    await db.insert(invitations).values({
      id: newId(),
      householdId: datos.data.householdId,
      email,
      role: datos.data.role,
      tokenHash: hashToken(token),
      createdBy: ctx.sesion.user.id,
      expiresAt,
    });

    const enlace = `${env.APP_URL}/invitacion/${encodeURIComponent(token)}`;

    if (email) {
      await enviarCorreo({
        to: email,
        ...correoInvitacion(ctx.sesion.user.name, ctx.despensa.name, enlace, ETIQUETA_ROL[datos.data.role]),
      });
    }

    await auditar({
      action: ACCIONES.invitacionCreada,
      userId: ctx.sesion.user.id,
      householdId: datos.data.householdId,
      metadata: { rol: datos.data.role, dirigida: Boolean(email) },
    });

    revalidatePath(`/despensas/${datos.data.householdId}/miembros`);

    return exito(
      email
        ? `Invitación enviada a ${email}. También puedes compartir el enlace directamente.`
        : "Enlace de invitación creado. Compártelo sólo con quien deba entrar.",
      { enlaceDesarrollo: enlace },
    );
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

export async function revocarInvitacion(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const id = String(fd.get("id") ?? "");
  if (!householdId || !id) return fallo("Faltan datos.");

  try {
    const ctx = await contextoAccion(householdId, "admin");
    const db = await getDb();

    const filas = await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(invitations.id, id), eq(invitations.householdId, householdId), isNull(invitations.acceptedAt)),
      )
      .returning({ id: invitations.id });

    if (filas.length === 0) return fallo("Esa invitación ya no está activa.");

    await auditar({
      action: ACCIONES.invitacionRevocada,
      userId: ctx.sesion.user.id,
      householdId,
      metadata: { invitacion: id },
    });

    revalidatePath(`/despensas/${householdId}/miembros`);
    return exito("Invitación revocada. El enlace deja de funcionar ahora mismo.");
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

export type DetalleInvitacion =
  | { estado: "valida"; despensa: string; rol: Rol; invitante: string; dirigidaA: string | null }
  | { estado: "invalida"; motivo: string }
  | { estado: "ya_miembro"; despensa: string; householdId: string };

/**
 * Lee una invitación por su token, sin canjearla.
 * Se usa para mostrar "X te invita a Y" antes de que la persona acepte.
 *
 * La identidad se toma de la sesión, nunca de un parámetro: un argumento
 * `userId` en una server action lo controla quien llama.
 */
export async function consultarInvitacion(token: string): Promise<DetalleInvitacion> {
  const sesion = await sesionActual();
  const userId = sesion?.user.id;

  if (!token || token.length < 10) return { estado: "invalida", motivo: "El enlace no es válido." };

  const db = await getDb();
  const ahora = new Date();

  const [inv] = await db
    .select({
      id: invitations.id,
      householdId: invitations.householdId,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      despensa: households.name,
      invitante: users.name,
    })
    .from(invitations)
    .innerJoin(households, eq(households.id, invitations.householdId))
    .leftJoin(users, eq(users.id, invitations.createdBy))
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);

  if (!inv) return { estado: "invalida", motivo: "Este enlace de invitación no existe." };
  if (inv.revokedAt) return { estado: "invalida", motivo: "Esta invitación fue revocada." };
  if (inv.acceptedAt) return { estado: "invalida", motivo: "Esta invitación ya se usó." };
  if (inv.expiresAt <= ahora) return { estado: "invalida", motivo: "Esta invitación caducó." };

  if (userId) {
    const ya = await miembroOpcional(inv.householdId, userId);
    if (ya) return { estado: "ya_miembro", despensa: inv.despensa, householdId: inv.householdId };
  }

  return {
    estado: "valida",
    despensa: inv.despensa,
    rol: inv.role,
    invitante: inv.invitante ?? "Alguien",
    dirigidaA: inv.email,
  };
}

export async function aceptarInvitacion(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const token = String(fd.get("token") ?? "");
  const sesion = await usuarioAccion();

  const ip = await clientIp();
  const cuota = await consumirCuota(`canjear:ip:${ip}`, CUOTAS.canjearInvitacionPorIp);
  if (!cuota.permitido) {
    return fallo(`Demasiados intentos. Espera ${minutos(cuota.reintentarEn)}.`);
  }

  if (!token || token.length < 10) return fallo("El enlace no es válido.");

  const db = await getDb();
  const ahora = new Date();

  const [inv] = await db
    .select({
      id: invitations.id,
      householdId: invitations.householdId,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      createdBy: invitations.createdBy,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);

  if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt <= ahora) {
    return fallo("Esta invitación ya no es válida. Pide un enlace nuevo.");
  }

  /**
   * Invitación dirigida: sólo la canjea la dirección indicada. Así, aunque el
   * enlace se reenvíe por error a un grupo, no entra quien no debe.
   */
  if (inv.email && inv.email !== sesion.user.email) {
    return fallo(`Esta invitación es para ${inv.email}. Inicia sesión con esa cuenta para aceptarla.`);
  }

  const ya = await miembroOpcional(inv.householdId, sesion.user.id);
  if (ya) return fallo("Ya formas parte de esta despensa.");

  const miembros = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, inv.householdId));

  if (miembros.length >= MAX_MIEMBROS) return fallo("Esta despensa ya alcanzó su máximo de miembros.");

  /**
   * Se marca la invitación como aceptada con una condición que exige que
   * siguiera sin aceptar. Si dos pestañas envían el formulario a la vez, sólo
   * una consigue la fila y la otra no llega a crear la membresía.
   */
  const marcadas = await db
    .update(invitations)
    .set({ acceptedAt: ahora, acceptedBy: sesion.user.id })
    .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id });

  if (marcadas.length === 0) return fallo("Esta invitación acaba de usarse.");

  await db.insert(householdMembers).values({
    householdId: inv.householdId,
    userId: sesion.user.id,
    role: inv.role,
    invitedBy: inv.createdBy,
  });

  await auditar({
    action: ACCIONES.invitacionAceptada,
    userId: sesion.user.id,
    householdId: inv.householdId,
    metadata: { rol: inv.role },
  });

  revalidatePath("/despensas");
  redirect(`/despensas/${inv.householdId}?bienvenida=1`);
}

/* -------------------------------------------------------------------------- */
/*                                  Miembros                                   */
/* -------------------------------------------------------------------------- */

export async function cambiarRol(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const userId = String(fd.get("userId") ?? "");
  const rolParsed = rolSchema.safeParse(fd.get("role"));

  if (!householdId || !userId) return fallo("Faltan datos.");
  if (!rolParsed.success) return fallo("Rol no válido.");

  const nuevo = rolParsed.data;

  try {
    const ctx = await contextoAccion(householdId, "admin");

    if (userId === ctx.sesion.user.id) {
      return fallo("No puedes cambiar tu propio rol. Pídeselo a otro propietario.");
    }

    const objetivo = await miembroOpcional(householdId, userId);
    if (!objetivo) return fallo("Esa persona ya no está en la despensa.");

    /**
     * Dos reglas cierran la escalada de privilegios:
     *   1. Sólo se puede gestionar a quien está por debajo de ti.
     *   2. Sólo se puede otorgar un rol inferior al tuyo.
     * La excepción es el propietario, que sí puede nombrar a otro propietario
     * (transferencia explícita).
     */
    if (JERARQUIA[ctx.rol] <= JERARQUIA[objetivo.rol]) {
      return fallo(`No puedes gestionar a alguien con rol "${ETIQUETA_ROL[objetivo.rol]}".`);
    }
    if (JERARQUIA[nuevo] >= JERARQUIA[ctx.rol] && ctx.rol !== "owner") {
      return fallo("No puedes otorgar un rol igual o superior al tuyo.");
    }
    if (nuevo === "owner" && ctx.rol !== "owner") {
      return fallo("Sólo un propietario puede nombrar a otro propietario.");
    }

    if (objetivo.rol === "owner" && nuevo !== "owner" && (await contarPropietarios(householdId)) === 1) {
      return fallo("La despensa debe tener al menos un propietario.");
    }

    const db = await getDb();
    await db
      .update(householdMembers)
      .set({ role: nuevo })
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));

    await auditar({
      action: ACCIONES.miembroRolCambiado,
      userId: ctx.sesion.user.id,
      householdId,
      metadata: { objetivo: userId, de: objetivo.rol, a: nuevo },
    });

    revalidatePath(`/despensas/${householdId}/miembros`);
    return exito(`Rol actualizado a ${ETIQUETA_ROL[nuevo]}.`);
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

export async function expulsarMiembro(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const userId = String(fd.get("userId") ?? "");
  if (!householdId || !userId) return fallo("Faltan datos.");

  try {
    const ctx = await contextoAccion(householdId, "admin");

    if (userId === ctx.sesion.user.id) {
      return fallo("Para salir tú mismo usa «Salir de la despensa».");
    }

    const objetivo = await miembroOpcional(householdId, userId);
    if (!objetivo) return fallo("Esa persona ya no está en la despensa.");

    if (JERARQUIA[ctx.rol] <= JERARQUIA[objetivo.rol]) {
      return fallo(`No puedes retirar a alguien con rol "${ETIQUETA_ROL[objetivo.rol]}".`);
    }

    const db = await getDb();
    await db
      .delete(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));

    await auditar({
      action: ACCIONES.miembroExpulsado,
      userId: ctx.sesion.user.id,
      householdId,
      metadata: { objetivo: userId },
    });

    revalidatePath(`/despensas/${householdId}/miembros`);
    return exito("Miembro retirado. Pierde el acceso de inmediato.");
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}
