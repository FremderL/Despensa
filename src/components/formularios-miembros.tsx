"use client";

import { useActionState, useState } from "react";

import {
  aceptarInvitacion,
  cambiarRol,
  crearInvitacion,
  expulsarMiembro,
  revocarInvitacion,
} from "@/app/actions/miembros";
import { BotonEnvio } from "@/components/boton-envio";
import { Campo, Selector } from "@/components/campos";
import { IconoEnlace } from "@/components/iconos";
import { Aviso, Boton } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/acciones";
import { DESCRIPCION_ROL, ETIQUETA_ROL, ROLES, type Rol } from "@/lib/catalogos";

/** Copia al portapapeles con respaldo para navegadores sin permiso. */
function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <Boton
      type="button"
      variante="secundario"
      tamano="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          window.prompt("Copia el enlace:", texto);
        }
      }}
    >
      <IconoEnlace className="size-4" />
      {copiado ? "¡Copiado!" : "Copiar enlace"}
    </Boton>
  );
}

/* ------------------------------- Invitación ------------------------------- */

export function FormularioInvitar({
  householdId,
  puedeInvitar,
  correoVerificado,
}: {
  householdId: string;
  puedeInvitar: boolean;
  correoVerificado: boolean;
}) {
  const [estado, accion] = useActionState(crearInvitacion, ESTADO_INICIAL);

  if (!puedeInvitar) {
    return (
      <Aviso tono="info">
        Sólo los administradores y el propietario pueden invitar a más gente a esta despensa.
      </Aviso>
    );
  }

  if (!correoVerificado) {
    return (
      <Aviso tono="aviso" titulo="Confirma tu correo primero">
        Pedimos la confirmación antes de dejar enviar invitaciones para que nadie pueda usar la
        aplicación como trampolín para mandar correos en nombre de otra persona. Encontrarás el botón
        para reenviar el mensaje en tu cuenta.
      </Aviso>
    );
  }

  return (
    <div className="space-y-4">
      <form action={accion} className="space-y-4">
        {estado.mensaje && !estado.ok && <Aviso tono="error">{estado.mensaje}</Aviso>}
        <input type="hidden" name="householdId" value={householdId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Correo de la persona"
            name="email"
            type="email"
            inputMode="email"
            maxLength={254}
            placeholder="opcional@ejemplo.com"
            error={estado.errores?.email}
            ayuda="Si lo indicas, sólo esa dirección podrá usar el enlace. Si lo dejas vacío, obtienes un enlace que sirve una vez para quien lo tenga."
          />

          <div className="space-y-4">
            <Selector etiqueta="Rol" name="role" defaultValue="member">
              {(["admin", "member", "viewer"] as Rol[]).map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </Selector>

            <Campo
              etiqueta="Días de validez"
              name="diasValidez"
              type="number"
              min={1}
              max={30}
              defaultValue={7}
              error={estado.errores?.diasValidez}
            />
          </div>
        </div>

        <BotonEnvio cargando="Creando…">Crear invitación</BotonEnvio>
      </form>

      {estado.ok && estado.enlaceDesarrollo && (
        <Aviso tono="exito" titulo="Invitación lista">
          <p>{estado.mensaje}</p>
          <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs break-all dark:bg-slate-900/60">
            {estado.enlaceDesarrollo}
          </p>
          <p className="mt-3">
            <BotonCopiar texto={estado.enlaceDesarrollo} />
          </p>
          <p className="mt-2 text-xs">
            El enlace sirve una sola vez y caduca. Si te equivocas al compartirlo, revócalo desde la
            lista de pendientes.
          </p>
        </Aviso>
      )}
    </div>
  );
}

export function BotonRevocarInvitacion({ householdId, id }: { householdId: string; id: string }) {
  const [estado, accion] = useActionState(revocarInvitacion, ESTADO_INICIAL);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Revocar esta invitación? El enlace dejará de funcionar.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
      >
        Revocar
      </button>
      {estado.mensaje && !estado.ok && <p className="error-campo">{estado.mensaje}</p>}
    </form>
  );
}

/* --------------------------------- Miembros ------------------------------- */

export function SelectorRol({
  householdId,
  userId,
  rolActual,
  rolesDisponibles,
}: {
  householdId: string;
  userId: string;
  rolActual: Rol;
  rolesDisponibles: Rol[];
}) {
  const [estado, accion] = useActionState(cambiarRol, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={rolActual}
        className="campo h-9 w-auto py-0 text-sm"
        aria-label="Rol"
      >
        {ROLES.filter((r) => rolesDisponibles.includes(r) || r === rolActual).map((r) => (
          <option key={r} value={r} title={DESCRIPCION_ROL[r]}>
            {ETIQUETA_ROL[r]}
          </option>
        ))}
      </select>
      <BotonEnvio variante="secundario" tamano="sm" cargando="…">
        Cambiar
      </BotonEnvio>
      {estado.mensaje && (
        <p
          className={
            estado.ok
              ? "text-xs font-medium text-emerald-600"
              : "text-xs font-medium text-rose-600 dark:text-rose-400"
          }
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

export function BotonExpulsar({
  householdId,
  userId,
  nombre,
}: {
  householdId: string;
  userId: string;
  nombre: string;
}) {
  const [estado, accion] = useActionState(expulsarMiembro, ESTADO_INICIAL);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm(`¿Retirar a ${nombre} de la despensa? Perderá el acceso de inmediato.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
      >
        Retirar
      </button>
      {estado.mensaje && !estado.ok && <p className="error-campo">{estado.mensaje}</p>}
    </form>
  );
}

/* ------------------------- Aceptación de invitación ----------------------- */

export function FormularioAceptarInvitacion({ token }: { token: string }) {
  const [estado, accion] = useActionState(aceptarInvitacion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      {estado.mensaje && !estado.ok && <Aviso tono="error">{estado.mensaje}</Aviso>}
      <input type="hidden" name="token" value={token} />
      <BotonEnvio ancho tamano="lg" cargando="Entrando…">
        Aceptar invitación
      </BotonEnvio>
    </form>
  );
}
