import "server-only";

import { and, asc, count, desc, eq, isNull, isNotNull, or, sql, type SQL } from "drizzle-orm";

import {
  categories,
  getDb,
  householdMembers,
  invitations,
  itemBatches,
  items,
  locations,
  stockMovements,
  users,
  type Rol,
  type TipoFecha,
  type Unidad,
} from "@/db";
import { estadoCaducidad, hoyISO, ORDEN_ESTADO, type EstadoCaducidad } from "@/lib/expiry";

/**
 * Consultas de lectura.
 *
 * Todas reciben el `householdId` ya autorizado por `requireMiembro`. Aquí no
 * se vuelve a comprobar el permiso, pero SÍ se filtra siempre por despensa:
 * es la última red de seguridad contra una fuga entre casas si alguna vez se
 * llama desde un sitio donde la autorización falte.
 */

/** Escapa los comodines de LIKE para que la búsqueda no los interprete. */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* -------------------------------------------------------------------------- */
/*                               Catálogos                                     */
/* -------------------------------------------------------------------------- */

export async function categoriasDe(householdId: string) {
  const db = await getDb();
  return db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      color: categories.color,
    })
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function ubicacionesDe(householdId: string) {
  const db = await getDb();
  return db
    .select({ id: locations.id, name: locations.name, kind: locations.kind })
    .from(locations)
    .where(eq(locations.householdId, householdId))
    .orderBy(asc(locations.sortOrder), asc(locations.name));
}

/* -------------------------------------------------------------------------- */
/*                                Inventario                                   */
/* -------------------------------------------------------------------------- */

export type FilaInventario = {
  id: string;
  name: string;
  brand: string | null;
  unit: Unidad;
  minQuantity: number;
  perishable: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  locationName: string | null;
  total: number;
  lotes: number;
  proximaCaducidad: string | null;
  estado: EstadoCaducidad;
  diasRestantes: number | null;
  etiquetaEstado: string;
  bajoMinimo: boolean;
};

export type FiltrosInventario = {
  buscar?: string;
  categoria?: string;
  ubicacion?: string;
  estado?: "todos" | "caducado" | "pronto" | "bajo_minimo" | "sin_stock";
  orden?: "caducidad" | "nombre" | "reciente";
};

