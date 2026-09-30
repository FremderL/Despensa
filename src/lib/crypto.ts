/**
 * Primitivas criptográficas compartidas.
 *
 * Regla de oro del proyecto: ningún secreto que viaje al usuario (token de
 * sesión, de invitación, de verificación) se almacena en claro. En la base de
 * datos vive únicamente su HMAC-SHA256 con `AUTH_SECRET`.
 *
 * Por qué HMAC y no SHA-256 a secas: si alguien copia la base de datos pero no
 * tiene la clave del servidor, no puede construir el hash de un token elegido
 * por él. Un SHA-256 simple sí permitiría ese ataque sobre tokens de baja
 * entropía o precalculados.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { env } from "@/env";

/** Identificador opaco para filas nuevas. */
export function newId(): string {
  return randomUUID();
}

/**
 * Token aleatorio apto para URL.
 * 32 bytes = 256 bits de entropía: no es adivinable por fuerza bruta.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Huella que sí puede guardarse en la base de datos. */
export function hashToken(token: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(token, "utf8").digest("hex");
}

/** Comparación en tiempo constante: no filtra información por el tiempo de respuesta. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Igualamos el coste aunque las longitudes difieran.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Código corto legible para mostrar una invitación sin exponer el token. */
export function shortCode(len = 6): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += abc[bytes[i] % abc.length];
  return out;
}
