"use client";

import { useEffect } from "react";

import { Boton, BotonEnlace } from "@/components/ui";

/**
 * Pantalla de error.
 *
 * Nunca se muestra `error.message` al usuario: en producción podría contener
 * rutas del servidor, fragmentos de SQL o nombres de columnas, que son justo
 * las pistas que busca alguien tanteando la aplicación. El detalle va al log
 * del servidor; aquí sólo queda el identificador para poder cruzarlos.
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error]", error.digest ?? "sin-digest", error.message);
  }, [error]);

  return (
    <main id="contenido" className="flex flex-1 items-center justify-center px-5 py-24">
      <div className="max-w-md text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-7">
            <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Algo salió mal
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Hubo un problema al procesar la petición. Vuelve a intentarlo; si sigue fallando, avísanos.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-xs text-slate-400 dark:text-slate-500">
            Referencia: {error.digest}
          </p>
        )}

        <div className="mt-7 flex justify-center gap-3">
          <Boton onClick={reset}>Reintentar</Boton>
          <BotonEnlace href="/despensas" variante="secundario">
            Ir a mis despensas
          </BotonEnlace>
        </div>
      </div>
    </main>
  );
}
