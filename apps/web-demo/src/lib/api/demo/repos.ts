import type {
  Assignment,
  AssignmentId,
  AssignmentRepository,
  Batch,
  BatchEvent,
  BatchEventFilter,
  BatchEventId,
  BatchEventRepository,
  BatchFilter,
  BatchId,
  BatchRepository,
  Location,
  LocationFilter,
  LocationId,
  LocationRepository,
  Machine,
  MachineFilter,
  MachineId,
  MachineRepository,
  Material,
  MaterialFilter,
  MaterialId,
  MaterialRepository,
  Recipe,
  RecipeFilter,
  RecipeId,
  RecipeRepository,
  Repositories,
  StockDelta,
  StockMovement,
  StockMovementRepository,
  UnitOfWork,
  Worker,
  WorkerFilter,
  WorkerId,
  WorkerRepository,
} from '@fabrik/domain';

import { loadDb, saveDb } from './db';
import {
  assignmentFromWire,
  assignmentToWire,
  batchEventFromWire,
  batchEventToWire,
  batchFromWire,
  batchToWire,
  locationFromWire,
  locationToWire,
  machineFromWire,
  machineToWire,
  materialFromWire,
  materialToWire,
  recipeFromWire,
  recipeToWire,
  stockMovementFromWire,
  stockMovementToWire,
  workerFromWire,
  workerToWire,
} from './mappers';

/**
 * Adaptadores de los 9 puertos de `@fabrik/domain` sobre la base demo de
 * `sessionStorage` (`db.ts`). El equivalente exacto de los `Drizzle*Repository`
 * de `apps/api/src/persistence/repositories/`, pero con el storage como motor:
 *
 * - **Lectura** (`read path`): `loadDb()` → filas de wire → hidratación con los
 *   mappers (`*FromWire`). Cada llamada carga de nuevo, así que **nunca se
 *   devuelve una instancia cacheada**: los consumidores reciben entidades
 *   frescas (y congeladas, como todas las del dominio) por llamada.
 * - **Escritura** (`save`/`add`/`delete`): *write-through* por llamada —
 *   `loadDb()` → upsert/eliminación por `id` → `saveDb()`. No hay caché en
 *   memoria: la base demo vive única y exclusivamente en `sessionStorage`.
 * - **Contrato de errores**: idéntico al adaptador Drizzle — `findById` devuelve
 *   `null` si no existe (el `NotFoundError` lo lanzan los use cases de dominio,
 *   y el mapeo a HTTP 404 ocurre después, en la capa de módulos).
 * - **`UnitOfWork`**: el demo es una base de un solo usuario sin motor
 *   transaccional; `run(fn)` es una pasada directa (documentado como decisión
 *   deliberada abajo).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Upsert por `id` sobre una colección inmutable de filas: reemplaza la fila
 * existente o agrega al final (orden de inserción, igual que el insert de
 * Drizzle). Devuelve un array nuevo, nunca muta `rows`.
 */
function upsertById<T extends { readonly id: string }>(rows: readonly T[], row: T): T[] {
  const index = rows.findIndex((candidate) => candidate.id === row.id);
  if (index < 0) {
    return [...rows, row];
  }
  const next = [...rows];
  next[index] = row;
  return next;
}

/**
 * `DateRange` inclusivo de `BatchEventFilter`: `from` <= t <= `to`
 * (los dos extremos son opcionales, igual que los `gte`/`lte` de Drizzle).
 */
function withinRange(
  timestamp: Date,
  range?: { readonly from?: Date; readonly to?: Date },
): boolean {
  if (range?.from !== undefined && timestamp.getTime() < range.from.getTime()) {
    return false;
  }
  if (range?.to !== undefined && timestamp.getTime() > range.to.getTime()) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

/** Adaptador demo de `MaterialRepository` (`save` = upsert por `id`). */
export class DemoMaterialRepository implements MaterialRepository {
  async findById(id: MaterialId): Promise<Material | null> {
    const row = loadDb().materials.find((candidate) => candidate.id === id);
    return row ? materialFromWire(row) : null;
  }

  async list(filter?: MaterialFilter): Promise<readonly Material[]> {
    const rows = loadDb().materials.filter(
      (candidate) =>
        (filter?.kind === undefined || candidate.kind === filter.kind) &&
        (filter?.physicalState === undefined || candidate.physicalState === filter.physicalState),
    );
    return rows.map(materialFromWire);
  }

  async save(material: Material): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      materials: upsertById(data.materials, materialToWire(material)),
    });
  }

  async existsByName(name: string): Promise<boolean> {
    return loadDb().materials.some((candidate) => candidate.name === name);
  }
}

/** Adaptador demo de `LocationRepository` (`save` = upsert por `id`). */
export class DemoLocationRepository implements LocationRepository {
  async findById(id: LocationId): Promise<Location | null> {
    const row = loadDb().locations.find((candidate) => candidate.id === id);
    return row ? locationFromWire(row) : null;
  }

  async list(filter?: LocationFilter): Promise<readonly Location[]> {
    const rows = loadDb().locations.filter(
      (candidate) => filter?.kind === undefined || candidate.kind === filter.kind,
    );
    return rows.map(locationFromWire);
  }

