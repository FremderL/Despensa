/**
 * Esquemas de validación.
 *
 * Toda entrada del usuario pasa por aquí antes de tocar la base de datos.
 * La validación del navegador es comodidad para la persona, no una defensa:
 * cualquiera puede enviar un POST a mano, así que el servidor no confía en
 * nada de lo que llega del formulario.
 */
import { z } from "zod";

import { LARGO_MAXIMO, LARGO_MINIMO } from "@/lib/password";
import { ROLES, TIPOS_CATEGORIA, TIPOS_FECHA, TIPOS_UBICACION, UNIDADES } from "@/db/schema";

/** Recorta espacios y colapsa los interiores; evita nombres "invisibles". */
const texto = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));

const textoReq = (min: number, max: number, nombre: string) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min, `${nombre} es obligatorio.`).max(max, `${nombre} es demasiado largo.`));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Escribe un correo válido.")
  .max(254, "El correo es demasiado largo.")
  .refine((v) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v), "Escribe un correo válido.");

export const passwordSchema = z
  .string()
  .min(LARGO_MINIMO, `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`)
  .max(LARGO_MAXIMO, `La contraseña no puede superar ${LARGO_MAXIMO} caracteres.`);

/* -------------------------------- Cuenta --------------------------------- */

export const registroSchema = z
  .object({
    name: textoReq(2, 80, "El nombre"),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    /** Campo trampa: invisible para personas, tentador para bots. */
    website: z.string().max(0).optional().or(z.literal("")),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

export const accesoSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Escribe tu contraseña.").max(LARGO_MAXIMO),
  siguiente: z.string().optional(),
});

export const recuperarSchema = z.object({
  email: emailSchema,
});

export const restablecerSchema = z
  .object({
    token: z.string().min(10).max(200),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

export const cambiarPasswordSchema = z
  .object({
    actual: z.string().min(1, "Escribe tu contraseña actual.").max(LARGO_MAXIMO),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

export const perfilSchema = z.object({
  name: textoReq(2, 80, "El nombre"),
});

/* ------------------------------- Despensas -------------------------------- */

export const despensaSchema = z.object({
  name: textoReq(2, 60, "El nombre de la despensa"),
});

export const ajustesDespensaSchema = z.object({
  householdId: z.string().min(1),
  name: textoReq(2, 60, "El nombre de la despensa"),
  expiryWarningDays: z.coerce
    .number()
    .int("Usa un número entero de días.")
    .min(1, "Avisa con al menos 1 día.")
    .max(120, "Como máximo 120 días."),
});

export const rolSchema = z.enum(ROLES);

export const invitacionSchema = z.object({
  householdId: z.string().min(1),
  /** Opcional: si se indica, sólo esa dirección podrá canjear el enlace. */
  email: z.union([emailSchema, z.literal("")]).optional(),
  role: z.enum(["admin", "member", "viewer"], {
    message: "Elige un rol válido. La propiedad se transfiere aparte.",
  }),
  diasValidez: z.coerce.number().int().min(1).max(30).default(7),
});

/* ------------------------------- Inventario ------------------------------- */

const cantidad = z.coerce
  .number({ message: "Escribe una cantidad válida." })
  .min(0, "La cantidad no puede ser negativa.")
  .max(1_000_000, "Esa cantidad es demasiado grande.")
  .refine((n) => Number.isFinite(n), "Escribe una cantidad válida.");

const cantidadPositiva = cantidad.refine((n) => n > 0, "La cantidad debe ser mayor que cero.");

/** Fecha ISO `YYYY-MM-DD` o vacío. */
const fechaOpcional = z
  .string()
  .trim()
  .max(10)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato de fecha inválido.")
  .refine((v) => v === null || !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Esa fecha no existe.");

const idOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v !== "" ? v : null));

export const articuloSchema = z.object({
  householdId: z.string().min(1),
  name: textoReq(1, 120, "El nombre del artículo"),
  brand: texto(80).optional().transform((v) => (v ? v : null)),
  barcode: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9A-Za-z-]+$/.test(v), "El código de barras sólo admite letras, números y guiones."),
  categoryId: idOpcional,
  locationId: idOpcional,
  unit: z.enum(UNIDADES),
  minQuantity: cantidad.default(0),
  perishable: z.coerce.boolean().default(true),
  notes: texto(500).optional().transform((v) => (v ? v : null)),

  // Primer lote, opcional al crear el artículo.
  quantity: cantidad.default(0),
  expiresAt: fechaOpcional,
  expiryType: z.enum(TIPOS_FECHA).default("caducidad"),
  purchasedAt: fechaOpcional,
  price: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (/^\d+([.,]\d{1,2})?$/.test(v) && Number(v.replace(",", ".")) <= 1_000_000), "Precio inválido."),
});

export const editarArticuloSchema = articuloSchema
  .omit({ quantity: true, expiresAt: true, expiryType: true, purchasedAt: true, price: true })
  .extend({ itemId: z.string().min(1) });

export const loteSchema = z.object({
  householdId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: cantidadPositiva,
  locationId: idOpcional,
  expiresAt: fechaOpcional,
  expiryType: z.enum(TIPOS_FECHA).default("caducidad"),
  purchasedAt: fechaOpcional,
  openedAt: fechaOpcional,
  price: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d+([.,]\d{1,2})?$/.test(v), "Precio inválido."),
  note: texto(300).optional().transform((v) => (v ? v : null)),
});

export const consumirSchema = z.object({
  householdId: z.string().min(1),
  batchId: z.string().min(1),
  quantity: cantidadPositiva,
  motivo: z.enum(["consumo", "merma"]).default("consumo"),
});

export const ajusteLoteSchema = z.object({
  householdId: z.string().min(1),
  batchId: z.string().min(1),
  quantity: cantidad,
  note: texto(300).optional().transform((v) => (v ? v : null)),
});

export const categoriaSchema = z.object({
  householdId: z.string().min(1),
  name: textoReq(1, 40, "El nombre de la categoría"),
  kind: z.enum(TIPOS_CATEGORIA).default("otro"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido.")
    .default("#64748b"),
});

export const ubicacionSchema = z.object({
  householdId: z.string().min(1),
  name: textoReq(1, 40, "El nombre de la ubicación"),
  kind: z.enum(TIPOS_UBICACION).default("otro"),
});

/* --------------------------------- Ayudas --------------------------------- */

/** Convierte `FormData` en objeto plano para Zod, ignorando ficheros. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export type ErroresCampo = Record<string, string>;

/** Aplana los errores de Zod a `{ campo: mensaje }`, listo para la UI. */
export function erroresDeZod(error: z.ZodError): ErroresCampo {
  const out: ErroresCampo = {};
  for (const issue of error.issues) {
    const campo = issue.path.join(".") || "_";
    if (!out[campo]) out[campo] = issue.message;
  }
  return out;
}
