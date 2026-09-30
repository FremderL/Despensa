/**
 * Esquema de la base de datos (PostgreSQL / Neon).
 *
 * Convenciones:
 *  - Identificadores: uuid v4 generados en la aplicación (`crypto.randomUUID()`),
 *    así no dependemos de extensiones del servidor.
 *  - Los códigos internos (roles, tipos, unidades) se guardan en inglés/snake
 *    estable y se traducen en la interfaz. Cambiar un texto de la UI nunca
 *    obliga a migrar datos.
 *  - Ningún token se guarda en claro: sólo su HMAC-SHA256.
 */
import { relations, sql } from "drizzle-orm";

import {
  ROLES,
  TIPOS_CATEGORIA,
  TIPOS_FECHA,
  TIPOS_MOVIMIENTO,
  TIPOS_TOKEN,
  TIPOS_UBICACION,
  UNIDADES,
} from "@/lib/catalogos";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Los catálogos (roles, unidades, tipos) viven en `@/lib/catalogos` para que
 * los componentes de cliente puedan usarlos sin arrastrar Drizzle ni el
 * driver de PostgreSQL al navegador. Se reexportan aquí por comodidad.
 */
export { ROLES, TIPOS_CATEGORIA, TIPOS_FECHA, TIPOS_MOVIMIENTO, TIPOS_TOKEN, TIPOS_UBICACION, UNIDADES };
export type {
  Rol,
  TipoCategoria,
  TipoFecha,
  TipoMovimiento,
  TipoToken,
  TipoUbicacion,
  Unidad,
} from "@/lib/catalogos";

/* -------------------------------------------------------------------------- */
/*                                  Identidad                                  */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    /** Siempre normalizado a minúsculas antes de escribir. */
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Argon2id. Nunca sale de la capa de servidor. */
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name").notNull(),
    /** Color determinista para el avatar, evita guardar imágenes. */
    avatarColor: text("avatar_color").notNull().default("#0f766e"),

    /** Defensa contra fuerza bruta dirigida a una cuenta concreta. */
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),

    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** HMAC-SHA256 del token opaco. El token en claro sólo vive en la cookie. */
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    /** Caducidad absoluta: ni con uso continuo se prolonga más allá de aquí. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: TIPOS_TOKEN }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_tokens_hash_unique").on(t.tokenHash),
    index("auth_tokens_user_type_idx").on(t.userId, t.type),
  ],
);

/* -------------------------------------------------------------------------- */
/*                            Despensas y miembros                             */
/* -------------------------------------------------------------------------- */

export const households = pgTable(
  "households",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Días de antelación con los que se avisa de una caducidad próxima. */
    expiryWarningDays: integer("expiry_warning_days").notNull().default(7),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("households_created_by_idx").on(t.createdBy)],
);

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("member"),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    index("household_members_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Si se fija, sólo esa dirección puede canjear la invitación. */
    email: text("email"),
    role: text("role", { enum: ROLES }).notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("invitations_token_hash_unique").on(t.tokenHash),
    index("invitations_household_idx").on(t.householdId),
  ],
);

/* -------------------------------------------------------------------------- */
/*                        Organización del inventario                          */
/* -------------------------------------------------------------------------- */

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: TIPOS_CATEGORIA }).notNull().default("otro"),
    color: text("color").notNull().default("#64748b"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_household_name_unique").on(t.householdId, t.name),
    index("categories_household_idx").on(t.householdId),
  ],
);

export const locations = pgTable(
  "locations",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: TIPOS_UBICACION }).notNull().default("otro"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("locations_household_name_unique").on(t.householdId, t.name),
    index("locations_household_idx").on(t.householdId),
  ],
);

/** Definición del producto. El stock real vive en `itemBatches`. */
export const items = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    barcode: text("barcode"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    defaultLocationId: text("default_location_id").references(() => locations.id, { onDelete: "set null" }),
    unit: text("unit", { enum: UNIDADES }).notNull().default("unidad"),
    /** Umbral para la alerta de "queda poco". 0 la desactiva. */
    minQuantity: numeric("min_quantity", { precision: 12, scale: 3 }).notNull().default("0"),
    perishable: boolean("perishable").notNull().default(true),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("items_household_idx").on(t.householdId),
    index("items_household_category_idx").on(t.householdId, t.categoryId),
    index("items_barcode_idx").on(t.householdId, t.barcode),
  ],
);

/**
 * Lote: una compra o preparación concreta con su propia fecha de caducidad.
 * Separar lotes es lo que permite avisar "este yogur caduca el jueves" en vez
 * de razonar sobre un stock agregado sin fecha.
 */
export const itemBatches = pgTable(
  "item_batches",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    expiresAt: date("expires_at"),
    expiryType: text("expiry_type", { enum: TIPOS_FECHA }).notNull().default("caducidad"),
    openedAt: date("opened_at"),
    purchasedAt: date("purchased_at"),
    price: numeric("price", { precision: 12, scale: 2 }),
    note: text("note"),
    depletedAt: timestamp("depleted_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("item_batches_item_idx").on(t.itemId),
    index("item_batches_household_expiry_idx").on(t.householdId, t.expiresAt),
    index("item_batches_household_active_idx").on(t.householdId, t.depletedAt),
  ],
);

/** Bitácora funcional: quién movió qué y cuándo. Sólo inserciones. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    batchId: text("batch_id").references(() => itemBatches.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    type: text("type", { enum: TIPOS_MOVIMIENTO }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit", { enum: UNIDADES }).notNull().default("unidad"),
    note: text("note"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_movements_household_created_idx").on(t.householdId, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/*                         Seguridad: auditoría y cuotas                       */
/* -------------------------------------------------------------------------- */

/** Bitácora de seguridad. Append-only, se consulta desde la cuenta del usuario. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    householdId: text("household_id").references(() => households.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    /** Nunca debe contener secretos ni tokens; sólo identificadores y contexto. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_user_idx").on(t.userId, t.createdAt),
    index("audit_log_household_idx").on(t.householdId, t.createdAt),
  ],
);

/** Contador de ventana deslizante para limitar intentos. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_expires_idx").on(t.expiresAt)],
);

/* -------------------------------------------------------------------------- */
/*                                 Relaciones                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(householdMembers),
}));

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  categories: many(categories),
  locations: many(locations),
  items: many(items),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, { fields: [householdMembers.householdId], references: [households.id] }),
  user: one(users, { fields: [householdMembers.userId], references: [users.id] }),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  household: one(households, { fields: [items.householdId], references: [households.id] }),
  category: one(categories, { fields: [items.categoryId], references: [categories.id] }),
  defaultLocation: one(locations, { fields: [items.defaultLocationId], references: [locations.id] }),
  batches: many(itemBatches),
}));

export const itemBatchesRelations = relations(itemBatches, ({ one }) => ({
  item: one(items, { fields: [itemBatches.itemId], references: [items.id] }),
  location: one(locations, { fields: [itemBatches.locationId], references: [locations.id] }),
}));

/* -------------------------------------------------------------------------- */
/*                                   Tipos                                     */
/* -------------------------------------------------------------------------- */

export type Usuario = typeof users.$inferSelect;
export type Despensa = typeof households.$inferSelect;
export type Miembro = typeof householdMembers.$inferSelect;
export type Invitacion = typeof invitations.$inferSelect;
export type Categoria = typeof categories.$inferSelect;
export type Ubicacion = typeof locations.$inferSelect;
export type Articulo = typeof items.$inferSelect;
export type Lote = typeof itemBatches.$inferSelect;
export type Movimiento = typeof stockMovements.$inferSelect;

export const schemaSql = sql;
