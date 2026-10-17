import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Esquema físico (Drizzle / SQLite) derivado de las entidades del dominio.
 *
 * Convenciones de mapeo (ver `src/persistence/README.md`):
 * - **IDs**: `text` (UUID) como PK; las entidades usan `BrandedId` (string).
 * - **Quantity**: `amount` (`real`) + `unit` (`text` con enum). Para `StockDelta`
 *   el monto se llama `delta_amount` y admite signo.
 * - **TimeSlot**: `days_of_week` como texto `"0,2,5"` (días ordenados) y
 *   `start`/`end` como texto `"HH:mm"` (se preserva el valor exacto del VO).
 * - **Fechas**: `integer` en modo `timestamp_ms` (epoch en milisegundos), que
 *   Drizzle mapea a `Date` en ambas direcciones.
 * - **Booleanos**: `integer` en modo `boolean`.
 * - **Append-only**: `batch_events` y `stock_movements` no exponen `UPDATE`/
 *   `DELETE` en los adaptadores (solo `add`/`list`/`sum`); el esquema no lo
 *   impide a nivel SQL, lo garantiza la capa de adaptadores (igual que I4).
 * - **Sin foreign keys**: la integridad referencial la garantizan el dominio y
 *   los use cases; se evitan FKs para no depender de `PRAGMA foreign_keys` y
 *   simplificar los `upsert` (borrar+reinsertar hijos).
 */

export const MATERIAL_KINDS = ['supply', 'product'] as const;
export const PHYSICAL_STATES = ['solid', 'liquid', 'gas'] as const;
export const UNITS_OF_MEASURE = ['g', 'kg', 'unit', 'ml', 'l', 'm3'] as const;
export const LOCATION_KINDS = ['production', 'storage'] as const;
export const MACHINE_STATUSES = ['idle', 'running', 'maintenance'] as const;
export const WORKER_ROLES = ['admin', 'worker', 'auditor'] as const;
export const BATCH_STATUSES = ['in_progress', 'completed', 'stored'] as const;
export const STOCK_MOVEMENT_REASONS = [
  'produced',
  'consumed',
  'supply_in',
  'transfer_in',
  'transfer_out',
  'manual_adjustment',
] as const;

/** Raíz del contexto. Sin puerto asociado en el dominio (solo tabla). */
export const factories = sqliteTable('factories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const materials = sqliteTable(
  'materials',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    kind: text('kind', { enum: MATERIAL_KINDS }).notNull(),
    physicalState: text('physical_state', { enum: PHYSICAL_STATES }).notNull(),
    unitOfMeasure: text('unit_of_measure', { enum: UNITS_OF_MEASURE }).notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [
    index('materials_kind_idx').on(table.kind),
    index('materials_physical_state_idx').on(table.physicalState),
  ],
);

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind', { enum: LOCATION_KINDS }).notNull(),
  },
  (table) => [index('locations_kind_idx').on(table.kind)],
);

export const machines = sqliteTable(
  'machines',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    locationId: text('location_id').notNull(),
    status: text('status', { enum: MACHINE_STATUSES }).notNull().default('idle'),
  },
  (table) => [
    index('machines_location_id_idx').on(table.locationId),
    index('machines_status_idx').on(table.status),
    index('machines_type_idx').on(table.type),
  ],
);

export const workers = sqliteTable(
  'workers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    role: text('role', { enum: WORKER_ROLES }).notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [index('workers_role_idx').on(table.role), index('workers_active_idx').on(table.active)],
);

export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    outputProductId: text('output_product_id').notNull(),
    outputAmount: real('output_amount').notNull(),
    outputUnit: text('output_unit', { enum: UNITS_OF_MEASURE }).notNull(),
  },
  (table) => [index('recipes_output_product_id_idx').on(table.outputProductId)],
);

export const recipeSteps = sqliteTable(
  'recipe_steps',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id').notNull(),
    position: integer('position').notNull(),
    machineType: text('machine_type').notNull(),
    outputProductId: text('output_product_id').notNull(),
    outputAmount: real('output_amount').notNull(),
    outputUnit: text('output_unit', { enum: UNITS_OF_MEASURE }).notNull(),
  },
  (table) => [index('recipe_steps_recipe_id_idx').on(table.recipeId)],
);

/** `RecipeStep.inputs` (MaterialQuantity[]) — hijo ordenado de `recipe_steps`. */
export const recipeStepInputs = sqliteTable(
  'recipe_step_inputs',
  {
    recipeStepId: text('recipe_step_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    materialId: text('material_id').notNull(),
    amount: real('amount').notNull(),
    unit: text('unit', { enum: UNITS_OF_MEASURE }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recipeStepId, table.ordinal] }),
    index('recipe_step_inputs_material_id_idx').on(table.materialId),
  ],
);