  async save(location: Location): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      locations: upsertById(data.locations, locationToWire(location)),
    });
  }
}

/** Adaptador demo de `MachineRepository` (`save` = upsert por `id`). */
export class DemoMachineRepository implements MachineRepository {
  async findById(id: MachineId): Promise<Machine | null> {
    const row = loadDb().machines.find((candidate) => candidate.id === id);
    return row ? machineFromWire(row) : null;
  }

  async list(filter?: MachineFilter): Promise<readonly Machine[]> {
    const rows = loadDb().machines.filter(
      (candidate) =>
        (filter?.locationId === undefined || candidate.locationId === filter.locationId) &&
        (filter?.status === undefined || candidate.status === filter.status) &&
        (filter?.type === undefined || candidate.type === filter.type),
    );
    return rows.map(machineFromWire);
  }

  async save(machine: Machine): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      machines: upsertById(data.machines, machineToWire(machine)),
    });
  }
}

/** Adaptador demo de `WorkerRepository` (`save` = upsert por `id`). */
export class DemoWorkerRepository implements WorkerRepository {
  async findById(id: WorkerId): Promise<Worker | null> {
    const row = loadDb().workers.find((candidate) => candidate.id === id);
    return row ? workerFromWire(row) : null;
  }

  async list(filter?: WorkerFilter): Promise<readonly Worker[]> {
    const rows = loadDb().workers.filter(
      (candidate) =>
        (filter?.role === undefined || candidate.role === filter.role) &&
        (filter?.active === undefined || candidate.active === filter.active),
    );
    return rows.map(workerFromWire);
  }

  async save(worker: Worker): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      workers: upsertById(data.workers, workerToWire(worker)),
    });
  }
}

/** Adaptador demo de `RecipeRepository` (`save` = upsert por `id`). */
export class DemoRecipeRepository implements RecipeRepository {
  async findById(id: RecipeId): Promise<Recipe | null> {
    const row = loadDb().recipes.find((candidate) => candidate.id === id);
    return row ? recipeFromWire(row) : null;
  }

  async list(filter?: RecipeFilter): Promise<readonly Recipe[]> {
    const rows = loadDb().recipes.filter(
      (candidate) =>
        filter?.outputProductId === undefined ||
        candidate.outputProductId === filter.outputProductId,
    );
    return rows.map(recipeFromWire);
  }

  async save(recipe: Recipe): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      recipes: upsertById(data.recipes, recipeToWire(recipe)),
    });
  }
}

// ---------------------------------------------------------------------------
// Asignaciones
// ---------------------------------------------------------------------------

/** Adaptador demo de `AssignmentRepository` (`save` = upsert, `delete` real). */
export class DemoAssignmentRepository implements AssignmentRepository {
  async findById(id: AssignmentId): Promise<Assignment | null> {
    const row = loadDb().assignments.find((candidate) => candidate.id === id);
    return row ? assignmentFromWire(row) : null;
  }

  async findByWorker(workerId: WorkerId): Promise<readonly Assignment[]> {
    return loadDb()
      .assignments.filter((candidate) => candidate.workerId === workerId)
      .map(assignmentFromWire);
  }

  async findByMachine(machineId: MachineId): Promise<readonly Assignment[]> {
    return loadDb()
      .assignments.filter((candidate) => candidate.machineId === machineId)
      .map(assignmentFromWire);
  }

  async save(assignment: Assignment): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      assignments: upsertById(data.assignments, assignmentToWire(assignment)),
    });
  }

  async delete(id: AssignmentId): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      assignments: data.assignments.filter((candidate) => candidate.id !== id),
    });
  }
}

// ---------------------------------------------------------------------------
// Producción: lotes
// ---------------------------------------------------------------------------

/** Adaptador demo de `BatchRepository` (`save` = upsert por `id`). */
export class DemoBatchRepository implements BatchRepository {
  async findById(id: BatchId): Promise<Batch | null> {
    const row = loadDb().batches.find((candidate) => candidate.id === id);
    return row ? batchFromWire(row) : null;
  }

  async findByMaterial(materialId: MaterialId): Promise<readonly Batch[]> {
    return this.list({ materialId });
  }

  async list(filter?: BatchFilter): Promise<readonly Batch[]> {
    const rows = loadDb().batches.filter(
      (candidate) =>
        (filter?.materialId === undefined || candidate.materialId === filter.materialId) &&
        (filter?.status === undefined || candidate.status === filter.status) &&
        (filter?.recipeId === undefined || candidate.recipeId === filter.recipeId) &&
        (filter?.originBatchEventId === undefined ||
          candidate.originBatchEventId === filter.originBatchEventId),
    );
    return rows.map(batchFromWire);
  }

  async save(batch: Batch): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      batches: upsertById(data.batches, batchToWire(batch)),
    });
  }
}

// ---------------------------------------------------------------------------
// Append-only: eventos y movimientos de stock
// ---------------------------------------------------------------------------

