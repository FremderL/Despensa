"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { categories, getDb, itemBatches, items, locations, stockMovements, type Unidad } from "@/db";
import { auditar } from "@/lib/audit";
import { exito, fallo, valoresSeguros, type EstadoFormulario } from "@/lib/acciones";
import { contextoAccion, respuestaDeError } from "@/lib/authz";
import { newId } from "@/lib/crypto";
import { CUOTAS, consumirCuota } from "@/lib/rate-limit";
import {
  ajusteLoteSchema,
  articuloSchema,
  consumirSchema,
  editarArticuloSchema,
  erroresDeZod,
  formToObject,
  loteSchema,
} from "@/lib/validation";

const MAX_ARTICULOS = 5000;
const MAX_LOTES_POR_ARTICULO = 100;

/* -------------------------------------------------------------------------- */
/*                                   Ayudas                                    */
/* -------------------------------------------------------------------------- */

/** Precio "1.234,56" o "1234.56" → número. */
function aNumero(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Comprueba que una categoría/ubicación pertenece a esta despensa.
 *
 * Sin esto, alguien podría enviar el id de una categoría de otra casa y
 * enlazar datos entre despensas ajenas. El identificador viene del formulario,
 * así que no es de fiar aunque el desplegable sólo muestre los correctos.
 */
async function idValidoEnDespensa(
  tabla: "categories" | "locations",
  id: string | null,
  householdId: string,
): Promise<boolean> {
  if (id === null) return true;
  const db = await getDb();
  if (tabla === "categories") {
    const [f] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.householdId, householdId)))
      .limit(1);
    return Boolean(f);
  }
  const [f] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.householdId, householdId)))
    .limit(1);
  return Boolean(f);
}

