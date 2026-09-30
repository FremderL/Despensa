"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authTokens, getDb, users } from "@/db";
import { env } from "@/env";
import { ACCIONES, auditar } from "@/lib/audit";
import { destinoSeguro, exito, fallo, valoresSeguros, type EstadoFormulario } from "@/lib/acciones";
import { generateToken, hashToken, newId } from "@/lib/crypto";
import { colorDeNombre } from "@/lib/format";
import {
  correoAvisoPasswordCambiada,
  correoIntentoRegistro,
  correoRecuperacion,
  correoVerificacion,
  enviarCorreo,
} from "@/lib/mailer";
import { evaluarPassword, hashPassword, verifyDummyPassword, verifyPassword } from "@/lib/password";
import { CUOTAS, consumirCuota, liberarCuota, minutos } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-context";
import { cerrarSesion, crearSesion, revocarSesion, revocarSesionesDeUsuario, sesionActual } from "@/lib/session";
import {
  accesoSchema,
  cambiarPasswordSchema,
  erroresDeZod,
  formToObject,
  perfilSchema,
  recuperarSchema,
  registroSchema,
  restablecerSchema,
} from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*                                  Constantes                                 */
/* -------------------------------------------------------------------------- */

const TTL_VERIFICACION_MS = 24 * 60 * 60 * 1000; // 24 h
const TTL_RECUPERACION_MS = 60 * 60 * 1000; // 1 h
const FALLOS_PARA_BLOQUEO = 10;
const BLOQUEO_BASE_MIN = 5;

/**
 * Mensaje único para cualquier fallo de acceso.
 *
 * Distinguir "ese correo no existe" de "contraseña incorrecta" le regala al
 * atacante un oráculo para descubrir qué cuentas existen antes de probar
 * contraseñas.
 */
const CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos.";

/* -------------------------------------------------------------------------- */
/*                                   Registro                                  */
/* -------------------------------------------------------------------------- */