export async function listarInventario(
  householdId: string,
  diasAviso: number,
  filtros: FiltrosInventario = {},
): Promise<FilaInventario[]> {
  const db = await getDb();
  const hoy = hoyISO();

  const condiciones: SQL[] = [eq(items.householdId, householdId), isNull(items.archivedAt)];

  if (filtros.buscar?.trim()) {
    const q = `%${escaparLike(filtros.buscar.trim())}%`;
    // `ILIKE` no distingue mayúsculas ni acentos escritos tal cual.
    const cond = or(
      sql`${items.name} ilike ${q}`,
      sql`coalesce(${items.brand}, '') ilike ${q}`,
      sql`coalesce(${items.barcode}, '') ilike ${q}`,
    );
    if (cond) condiciones.push(cond);
  }

  if (filtros.categoria && filtros.categoria !== "todas") {
    condiciones.push(
      filtros.categoria === "sin_categoria"
        ? isNull(items.categoryId)
        : eq(items.categoryId, filtros.categoria),
    );
  }

  const filas = await db
    .select({
      id: items.id,
      name: items.name,
      brand: items.brand,
      unit: items.unit,
      minQuantity: sql<string>`${items.minQuantity}::text`,
      perishable: items.perishable,
      categoryId: items.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      locationName: locations.name,
      createdAt: items.createdAt,
      // Sólo cuentan los lotes con existencia.
      total: sql<string>`coalesce(sum(${itemBatches.quantity}) filter (where ${itemBatches.quantity} > 0), 0)::text`,
      lotes: sql<string>`count(${itemBatches.id}) filter (where ${itemBatches.quantity} > 0)::text`,
      // ::text evita que cada driver devuelva la fecha en un tipo distinto.
      proximaCaducidad: sql<
        string | null
      >`(min(${itemBatches.expiresAt}) filter (where ${itemBatches.quantity} > 0 and ${itemBatches.expiresAt} is not null))::text`,
      ubicacionesLote: sql<
        string | null
      >`(select string_agg(distinct l2.name, ', ') from item_batches b2 left join locations l2 on l2.id = b2.location_id where b2.item_id = ${items.id} and b2.quantity > 0)`,
    })
    .from(items)
    .leftJoin(itemBatches, eq(itemBatches.itemId, items.id))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .leftJoin(locations, eq(locations.id, items.defaultLocationId))
    .where(and(...condiciones))
    .groupBy(items.id, categories.id, categories.name, categories.color, locations.name);

  let salida: FilaInventario[] = filas.map((f) => {
    const total = Number(f.total);
    const min = Number(f.minQuantity);
    const info = estadoCaducidad(f.proximaCaducidad, diasAviso, hoy);

    return {
      id: f.id,
      name: f.name,
      brand: f.brand,
      unit: f.unit,
      minQuantity: min,
      perishable: f.perishable,
      categoryId: f.categoryId,
      categoryName: f.categoryName,
      categoryColor: f.categoryColor,
      locationName: f.ubicacionesLote || f.locationName,
      total,
      lotes: Number(f.lotes),
      proximaCaducidad: f.proximaCaducidad,
      estado: info.estado,
      diasRestantes: info.dias,
      etiquetaEstado: info.etiqueta,
      bajoMinimo: min > 0 && total < min,
      _createdAt: f.createdAt,
    } as FilaInventario & { _createdAt: Date };
  });

  if (filtros.ubicacion && filtros.ubicacion !== "todas") {
    const nombre = (await ubicacionesDe(householdId)).find((u) => u.id === filtros.ubicacion)?.name;
    if (nombre) salida = salida.filter((f) => (f.locationName ?? "").includes(nombre));
  }

  switch (filtros.estado) {
    case "caducado":
      salida = salida.filter((f) => f.estado === "caducado");
      break;
    case "pronto":
      salida = salida.filter((f) => f.estado === "critico" || f.estado === "proximo");
      break;
    case "bajo_minimo":
      salida = salida.filter((f) => f.bajoMinimo);
      break;
    case "sin_stock":
      salida = salida.filter((f) => f.total <= 0);
      break;
  }

  switch (filtros.orden) {
    case "nombre":
      salida.sort((a, b) => a.name.localeCompare(b.name, "es"));
      break;
    case "reciente":
      salida.sort(
        (a, b) =>
          ((b as unknown as { _createdAt: Date })._createdAt?.getTime() ?? 0) -
          ((a as unknown as { _createdAt: Date })._createdAt?.getTime() ?? 0),
      );
      break;
    default:
      // Por defecto: lo que hay que resolver antes, primero.
      salida.sort((a, b) => {
        const d = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado];
        if (d !== 0) return d;
        if (a.diasRestantes !== null && b.diasRestantes !== null && a.diasRestantes !== b.diasRestantes) {
          return a.diasRestantes - b.diasRestantes;
        }
        return a.name.localeCompare(b.name, "es");
      });
  }

  return salida;
}

/* -------------------------------------------------------------------------- */
/*                             Detalle de artículo                             */
/* -------------------------------------------------------------------------- */

export type LoteDetalle = {
  id: string;
  quantity: number;
  expiresAt: string | null;
  expiryType: TipoFecha;
  openedAt: string | null;
  purchasedAt: string | null;
  price: number | null;
  note: string | null;
  locationId: string | null;
  locationName: string | null;
  creadoPor: string | null;
  createdAt: Date;
  estado: EstadoCaducidad;
  etiquetaEstado: string;
  diasRestantes: number | null;
};

