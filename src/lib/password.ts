/**
 * Hashing y política de contraseñas.
 *
 * Algoritmo: Argon2id, ganador del Password Hashing Competition y la
 * recomendación actual de OWASP. Parámetros según la guía de OWASP
 * (m=19 MiB, t=2, p=1), que resiste tanto GPU como ataques de canal lateral.
 */
import { randomBytes } from "node:crypto";

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

/**
 * `2` es Argon2id en @node-rs/argon2. Se escribe el número en lugar de
 * importar su enum porque es un `const enum` ambiente, incompatible con la
 * compilación por módulos aislados que usa Next.
 */
const ARGON2ID = 2;

const OPCIONES = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash desechable con el mismo coste que uno real. Se verifica contra él
 * cuando el correo no existe, para que iniciar sesión tarde lo mismo exista o
 * no la cuenta: si no, el tiempo de respuesta delata qué correos están dados
 * de alta.
 *
 * Se calcula una vez por proceso sobre una entrada aleatoria, de modo que sea
 * un hash válido de verdad (uno inventado fallaría al parsearse y devolvería
 * de inmediato, que es justo la fuga de tiempo que queremos evitar).
 */
let señuelo: Promise<string> | null = null;
function hashSeñuelo(): Promise<string> {
  señuelo ??= argonHash(randomBytes(32).toString("hex"), OPCIONES);
  return señuelo;
}

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, OPCIONES);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain, OPCIONES);
  } catch {
    // Hash corrupto o de otro algoritmo: se trata como fallo, nunca como acierto.
    return false;
  }
}

/** Consume el mismo tiempo que una verificación real, sin revelar nada. */
export async function verifyDummyPassword(plain: string): Promise<void> {
  try {
    await argonVerify(await hashSeñuelo(), plain, OPCIONES);
  } catch {
    /* se ignora a propósito */
  }
}

export const LARGO_MINIMO = 10;
export const LARGO_MAXIMO = 128; // evita DoS: hashear megabytes es caro

/**
 * Contraseñas muy frecuentes en filtraciones. No pretende ser exhaustivo:
 * cubre lo que un atacante probaría en los primeros intentos.
 */
const FRECUENTES = new Set([
  "contrasena1",
  "contraseña1",
  "contrasena123",
  "contraseña123",
  "password12",
  "password123",
  "password1234",
  "qwertyuiop",
  "1234567890",
  "12345678910",
  "administrador",
  "bienvenido1",
  "iloveyou12",
  "despensa123",
  "qwerty12345",
  "abc123456789",
]);

export type ResultadoPolitica = { ok: true } | { ok: false; motivo: string };

/**
 * Política deliberadamente simple: longitud por encima de todo.
 * Exigir símbolos y mayúsculas empuja a la gente hacia `Password1!`, que es
 * peor que una frase larga. NIST SP 800-63B recomienda justo esto.
 */
export function evaluarPassword(plain: string, contexto: { email?: string; nombre?: string } = {}): ResultadoPolitica {
  if (plain.length < LARGO_MINIMO) {
    return { ok: false, motivo: `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.` };
  }
  if (plain.length > LARGO_MAXIMO) {
    return { ok: false, motivo: `La contraseña no puede superar ${LARGO_MAXIMO} caracteres.` };
  }

  const normal = plain.toLowerCase().normalize("NFKD");

  if (FRECUENTES.has(normal)) {
    return { ok: false, motivo: "Esa contraseña aparece en filtraciones conocidas. Elige otra." };
  }

  // Un solo carácter repetido, o secuencias evidentes.
  if (/^(.)\1+$/.test(plain)) {
    return { ok: false, motivo: "La contraseña no puede ser un mismo carácter repetido." };
  }
  if (/^(0123456789|1234567890|abcdefghij|qwertyuiop)/.test(normal)) {
    return { ok: false, motivo: "Evita secuencias del teclado o números consecutivos." };
  }

  const local = contexto.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && normal.includes(local)) {
    return { ok: false, motivo: "La contraseña no puede contener tu correo." };
  }
  if (contexto.nombre && contexto.nombre.length >= 3 && normal.includes(contexto.nombre.toLowerCase())) {
    return { ok: false, motivo: "La contraseña no puede contener tu nombre." };
  }

  // Al menos 5 caracteres distintos: descarta "aaaaaaaaab".
  if (new Set(plain).size < 5) {
    return { ok: false, motivo: "La contraseña es demasiado repetitiva." };
  }

  return { ok: true };
}
