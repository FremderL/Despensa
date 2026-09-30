import type { ComponentProps, ReactNode } from "react";

import { cx } from "@/components/ui";

type Comun = {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string;
  requerido?: boolean;
  className?: string;
};

function Envoltorio({
  id,
  etiqueta,
  ayuda,
  error,
  requerido,
  className,
  children,
}: Comun & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="etiqueta">
        {etiqueta}
        {requerido && (
          <span className="ml-0.5 text-rose-500" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {ayuda && !error && <p className="ayuda">{ayuda}</p>}
      {error && (
        <p className="error-campo" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  requerido,
  className,
  id,
  ...props
}: Comun & ComponentProps<"input">) {
  const idFinal = id ?? props.name ?? etiqueta;
  return (
    <Envoltorio
      id={idFinal}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      requerido={requerido}
      className={className}
    >
      <input
        {...props}
        id={idFinal}
        required={requerido}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${idFinal}-error` : undefined}
        className={cx("campo", error && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20")}
      />
    </Envoltorio>
  );
}

export function Area({
  etiqueta,
  ayuda,
  error,
  requerido,
  className,
  id,
  ...props
}: Comun & ComponentProps<"textarea">) {
  const idFinal = id ?? props.name ?? etiqueta;
  return (
    <Envoltorio
      id={idFinal}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      requerido={requerido}
      className={className}
    >
      <textarea
        {...props}
        id={idFinal}
        required={requerido}
        aria-invalid={error ? true : undefined}
        className={cx("campo resize-y", error && "border-rose-400")}
      />
    </Envoltorio>
  );
}

export function Selector({
  etiqueta,
  ayuda,
  error,
  requerido,
  className,
  id,
  children,
  ...props
}: Comun & ComponentProps<"select">) {
  const idFinal = id ?? props.name ?? etiqueta;
  return (
    <Envoltorio
      id={idFinal}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      requerido={requerido}
      className={className}
    >
      <select
        {...props}
        id={idFinal}
        required={requerido}
        aria-invalid={error ? true : undefined}
        className={cx("campo appearance-none bg-no-repeat pr-9", error && "border-rose-400")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")",
          backgroundPosition: "right 0.75rem center",
        }}
      >
        {children}
      </select>
    </Envoltorio>
  );
}

export function Casilla({
  etiqueta,
  ayuda,
  className,
  id,
  ...props
}: { etiqueta: string; ayuda?: ReactNode; className?: string } & ComponentProps<"input">) {
  const idFinal = id ?? props.name ?? etiqueta;
  return (
    <div className={cx("flex gap-3", className)}>
      <input
        {...props}
        type="checkbox"
        id={idFinal}
        className="mt-0.5 size-4.5 shrink-0 rounded border-slate-300 text-marca-700 focus:ring-marca-600 dark:border-slate-600 dark:bg-slate-800"
      />
      <div className="min-w-0">
        <label htmlFor={idFinal} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {etiqueta}
        </label>
        {ayuda && <p className="ayuda mt-0.5">{ayuda}</p>}
      </div>
    </div>
  );
}

/** Campo señuelo para bots. Invisible y fuera del orden de tabulación. */
export function Trampa() {
  return (
    <div className="trampa" aria-hidden>
      <label htmlFor="website">No rellenes este campo</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