export const assignments = sqliteTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id').notNull(),
    machineId: text('machine_id').notNull(),
    /** Días como `"0,2,5"` (0 = domingo .. 6 = sábado), ordenados ascendente. */
    daysOfWeek: text('days_of_week').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
  },
  (table) => [
    index('assignments_worker_id_idx').on(table.workerId),
    index('assignments_machine_id_idx').on(table.machineId),
  ],
);

export const batches = sqliteTable(
  'batches',
  {
    id: text('id').primaryKey(),
    materialId: text('material_id').notNull(),
    amount: real('amount').notNull(),
    unit: text('unit', { enum: UNITS_OF_MEASURE }).notNull(),
    recipeId: text('recipe_id'),
    originBatchEventId: text('origin_batch_event_id'),
    status: text('status', { enum: BATCH_STATUSES }).notNull().default('in_progress'),
  },
  (table) => [
    index('batches_material_id_idx').on(table.materialId),
    index('batches_status_idx').on(table.status),
    index('batches_recipe_id_idx').on(table.recipeId),
    index('batches_origin_batch_event_id_idx').on(table.originBatchEventId),
  ],
);

export const batchEvents = sqliteTable(
  'batch_events',
  {
    id: text('id').primaryKey(),
    machineId: text('machine_id').notNull(),
    workerId: text('worker_id').notNull(),
    locationId: text('location_id').notNull(),
    recipeStepId: text('recipe_step_id'),
    observation: text('observation'),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('batch_events_machine_id_idx').on(table.machineId),
    index('batch_events_worker_id_idx').on(table.workerId),
    index('batch_events_timestamp_idx').on(table.timestamp),
  ],
);

/** `BatchEvent.inputs` (BatchQuantity[]) — tabla hija ordenada, append-only. */
export const batchEventInputs = sqliteTable(
  'batch_event_inputs',
  {
    eventId: text('event_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    batchId: text('batch_id'),
    materialId: text('material_id').notNull(),
    amount: real('amount').notNull(),
    unit: text('unit', { enum: UNITS_OF_MEASURE }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.ordinal] }),
    index('batch_event_inputs_batch_id_idx').on(table.batchId),
    index('batch_event_inputs_material_id_idx').on(table.materialId),
  ],
);

/** `BatchEvent.outputs` (BatchQuantity[]) — tabla hija ordenada, append-only. */
export const batchEventOutputs = sqliteTable(
  'batch_event_outputs',
  {
    eventId: text('event_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    batchId: text('batch_id'),
    materialId: text('material_id').notNull(),
    amount: real('amount').notNull(),
    unit: text('unit', { enum: UNITS_OF_MEASURE }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.ordinal] }),
    index('batch_event_outputs_batch_id_idx').on(table.batchId),
    index('batch_event_outputs_material_id_idx').on(table.materialId),
  ],
);

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    locationId: text('location_id').notNull(),
    materialId: text('material_id').notNull(),
    deltaAmount: real('delta_amount').notNull(),
    deltaUnit: text('delta_unit', { enum: UNITS_OF_MEASURE }).notNull(),
    reason: text('reason', { enum: STOCK_MOVEMENT_REASONS }).notNull(),
    batchEventId: text('batch_event_id'),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('stock_movements_location_id_idx').on(table.locationId),
    index('stock_movements_material_id_idx').on(table.materialId),
  ],
);

// ---------------------------------------------------------------------------
// Auth (Fase 3). Datos de autenticación de la API, **no** del dominio (Worker no
// tiene password). Se guardan en `apps/api` y se relacionan con `workers.id` por
// convención (sin FK, igual que el resto del esquema).
// ---------------------------------------------------------------------------

/**
 * Credencial de acceso de un worker. `password_hash` guarda el string
 * autocontenido de scrypt (`scrypt$N=...,r=...,p=...$<salt>$<hash>`), es decir,
 * incluye sal y parámetros: no hace falta una columna `salt` aparte.
 */
export const authCredentials = sqliteTable('auth_credentials', {
  workerId: text('worker_id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Refresh tokens rotativos. Se guarda **solo el hash** (SHA-256) del token: el
 * valor en claro vive únicamente en el cliente. `revoked_at` marca la rotación
 * (el token viejo se revoca al emitir el nuevo) o el logout.
 */
export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('refresh_tokens_worker_id_idx').on(table.workerId),
    index('refresh_tokens_token_hash_idx').on(table.tokenHash),
  ],
);

// Tipos de fila inferidos (para los mappers).
export type FactoryRow = typeof factories.$inferSelect;
export type MaterialRow = typeof materials.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type MachineRow = typeof machines.$inferSelect;
export type WorkerRow = typeof workers.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type RecipeStepRow = typeof recipeSteps.$inferSelect;
export type RecipeStepInputRow = typeof recipeStepInputs.$inferSelect;
export type AssignmentRow = typeof assignments.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type BatchEventRow = typeof batchEvents.$inferSelect;
export type BatchEventInputRow = typeof batchEventInputs.$inferSelect;
export type BatchEventOutputRow = typeof batchEventOutputs.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
export type AuthCredentialRow = typeof authCredentials.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
