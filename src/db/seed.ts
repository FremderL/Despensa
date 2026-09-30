/**
 * Datos de ejemplo para desarrollo.
 *
 *   npm run seed
 *
 * Crea una casa con gente, categorías, ubicaciones y un inventario con
 * caducidades repartidas (caducado, hoy, esta semana, el año que viene) para
 * poder ver el semáforo funcionando sin teclear treinta productos.
 *
 * Se niega a ejecutarse en producción: nunca debe haber cuentas de ejemplo
 * con contraseña conocida en un entorno real.
 */
import { cargarEnv } from "./load-env";

const id = () => crypto.randomUUID();


/** Fecha ISO desplazada N días desde hoy. */
function enDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const CUENTAS = [
  { email: "ana@ejemplo.com", name: "Ana García", password: "despensa-demo-2026", rol: "owner" as const },
  { email: "luis@ejemplo.com", name: "Luis Ortega", password: "despensa-demo-2026", rol: "admin" as const },
  { email: "sofia@ejemplo.com", name: "Sofía Ruiz", password: "despensa-demo-2026", rol: "member" as const },
];

/** [nombre, categoría, ubicación, unidad, mínimo, cantidad, días hasta caducar] */
const INVENTARIO: Array<[string, string, string, string, number, number, number | null, string | null]> = [
  ["Lentejas cocidas", "Comida preparada", "Refrigerador", "porcion", 0, 3, -2, "Sobras del domingo"],
  ["Pollo asado", "Comida preparada", "Refrigerador", "porcion", 0, 2, 0, null],
  ["Sopa de verduras", "Comida preparada", "Congelador", "porcion", 0, 4, 45, "Congelada en táperes"],
  ["Leche entera", "Refrigerados", "Refrigerador", "l", 2, 1, 2, null],
  ["Yogur natural", "Refrigerados", "Refrigerador", "unidad", 4, 6, 5, null],
  ["Queso manchego", "Refrigerados", "Refrigerador", "g", 0, 250, 12, null],
  ["Huevos", "Refrigerados", "Refrigerador", "unidad", 6, 12, 18, null],
  ["Arroz", "Despensa seca", "Alacena", "kg", 1, 2, 400, null],
  ["Atún en lata", "Despensa seca", "Alacena", "lata", 4, 3, 730, null],
  ["Pasta", "Despensa seca", "Alacena", "paquete", 2, 1, 300, "Queda poca"],
  ["Aceite de oliva", "Despensa seca", "Alacena", "botella", 1, 1, 500, null],
  ["Garbanzos secos", "Despensa seca", "Alacena", "kg", 0, 1, 600, null],
  ["Manzanas", "Frutas y verduras", "Refrigerador", "unidad", 0, 6, 8, null],
  ["Espinacas", "Frutas y verduras", "Refrigerador", "bolsa", 0, 1, 1, null],
  ["Guisantes", "Congelados", "Congelador", "bolsa", 1, 2, 180, null],
  ["Agua mineral", "Bebidas", "Alacena", "botella", 6, 4, 365, null],
  ["Café molido", "Bebidas", "Alacena", "paquete", 1, 1, 90, null],
  ["Pasta de dientes", "Baño e higiene personal", "Baño", "unidad", 2, 1, 540, "Comprar de repuesto"],
  ["Papel higiénico", "Baño e higiene personal", "Baño", "rollo", 8, 12, null, null],
  ["Champú", "Baño e higiene personal", "Baño", "botella", 1, 2, 400, null],
  ["Jabón de manos", "Baño e higiene personal", "Baño", "botella", 2, 1, 300, null],
  ["Detergente de ropa", "Limpieza del hogar", "Clóset de limpieza", "l", 1, 3, 500, null],
  ["Lavavajillas", "Limpieza del hogar", "Clóset de limpieza", "botella", 1, 1, 400, null],
  ["Bolsas de basura", "Limpieza del hogar", "Clóset de limpieza", "paquete", 1, 2, null, null],
  ["Ibuprofeno 400 mg", "Botiquín", "Botiquín", "caja", 1, 1, 6, "Revisar antes de usar"],
  ["Tiritas", "Botiquín", "Botiquín", "caja", 1, 1, 900, null],
  ["Paracetamol", "Botiquín", "Botiquín", "caja", 1, 0, 200, "Se acabó, reponer"],
  ["Pienso para gato", "Mascotas", "Alacena", "kg", 2, 1, 120, null],
];

