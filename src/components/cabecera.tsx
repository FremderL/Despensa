import Link from "next/link";

import { salir } from "@/app/actions/auth";
import { IconoDespensa, IconoSalir } from "@/components/iconos";
import { Avatar, cx } from "@/components/ui";
import type { SesionActiva } from "@/lib/session";

/**
 * Barra superior. El cierre de sesión es un formulario POST, no un enlace:
 * una petición GET no debe cambiar el estado del servidor, y un `<img>` en
 * otra web podría provocarla.
 */
export function Cabecera({
  usuario,
  despensa,
}: {
  usuario: SesionActiva["user"];
  despensa?: { id: string; name: string } | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/despensas"
          className="flex items-center gap-2 font-bold tracking-tight text-slate-900 dark:text-white"
        >
          <IconoDespensa className="size-5 text-marca-700 dark:text-marca-400" />
          <span className="hidden sm:inline">Despensa</span>
        </Link>

        {despensa && (
          <>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden>
              /
            </span>
            <Link
              href={`/despensas/${despensa.id}`}
              className="max-w-[10rem] truncate text-sm font-semibold text-slate-700 hover:text-marca-700 sm:max-w-xs dark:text-slate-200 dark:hover:text-marca-400"
            >
              {despensa.name}
            </Link>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/cuenta"
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Mi cuenta"
          >
            <Avatar nombre={usuario.name} color={usuario.avatarColor} tamano={30} />
            <span className="hidden max-w-[9rem] truncate text-sm font-medium text-slate-700 sm:inline dark:text-slate-200">
              {usuario.name}
            </span>
          </Link>

          <form action={salir}>
            <button
              type="submit"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className={cx(
                "inline-flex items-center justify-center rounded-xl p-2 text-slate-500 transition",
                "hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 dark:hover:text-rose-400",
              )}
            >
              <IconoSalir className="size-5" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

/** Aviso persistente mientras el correo no esté confirmado. */
export function BannerVerificacion({ verificado }: { verificado: boolean }) {
  if (verificado) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm text-amber-900 sm:px-6 dark:text-amber-100">
        <span className="font-semibold">Confirma tu correo</span>
        <span className="text-amber-800 dark:text-amber-200/90">
          para poder invitar a otras personas a tus despensas.
        </span>
        <Link href="/cuenta" className="ml-auto font-semibold underline underline-offset-2">
          Reenviar el correo
        </Link>
      </div>
    </div>
  );
}
