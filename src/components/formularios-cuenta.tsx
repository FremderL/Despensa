"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  actualizarPerfil,
  cerrarOtrasSesiones,
  cerrarSesionConcreta,
  confirmarCorreo,
  reenviarVerificacion,
} from "@/app/actions/auth";
import { BotonEnvio } from "@/components/boton-envio";
import { Campo } from "@/components/campos";
import { Aviso, Boton } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/acciones";

export function FormularioConfirmarCorreo({ token }: { token: string }) {
  const [estado, accion] = useActionState(confirmarCorreo, ESTADO_INICIAL);

  if (estado.ok) {
    return (
      <>
        <Aviso tono="exito" titulo="¡Listo!">
          {estado.mensaje}
        </Aviso>
        <p className="mt-6">
          <Link
            href="/despensas"
            className="font-semibold text-marca-700 hover:underline dark:text-marca-400"
          >
            Ir a mis despensas →
          </Link>
        </p>
      </>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      {estado.mensaje && <Aviso tono="error">{estado.mensaje}</Aviso>}
      <input type="hidden" name="token" value={token} />
      <BotonEnvio ancho tamano="lg" cargando="Confirmando…">
        Confirmar mi correo
      </BotonEnvio>
    </form>
  );
}

export function FormularioPerfil({ nombre }: { nombre: string }) {
  const [estado, accion] = useActionState(actualizarPerfil, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.mensaje && <Aviso tono={estado.ok ? "exito" : "error"}>{estado.mensaje}</Aviso>}
      <Campo
        etiqueta="Nombre visible"
        name="name"
        defaultValue={nombre}
        requerido
        maxLength={80}
        error={estado.errores?.name}
        ayuda="Es el nombre que verán los demás miembros de tus despensas."
      />
      <BotonEnvio cargando="Guardando…">Guardar</BotonEnvio>
    </form>
  );
}

export function BotonReenviarVerificacion() {
  const [estado, accion, pendiente] = useActionState(
    async () => reenviarVerificacion(),
    ESTADO_INICIAL,
  );

  return (
    <div>
      <form action={accion}>
        <Boton type="submit" variante="secundario" tamano="sm" disabled={pendiente}>
          {pendiente ? "Enviando…" : "Reenviar correo de confirmación"}
        </Boton>
      </form>

      {estado.mensaje && (
        <Aviso tono={estado.ok ? "exito" : "error"} className="mt-3">
          {estado.mensaje}
          {estado.enlaceDesarrollo && (
            <p className="mt-2 break-all">
              Modo desarrollo:{" "}
              <Link href={estado.enlaceDesarrollo} className="font-medium underline">
                abrir enlace de confirmación
              </Link>
            </p>
          )}
        </Aviso>
      )}
    </div>
  );
}

export function BotonCerrarOtrasSesiones() {
  const [estado, accion, pendiente] = useActionState(
    async () => cerrarOtrasSesiones(),
    ESTADO_INICIAL,
  );

  return (
    <div>
      <form action={accion}>
        <Boton type="submit" variante="secundario" tamano="sm" disabled={pendiente}>
          {pendiente ? "Cerrando…" : "Cerrar el resto de sesiones"}
        </Boton>
      </form>
      {estado.mensaje && (
        <Aviso tono={estado.ok ? "exito" : "error"} className="mt-3">
          {estado.mensaje}
        </Aviso>
      )}
    </div>
  );
}

export function FormularioCerrarSesion({ sessionId }: { sessionId: string }) {
  const [estado, accion, pendiente] = useActionState(cerrarSesionConcreta, ESTADO_INICIAL);

  return (
    <form action={accion}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        type="submit"
        disabled={pendiente}
        className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
      >
        {pendiente ? "Cerrando…" : "Cerrar"}
      </button>
      {estado.mensaje && !estado.ok && <p className="error-campo">{estado.mensaje}</p>}
    </form>
  );
}
