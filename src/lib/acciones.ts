import type { ErroresCampo } from "@/lib/validation";

/**
 * Forma común de la respuesta de una server action, pensada para
 * `useActionState`. Incluye los valores enviados para que el formulario se
 * repueble tras un error y la persona no tenga que reescribirlo todo.
 */
export type EstadoFormulario = {
  ok: boolean;
  mensaje?: string;
  errores?: ErroresCampo;
  valores?: Record<string, string>;
  /** Sólo en desarrollo sin SMTP: enlace que normalmente iría por correo. */
  enlaceDesarrollo?: string;
};

export const ESTADO_INICIAL: EstadoFormulario = { ok: false };

export function fallo(mensaje: string, errores?: ErroresCampo, valores?: Record<string, string>): EstadoFormulario {
  return { ok: false, mensaje, errores, valores };
}

export function exito(mensaje?: string, extra: Partial<EstadoFormulario> = {}): EstadoFormulario {
  return { ok: true, mensaje, ...extra };
}

/** Conserva lo tecleado salvo los campos sensibles. */
export function valoresSeguros(fd: FormData, omitir: string[] = []): Record<string, string> {
  const fuera = new Set([...omitir, "password", "passwordConfirm", "actual", "token"]);
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && !fuera.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Sanea un destino de redirección tomado de la URL.
 *
 * Sin esto, `/ingresar?siguiente=https://sitio-malo.example` convertiría
 * nuestra pantalla de acceso en un trampolín creíble para phishing: el enlace
 * empieza en nuestro dominio y acaba en el suyo. Sólo se aceptan rutas
 * internas absolutas.
 */
export function destinoSeguro(valor: string | null | undefined, porDefecto = "/despensas"): string {
  if (!valor) return porDefecto;
  if (!valor.startsWith("/")) return porDefecto;
  // `//host` y `/\host` los interpreta el navegador como URL con autoridad.
  if (valor.startsWith("//") || valor.startsWith("/\\")) return porDefecto;
  if (valor.includes("://") || /[\r\n]/.test(valor)) return porDefecto;
  return valor;
}
