"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  categories,
  getDb,
  householdMembers,
  households,
  locations,
  type Db,
} from "@/db";
import { ACCIONES, auditar } from "@/lib/audit";
import { exito, fallo, valoresSeguros, type EstadoFormulario } from "@/lib/acciones";
import { contarPropietarios, ErrorAutorizacion, requireMiembro, requireUsuario } from "@/lib/authz";
import { newId } from "@/lib/crypto";
import { CATEGORIAS_INICIALES, UBICACIONES_INICIALES } from "@/lib/defaults";
import { CUOTAS, consumirCuota } from "@/lib/rate-limit";
import {
  ajustesDespensaSchema,
  categoriaSchema,
  despensaSchema,
  erroresDeZod,
  formToObject,
  ubicacionSchema,
} from "@/lib/validation";

/** Tope por persona: evita que una cuenta llene la base de datos. */
const MAX_DESPENSAS_POR_USUARIO = 10;

/** Siembra las categorías y ubicaciones iniciales de una despensa nueva. */
async function sembrarDespensa(tx: Db, householdId: string) {
  await tx.insert(categories).values(
    CATEGORIAS_INICIALES.map((c, i) => ({
      id: newId(),
      householdId,
      name: c.name,
      kind: c.kind,
      color: c.color,
      sortOrder: i,
    })),
  );

  await tx.insert(locations).values(
    UBICACIONES_INICIALES.map((l, i) => ({
      id: newId(),
      householdId,
      name: l.name,
      kind: l.kind,
      sortOrder: i,
    })),
  );
}

export async function crearDespensa(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const sesion = await requireUsuario();

  const datos = despensaSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa el nombre.", erroresDeZod(datos.error), valoresSeguros(fd));

  const db = await getDb();

  const [{ n }] = await db
    .select({ n: count() })
    .from(householdMembers)
    .where(eq(householdMembers.userId, sesion.user.id));

  if (Number(n) >= MAX_DESPENSAS_POR_USUARIO) {
    return fallo(`Ya participas en ${MAX_DESPENSAS_POR_USUARIO} despensas, el máximo por cuenta.`);
  }

  const householdId = newId();

  await db.transaction(async (tx) => {
    await tx.insert(households).values({
      id: householdId,
      name: datos.data.name,
      createdBy: sesion.user.id,
    });
    await tx.insert(householdMembers).values({
      householdId,
      userId: sesion.user.id,
      role: "owner",
    });
    await sembrarDespensa(tx as unknown as Db, householdId);
  });

  await auditar({
    action: ACCIONES.despensaCreada,
    userId: sesion.user.id,
    householdId,
    metadata: { nombre: datos.data.name },
  });

  revalidatePath("/despensas");
  redirect(`/despensas/${householdId}`);
}

export async function actualizarAjustes(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = ajustesDespensaSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos.", erroresDeZod(datos.error), valoresSeguros(fd));

  try {
    const ctx = await requireMiembro(datos.data.householdId, "admin");
    const db = await getDb();

    await db
      .update(households)
      .set({
        name: datos.data.name,
        expiryWarningDays: datos.data.expiryWarningDays,
        updatedAt: new Date(),
      })
      .where(eq(households.id, datos.data.householdId));

    await auditar({
      action: ACCIONES.despensaActualizada,
      userId: ctx.sesion.user.id,
      householdId: datos.data.householdId,
    });

    revalidatePath(`/despensas/${datos.data.householdId}`, "layout");
    return exito("Ajustes guardados.");
  } catch (err) {
    if (err instanceof ErrorAutorizacion) return fallo(err.message);
    throw err;
  }
}

export async function eliminarDespensa(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const confirmacion = String(fd.get("confirmacion") ?? "");

  if (!householdId) return fallo("Falta la despensa.");

  let nombre = "";
  try {
    const ctx = await requireMiembro(householdId, "owner");
    nombre = ctx.despensa.name;

    /**
     * Confirmación escribiendo el nombre: un borrado en cascada de todo el
     * inventario no debe poder dispararse con un clic accidental.
     */
    if (confirmacion.trim() !== ctx.despensa.name) {
      return fallo("Escribe exactamente el nombre de la despensa para confirmar.", {
        confirmacion: "El texto no coincide.",
      });
    }

    const db = await getDb();
    await db.delete(households).where(eq(households.id, householdId));

    await auditar({
      action: ACCIONES.despensaEliminada,
      userId: ctx.sesion.user.id,
      metadata: { householdId, nombre },
    });
  } catch (err) {
    if (err instanceof ErrorAutorizacion) return fallo(err.message);
    throw err;
  }

  revalidatePath("/despensas");
  redirect("/despensas?eliminada=1");
}