async function main() {
  cargarEnv();

  if (process.env.NODE_ENV === "production") {
    console.error("✗ La semilla no puede ejecutarse en producción.");
    process.exit(1);
  }

  // Los módulos se cargan después de `cargarEnv()` para que la validación de
  // entorno vea ya las variables del fichero .env.
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("./client");
  const schema = await import("./schema");
  const { hashPassword } = await import("../lib/password");
  const { CATEGORIAS_INICIALES, UBICACIONES_INICIALES } = await import("../lib/defaults");

  const {
    categories,
    householdMembers,
    households,
    itemBatches,
    items,
    locations,
    stockMovements,
    users,
  } = schema;

  const db = await getDb();
  console.log("→ Sembrando datos de ejemplo…");

  /* Usuarios ------------------------------------------------------------- */
  const idsUsuario: Record<string, string> = {};

  for (const c of CUENTAS) {
    const [existente] = await db.select({ id: users.id }).from(users).where(eq(users.email, c.email)).limit(1);

    if (existente) {
      idsUsuario[c.email] = existente.id;
      console.log(`  · ${c.email} ya existía`);
      continue;
    }

    const uid = id();
    await db.insert(users).values({
      id: uid,
      email: c.email,
      name: c.name,
      passwordHash: await hashPassword(c.password),
      emailVerifiedAt: new Date(),
      avatarColor: ["#0f766e", "#7c3aed", "#b45309"][Object.keys(idsUsuario).length % 3],
    });
    idsUsuario[c.email] = uid;
    console.log(`  · ${c.email} creado`);
  }

  const propietario = idsUsuario["ana@ejemplo.com"];

  /* Despensa -------------------------------------------------------------- */
  const [yaHay] = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.name, "Casa de ejemplo"))
    .limit(1);

  if (yaHay) {
    console.log("✓ «Casa de ejemplo» ya existe. Nada que hacer.");
    process.exit(0);
  }

  const hid = id();
  await db.insert(households).values({
    id: hid,
    name: "Casa de ejemplo",
    expiryWarningDays: 7,
    createdBy: propietario,
  });

  for (const c of CUENTAS) {
    await db.insert(householdMembers).values({
      householdId: hid,
      userId: idsUsuario[c.email],
      role: c.rol,
      invitedBy: c.rol === "owner" ? null : propietario,
    });
  }

  /* Catálogos ------------------------------------------------------------- */
  const idCategoria: Record<string, string> = {};
  for (const [i, c] of CATEGORIAS_INICIALES.entries()) {
    const cid = id();
    idCategoria[c.name] = cid;
    await db.insert(categories).values({ id: cid, householdId: hid, ...c, sortOrder: i });
  }

  const idUbicacion: Record<string, string> = {};
  for (const [i, l] of UBICACIONES_INICIALES.entries()) {
    const lid = id();
    idUbicacion[l.name] = lid;
    await db.insert(locations).values({ id: lid, householdId: hid, ...l, sortOrder: i });
  }

  /* Inventario ------------------------------------------------------------ */
  const autores = Object.values(idsUsuario);

  for (const [i, fila] of INVENTARIO.entries()) {
    const [nombre, categoria, ubicacion, unidad, minimo, cantidad, dias, nota] = fila;
    const autor = autores[i % autores.length];

    const iid = id();
    await db.insert(items).values({
      id: iid,
      householdId: hid,
      name: nombre,
      categoryId: idCategoria[categoria] ?? null,
      defaultLocationId: idUbicacion[ubicacion] ?? null,
      unit: unidad as (typeof schema.UNIDADES)[number],
      minQuantity: String(minimo),
      perishable: dias !== null,
      notes: nota,
      createdBy: autor,
    });

    if (cantidad > 0) {
      const bid = id();
      await db.insert(itemBatches).values({
        id: bid,
        itemId: iid,
        householdId: hid,
        quantity: String(cantidad),
        locationId: idUbicacion[ubicacion] ?? null,
        expiresAt: dias === null ? null : enDias(dias),
        expiryType: dias !== null && dias > 200 ? "consumo_preferente" : "caducidad",
        purchasedAt: enDias(-Math.min(30, i + 1)),
        createdBy: autor,
      });

      await db.insert(stockMovements).values({
        id: id(),
        householdId: hid,
        itemId: iid,
        batchId: bid,
        itemName: nombre,
        type: "alta",
        quantity: String(cantidad),
        unit: unidad as (typeof schema.UNIDADES)[number],
        userId: autor,
      });
    }
  }

  console.log(`✓ Listo: ${INVENTARIO.length} artículos en «Casa de ejemplo».`);
  console.log("");
  console.log("  Entra con cualquiera de estas cuentas:");
  for (const c of CUENTAS) console.log(`    ${c.email.padEnd(20)} ${c.password}   (${c.rol})`);
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Falló la semilla:", err);
  process.exit(1);
});