/**
 * Adaptador demo **append-only** de `BatchEventRepository`: solo `add` y
 * lecturas (nunca update/delete). `add` es idempotente por `id` (re-`add`
 * reemplaza, igual que el `onConflictDoUpdate` de Drizzle).
 */
export class DemoBatchEventRepository implements BatchEventRepository {
  async add(event: BatchEvent): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      batchEvents: upsertById(data.batchEvents, batchEventToWire(event)),
    });
  }

  async findById(id: BatchEventId): Promise<BatchEvent | null> {
    const row = loadDb().batchEvents.find((candidate) => candidate.id === id);
    return row ? batchEventFromWire(row) : null;
  }

  async listBy(filters?: BatchEventFilter): Promise<readonly BatchEvent[]> {
    const rows = loadDb().batchEvents.filter(
      (candidate) =>
        (filters?.machineId === undefined || candidate.machineId === filters.machineId) &&
        (filters?.workerId === undefined || candidate.workerId === filters.workerId) &&
        (filters?.materialId === undefined ||
          candidate.inputs.some((input) => input.materialId === filters.materialId) ||
          candidate.outputs.some((output) => output.materialId === filters.materialId)) &&
        withinRange(new Date(candidate.timestamp), filters?.dateRange),
    );
    return rows.map(batchEventFromWire);
  }

  async listByInputBatchId(batchId: BatchId): Promise<readonly BatchEvent[]> {
    // Eventos cuyos `inputs` referencian ese batch (trazabilidad hacia adelante).
    return loadDb()
      .batchEvents.filter((candidate) =>
        candidate.inputs.some((input) => input.batchId === batchId),
      )
      .map(batchEventFromWire);
  }
}

/**
 * Adaptador demo **append-only** de `StockMovementRepository`: solo `add` y
 * lecturas/agregados. El stock actual se deriva sumando los deltas.
 */
export class DemoStockMovementRepository implements StockMovementRepository {
  async add(movement: StockMovement): Promise<void> {
    const data = loadDb();
    saveDb({
      ...data,
      stockMovements: upsertById(data.stockMovements, stockMovementToWire(movement)),
    });
  }

  async listByLocation(
    locationId: LocationId,
    materialId?: MaterialId,
  ): Promise<readonly StockMovement[]> {
    return loadDb()
      .stockMovements.filter(
        (candidate) =>
          candidate.locationId === locationId &&
          (materialId === undefined || candidate.materialId === materialId),
      )
      .map(stockMovementFromWire);
  }

  async sumByLocationAndMaterial(
    locationId: LocationId,
    materialId: MaterialId,
  ): Promise<StockDelta | null> {
    const rows = loadDb().stockMovements.filter(
      (candidate) => candidate.locationId === locationId && candidate.materialId === materialId,
    );
    if (rows.length === 0) {
      return null;
    }
    // La unidad se toma de la primera fila (convención del adaptador Drizzle).
    return {
      amount: rows.reduce((total, row) => total + row.delta.amount, 0),
      unit: rows[0].delta.unit,
    };
  }
}

// ---------------------------------------------------------------------------
// Unit of work + fábrica de repositorios
// ---------------------------------------------------------------------------

/**
 * Construye el agregado de repositorios demo (los 9 puertos). Cada instancia
 * es *stateless* (lee/escribe el storage en cada llamada), así que reutilizarla
 * o construir una nueva no cambia el comportamiento.
 */
export function createDemoRepositories(): Repositories {
  const materials = new DemoMaterialRepository();
  const machines = new DemoMachineRepository();
  const workers = new DemoWorkerRepository();
  const locations = new DemoLocationRepository();
  const recipes = new DemoRecipeRepository();
  const batches = new DemoBatchRepository();
  const batchEvents = new DemoBatchEventRepository();
  const assignments = new DemoAssignmentRepository();
  const stockMovements = new DemoStockMovementRepository();
  return {
    materials,
    machines,
    workers,
    locations,
    recipes,
    batches,
    batchEvents,
    assignments,
    stockMovements,
  };
}

/**
 * `UnitOfWork` del demo.
 *
 * **Decisión deliberada**: `run(fn)` es una pasada directa a `fn`. La API real
 * envuelve las escrituras en la transacción de Drizzle (commit/rollback) porque
 * `RecordTransformation` escribe en varios agregados a la vez; el demo corre en
 * el navegador sobre una base **de un solo usuario en `sessionStorage`**, sin
 * motor transaccional ni concurrencia que justifique snapshot isolation. Los
 * adaptadores ya persisten cada mutación al vuelo (write-through), así que `fn`
 * ve el estado consistente secuencia a secuencia. Si `fn` lanza, el error se
 * propaga tal cual (sin rollback: las escrituras anteriores ya quedaron
 * aplicadas — comportamiento aceptado por diseño para el demo).
 */
export class DemoUnitOfWork implements UnitOfWork {
  private readonly repositories: Repositories;

  constructor(repositories: Repositories = createDemoRepositories()) {
    this.repositories = repositories;
  }

  async run<T>(fn: (repositories: Repositories) => Promise<T>): Promise<T> {
    return fn(this.repositories);
  }
}
