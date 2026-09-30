import { formaUnidad, type Unidad } from "@/lib/catalogos";

const ZONA = "America/Mexico_City";

export function formatearCantidad(valor: number | string | null | undefined): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  if (!Number.isFinite(n)) return "0";
  // Hasta 3 decimales, sin ceros de relleno: 1.5 y no 1.500
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n);
}

export function formatearUnidad(unidad: Unidad, cantidad: number): string {
  return formaUnidad(unidad, cantidad);
}

export function cantidadConUnidad(valor: number | string | null | undefined, unidad: Unidad): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  return `${formatearCantidad(n)} ${formaUnidad(unidad, n)}`;
}

export function formatearFecha(fecha: string | Date | null | undefined): string {
  if (!fecha) return "—";
  const d = typeof fecha === "string" ? new Date(`${fecha}T12:00:00Z`) : fecha;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ZONA,
  }).format(d);
}

export function formatearFechaHora(fecha: Date | null | undefined): string {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA,
  }).format(fecha);
}

export function tiempoRelativo(fecha: Date | null | undefined): string {
  if (!fecha) return "—";
  const diff = fecha.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

  const min = 60_000;
  const hora = 60 * min;
  const dia = 24 * hora;

  if (abs < min) return "hace un momento";
  if (abs < hora) return rtf.format(Math.round(diff / min), "minute");
  if (abs < dia) return rtf.format(Math.round(diff / hora), "hour");
  if (abs < 30 * dia) return rtf.format(Math.round(diff / dia), "day");
  return formatearFecha(fecha);
}

export function formatearDinero(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Resume un user-agent a algo legible en la lista de sesiones. */
export function resumirDispositivo(ua: string | null | undefined): string {
  if (!ua) return "Dispositivo desconocido";
  const so = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Sistema desconocido";

  const nav = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "Navegador desconocido";

  return `${nav} · ${so}`;
}

/** Color estable derivado del nombre, para los avatares. */
export function colorDeNombre(nombre: string): string {
  const paleta = ["#0f766e", "#7c3aed", "#b45309", "#be123c", "#1d4ed8", "#15803d", "#a21caf", "#0e7490"];
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return paleta[h % paleta.length];
}
