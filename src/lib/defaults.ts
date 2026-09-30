import type { TipoCategoria, TipoUbicacion } from "@/lib/catalogos";

/**
 * Categorías y ubicaciones que se crean con cada despensa nueva.
 *
 * Cubren los tres grandes grupos que pidió el proyecto: comida preparada,
 * comida no perecedera y objetos de cualquier otra procedencia (baño, higiene,
 * limpieza, botiquín...). Son un punto de partida editable, no una jaula:
 * cada casa puede renombrarlas, borrarlas o añadir las suyas.
 */

export const CATEGORIAS_INICIALES: Array<{ name: string; kind: TipoCategoria; color: string }> = [
  { name: "Comida preparada", kind: "comida_preparada", color: "#ea580c" },
  { name: "Despensa seca", kind: "no_perecedero", color: "#a16207" },
  { name: "Refrigerados", kind: "refrigerado", color: "#0891b2" },
  { name: "Congelados", kind: "congelado", color: "#2563eb" },
  { name: "Frutas y verduras", kind: "refrigerado", color: "#16a34a" },
  { name: "Bebidas", kind: "bebida", color: "#7c3aed" },
  { name: "Baño e higiene personal", kind: "higiene", color: "#db2777" },
  { name: "Limpieza del hogar", kind: "limpieza", color: "#0d9488" },
  { name: "Botiquín", kind: "medicamento", color: "#dc2626" },
  { name: "Mascotas", kind: "mascota", color: "#65a30d" },
  { name: "Bebé", kind: "bebe", color: "#e11d48" },
  { name: "Otros", kind: "otro", color: "#64748b" },
];

export const UBICACIONES_INICIALES: Array<{ name: string; kind: TipoUbicacion }> = [
  { name: "Alacena", kind: "alacena" },
  { name: "Refrigerador", kind: "refrigerador" },
  { name: "Congelador", kind: "congelador" },
  { name: "Baño", kind: "bano" },
  { name: "Clóset de limpieza", kind: "closet" },
  { name: "Botiquín", kind: "botiquin" },
];

/** Reexportadas desde los catálogos para no duplicar la traducción. */
export { ETIQUETA_TIPO_CATEGORIA, ETIQUETA_TIPO_UBICACION } from "@/lib/catalogos";
