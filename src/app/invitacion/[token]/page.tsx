import type { Metadata } from "next";
import Link from "next/link";

import { consultarInvitacion } from "@/app/actions/miembros";
import { FormularioAceptarInvitacion } from "@/components/formularios-miembros";
import { IconoDespensa, IconoPersonas } from "@/components/iconos";
import { Aviso, BotonEnlace, Tarjeta } from "@/components/ui";
import { DESCRIPCION_ROL, ETIQUETA_ROL } from "@/lib/authz";
import { sesionActual } from "@/lib/session";

export const metadata: Metadata = { title: "Invitación" };

/**
 * Página de invitación.
 *
 * Muestra qué se está aceptando ANTES de aceptarlo, y el canje es siempre un
 * POST explícito: abrir el enlace nunca te mete en una casa ajena por
 * accidente ni gasta el token.
 */
export default async function PaginaInvitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const destino = `/invitacion/${encodeURIComponent(token)}`;

  const [sesion, detalle] = await Promise.all([sesionActual(), consultarInvitacion(token)]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="px-5 py-6">
        <Link
          href="/"
          className="mx-auto flex w-fit items-center gap-2.5 font-bold tracking-tight text-slate-900 dark:text-white"
        >
          <IconoDespensa className="size-6 text-marca-700 dark:text-marca-400" />
          Despensa
        </Link>
      </header>

      <main id="contenido" className="flex flex-1 items-start justify-center px-5 pb-16">
        <div className="w-full max-w-md">
          <Tarjeta className="p-7">
            {detalle.estado === "invalida" && (
              <>
                <Aviso tono="error" titulo="Invitación no válida">
                  {detalle.motivo}
                </Aviso>
                <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                  Pide a quien te invitó que genere un enlace nuevo.
                </p>
              </>
            )}

            {detalle.estado === "ya_miembro" && (
              <>
                <Aviso tono="info" titulo="Ya estás dentro">
                  Ya formas parte de «{detalle.despensa}».
                </Aviso>
                <div className="mt-6">
                  <BotonEnlace href={`/despensas/${detalle.householdId}`} ancho tamano="lg">
                    Ir a la despensa
                  </BotonEnlace>
                </div>
              </>
            )}

            {detalle.estado === "valida" && (
              <>
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-marca-100 text-marca-700 dark:bg-marca-950 dark:text-marca-300">
                  <IconoPersonas className="size-7" />
                </div>

                <h1 className="mt-5 text-center text-xl font-bold text-slate-900 dark:text-white">
                  {detalle.invitante} te invita a<br />«{detalle.despensa}»
                </h1>

                <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Entrarías como {ETIQUETA_ROL[detalle.rol]}
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{DESCRIPCION_ROL[detalle.rol]}</p>
                </div>

                {detalle.dirigidaA && (
                  <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    Esta invitación está reservada para <strong>{detalle.dirigidaA}</strong>.
                  </p>
                )}

                <div className="mt-6">
                  {sesion ? (
                    <FormularioAceptarInvitacion token={token} />
                  ) : (
                    <div className="space-y-3">
                      <Aviso tono="info">
                        Necesitas una cuenta para unirte. Si ya tienes una, inicia sesión y volverás
                        aquí automáticamente.
                      </Aviso>
                      <BotonEnlace
                        href={`/ingresar?siguiente=${encodeURIComponent(destino)}`}
                        ancho
                        tamano="lg"
                      >
                        Ingresar y aceptar
                      </BotonEnlace>
                      <BotonEnlace href="/registro" variante="secundario" ancho tamano="lg">
                        Crear una cuenta
                      </BotonEnlace>
                    </div>
                  )}
                </div>
              </>
            )}
          </Tarjeta>
        </div>
      </main>
    </div>
  );
}
