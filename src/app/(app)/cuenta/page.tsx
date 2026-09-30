import type { Metadata } from "next";

import { FormularioCambiarPassword } from "@/components/formularios-auth";
import {
  BotonCerrarOtrasSesiones,
  BotonReenviarVerificacion,
  FormularioCerrarSesion,
  FormularioPerfil,
} from "@/components/formularios-cuenta";
import { IconoEscudo } from "@/components/iconos";
import { Avatar, Aviso, Insignia, Seccion } from "@/components/ui";
import { ETIQUETAS_ACCION, eventosDeUsuario } from "@/lib/audit";
import { requireUsuario } from "@/lib/authz";
import { formatearFechaHora, resumirDispositivo, tiempoRelativo } from "@/lib/format";
import { sesionesDeUsuario } from "@/lib/session";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function PaginaCuenta() {
  const sesion = await requireUsuario("/cuenta");

  const [sesiones, eventos] = await Promise.all([
    sesionesDeUsuario(sesion.user.id),
    eventosDeUsuario(sesion.user.id, 25),
  ]);

  const verificado = Boolean(sesion.user.emailVerifiedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Avatar nombre={sesion.user.name} color={sesion.user.avatarColor} tamano={56} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {sesion.user.name}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            {sesion.user.email}
            {verificado ? (
              <Insignia className="bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-300">
                Correo confirmado
              </Insignia>
            ) : (
              <Insignia className="bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300">
                Sin confirmar
              </Insignia>
            )}
          </p>
        </div>
      </div>

      {!verificado && (
        <Seccion
          titulo="Confirma tu correo"
          descripcion="Hace falta para poder invitar a otras personas a tus despensas"
        >
          <BotonReenviarVerificacion />
        </Seccion>
      )}

      <Seccion titulo="Perfil" descripcion="Cómo te ven los demás miembros">
        <div className="max-w-sm">
          <FormularioPerfil nombre={sesion.user.name} />
        </div>
      </Seccion>

      <Seccion
        titulo="Contraseña"
        descripcion="Se guarda con Argon2id; ni nosotros podemos leerla"
      >
        <div className="max-w-sm">
          <FormularioCambiarPassword />
        </div>
      </Seccion>

      <Seccion
        titulo={`Sesiones activas (${sesiones.length})`}
        descripcion="Dispositivos donde tu cuenta está abierta ahora mismo"
        acciones={<BotonCerrarOtrasSesiones />}
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {sesiones.map((s) => {
            const esActual = s.id === sesion.sessionId;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
                    {resumirDispositivo(s.userAgent)}
                    {esActual && (
                      <Insignia className="bg-marca-50 text-marca-700 ring-marca-600/20 dark:bg-marca-950 dark:text-marca-300">
                        Esta sesión
                      </Insignia>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Red {s.ip ?? "desconocida"} · última actividad {tiempoRelativo(s.lastUsedAt)} ·
                    caduca {tiempoRelativo(s.expiresAt)}
                  </p>
                </div>
                {!esActual && <FormularioCerrarSesion sessionId={s.id} />}
              </li>
            );
          })}
        </ul>
      </Seccion>

      <Seccion
        titulo="Actividad de seguridad"
        descripcion="Registro de lo relevante que ha pasado en tu cuenta"
      >
        {eventos.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay eventos.</p>
        ) : (
          <ul className="space-y-2.5">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  {ETIQUETAS_ACCION[e.action] ?? e.action}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {formatearFechaHora(e.createdAt)} · {e.ip ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <Aviso tono="info" className="mt-5">
          <p className="flex items-start gap-2">
            <IconoEscudo className="mt-0.5 size-4 shrink-0" />
            <span>
              Si ves un acceso que no reconoces, cambia la contraseña ahora mismo: al hacerlo se
              cierran todas las demás sesiones.
            </span>
          </p>
        </Aviso>
      </Seccion>
    </div>
  );
}