export async function registrarse(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const ip = await clientIp();
  const cuota = await consumirCuota(`registro:ip:${ip}`, CUOTAS.registroPorIp);
  if (!cuota.permitido) {
    await auditar({ action: ACCIONES.cuotaExcedida, metadata: { operacion: "registro" } });
    return fallo(`Demasiadas cuentas creadas desde esta red. Inténtalo en ${minutos(cuota.reintentarEn)}.`);
  }

  const datos = registroSchema.safeParse(formToObject(fd));
  if (!datos.success) {
    return fallo("Revisa los datos del formulario.", erroresDeZod(datos.error), valoresSeguros(fd));
  }

  // Trampa para bots: el campo está oculto por CSS, una persona no lo rellena.
  if (datos.data.website) {
    return exito("Cuenta creada. Revisa tu correo para confirmar la dirección.");
  }

  const { name, email, password } = datos.data;

  const politica = evaluarPassword(password, { email, nombre: name });
  if (!politica.ok) {
    return fallo(politica.motivo, { password: politica.motivo }, valoresSeguros(fd));
  }

  const db = await getDb();
  const [existente] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  /**
   * La respuesta es idéntica exista o no la cuenta. Si ya existe, avisamos por
   * correo a su dueño legítimo en lugar de decírselo a quien está probando.
   */
  const MENSAJE_NEUTRO = "Listo. Si la dirección es válida, recibirás un correo para confirmarla.";

  if (existente) {
    await enviarCorreo({ to: email, ...correoIntentoRegistro(`${env.APP_URL}/recuperar`) });
    return exito(MENSAJE_NEUTRO);
  }

  const userId = newId();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id: userId,
    email,
    name,
    passwordHash,
    avatarColor: colorDeNombre(name),
  });

  const enlace = await crearEnlaceToken(userId, "verificacion_correo", TTL_VERIFICACION_MS, "/verificar");
  await enviarCorreo({ to: email, ...correoVerificacion(name, enlace) });
  await auditar({ action: ACCIONES.registro, userId, metadata: { email } });

  return exito(MENSAJE_NEUTRO, {
    // Comodidad de desarrollo: sin SMTP el correo sólo existe en el log.
    enlaceDesarrollo: !env.isProd && !env.SMTP_URL ? enlace : undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*                                    Acceso                                   */
/* -------------------------------------------------------------------------- */

export async function acceder(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const ip = await clientIp();

  const porIp = await consumirCuota(`login:ip:${ip}`, CUOTAS.loginPorIp);
  if (!porIp.permitido) {
    await auditar({ action: ACCIONES.cuotaExcedida, metadata: { operacion: "acceso", ambito: "ip" } });
    return fallo(`Demasiados intentos desde esta red. Inténtalo en ${minutos(porIp.reintentarEn)}.`);
  }

  const datos = accesoSchema.safeParse(formToObject(fd));
  if (!datos.success) {
    return fallo(CREDENCIALES_INVALIDAS, erroresDeZod(datos.error), valoresSeguros(fd));
  }

  const { email, password } = datos.data;
  const destino = destinoSeguro(datos.data.siguiente);

  const porCuenta = await consumirCuota(`login:cuenta:${email}`, CUOTAS.loginPorCuenta);
  if (!porCuenta.permitido) {
    return fallo(`Demasiados intentos con esta cuenta. Inténtalo en ${minutos(porCuenta.reintentarEn)}.`);
  }

  const db = await getDb();
  const [usuario] = await db
    .select({
      id: users.id,
      name: users.name,
      passwordHash: users.passwordHash,
      failedLoginCount: users.failedLoginCount,
      lockedUntil: users.lockedUntil,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!usuario) {
    // Se gasta el mismo tiempo que en una verificación real.
    await verifyDummyPassword(password);
    await auditar({ action: ACCIONES.accesoFallido, metadata: { email, motivo: "inexistente" } });
    return fallo(CREDENCIALES_INVALIDAS, undefined, valoresSeguros(fd));
  }

  if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
    const seg = Math.ceil((usuario.lockedUntil.getTime() - Date.now()) / 1000);
    await verifyDummyPassword(password);
    return fallo(`La cuenta está bloqueada temporalmente. Vuelve a intentarlo en ${minutos(seg)}.`);
  }

  if (usuario.disabledAt) {
    await verifyDummyPassword(password);
    return fallo(CREDENCIALES_INVALIDAS, undefined, valoresSeguros(fd));
  }

  const correcta = await verifyPassword(usuario.passwordHash, password);

  if (!correcta) {
    const fallos = usuario.failedLoginCount + 1;
    /**
     * Bloqueo con espera creciente: 5, 10, 20... minutos. Frena la fuerza
     * bruta sin regalar a un atacante la posibilidad de dejar fuera a alguien
     * de forma permanente.
     */
    const bloquear = fallos >= FALLOS_PARA_BLOQUEO;
    const exceso = fallos - FALLOS_PARA_BLOQUEO;
    const minutosBloqueo = Math.min(BLOQUEO_BASE_MIN * 2 ** Math.max(0, exceso), 60 * 4);

    await db
      .update(users)
      .set({
        failedLoginCount: fallos,
        lockedUntil: bloquear ? new Date(Date.now() + minutosBloqueo * 60_000) : usuario.lockedUntil,
        updatedAt: new Date(),
      })
      .where(eq(users.id, usuario.id));

    await auditar({
      action: bloquear ? ACCIONES.cuentaBloqueada : ACCIONES.accesoFallido,
      userId: usuario.id,
      metadata: { intentos: fallos },
    });

    return fallo(CREDENCIALES_INVALIDAS, undefined, valoresSeguros(fd));
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, usuario.id));

  await Promise.all([liberarCuota(`login:cuenta:${email}`), liberarCuota(`login:ip:${ip}`)]);

  await crearSesion(usuario.id);
  await auditar({ action: ACCIONES.accesoOk, userId: usuario.id });

  redirect(destino);
}

export async function salir(): Promise<void> {
  const userId = await cerrarSesion();
  if (userId) await auditar({ action: ACCIONES.cierreSesion, userId });
  redirect("/ingresar");
}

/* -------------------------------------------------------------------------- */
/*                            Verificación de correo                           */
/* -------------------------------------------------------------------------- */

async function crearEnlaceToken(
  userId: string,
  tipo: "verificacion_correo" | "restablecer_password",
  ttlMs: number,
  ruta: string,
): Promise<string> {
  const db = await getDb();
  const token = generateToken(32);

  await db.insert(authTokens).values({
    id: newId(),
    userId,
    type: tipo,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });

  return `${env.APP_URL}${ruta}?token=${encodeURIComponent(token)}`;
}

/**
 * Canjea un token de verificación.
 *
 * Se expone como acción de formulario (POST) y no como efecto de abrir la
 * URL. Muchos filtros de correo corporativos visitan los enlaces antes de
 * entregar el mensaje: con un canje por GET, ese robot consumiría el token de
 * un solo uso y la persona encontraría el enlace ya gastado.
 */
export async function confirmarCorreo(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const token = String(fd.get("token") ?? "");
  if (!token || token.length < 10) return fallo("El enlace no es válido.");

  const ip = await clientIp();
  const cuota = await consumirCuota(`verificar:ip:${ip}`, CUOTAS.recuperarPorIp);
  if (!cuota.permitido) return fallo(`Demasiados intentos. Espera ${minutos(cuota.reintentarEn)}.`);

  const db = await getDb();
  const ahora = new Date();

  const [fila] = await db
    .select({ id: authTokens.id, userId: authTokens.userId })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.type, "verificacion_correo"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, ahora),
      ),
    )
    .limit(1);

  if (!fila) {
    return fallo("Este enlace ya se usó o caducó. Inicia sesión y pide uno nuevo desde tu cuenta.");
  }

  // Se marca usado antes de aplicar el efecto: un doble envío no lo repite.
  await db.update(authTokens).set({ usedAt: ahora }).where(eq(authTokens.id, fila.id));
  await db
    .update(users)
    .set({ emailVerifiedAt: ahora, updatedAt: ahora })
    .where(and(eq(users.id, fila.userId), isNull(users.emailVerifiedAt)));

  await auditar({ action: ACCIONES.correoVerificado, userId: fila.userId });
  revalidatePath("/", "layout");

  return exito("Correo confirmado. Ya puedes usar todas las funciones, incluidas las invitaciones.");
}

