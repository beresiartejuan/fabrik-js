// Casos de uso de trazabilidad y consulta de stock (Fase 8, docs/03 y docs/04).
//
// Son lecturas puras: no escriben ni emiten eventos. La autorización sigue el
// catálogo de docs/04 (A = admin, Au = auditor, W = worker):
//  - `TraceBatch` / `TraceForward` / `GetStockMovements` / `ListBatchEvents`: A, Au.
//  - `GetStockByLocation`: A, Au, W.
import { NotFoundError } from '../errors/index.js';
import type { Batch } from '../entities/batch.js';
import type { BatchEvent } from '../entities/batch-event.js';
import type { StockMovement } from '../entities/stock-movement.js';
import type { WorkerRole } from '../entities/worker.js';
import type {
  BatchEventFilter,
  BatchEventRepository,
} from '../ports/batch-event-repository.js';
import type { BatchRepository } from '../ports/batch-repository.js';
import type { LocationRepository } from '../ports/location-repository.js';
import type { MaterialRepository } from '../ports/material-repository.js';
import type { StockMovementRepository } from '../ports/stock-movement-repository.js';
import type { BatchId, LocationId, MaterialId } from '../value-objects/ids.js';
import type { UnitOfMeasure } from '../value-objects/quantity.js';

import { ALL_ROLES, requireRole, type Actor } from './actor.js';

// --- Roles (docs/04) ---

/** Lecturas de trazabilidad e historial: A, Au. */
const TRACEABILITY_READ_ROLES: readonly WorkerRole[] = ['admin', 'auditor'];

// --- Dependencias ---

/** Grafo de trazabilidad: lotes + eventos. */
export interface TraceabilityReadDeps {
  readonly batches: BatchRepository;
  readonly batchEvents: BatchEventRepository;
}

/** Stock agregado por lugar + catálogo de materiales para resolver la unidad. */
export interface StockByLocationDeps {
  readonly locations: LocationRepository;
  readonly materials: MaterialRepository;
  readonly stockMovements: StockMovementRepository;
}

/** Historial de movimientos de un lugar. */
export interface StockMovementsDeps {
  readonly locations: LocationRepository;
  readonly stockMovements: StockMovementRepository;
}

/** Búsqueda de eventos de transformación. */
export interface BatchEventQueryDeps {
  readonly batchEvents: BatchEventRepository;
}

// --- Comandos ---

export interface TraceBatchCommand {
  readonly batchId: BatchId;
}

export interface TraceForwardCommand {
  readonly batchId: BatchId;
}

export interface GetStockByLocationCommand {
  readonly locationId: LocationId;
}

export interface GetStockMovementsCommand {
  readonly locationId: LocationId;
  readonly materialId?: MaterialId;
}

export interface ListBatchEventsCommand extends BatchEventFilter {}

// --- DTOs ---

/**
 * Nodo del árbol de genealogía **hacia atrás** (`TraceBatch`).
 * `event` es el evento que originó `batch`; las hojas (suministros y raíces sin
 * origen) no lo tienen. `machineId`/`workerId`/`observation` viven en `event`, no
 * se hidratan las entidades completas.
 */
export interface BatchTraceNode {
  readonly batch: Batch;
  readonly event?: BatchEvent;
  readonly children: readonly BatchTraceNode[];
  /** Ciclo detectado en datos corruptos: la rama se corta en este nodo. */
  readonly cycleDetected?: boolean;
}

/**
 * Nodo del árbol de genealogía **hacia adelante** (`TraceForward`, recall).
 * Convención: un nodo de lote lleva `batch` (sin `event`); un nodo de evento
 * lleva `event` (sin `batch`) y cuelga de un lote. La raíz es un nodo de lote.
 */
export interface BatchForwardNode {
  readonly batch?: Batch;
  readonly event?: BatchEvent;
  readonly children: readonly BatchForwardNode[];
  /** Ciclo detectado en datos corruptos: la rama se corta en este nodo. */
  readonly cycleDetected?: boolean;
}

