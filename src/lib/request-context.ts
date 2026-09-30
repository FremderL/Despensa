import "server-only";

import { headers } from "next/headers";

/**
 * IP del cliente tal y como la reporta el proxy de Render.
 *
 * Advertencia consciente: `x-forwarded-for` es falsificable si la app se
 * expone sin proxy delante. Por eso las cuotas por IP nunca son el único
 * control: los intentos de acceso se limitan también por cuenta, que no se
 * puede falsificar.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return (h.get("x-real-ip") ?? "desconocida").slice(0, 64);
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "desconocido").slice(0, 300);
}

export async function requestContext(): Promise<{ ip: string; userAgent: string }> {
  const [ip, ua] = await Promise.all([clientIp(), userAgent()]);
  return { ip, userAgent: ua };
}