export async function detalleArticulo(householdId: string, itemId: string, diasAviso: number) {
  const db = await getDb();
  const hoy = hoyISO();

  const [articulo] = await db
    .select({
      id: items.id,
      name: items.name,
      brand: items.brand,
      barcode: items.barcode,
      unit: items.unit,
      minQuantity: sql<string>`${items.minQuantity}::text`,
      perishable: items.perishable,
      notes: items.notes,
      categoryId: items.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryKind: categories.kind,
      defaultLocationId: items.defaultLocationId,
      createdAt: items.createdAt,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .where(and(eq(items.id, itemId), eq(items.householdId, householdId)))
    .limit(1);

  if (!articulo) return null;

  const lotesRaw = await db
    .select({
      id: itemBatches.id,
      quantity: sql<string>`${itemBatches.quantity}::text`,
      expiresAt: sql<string | null>`${itemBatches.expiresAt}::text`,
      expiryType: itemBatches.expiryType,
      openedAt: sql<string | null>`${itemBatches.openedAt}::text`,
      purchasedAt: sql<string | null>`${itemBatches.purchasedAt}::text`,
      price: sql<string | null>`${itemBatches.price}::text`,
      note: itemBatches.note,
      locationId: itemBatches.locationId,
      locationName: locations.name,
      creadoPor: users.name,
      createdAt: itemBatches.createdAt,
    })
    .from(itemBatches)
    .leftJoin(locations, eq(locations.id, itemBatches.locationId))
    .leftJoin(users, eq(users.id, itemBatches.createdBy))
    .where(and(eq(itemBatches.itemId, itemId), eq(itemBatches.householdId, householdId)))
    .orderBy(asc(itemBatches.expiresAt), asc(itemBatches.createdAt));

  const lotes: LoteDetalle[] = lotesRaw.map((l) => {
    const info = estadoCaducidad(l.expiresAt, diasAviso, hoy);
    return {
      id: l.id,
      quantity: Number(l.quantity),
      expiresAt: l.expiresAt,
      expiryType: l.expiryType,
      openedAt: l.openedAt,
      purchasedAt: l.purchasedAt,
      price: l.price === null ? null : Number(l.price),
      note: l.note,
      locationId: l.locationId,
      locationName: l.locationName,
      creadoPor: l.creadoPor,
      createdAt: l.createdAt,
      estado: info.estado,
      etiquetaEstado: info.etiqueta,
      diasRestantes: info.dias,
    };
  });

  const activos = lotes.filter((l) => l.quantity > 0);
  const total = activos.reduce((s, l) => s + l.quantity, 0);

  const movimientos = await db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: sql<string>`${stockMovements.quantity}::text`,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      usuario: users.name,
    })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(and(eq(stockMovements.itemId, itemId), eq(stockMovements.householdId, householdId)))
    .orderBy(desc(stockMovements.createdAt))
    .limit(25);

  return {
    articulo: { ...articulo, minQuantity: Number(articulo.minQuantity) },
    lotes,
    lotesActivos: activos,
    total,
    bajoMinimo: Number(articulo.minQuantity) > 0 && total < Number(articulo.minQuantity),
    movimientos: movimientos.map((m) => ({ ...m, quantity: Number(m.quantity) })),
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Resumen                                    */
/* -------------------------------------------------------------------------- */

export type ResumenDespensa = {
  articulos: number;
  lotesActivos: number;
  caducados: number;
  porCaducar: number;
  bajoMinimo: number;
  sinStock: number;
  valorEstimado: number;
};

export async function resumenDespensa(householdId: string, diasAviso: number): Promise<ResumenDespensa> {
  const db = await getDb();
  const hoy = hoyISO();
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + diasAviso);
  const limiteISO = limite.toISOString().slice(0, 10);

  const [fila] = await db
    .select({
      articulos: sql<string>`(select count(*) from items i where i.household_id = ${householdId} and i.archived_at is null)::text`,
      lotesActivos: sql<string>`(select count(*) from item_batches b where b.household_id = ${householdId} and b.quantity > 0)::text`,
      caducados: sql<string>`(select count(*) from item_batches b where b.household_id = ${householdId} and b.quantity > 0 and b.expires_at is not null and b.expires_at < ${hoy}::date)::text`,
      porCaducar: sql<string>`(select count(*) from item_batches b where b.household_id = ${householdId} and b.quantity > 0 and b.expires_at is not null and b.expires_at >= ${hoy}::date and b.expires_at <= ${limiteISO}::date)::text`,
      valorEstimado: sql<string>`(select coalesce(sum(b.price), 0) from item_batches b where b.household_id = ${householdId} and b.quantity > 0 and b.price is not null)::text`,
    })
    .from(sql`(select 1) as _`);

  // Bajo mínimo y sin existencias se calculan sobre el agregado por artículo.
  const porArticulo = await db
    .select({
      minQuantity: sql<string>`${items.minQuantity}::text`,
      total: sql<string>`coalesce(sum(${itemBatches.quantity}) filter (where ${itemBatches.quantity} > 0), 0)::text`,
    })
    .from(items)
    .leftJoin(itemBatches, eq(itemBatches.itemId, items.id))
    .where(and(eq(items.householdId, householdId), isNull(items.archivedAt)))
    .groupBy(items.id);

  let bajoMinimo = 0;
  let sinStock = 0;
  for (const a of porArticulo) {
    const min = Number(a.minQuantity);
    const total = Number(a.total);
    if (total <= 0) sinStock++;
    else if (min > 0 && total < min) bajoMinimo++;
  }

  return {
    articulos: Number(fila?.articulos ?? 0),
    lotesActivos: Number(fila?.lotesActivos ?? 0),
    caducados: Number(fila?.caducados ?? 0),
    porCaducar: Number(fila?.porCaducar ?? 0),
    bajoMinimo,
    sinStock,
    valorEstimado: Number(fila?.valorEstimado ?? 0),
  };
}

/** Lotes que exigen atención, ordenados por urgencia. */
export async function alertasCaducidad(householdId: string, diasAviso: number, limite = 12) {
  const db = await getDb();
  const hoy = hoyISO();
  const tope = new Date(`${hoy}T00:00:00Z`);
  tope.setUTCDate(tope.getUTCDate() + diasAviso);
  const topeISO = tope.toISOString().slice(0, 10);

  const filas = await db
    .select({
      batchId: itemBatches.id,
      itemId: items.id,
      nombre: items.name,
      marca: items.brand,
      unit: items.unit,
      cantidad: sql<string>`${itemBatches.quantity}::text`,
      expiresAt: sql<string>`${itemBatches.expiresAt}::text`,
      expiryType: itemBatches.expiryType,
      ubicacion: locations.name,
      categoria: categories.name,
      color: categories.color,
    })
    .from(itemBatches)
    .innerJoin(items, eq(items.id, itemBatches.itemId))
    .leftJoin(locations, eq(locations.id, itemBatches.locationId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .where(
      and(
        eq(itemBatches.householdId, householdId),
        sql`${itemBatches.quantity} > 0`,
        isNotNull(itemBatches.expiresAt),
        sql`${itemBatches.expiresAt} <= ${topeISO}::date`,
      ),
    )
    .orderBy(asc(itemBatches.expiresAt))
    .limit(limite);

  return filas.map((f) => {
    const info = estadoCaducidad(f.expiresAt, diasAviso, hoy);
    return { ...f, cantidad: Number(f.cantidad), ...info };
  });
}

/** Artículos por debajo del mínimo: la lista de la compra implícita. */
export async function articulosBajoMinimo(householdId: string, limite = 20) {
  const db = await getDb();
  const filas = await db
    .select({
      id: items.id,
      nombre: items.name,
      unit: items.unit,
      minQuantity: sql<string>`${items.minQuantity}::text`,
      categoria: categories.name,
      color: categories.color,
      total: sql<string>`coalesce(sum(${itemBatches.quantity}) filter (where ${itemBatches.quantity} > 0), 0)::text`,
    })
    .from(items)
    .leftJoin(itemBatches, eq(itemBatches.itemId, items.id))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .where(and(eq(items.householdId, householdId), isNull(items.archivedAt), sql`${items.minQuantity} > 0`))
    .groupBy(items.id, categories.name, categories.color)
    .having(sql`coalesce(sum(${itemBatches.quantity}) filter (where ${itemBatches.quantity} > 0), 0) < ${items.minQuantity}`)
    .orderBy(asc(items.name))
    .limit(limite);

  return filas.map((f) => ({
    ...f,
    total: Number(f.total),
    minQuantity: Number(f.minQuantity),
  }));
}

/* -------------------------------------------------------------------------- */
/*                            Lista de reposición                              */
/* -------------------------------------------------------------------------- */

export type FilaReposicion = {
  id: string;
  nombre: string;
  marca: string | null;
  unit: Unidad;
  total: number;
  minQuantity: number;
  categoria: string | null;
  color: string | null;
  ubicacionId: string | null;
  ubicacion: string | null;
  /** Sin existencia alguna, frente a "le queda menos del mínimo". */
  agotado: boolean;
  /** Cuándo se consumió lo último, para saber si hace falta reponerlo. */
  ultimoMovimiento: Date | null;
};

/**
 * Artículos que hay que reponer: agotados primero, luego los que han bajado
 * de su mínimo.
 *
 * Se consulta aparte del inventario en lugar de filtrarlo porque las dos
 * listas sirven para cosas distintas: una es "qué tengo", la otra es "qué
 * falta". Mezclarlas obliga a traducir mentalmente de una a otra justo cuando
 * estás en el supermercado.
 */
export async function listaDeReposicion(householdId: string): Promise<FilaReposicion[]> {
  const db = await getDb();

  const filas = await db
    .select({
      id: items.id,
      nombre: items.name,
      marca: items.brand,
      unit: items.unit,
      minQuantity: sql<string>`${items.minQuantity}::text`,
      categoria: categories.name,
      color: categories.color,
      ubicacionId: items.defaultLocationId,
      ubicacion: locations.name,
      total: sql<string>`coalesce(sum(${itemBatches.quantity}) filter (where ${itemBatches.quantity} > 0), 0)::text`,
      ultimoMovimiento: sql<Date | null>`(
        select max(m.created_at) from stock_movements m where m.item_id = ${items.id}
      )`,
    })
    .from(items)
    .leftJoin(itemBatches, eq(itemBatches.itemId, items.id))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .leftJoin(locations, eq(locations.id, items.defaultLocationId))
    .where(and(eq(items.householdId, householdId), isNull(items.archivedAt)))
    .groupBy(items.id, categories.name, categories.color, locations.name)
    .having(
      sql`coalesce(sum(${itemBatches.quantity}) filter (where ${itemBatches.quantity} > 0), 0) <= 0
          or (${items.minQuantity} > 0
              and coalesce(sum(${itemBatches.quantity}) filter (where ${itemBatches.quantity} > 0), 0) < ${items.minQuantity})`,
    );

  return filas
    .map((f) => {
      const total = Number(f.total);
      return {
        id: f.id,
        nombre: f.nombre,
        marca: f.marca,
        unit: f.unit,
        total,
        minQuantity: Number(f.minQuantity),
        categoria: f.categoria,
        color: f.color,
        ubicacionId: f.ubicacionId,
        ubicacion: f.ubicacion,
        agotado: total <= 0,
        ultimoMovimiento: f.ultimoMovimiento ? new Date(f.ultimoMovimiento) : null,
      };
    })
    .sort((a, b) => {
      // Primero lo que no queda nada, luego por nombre.
      if (a.agotado !== b.agotado) return a.agotado ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, "es");
    });
}

export async function movimientosRecientes(householdId: string, limite = 15) {
  const db = await getDb();
  const filas = await db
    .select({
      id: stockMovements.id,
      itemId: stockMovements.itemId,
      itemName: stockMovements.itemName,
      type: stockMovements.type,
      quantity: sql<string>`${stockMovements.quantity}::text`,
      unit: stockMovements.unit,
      createdAt: stockMovements.createdAt,
      usuario: users.name,
      color: users.avatarColor,
    })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(eq(stockMovements.householdId, householdId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limite);

  return filas.map((f) => ({ ...f, quantity: Number(f.quantity) }));
}

/* -------------------------------------------------------------------------- */
/*                             Miembros e invitaciones                         */
/* -------------------------------------------------------------------------- */

export async function miembrosDe(householdId: string) {
  const db = await getDb();
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarColor: users.avatarColor,
      emailVerifiedAt: users.emailVerifiedAt,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(asc(householdMembers.joinedAt));
}

export async function invitacionesPendientes(householdId: string) {
  const db = await getDb();
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      creador: users.name,
    })
    .from(invitations)
    .leftJoin(users, eq(users.id, invitations.createdBy))
    .where(
      and(
        eq(invitations.householdId, householdId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        sql`${invitations.expiresAt} > now()`,
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

export async function contarPorCategoria(householdId: string): Promise<Map<string, number>> {
  const db = await getDb();
  const filas = await db
    .select({ categoryId: items.categoryId, n: count() })
    .from(items)
    .where(eq(items.householdId, householdId))
    .groupBy(items.categoryId);

  const m = new Map<string, number>();
  for (const f of filas) if (f.categoryId) m.set(f.categoryId, Number(f.n));
  return m;
}

export type RolMiembro = Rol;
