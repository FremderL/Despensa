"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  acceder,
  cambiarPassword,
  registrarse,
  restablecerPassword,
  solicitarRecuperacion,
} from "@/app/actions/auth";
import { BotonEnvio } from "@/components/boton-envio";
import { Campo, Trampa } from "@/components/campos";
import { Aviso } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/acciones";

/** Enlace que en desarrollo sustituye al correo que no se puede enviar. */
function EnlaceDesarrollo({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <Aviso tono="aviso" titulo="Modo desarrollo: no hay servidor de correo" className="mt-4">
      <p>
        El mensaje se escribió en el log del servidor. Para continuar sin SMTP, usa este enlace:
      </p>
      <p className="mt-2 break-all">
        <Link href={url} className="font-medium underline">
          {url}
        </Link>
      </p>
    </Aviso>
  );
}

/* --------------------------------- Registro ------------------------------- */

export function FormularioRegistro() {
  const [estado, accion] = useActionState(registrarse, ESTADO_INICIAL);

  if (estado.ok) {
    return (
      <>
        <Aviso tono="exito" titulo="Revisa tu correo">
          {estado.mensaje}
        </Aviso>
        <EnlaceDesarrollo url={estado.enlaceDesarrollo} />
        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          ¿Ya lo confirmaste?{" "}
          <Link href="/ingresar" className="font-semibold text-marca-700 hover:underline dark:text-marca-400">
            Inicia sesión
          </Link>
        </p>
      </>
    );
  }

  return (
    <form action={accion} className="space-y-4" noValidate>
      {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}

      <Campo
        etiqueta="¿Cómo te llamas?"
        name="name"
        autoComplete="name"
        requerido
        maxLength={80}
        defaultValue={estado.valores?.name}
        error={estado.errores?.name}
        placeholder="Ana García"
      />

      <Campo
        etiqueta="Correo electrónico"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        requerido
        maxLength={254}
        defaultValue={estado.valores?.email}
        error={estado.errores?.email}
        placeholder="ana@ejemplo.com"
      />

      <Campo
        etiqueta="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        requerido
        minLength={10}
        maxLength={128}
        error={estado.errores?.password}
        ayuda="Mínimo 10 caracteres. Una frase que recuerdes es más segura que una palabra con símbolos."
      />

      <Campo
        etiqueta="Repite la contraseña"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        requerido
        maxLength={128}
        error={estado.errores?.passwordConfirm}
      />

      <Trampa />

      <BotonEnvio ancho tamano="lg" cargando="Creando la cuenta…">
        Crear mi cuenta
      </BotonEnvio>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-marca-700 hover:underline dark:text-marca-400">
          Ingresar
        </Link>
      </p>
    </form>
  );
}

/* ---------------------------------- Acceso -------------------------------- */

export function FormularioAcceso({ siguiente }: { siguiente?: string }) {
  const [estado, accion] = useActionState(acceder, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}

      <input type="hidden" name="siguiente" value={siguiente ?? ""} />

      <Campo
        etiqueta="Correo electrónico"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        requerido
        autoFocus
        maxLength={254}
        defaultValue={estado.valores?.email}
        placeholder="ana@ejemplo.com"
      />

      <div>
        <Campo
          etiqueta="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          requerido
          maxLength={128}
        />
        <p className="mt-2 text-right">
          <Link
            href="/recuperar"
            className="text-xs font-medium text-slate-500 hover:text-marca-700 hover:underline dark:text-slate-400 dark:hover:text-marca-400"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </div>

      <BotonEnvio ancho tamano="lg" cargando="Entrando…">
        Ingresar
      </BotonEnvio>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-marca-700 hover:underline dark:text-marca-400">
          Crear una
        </Link>
      </p>
    </form>
  );
}

/* -------------------------------- Recuperar ------------------------------- */

export function FormularioRecuperar() {
  const [estado, accion] = useActionState(solicitarRecuperacion, ESTADO_INICIAL);

  if (estado.ok) {
    return (
      <>
        <Aviso tono="exito" titulo="Solicitud enviada">
          {estado.mensaje}
        </Aviso>
        <EnlaceDesarrollo url={estado.enlaceDesarrollo} />
        <p className="mt-6 text-center text-sm">
          <Link href="/ingresar" className="font-semibold text-marca-700 hover:underline dark:text-marca-400">
            Volver al acceso
          </Link>
        </p>
      </>
    );
  }

  return (
    <form action={accion} className="space-y-4" noValidate>
      {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}

      <Campo
        etiqueta="Correo electrónico"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        requerido
        autoFocus
        maxLength={254}
        error={estado.errores?.email}
        placeholder="ana@ejemplo.com"
      />

      <BotonEnvio ancho tamano="lg" cargando="Enviando…">
        Enviarme el enlace
      </BotonEnvio>

      <p className="text-center text-sm">
        <Link
          href="/ingresar"
          className="font-medium text-slate-500 hover:text-marca-700 hover:underline dark:text-slate-400"
        >
          Volver al acceso
        </Link>
      </p>
    </form>
  );
}

/* ------------------------------- Restablecer ------------------------------ */

export function FormularioRestablecer({ token }: { token: string }) {
  const [estado, accion] = useActionState(restablecerPassword, ESTADO_INICIAL);

  if (estado.ok) {
    return (
      <>
        <Aviso tono="exito" titulo="Contraseña actualizada">
          {estado.mensaje} Por seguridad cerramos todas las sesiones que hubiera abiertas.
        </Aviso>
        <p className="mt-6 text-center text-sm">
          <Link href="/ingresar" className="font-semibold text-marca-700 hover:underline dark:text-marca-400">
            Ir al acceso
          </Link>
        </p>
      </>
    );
  }

  return (
    <form action={accion} className="space-y-4" noValidate>
      {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}

      <input type="hidden" name="token" value={token} />

      <Campo
        etiqueta="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        requerido
        autoFocus
        minLength={10}
        maxLength={128}
        error={estado.errores?.password}
        ayuda="Mínimo 10 caracteres."
      />

      <Campo
        etiqueta="Repite la contraseña"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        requerido
        maxLength={128}
        error={estado.errores?.passwordConfirm}
      />

      <BotonEnvio ancho tamano="lg" cargando="Guardando…">
        Guardar contraseña
      </BotonEnvio>
    </form>
  );
}

/* ---------------------------- Cambiar contraseña -------------------------- */

export function FormularioCambiarPassword() {
  const [estado, accion] = useActionState(cambiarPassword, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4" noValidate>
      {estado.mensaje && <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>}

      <Campo
        etiqueta="Contraseña actual"
        name="actual"
        type="password"
        autoComplete="current-password"
        requerido
        maxLength={128}
        error={estado.errores?.actual}
      />

      <Campo
        etiqueta="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        requerido
        minLength={10}
        maxLength={128}
        error={estado.errores?.password}
        ayuda="Mínimo 10 caracteres. Se cerrarán las sesiones abiertas en otros dispositivos."
      />

      <Campo
        etiqueta="Repite la contraseña nueva"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        requerido
        maxLength={128}
        error={estado.errores?.passwordConfirm}
      />

      <BotonEnvio cargando="Guardando…">Cambiar contraseña</BotonEnvio>
    </form>
  );
}