/** Stock actual de un material en un lugar (agregado de movimientos). */
export interface StockByLocationEntry {
  readonly materialId: MaterialId;
  readonly amount: number;
  readonly unit: UnitOfMeasure;
}

// --- Utilidades ---

// Orden cronológico ascendente, estable ante timestamps iguales.
function byTimestamp(a: { readonly timestamp: Date }, b: { readonly timestamp: Date }): number {
  return a.timestamp.getTime() - b.timestamp.getTime();
}

/**
 * `TraceBatch` (roles A, Au): reconstruye la genealogía de un lote siguiendo
 * `originBatchEventId` hacia atrás (docs/03). Devuelve un árbol en el que cada
 * nodo es un lote y el `event` es la transformación que lo produjo; las hojas
 * (suministros/raíces) no tienen evento. Un `batchId` desconocido lanza
 * `NotFoundError`.
 *
 * Robustez: si los datos estuvieran corruptos y formaran un ciclo, la rama se
 * corta en el nodo repetido (`cycleDetected: true`) en lugar de colgar. Las
 * referencias de input colgantes se ignoran.
 */
export class TraceBatch {
  constructor(private readonly deps: TraceabilityReadDeps) {}

  async execute(actor: Actor, command: TraceBatchCommand): Promise<BatchTraceNode> {
    requireRole(actor, TRACEABILITY_READ_ROLES, 'TraceBatch');

    const root = await this.deps.batches.findById(command.batchId);
    if (!root) {
      throw new NotFoundError('Batch', command.batchId);
    }
    return this.build(root, new Set());
  }

  private async build(batch: Batch, ancestors: ReadonlySet<BatchId>): Promise<BatchTraceNode> {
    const nextAncestors = new Set(ancestors).add(batch.id);

    if (!batch.originBatchEventId) {
      return { batch, children: [] };
    }
    const event = await this.deps.batchEvents.findById(batch.originBatchEventId);
    if (!event) {
      // Referencia colgante: se trata como hoja para no romper la lectura.
      return { batch, children: [] };
    }

    const children: BatchTraceNode[] = [];
    for (const input of event.inputs) {
      if (!input.batchId) {
        continue;
      }
      const inputBatch = await this.deps.batches.findById(input.batchId);
      if (!inputBatch) {
        continue;
      }
      if (nextAncestors.has(inputBatch.id)) {
        children.push({ batch: inputBatch, children: [], cycleDetected: true });
        continue;
      }
      children.push(await this.build(inputBatch, nextAncestors));
    }
    return { batch, event, children };
  }
}

/**
 * `TraceForward` (roles A, Au): genealogía hacia adelante para *recall* (docs/03).
 * Parte de un lote, busca los eventos que lo consumen (`listByInputBatchId`) y,
 * para cada uno, los lotes que produjo (`list({ originBatchEventId })`), y
 * recurse. Un `batchId` desconocido lanza `NotFoundError`. Mismo guard de ciclos
 * que `TraceBatch`.
 */
export class TraceForward {
  constructor(private readonly deps: TraceabilityReadDeps) {}

  async execute(actor: Actor, command: TraceForwardCommand): Promise<BatchForwardNode> {
    requireRole(actor, TRACEABILITY_READ_ROLES, 'TraceForward');

    const root = await this.deps.batches.findById(command.batchId);
    if (!root) {
      throw new NotFoundError('Batch', command.batchId);
    }
    return this.buildBatch(root, new Set());
  }