export async function reenviarVerificacion(): Promise<EstadoFormulario> {
  const sesion = await sesionActual();
  if (!sesion) return fallo("Inicia sesión para hacer esto.");
  if (sesion.user.emailVerifiedAt) return exito("Tu correo ya está confirmado.");

  const cuota = await consumirCuota(`verificar:usuario:${sesion.user.id}`, CUOTAS.recuperarPorCuenta);
  if (!cuota.permitido) {
    return fallo(`Ya enviamos varios correos. Espera ${minutos(cuota.reintentarEn)} antes de pedir otro.`);
  }

  const enlace = await crearEnlaceToken(sesion.user.id, "verificacion_correo", TTL_VERIFICACION_MS, "/verificar");
  await enviarCorreo({ to: sesion.user.email, ...correoVerificacion(sesion.user.name, enlace) });

  return exito("Te enviamos un correo nuevo.", {
    enlaceDesarrollo: !env.isProd && !env.SMTP_URL ? enlace : undefined,
  });
}

/* -------------------------------------------------------------------------- */
/*                         Recuperación de contraseña                          */
/* -------------------------------------------------------------------------- */

export async function solicitarRecuperacion(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const ip = await clientIp();
  const porIp = await consumirCuota(`recuperar:ip:${ip}`, CUOTAS.recuperarPorIp);
  if (!porIp.permitido) {
    return fallo(`Demasiadas solicitudes desde esta red. Inténtalo en ${minutos(porIp.reintentarEn)}.`);
  }

  const datos = recuperarSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Escribe un correo válido.", erroresDeZod(datos.error));

  const { email } = datos.data;

  // Respuesta invariable: no revela si la dirección está registrada.
  const NEUTRO = "Si esa dirección tiene una cuenta, te enviamos un enlace para restablecer la contraseña.";

  const porCuenta = await consumirCuota(`recuperar:cuenta:${email}`, CUOTAS.recuperarPorCuenta);
  if (!porCuenta.permitido) return exito(NEUTRO);

  const db = await getDb();
  const [usuario] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.disabledAt)))
    .limit(1);

  if (!usuario) return exito(NEUTRO);

  /**
   * Se invalidan los tokens de recuperación previos: si alguien consiguió uno
   * antiguo, pedir otro lo deja inservible.
   */
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, usuario.id),
        eq(authTokens.type, "restablecer_password"),
        isNull(authTokens.usedAt),
      ),
    );

  const enlace = await crearEnlaceToken(usuario.id, "restablecer_password", TTL_RECUPERACION_MS, "/restablecer");
  await enviarCorreo({ to: email, ...correoRecuperacion(usuario.name, enlace) });
  await auditar({ action: ACCIONES.recuperacionSolicitada, userId: usuario.id });

  return exito(NEUTRO, {
    enlaceDesarrollo: !env.isProd && !env.SMTP_URL ? enlace : undefined,
  });
}

export async function restablecerPassword(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = restablecerSchema.safeParse(formToObject(fd));
  if (!datos.success) {
    return fallo("Revisa los datos del formulario.", erroresDeZod(datos.error));
  }

  const { token, password } = datos.data;
  const db = await getDb();
  const ahora = new Date();

  const [fila] = await db
    .select({ id: authTokens.id, userId: authTokens.userId })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.type, "restablecer_password"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, ahora),
      ),
    )
    .limit(1);

  if (!fila) {
    return fallo("Este enlace ya se usó o caducó. Solicita uno nuevo.");
  }

  const [usuario] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, fila.userId))
    .limit(1);

  const politica = evaluarPassword(password, { email: usuario?.email, nombre: usuario?.name });
  if (!politica.ok) return fallo(politica.motivo, { password: politica.motivo });

  const hash = await hashPassword(password);

  await db.update(authTokens).set({ usedAt: ahora }).where(eq(authTokens.id, fila.id));
  await db
    .update(users)
    .set({
      passwordHash: hash,
      passwordChangedAt: ahora,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: ahora,
    })
    .where(eq(users.id, fila.userId));

  /**
   * Cerrar todas las sesiones es el punto del restablecimiento: si alguien
   * había entrado con la contraseña anterior, aquí pierde el acceso.
   */
  await revocarSesionesDeUsuario(fila.userId);
  await auditar({ action: ACCIONES.passwordRestablecida, userId: fila.userId });

  if (usuario) await enviarCorreo({ to: usuario.email, ...correoAvisoPasswordCambiada(usuario.name) });

  return exito("Contraseña actualizada. Ya puedes iniciar sesión.");
}