async function registrarMovimiento(opts: {
  householdId: string;
  itemId: string;
  batchId: string | null;
  itemName: string;
  type: "alta" | "consumo" | "merma" | "ajuste" | "traslado";
  quantity: number;
  unit: Unidad;
  userId: string;
  note?: string | null;
}) {
  const db = await getDb();
  await db.insert(stockMovements).values({
    id: newId(),
    householdId: opts.householdId,
    itemId: opts.itemId,
    batchId: opts.batchId,
    itemName: opts.itemName,
    type: opts.type,
    quantity: String(opts.quantity),
    unit: opts.unit,
    userId: opts.userId,
    note: opts.note ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Artículos                                  */
/* -------------------------------------------------------------------------- */

export async function crearArticulo(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = articuloSchema.safeParse(formToObject(fd));
  if (!datos.success) {
    return fallo("Revisa los datos del artículo.", erroresDeZod(datos.error), valoresSeguros(fd));
  }

  const d = datos.data;
  let itemId = "";

  try {
    const ctx = await contextoAccion(d.householdId, "member");

    const cuota = await consumirCuota(`escritura:${ctx.sesion.user.id}`, CUOTAS.escrituraPorUsuario);
    if (!cuota.permitido) return fallo("Vas demasiado rápido. Espera unos segundos.");

    const db = await getDb();

    const [{ n }] = await db.select({ n: count() }).from(items).where(eq(items.householdId, d.householdId));
    if (Number(n) >= MAX_ARTICULOS) return fallo(`Esta despensa alcanzó el máximo de ${MAX_ARTICULOS} artículos.`);

    if (!(await idValidoEnDespensa("categories", d.categoryId, d.householdId))) {
      return fallo("La categoría seleccionada no existe en esta despensa.");
    }
    if (!(await idValidoEnDespensa("locations", d.locationId, d.householdId))) {
      return fallo("La ubicación seleccionada no existe en esta despensa.");
    }

    itemId = newId();

    await db.insert(items).values({
      id: itemId,
      householdId: d.householdId,
      name: d.name,
      brand: d.brand,
      barcode: d.barcode,
      categoryId: d.categoryId,
      defaultLocationId: d.locationId,
      unit: d.unit,
      minQuantity: String(d.minQuantity),
      perishable: d.perishable,
      notes: d.notes,
      createdBy: ctx.sesion.user.id,
    });

    // Primer lote, si se indicó cantidad.
    if (d.quantity > 0) {
      const batchId = newId();
      await db.insert(itemBatches).values({
        id: batchId,
        itemId,
        householdId: d.householdId,
        quantity: String(d.quantity),
        locationId: d.locationId,
        expiresAt: d.expiresAt,
        expiryType: d.expiryType,
        purchasedAt: d.purchasedAt,
        price: aNumero(d.price) !== null ? String(aNumero(d.price)) : null,
        createdBy: ctx.sesion.user.id,
      });

      await registrarMovimiento({
        householdId: d.householdId,
        itemId,
        batchId,
        itemName: d.name,
        type: "alta",
        quantity: d.quantity,
        unit: d.unit,
        userId: ctx.sesion.user.id,
      });
    }
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }

  revalidatePath(`/despensas/${d.householdId}`, "layout");
  redirect(`/despensas/${d.householdId}/inventario/${itemId}?creado=1`);
}

export async function editarArticulo(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = editarArticuloSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos.", erroresDeZod(datos.error), valoresSeguros(fd));

  const d = datos.data;

  try {
    const ctx = await contextoAccion(d.householdId, "member");
    const db = await getDb();

    if (!(await idValidoEnDespensa("categories", d.categoryId, d.householdId))) {
      return fallo("La categoría seleccionada no existe en esta despensa.");
    }
    if (!(await idValidoEnDespensa("locations", d.locationId, d.householdId))) {
      return fallo("La ubicación seleccionada no existe en esta despensa.");
    }

    // El filtro por householdId es la barrera contra editar el artículo de otra casa.
    const actualizados = await db
      .update(items)
      .set({
        name: d.name,
        brand: d.brand,
        barcode: d.barcode,
        categoryId: d.categoryId,
        defaultLocationId: d.locationId,
        unit: d.unit,
        minQuantity: String(d.minQuantity),
        perishable: d.perishable,
        notes: d.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(items.id, d.itemId), eq(items.householdId, d.householdId)))
      .returning({ id: items.id });

    if (actualizados.length === 0) return fallo("Ese artículo ya no existe.");

    void ctx;
    revalidatePath(`/despensas/${d.householdId}`, "layout");
    return exito("Artículo actualizado.");
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

export async function eliminarArticulo(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const itemId = String(fd.get("itemId") ?? "");
  if (!householdId || !itemId) return fallo("Faltan datos.");

  try {
    const ctx = await contextoAccion(householdId, "member");
    const db = await getDb();

    const borrados = await db
      .delete(items)
      .where(and(eq(items.id, itemId), eq(items.householdId, householdId)))
      .returning({ name: items.name });

    if (borrados.length === 0) return fallo("Ese artículo ya no existe.");

    await auditar({
      action: "articulo.eliminado",
      userId: ctx.sesion.user.id,
      householdId,
      metadata: { nombre: borrados[0].name },
    });
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }

  revalidatePath(`/despensas/${householdId}`, "layout");
  redirect(`/despensas/${householdId}/inventario?eliminado=1`);
}

/* -------------------------------------------------------------------------- */
/*                                    Lotes                                    */
/* -------------------------------------------------------------------------- */

export async function agregarLote(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = loteSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos.", erroresDeZod(datos.error), valoresSeguros(fd));

  const d = datos.data;

  try {
    const ctx = await contextoAccion(d.householdId, "member");
    const cuota = await consumirCuota(`escritura:${ctx.sesion.user.id}`, CUOTAS.escrituraPorUsuario);
    if (!cuota.permitido) return fallo("Vas demasiado rápido. Espera unos segundos.");

    const db = await getDb();

    const [articulo] = await db
      .select({ id: items.id, name: items.name, unit: items.unit })
      .from(items)
      .where(and(eq(items.id, d.itemId), eq(items.householdId, d.householdId)))
      .limit(1);

    if (!articulo) return fallo("Ese artículo no existe en esta despensa.");

    if (!(await idValidoEnDespensa("locations", d.locationId, d.householdId))) {
      return fallo("La ubicación seleccionada no existe en esta despensa.");
    }

    const [{ n }] = await db.select({ n: count() }).from(itemBatches).where(eq(itemBatches.itemId, d.itemId));
    if (Number(n) >= MAX_LOTES_POR_ARTICULO) {
      return fallo(`Este artículo ya tiene ${MAX_LOTES_POR_ARTICULO} lotes. Consume o elimina alguno.`);
    }

    const batchId = newId();
    await db.insert(itemBatches).values({
      id: batchId,
      itemId: d.itemId,
      householdId: d.householdId,
      quantity: String(d.quantity),
      locationId: d.locationId,
      expiresAt: d.expiresAt,
      expiryType: d.expiryType,
      openedAt: d.openedAt,
      purchasedAt: d.purchasedAt,
      price: aNumero(d.price) !== null ? String(aNumero(d.price)) : null,
      note: d.note,
      createdBy: ctx.sesion.user.id,
    });

    await registrarMovimiento({
      householdId: d.householdId,
      itemId: d.itemId,
      batchId,
      itemName: articulo.name,
      type: "alta",
      quantity: d.quantity,
      unit: articulo.unit,
      userId: ctx.sesion.user.id,
      note: d.note,
    });

    revalidatePath(`/despensas/${d.householdId}`, "layout");
    return exito("Lote añadido.");
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

/** Descuenta cantidad de un lote (consumo o merma). */
export async function consumirLote(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = consumirSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Cantidad no válida.", erroresDeZod(datos.error));

  const d = datos.data;

  try {
    const ctx = await contextoAccion(d.householdId, "member");
    const db = await getDb();

    const [lote] = await db
      .select({
        id: itemBatches.id,
        quantity: itemBatches.quantity,
        itemId: itemBatches.itemId,
        itemName: items.name,
        unit: items.unit,
      })
      .from(itemBatches)
      .innerJoin(items, eq(items.id, itemBatches.itemId))
      .where(and(eq(itemBatches.id, d.batchId), eq(itemBatches.householdId, d.householdId)))
      .limit(1);

    if (!lote) return fallo("Ese lote ya no existe.");

    const actual = Number(lote.quantity);
    if (d.quantity > actual) {
      return fallo(`Sólo quedan ${actual} en ese lote.`, { quantity: "Cantidad mayor que la existencia." });
    }

    const restante = Number((actual - d.quantity).toFixed(3));

    /**
     * El descuento se hace en la propia sentencia (`quantity - X`) y sólo si
     * sigue habiendo suficiente. Si dos personas consumen a la vez desde sus
     * móviles, la base de datos impide que el stock quede negativo.
     */
    const actualizados = await db
      .update(itemBatches)
      .set({
        quantity: sql`${itemBatches.quantity} - ${String(d.quantity)}`,
        depletedAt: restante <= 0 ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(itemBatches.id, d.batchId),
          eq(itemBatches.householdId, d.householdId),
          sql`${itemBatches.quantity} >= ${String(d.quantity)}`,
        ),
      )
      .returning({ id: itemBatches.id });

    if (actualizados.length === 0) {
      return fallo("Alguien acaba de modificar este lote. Vuelve a intentarlo.");
    }

    await registrarMovimiento({
      householdId: d.householdId,
      itemId: lote.itemId,
      batchId: lote.id,
      itemName: lote.itemName,
      type: d.motivo,
      quantity: -d.quantity,
      unit: lote.unit,
      userId: ctx.sesion.user.id,
    });

    revalidatePath(`/despensas/${d.householdId}`, "layout");
    return exito(
      d.motivo === "merma"
        ? `Se registró la merma de ${d.quantity}.`
        : restante <= 0
          ? "Lote agotado."
          : `Consumido. Quedan ${restante}.`,
    );
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

/** Corrige la cantidad de un lote a un valor absoluto (recuento manual). */
export async function ajustarLote(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = ajusteLoteSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Cantidad no válida.", erroresDeZod(datos.error));

  const d = datos.data;

  try {
    const ctx = await contextoAccion(d.householdId, "member");
    const db = await getDb();

    const [lote] = await db
      .select({
        id: itemBatches.id,
        quantity: itemBatches.quantity,
        itemId: itemBatches.itemId,
        itemName: items.name,
        unit: items.unit,
      })
      .from(itemBatches)
      .innerJoin(items, eq(items.id, itemBatches.itemId))
      .where(and(eq(itemBatches.id, d.batchId), eq(itemBatches.householdId, d.householdId)))
      .limit(1);

    if (!lote) return fallo("Ese lote ya no existe.");

    const anterior = Number(lote.quantity);
    const delta = Number((d.quantity - anterior).toFixed(3));

    await db
      .update(itemBatches)
      .set({
        quantity: String(d.quantity),
        depletedAt: d.quantity <= 0 ? new Date() : null,
        note: d.note ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(itemBatches.id, d.batchId), eq(itemBatches.householdId, d.householdId)));

    if (delta !== 0) {
      await registrarMovimiento({
        householdId: d.householdId,
        itemId: lote.itemId,
        batchId: lote.id,
        itemName: lote.itemName,
        type: "ajuste",
        quantity: delta,
        unit: lote.unit,
        userId: ctx.sesion.user.id,
        note: d.note,
      });
    }

    revalidatePath(`/despensas/${d.householdId}`, "layout");
    return exito("Cantidad ajustada.");
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

export async function eliminarLote(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const batchId = String(fd.get("batchId") ?? "");
  if (!householdId || !batchId) return fallo("Faltan datos.");

  try {
    const ctx = await contextoAccion(householdId, "member");
    const db = await getDb();

    const [lote] = await db
      .select({
        id: itemBatches.id,
        quantity: itemBatches.quantity,
        itemId: itemBatches.itemId,
        itemName: items.name,
        unit: items.unit,
      })
      .from(itemBatches)
      .innerJoin(items, eq(items.id, itemBatches.itemId))
      .where(and(eq(itemBatches.id, batchId), eq(itemBatches.householdId, householdId)))
      .limit(1);

    if (!lote) return fallo("Ese lote ya no existe.");

    await db
      .delete(itemBatches)
      .where(and(eq(itemBatches.id, batchId), eq(itemBatches.householdId, householdId)));

    await registrarMovimiento({
      householdId,
      itemId: lote.itemId,
      batchId: null,
      itemName: lote.itemName,
      type: "merma",
      quantity: -Number(lote.quantity),
      unit: lote.unit,
      userId: ctx.sesion.user.id,
      note: "Lote eliminado",
    });

    revalidatePath(`/despensas/${householdId}`, "layout");
    return exito("Lote eliminado.");
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }
}

/** Consume el lote entero de una vez: el gesto más común desde el móvil. */
export async function agotarLote(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const batchId = String(fd.get("batchId") ?? "");
  if (!householdId || !batchId) return fallo("Faltan datos.");

  try {
    await contextoAccion(householdId, "member");
  } catch (err) {
    const r = respuestaDeError(err);
    if (r) return r;
    throw err;
  }

  const db = await getDb();
  const [lote] = await db
    .select({ quantity: itemBatches.quantity })
    .from(itemBatches)
    .where(and(eq(itemBatches.id, batchId), eq(itemBatches.householdId, householdId)))
    .limit(1);

  if (!lote) return fallo("Ese lote ya no existe.");

  const fd2 = new FormData();
  fd2.set("householdId", householdId);
  fd2.set("batchId", batchId);
  fd2.set("quantity", lote.quantity);
  fd2.set("motivo", "consumo");

  return consumirLote({ ok: false }, fd2);
}