  // Nodo de lote: hijos = un nodo por cada evento que lo consume.
  private async buildBatch(
    batch: Batch,
    ancestors: ReadonlySet<BatchId>,
  ): Promise<BatchForwardNode> {
    const nextAncestors = new Set(ancestors).add(batch.id);

    const consumers = await this.deps.batchEvents.listByInputBatchId(batch.id);
    const children: BatchForwardNode[] = [];
    for (const event of consumers) {
      const descendants = await this.deps.batches.list({ originBatchEventId: event.id });
      const produced: BatchForwardNode[] = [];
      for (const descendant of descendants) {
        if (nextAncestors.has(descendant.id)) {
          produced.push({ batch: descendant, children: [], cycleDetected: true });
          continue;
        }
        produced.push(await this.buildBatch(descendant, nextAncestors));
      }
      // Nodo de evento: hijos = lotes producidos por él.
      children.push({ event, children: produced });
    }
    return { batch, children };
  }
}

/**
 * `GetStockByLocation` (roles A, Au, W): stock actual por material de un lugar
 * como agregado de movimientos (docs/04). El lugar debe existir (`NotFoundError`).
 *
 * Decisiones documentadas:
 *  - La **unidad** de cada entrada se toma del `unitOfMeasure` del material, no
 *    del movimiento, porque pueden convivir movimientos con unidades distintas
 *    (caveat conocido) y el catálogo es la fuente de verdad (I6).
 *  - Un material cuyo **delta neto es 0** no tiene stock y se **omite** del
 *    resultado (no se devuelven entradas en cero).
 *  - El orden es el de primera aparición del material en los movimientos.
 *  - Si un movimiento referencia un material inexistente se lanza `NotFoundError`
 *    (dato corrupto), en línea con la convención de no propagar valores vacíos.
 */
export class GetStockByLocation {
  constructor(private readonly deps: StockByLocationDeps) {}

  async execute(
    actor: Actor,
    command: GetStockByLocationCommand,
  ): Promise<readonly StockByLocationEntry[]> {
    requireRole(actor, ALL_ROLES, 'GetStockByLocation');

    const location = await this.deps.locations.findById(command.locationId);
    if (!location) {
      throw new NotFoundError('Location', command.locationId);
    }

    // Agrega deltas por material conservando el orden de primera aparición.
    const totals = new Map<MaterialId, number>();
    const movements = await this.deps.stockMovements.listByLocation(location.id);
    for (const movement of movements) {
      totals.set(
        movement.materialId,
        (totals.get(movement.materialId) ?? 0) + movement.delta.amount,
      );
    }

    const entries: StockByLocationEntry[] = [];
    for (const [materialId, amount] of totals) {
      if (amount === 0) {
        continue;
      }
      const material = await this.deps.materials.findById(materialId);
      if (!material) {
        throw new NotFoundError('Material', materialId);
      }
      entries.push({ materialId, amount, unit: material.unitOfMeasure });
    }
    return entries;
  }
}

/**
 * `GetStockMovements` (roles A, Au): historial de movimientos de un lugar,
 * opcionalmente filtrado por material. El lugar debe existir (`NotFoundError`).
 * Orden cronológico ascendente (`timestamp`).
 */
export class GetStockMovements {
  constructor(private readonly deps: StockMovementsDeps) {}

  async execute(actor: Actor, command: GetStockMovementsCommand): Promise<readonly StockMovement[]> {
    requireRole(actor, TRACEABILITY_READ_ROLES, 'GetStockMovements');

    const location = await this.deps.locations.findById(command.locationId);
    if (!location) {
      throw new NotFoundError('Location', command.locationId);
    }
    const movements = await this.deps.stockMovements.listByLocation(
      location.id,
      command.materialId,
    );
    return [...movements].sort(byTimestamp);
  }
}

/**
 * `ListBatchEvents` (roles A, Au): busca eventos de transformación por máquina,
 * worker, material y rango de fechas inclusivo (docs/04). El orden es cronológico
 * ascendente (`timestamp`).
 */
export class ListBatchEvents {
  constructor(private readonly deps: BatchEventQueryDeps) {}

  async execute(actor: Actor, command: ListBatchEventsCommand): Promise<readonly BatchEvent[]> {
    requireRole(actor, TRACEABILITY_READ_ROLES, 'ListBatchEvents');

    const events = await this.deps.batchEvents.listBy(command);
    return [...events].sort(byTimestamp);
  }
}