/* -------------------------------------------------------------------------- */
/*                                    Cuenta                                   */
/* -------------------------------------------------------------------------- */

export async function cambiarPassword(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const sesion = await sesionActual();
  if (!sesion) return fallo("Inicia sesión para hacer esto.");

  const datos = cambiarPasswordSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos del formulario.", erroresDeZod(datos.error));

  const cuota = await consumirCuota(`password:usuario:${sesion.user.id}`, CUOTAS.loginPorCuenta);
  if (!cuota.permitido) return fallo(`Demasiados intentos. Espera ${minutos(cuota.reintentarEn)}.`);

  const db = await getDb();
  const [usuario] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, sesion.user.id))
    .limit(1);

  if (!usuario) return fallo("No se pudo completar la operación.");

  // Reautenticación: cambiar la contraseña exige demostrar que conoces la actual.
  if (!(await verifyPassword(usuario.passwordHash, datos.data.actual))) {
    return fallo("La contraseña actual no es correcta.", { actual: "La contraseña actual no es correcta." });
  }

  const politica = evaluarPassword(datos.data.password, {
    email: sesion.user.email,
    nombre: sesion.user.name,
  });
  if (!politica.ok) return fallo(politica.motivo, { password: politica.motivo });

  if (await verifyPassword(usuario.passwordHash, datos.data.password)) {
    return fallo("La contraseña nueva debe ser distinta de la actual.", {
      password: "Elige una contraseña diferente.",
    });
  }

  const ahora = new Date();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(datos.data.password), passwordChangedAt: ahora, updatedAt: ahora })
    .where(eq(users.id, sesion.user.id));

  // Se conserva la sesión actual y se cierran las demás.
  const cerradas = await revocarSesionesDeUsuario(sesion.user.id, sesion.sessionId);
  await auditar({ action: ACCIONES.passwordCambiada, userId: sesion.user.id, metadata: { cerradas } });
  await enviarCorreo({ to: sesion.user.email, ...correoAvisoPasswordCambiada(sesion.user.name) });

  revalidatePath("/cuenta");
  return exito(
    cerradas > 0
      ? `Contraseña actualizada. Cerramos ${cerradas} ${cerradas === 1 ? "sesión" : "sesiones"} en otros dispositivos.`
      : "Contraseña actualizada.",
  );
}

export async function actualizarPerfil(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const sesion = await sesionActual();
  if (!sesion) return fallo("Inicia sesión para hacer esto.");

  const datos = perfilSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos.", erroresDeZod(datos.error));

  const db = await getDb();
  await db
    .update(users)
    .set({ name: datos.data.name, avatarColor: colorDeNombre(datos.data.name), updatedAt: new Date() })
    .where(eq(users.id, sesion.user.id));

  revalidatePath("/", "layout");
  return exito("Perfil actualizado.");
}

export async function cerrarOtrasSesiones(): Promise<EstadoFormulario> {
  const sesion = await sesionActual();
  if (!sesion) return fallo("Inicia sesión para hacer esto.");

  const n = await revocarSesionesDeUsuario(sesion.user.id, sesion.sessionId);
  await auditar({ action: ACCIONES.sesionRevocada, userId: sesion.user.id, metadata: { cerradas: n, todas: true } });

  revalidatePath("/cuenta");
  return exito(n === 0 ? "No había otras sesiones abiertas." : `Cerramos ${n} ${n === 1 ? "sesión" : "sesiones"}.`);
}

export async function cerrarSesionConcreta(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const sesion = await sesionActual();
  if (!sesion) return fallo("Inicia sesión para hacer esto.");

  const id = String(fd.get("sessionId") ?? "");
  if (!id) return fallo("Falta la sesión a cerrar.");

  if (id === sesion.sessionId) {
    // Cerrar la propia sesión desde aquí sería confuso; hay botón de salir.
    return fallo("Esa es tu sesión actual. Usa «Cerrar sesión».");
  }

  const ok = await revocarSesion(sesion.user.id, id);
  if (!ok) return fallo("Esa sesión ya no está activa.");

  await auditar({ action: ACCIONES.sesionRevocada, userId: sesion.user.id, metadata: { sessionId: id } });
  revalidatePath("/cuenta");
  return exito("Sesión cerrada.");
}
