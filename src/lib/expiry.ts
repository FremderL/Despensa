/**
 * Cálculo del estado de caducidad.
 *
 * Se razona en fechas de calendario, no en instantes: "caduca el 3 de octubre"
 * significa el día completo, y comparar con `Date.now()` haría que un producto
 * apareciera como caducado a media mañana del mismo día.
 */

export type EstadoCaducidad = "caducado" | "critico" | "proximo" | "vigente" | "sin_fecha";

export type InfoCaducidad = {
  estado: EstadoCaducidad;
  /** Días de calendario hasta la fecha. Negativo si ya pasó. */
  dias: number | null;
  etiqueta: string;
};

/** Fecha de hoy en formato `YYYY-MM-DD` según la zona indicada. */
export function hoyISO(timeZone = "America/Mexico_City"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function aUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function diasHasta(fechaISO: string, hoy = hoyISO()): number {
  return Math.round((aUTC(fechaISO) - aUTC(hoy)) / 86_400_000);
}

/**
 * Clasifica una fecha de caducidad.
 * `critico` son los 2 días siguientes: lo que hay que cocinar ya.
 */
export function estadoCaducidad(
  fechaISO: string | null | undefined,
  diasAviso: number,
  hoy = hoyISO(),
): InfoCaducidad {
  if (!fechaISO) return { estado: "sin_fecha", dias: null, etiqueta: "Sin fecha" };

  const dias = diasHasta(fechaISO, hoy);

  if (dias < 0) {
    const n = Math.abs(dias);
    return { estado: "caducado", dias, etiqueta: n === 1 ? "Caducó ayer" : `Caducó hace ${n} días` };
  }
  if (dias === 0) return { estado: "critico", dias, etiqueta: "Caduca hoy" };
  if (dias === 1) return { estado: "critico", dias, etiqueta: "Caduca mañana" };
  if (dias <= 2) return { estado: "critico", dias, etiqueta: `Caduca en ${dias} días` };
  if (dias <= diasAviso) return { estado: "proximo", dias, etiqueta: `Caduca en ${dias} días` };

  return { estado: "vigente", dias, etiqueta: `Caduca en ${dias} días` };
}

export const ORDEN_ESTADO: Record<EstadoCaducidad, number> = {
  caducado: 0,
  critico: 1,
  proximo: 2,
  vigente: 3,
  sin_fecha: 4,
};

export const ETIQUETA_ESTADO: Record<EstadoCaducidad, string> = {
  caducado: "Caducado",
  critico: "Urgente",
  proximo: "Caduca pronto",
  vigente: "En buen estado",
  sin_fecha: "Sin fecha",
};

/** Clases de Tailwind por estado; se usan en insignias y bordes. */
export const CLASES_ESTADO: Record<EstadoCaducidad, { chip: string; punto: string; borde: string }> = {
  caducado: {
    chip: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-400/20",
    punto: "bg-rose-500",
    borde: "border-l-rose-500",
  },
  critico: {
    chip: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-400/20",
    punto: "bg-orange-500",
    borde: "border-l-orange-500",
  },
  proximo: {
    chip: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/20",
    punto: "bg-amber-400",
    borde: "border-l-amber-400",
  },
  vigente: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/20",
    punto: "bg-emerald-500",
    borde: "border-l-emerald-500",
  },
  sin_fecha: {
    chip: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20",
    punto: "bg-slate-400",
    borde: "border-l-slate-300 dark:border-l-slate-600",
  },
};

/**
 * Sugerencia de caducidad al dar de alta, según el tipo de categoría.
 * Sólo es un valor por defecto editable: ahorra tecleo en lo más frecuente
 * (las sobras de la comida) sin imponer nada.
 */
export function sugerenciaCaducidad(kind: string | null | undefined, hoy = hoyISO()): string | null {
  const dias: Record<string, number> = {
    comida_preparada: 3,
    refrigerado: 7,
    congelado: 90,
    bebida: 180,
    no_perecedero: 365,
  };
  const d = kind ? dias[kind] : undefined;
  if (d === undefined) return null;
  const base = new Date(`${hoy}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + d);
  return base.toISOString().slice(0, 10);
}
