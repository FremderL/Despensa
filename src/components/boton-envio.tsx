"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

import { Boton, cx } from "@/components/ui";

/**
 * Botón de envío que se deshabilita solo mientras la acción está en vuelo.
 *
 * Además de ser buena señal para el usuario, evita el doble envío accidental:
 * dos clics rápidos en «Consumir» descontarían dos veces.
 */
export function BotonEnvio({
  children,
  cargando,
  ...props
}: ComponentProps<typeof Boton> & { cargando?: string }) {
  const { pending } = useFormStatus();

  return (
    <Boton {...props} type="submit" disabled={pending || props.disabled} aria-busy={pending}>
      {pending && (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {pending && cargando ? cargando : children}
    </Boton>
  );
}

/** Variante compacta para acciones en línea dentro de una lista. */
export function BotonEnvioIcono({
  children,
  className,
  titulo,
  ...props
}: ComponentProps<"button"> & { titulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      type="submit"
      title={titulo}
      aria-label={titulo}
      disabled={pending || props.disabled}
      className={cx(
        "inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition",
        "hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40",
        "dark:hover:bg-slate-800 dark:hover:text-white",
        className,
      )}
    >
      {pending ? (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        children
      )}
    </button>
  );
}