export async function salirDeDespensa(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  if (!householdId) return fallo("Falta la despensa.");

  try {
    const ctx = await requireMiembro(householdId, "viewer");

    if (ctx.rol === "owner" && (await contarPropietarios(householdId)) === 1) {
      return fallo(
        "Eres el único propietario. Nombra a otro propietario antes de salir, o elimina la despensa.",
      );
    }

    const db = await getDb();
    await db
      .delete(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, ctx.sesion.user.id)));

    await auditar({ action: ACCIONES.miembroSalio, userId: ctx.sesion.user.id, householdId });
  } catch (err) {
    if (err instanceof ErrorAutorizacion) return fallo(err.message);
    throw err;
  }

  revalidatePath("/despensas");
  redirect("/despensas");
}

/* ----------------------------- Categorías -------------------------------- */

export async function crearCategoria(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = categoriaSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos.", erroresDeZod(datos.error), valoresSeguros(fd));

  try {
    const ctx = await requireMiembro(datos.data.householdId, "admin");
    const cuota = await consumirCuota(`escritura:${ctx.sesion.user.id}`, CUOTAS.escrituraPorUsuario);
    if (!cuota.permitido) return fallo("Vas demasiado rápido. Espera un momento.");

    const db = await getDb();
    const [{ n }] = await db
      .select({ n: count() })
      .from(categories)
      .where(eq(categories.householdId, datos.data.householdId));

    if (Number(n) >= 60) return fallo("Has alcanzado el máximo de 60 categorías.");

    await db.insert(categories).values({
      id: newId(),
      householdId: datos.data.householdId,
      name: datos.data.name,
      kind: datos.data.kind,
      color: datos.data.color,
      sortOrder: Number(n),
    });

    revalidatePath(`/despensas/${datos.data.householdId}/ajustes`);
    return exito("Categoría creada.");
  } catch (err) {
    if (err instanceof ErrorAutorizacion) return fallo(err.message);
    if (esConflictoUnico(err)) return fallo("Ya existe una categoría con ese nombre.");
    throw err;
  }
}

export async function eliminarCategoria(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const id = String(fd.get("id") ?? "");
  if (!householdId || !id) return fallo("Faltan datos.");

  try {
    await requireMiembro(householdId, "admin");
    const db = await getDb();

    // El `where` incluye householdId: impide borrar la categoría de otra casa.
    const borradas = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.householdId, householdId)))
      .returning({ id: categories.id });

    if (borradas.length === 0) return fallo("Esa categoría ya no existe.");

    revalidatePath(`/despensas/${householdId}`, "layout");
    return exito("Categoría eliminada. Los artículos que la usaban quedaron sin categoría.");
  } catch (err) {
    if (err instanceof ErrorAutorizacion) return fallo(err.message);
    throw err;
  }
}

/* ----------------------------- Ubicaciones -------------------------------- */

export async function crearUbicacion(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const datos = ubicacionSchema.safeParse(formToObject(fd));
  if (!datos.success) return fallo("Revisa los datos.", erroresDeZod(datos.error), valoresSeguros(fd));

  try {
    const ctx = await requireMiembro(datos.data.householdId, "admin");
    const cuota = await consumirCuota(`escritura:${ctx.sesion.user.id}`, CUOTAS.escrituraPorUsuario);
    if (!cuota.permitido) return fallo("Vas demasiado rápido. Espera un momento.");

    const db = await getDb();
    const [{ n }] = await db
      .select({ n: count() })
      .from(locations)
      .where(eq(locations.householdId, datos.data.householdId));

    if (Number(n) >= 40) return fallo("Has alcanzado el máximo de 40 ubicaciones.");

    await db.insert(locations).values({
      id: newId(),
      householdId: datos.data.householdId,
      name: datos.data.name,
      kind: datos.data.kind,
      sortOrder: Number(n),
    });

    revalidatePath(`/despensas/${datos.data.householdId}/ajustes`);
    return exito("Ubicación creada.");
  } catch (err) {
    if (err instanceof ErrorAutorizacion) return fallo(err.message);
    if (esConflictoUnico(err)) return fallo("Ya existe una ubicación con ese nombre.");
    throw err;
  }
}

export async function eliminarUbicacion(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const householdId = String(fd.get("householdId") ?? "");
  const id = String(fd.get("id") ?? "");
  if (!householdId || !id) return fallo("Faltan datos.");

  try {
    await requireMiembro(householdId, "admin");
    const db = await getDb();

    const borradas = await db
      .delete(locations)
      .where(and(eq(locations.id, id), eq(locations.householdId, householdId)))
      .returning({ id: locations.id });

    if (borradas.length === 0) return fallo("Esa ubicación ya no existe.");

    revalidatePath(`/despensas/${householdId}`, "layout");
    return exito("Ubicación eliminada.");
  } catch (err) {
    if (err instanceof ErrorAutorizacion) return fallo(err.message);
    throw err;
  }
}

/** ¿El error viene de una restricción UNIQUE de PostgreSQL? */
function esConflictoUnico(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}
