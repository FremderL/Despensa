import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { CLASES_ESTADO, type EstadoCaducidad } from "@/lib/expiry";
import { iniciales } from "@/lib/format";

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

/* --------------------------------- Botones -------------------------------- */

const VARIANTES = {
  primario:
    "bg-marca-700 text-white shadow-sm hover:bg-marca-800 active:bg-marca-900 disabled:bg-marca-700/50",
  secundario:
    "bg-white text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800",
  sutil:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
  peligro: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:bg-rose-600/50",
  fantasma:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
} as const;

const TAMANOS = {
  sm: "px-3 py-1.5 text-[13px] gap-1.5",
  md: "px-4 py-2.5 text-sm gap-2",
  lg: "px-5 py-3 text-[15px] gap-2",
} as const;

type BotonBase = {
  variante?: keyof typeof VARIANTES;
  tamano?: keyof typeof TAMANOS;
  ancho?: boolean;
};

export function clasesBoton({ variante = "primario", tamano = "md", ancho }: BotonBase = {}) {
  return cx(
    "inline-flex items-center justify-center rounded-xl font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600",
    "disabled:cursor-not-allowed",
    VARIANTES[variante],
    TAMANOS[tamano],
    ancho && "w-full",
  );
}

export function Boton({
  variante,
  tamano,
  ancho,
  className,
  ...props
}: BotonBase & ComponentProps<"button">) {
  return <button {...props} className={cx(clasesBoton({ variante, tamano, ancho }), className)} />;
}

export function BotonEnlace({
  variante,
  tamano,
  ancho,
  className,
  ...props
}: BotonBase & ComponentProps<typeof Link>) {
  return <Link {...props} className={cx(clasesBoton({ variante, tamano, ancho }), className)} />;
}

/* --------------------------------- Avisos --------------------------------- */

const TONOS = {
  info: "bg-sky-50 text-sky-900 ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-400/20",
  exito:
    "bg-emerald-50 text-emerald-900 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/20",
  error:
    "bg-rose-50 text-rose-900 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-400/20",
  aviso:
    "bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-400/20",
} as const;

export function Aviso({
  tono = "info",
  titulo,
  children,
  className,
}: {
  tono?: keyof typeof TONOS;
  titulo?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={cx("rounded-xl px-4 py-3 text-sm ring-1 ring-inset", TONOS[tono], className)}
    >
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children && <div className={cx(titulo && "mt-1", "leading-relaxed [&_a]:underline")}>{children}</div>}
    </div>
  );
}

/* -------------------------------- Insignias ------------------------------- */

export function Insignia({
  children,
  className,
  punto,
}: {
  children: ReactNode;
  className?: string;
  punto?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        className ?? "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200",
      )}
    >
      {punto && <span className={cx("size-1.5 rounded-full", punto)} />}
      {children}
    </span>
  );
}

export function ChipEstado({ estado, texto }: { estado: EstadoCaducidad; texto: string }) {
  const c = CLASES_ESTADO[estado];
  return (
    <Insignia className={c.chip} punto={c.punto}>
      {texto}
    </Insignia>
  );
}

/* --------------------------------- Avatar --------------------------------- */

export function Avatar({
  nombre,
  color,
  tamano = 36,
}: {
  nombre: string;
  color?: string | null;
  tamano?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
      style={{
        width: tamano,
        height: tamano,
        background: color ?? "#0f766e",
        fontSize: Math.round(tamano * 0.38),
      }}
      aria-hidden
    >
      {iniciales(nombre)}
    </span>
  );
}

/* --------------------------------- Bloques -------------------------------- */

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("tarjeta", className)}>{children}</div>;
}

export function Seccion({
  titulo,
  descripcion,
  acciones,
  children,
  className,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("tarjeta overflow-hidden", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono?: ReactNode;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
      {icono && <div className="mb-3 text-slate-400 dark:text-slate-500">{icono}</div>}
      <p className="font-medium text-slate-700 dark:text-slate-200">{titulo}</p>
      {descripcion && (
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>
      )}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

export function Metrica({
  etiqueta,
  valor,
  detalle,
  tono = "neutro",
  href,
  icono,
}: {
  etiqueta: string;
  valor: string | number;
  detalle?: string;
  tono?: "neutro" | "peligro" | "aviso" | "exito";
  href?: string;
  icono?: ReactNode;
}) {
  const tonos = {
    neutro: "text-slate-900 dark:text-white",
    peligro: "text-rose-600 dark:text-rose-400",
    aviso: "text-amber-600 dark:text-amber-400",
    exito: "text-emerald-600 dark:text-emerald-400",
  };

  const contenido = (
    <>
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {icono}
        <span className="text-xs font-medium tracking-wide uppercase">{etiqueta}</span>
      </div>
      <p className={cx("mt-2 text-3xl font-bold tabular-nums", tonos[tono])}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detalle}</p>}
    </>
  );

  const clases = cx(
    "tarjeta block p-5 transition",
    href && "hover:border-marca-400 hover:shadow-sm dark:hover:border-marca-700",
  );

  return href ? (
    <Link href={href} className={clases}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}
