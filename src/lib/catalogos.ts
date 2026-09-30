/**
 * Catálogos y etiquetas compartidos entre servidor y navegador.
 *
 * Este módulo existe para que un componente de cliente pueda escribir
 * «Propietario» o listar las unidades sin importar, de rebote, el esquema de
 * Drizzle y con él el driver de PostgreSQL. Además de inflar el bundle, eso
 * arrastraría código de servidor al navegador.
 *
 * Regla: aquí sólo datos y funciones puras. Ni base de datos, ni `node:`, ni
 * variables de entorno.
 */

/* ---------------------------------- Roles --------------------------------- */

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Rol = (typeof ROLES)[number];

/** De menor a mayor privilegio. */
export const JERARQUIA: Record<Rol, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export const ETIQUETA_ROL: Record<Rol, string> = {
  owner: "Propietario",
  admin: "Administrador",
  member: "Miembro",
  viewer: "Sólo lectura",
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  owner: "Control total, incluido eliminar la despensa y transferir la propiedad.",
  admin: "Puede invitar, gestionar miembros y editar la configuración.",
  member: "Puede añadir, consumir y editar artículos.",
  viewer: "Sólo puede consultar el inventario.",
};

export function tienePermiso(rol: Rol, minimo: Rol): boolean {
  return JERARQUIA[rol] >= JERARQUIA[minimo];
}

/* ------------------------------- Categorías -------------------------------- */

export const TIPOS_CATEGORIA = [
  "comida_preparada",
  "no_perecedero",
  "refrigerado",
  "congelado",
  "bebida",
  "higiene",
  "limpieza",
  "medicamento",
  "mascota",
  "bebe",
  "otro",
] as const;
export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number];

export const ETIQUETA_TIPO_CATEGORIA: Record<TipoCategoria, string> = {
  comida_preparada: "Comida preparada",
  no_perecedero: "No perecedero",
  refrigerado: "Refrigerado",
  congelado: "Congelado",
  bebida: "Bebida",
  higiene: "Higiene personal",
  limpieza: "Limpieza",
  medicamento: "Medicamento",
  mascota: "Mascota",
  bebe: "Bebé",
  otro: "Otro",
};

/* ------------------------------- Ubicaciones ------------------------------- */

export const TIPOS_UBICACION = [
  "alacena",
  "refrigerador",
  "congelador",
  "bano",
  "closet",
  "bodega",
  "botiquin",
  "otro",
] as const;
export type TipoUbicacion = (typeof TIPOS_UBICACION)[number];

export const ETIQUETA_TIPO_UBICACION: Record<TipoUbicacion, string> = {
  alacena: "Alacena",
  refrigerador: "Refrigerador",
  congelador: "Congelador",
  bano: "Baño",
  closet: "Clóset",
  bodega: "Bodega",
  botiquin: "Botiquín",
  otro: "Otro",
};

/* --------------------------------- Unidades -------------------------------- */

export const UNIDADES = [
  "unidad",
  "g",
  "kg",
  "ml",
  "l",
  "paquete",
  "lata",
  "botella",
  "caja",
  "bolsa",
  "rollo",
  "sobre",
  "porcion",
] as const;
export type Unidad = (typeof UNIDADES)[number];

export const ETIQUETA_UNIDAD: Record<Unidad, string> = {
  unidad: "Unidades",
  g: "Gramos (g)",
  kg: "Kilogramos (kg)",
  ml: "Mililitros (ml)",
  l: "Litros (l)",
  paquete: "Paquetes",
  lata: "Latas",
  botella: "Botellas",
  caja: "Cajas",
  bolsa: "Bolsas",
  rollo: "Rollos",
  sobre: "Sobres",
  porcion: "Porciones",
};

/** Singular y plural para componer «3 botellas» / «1 botella». */
const FORMA_UNIDAD: Record<Unidad, [string, string]> = {
  unidad: ["unidad", "unidades"],
  g: ["g", "g"],
  kg: ["kg", "kg"],
  ml: ["ml", "ml"],
  l: ["l", "l"],
  paquete: ["paquete", "paquetes"],
  lata: ["lata", "latas"],
  botella: ["botella", "botellas"],
  caja: ["caja", "cajas"],
  bolsa: ["bolsa", "bolsas"],
  rollo: ["rollo", "rollos"],
  sobre: ["sobre", "sobres"],
  porcion: ["porción", "porciones"],
};

export function formaUnidad(unidad: Unidad, cantidad: number): string {
  const f = FORMA_UNIDAD[unidad] ?? FORMA_UNIDAD.unidad;
  return cantidad === 1 ? f[0] : f[1];
}

/* ----------------------------- Fechas y movimientos ------------------------ */

/** `caducidad` = límite de consumo. `consumo_preferente` = calidad, no seguridad. */
export const TIPOS_FECHA = ["caducidad", "consumo_preferente"] as const;
export type TipoFecha = (typeof TIPOS_FECHA)[number];

export const TIPOS_MOVIMIENTO = ["alta", "consumo", "merma", "ajuste", "traslado"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  alta: "Alta",
  consumo: "Consumo",
  merma: "Merma",
  ajuste: "Ajuste",
  traslado: "Traslado",
};

/** Forma verbal para la línea de actividad: «Ana consumió leche». */
export const VERBO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  alta: "añadió",
  consumo: "consumió",
  merma: "tiró",
  ajuste: "ajustó",
  traslado: "movió",
};

export const TIPOS_TOKEN = ["verificacion_correo", "restablecer_password"] as const;
export type TipoToken = (typeof TIPOS_TOKEN)[number];
